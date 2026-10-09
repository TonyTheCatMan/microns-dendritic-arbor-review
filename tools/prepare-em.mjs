import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {RawSource,ChunkCache,sha256,shardLocation} from '../viewer/raw-source.js';
import {EM_URL,RESOLUTION_NM,COORDINATE_CONVENTION,planePlan,mortonCode} from '../viewer/coordinates.js';
import {preparedPlaneKey} from '../viewer/prepared-source.js';

const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'data','prepared-em');
await fs.mkdir(directory,{recursive:true});
const catalog=JSON.parse(await fs.readFile(path.join(root,'data','catalog.json'),'utf8'));
const response=await fetch(EM_URL+'/info');if(!response.ok)throw new Error('Source metadata HTTP '+response.status);
const infoText=await response.text(),infoSha256=await sha256(infoText);
if(infoSha256!==catalog.sources.em.metadataSha256)throw new Error('Source metadata differs from the verified catalog');
const fetcher=async(url,options)=>{
  if(url===EM_URL+'/info')return new Response(infoText);
  let lastError;
  for(let attempt=0;attempt<3;attempt++)try{const r=await fetch(url,options);if(r.status!==206)throw new Error('Source range HTTP '+r.status);return r;}catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}
  throw lastError;
};
const source=new RawSource({fetcher,concurrency:8,cache:new ChunkCache({maxBytes:64*1024*1024})});
let manifest={schemaVersion:1,source:EM_URL,infoText,infoSha256,resolutionNm:[...RESOLUTION_NM],convention:COORDINATE_CONVENTION,createdAt:new Date().toISOString(),method:'Exact native uint8 source chunks and integer-sampled XY starter planes, lossless gzip; no interpolation or contrast change',volumes:[]};
try{const previous=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));if(previous.infoSha256===infoSha256)manifest=previous;}catch{}
const byKey=new Map(manifest.volumes.flatMap(volume=>volume.planes.map(plane=>[preparedPlaneKey(plane),{volume,plane}])));
const unique=new Map();for(const task of catalog.tasks){const key=task.anchorNm.join(',');if(!unique.has(key))unique.set(key,{anchorNm:task.anchorNm,taskIds:[]});unique.get(key).taskIds.push(task.id);}
const save=async()=>{const file=path.join(directory,'manifest.json'),temporary=path.join(directory,'manifest.tmp');await fs.writeFile(temporary,JSON.stringify(manifest)+'\n');await fs.rename(temporary,file);};
await source.init();
async function prepare(view){
  const p=planePlan(view,source.scale),s=source.scale,size=s.chunk_sizes[0],voxelOffset=s.voxel_offset,shape=s.size.map((n,i)=>Math.ceil(n/size[i]));
  const first=p.begin.map((n,i)=>Math.floor((n-voxelOffset[i])/size[i])),last=p.end.map((n,i)=>Math.floor((n-1-voxelOffset[i])/size[i])),ids=[];
  for(let z=first[2];z<=last[2];z++)for(let y=first[1];y<=last[1];y++)for(let x=first[0];x<=last[0];x++)ids.push(mortonCode([x,y,z],shape).toString());
  const id='crop-'+(await sha256(ids.sort().join(','))).slice(0,16),existing=manifest.volumes.find(v=>v.id===id);
  if(existing)return {volume:existing,plane:null};
  let plane;
  for(let attempt=0;attempt<3;attempt++){plane=await source.plane(view);if(plane.complete)break;}
  if(!plane.complete)throw new Error('Incomplete native plane: '+JSON.stringify(plane.failures));
  const receipts=[...plane.receipts].sort((a,b)=>a.chunkId.localeCompare(b.chunkId));let volume;
    const chunks=[],parts=[];let offset=0;
    for(const receipt of receipts){const data=await source.cache.get(infoSha256+':'+source.scale.key+':'+receipt.chunkId);if(!data||await sha256(data)!==receipt.decodedSha256)throw new Error('Native chunk changed before preparation');
      if(!receipt.rangeBytes){const loc=shardLocation(BigInt(receipt.chunkId),source.scale.sharding),url=EM_URL+'/'+source.scale.key+'/'+loc.filename,entry=(await source.index(url,loc)).get(receipt.chunkId);receipt.url=url;receipt.rangeBytes=[entry.start,entry.end];}
      const {fromCache,sharedRequest,...provenance}=receipt;parts.push(data);chunks.push({chunkId:receipt.chunkId,offset,bytes:data.byteLength,receipt:provenance});offset+=data.byteLength;}
    const raw=new Uint8Array(offset);let cursor=0;for(const part of parts){raw.set(part,cursor);cursor+=part.byteLength;}
    const encoded=gzipSync(raw,{level:6}),file=id+'.bin.gz';await fs.writeFile(path.join(directory,file),encoded);
    volume={id,file,fileSha256:await sha256(encoded),fileBytes:encoded.byteLength,rawBytes:raw.byteLength,chunks,planes:[]};manifest.volumes.push(volume);
  return {volume,plane};
}
let number=0;
for(const anchor of unique.values()){
  number++;const view={plane:'xy',centerNm:anchor.anchorNm,spanNm:4096},key=preparedPlaneKey(planePlan(view,source.scale));
  let already=byKey.get(key),volume,entry;
  if(already){({volume,plane:entry}=already);entry.taskIds=anchor.taskIds;}
  else{
    let prepared=await prepare(view);volume=prepared.volume;const plane=prepared.plane||await source.plane(view);
    const file='plane-'+(await sha256(key)).slice(0,16)+'.bin.gz',encoded=gzipSync(plane.pixels,{level:6});await fs.writeFile(path.join(directory,file),encoded);
    entry={plane:'xy',anchorNm:anchor.anchorNm,begin:plane.begin,end:plane.end,width:plane.width,height:plane.height,file,fileSha256:await sha256(encoded),fileBytes:encoded.byteLength,decodedSha256:await sha256(plane.pixels),taskIds:anchor.taskIds};volume.planes.push(entry);byKey.set(key,{volume,plane:entry});
  }
  entry.warmVolumeIds=[volume.id];
  for(const delta of [640,-640,1280,-1280]){const centerNm=[...anchor.anchorNm];centerNm[2]+=delta;const neighbor=await prepare({...view,centerNm});entry.warmVolumeIds.push(neighbor.volume.id);await save();}
  await save();console.log(JSON.stringify({anchor:number,total:unique.size,volumes:entry.warmVolumeIds,starterBytes:entry.fileBytes,totalBytes:manifest.volumes.reduce((n,v)=>n+v.fileBytes,0)}));
}
manifest.taskCount=catalog.tasks.length;manifest.anchorCount=unique.size;manifest.totalAssetBytes=manifest.volumes.reduce((n,v)=>n+v.fileBytes+v.planes.reduce((s,p)=>s+p.fileBytes,0),0);await save();
console.log(JSON.stringify({complete:true,tasks:manifest.taskCount,anchors:manifest.anchorCount,volumes:manifest.volumes.length,assetBytes:manifest.totalAssetBytes,sourceRangeBytes:source.networkBytes}));
