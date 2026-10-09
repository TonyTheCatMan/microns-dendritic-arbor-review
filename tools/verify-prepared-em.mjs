import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {sha256} from '../viewer/raw-source.js';
import {mortonCode,planePlan} from '../viewer/coordinates.js';
import {preparedPlaneKey} from '../viewer/prepared-source.js';

const directory=new URL('../data/prepared-em/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8')),catalog=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const info=JSON.parse(manifest.infoText),scale=info.scales.find(s=>s.key==='8_8_40'),size=scale.chunk_sizes[0],shape=scale.size.map((n,i)=>Math.ceil(n/size[i]));
if(await sha256(manifest.infoText)!==catalog.sources.em.metadataSha256)throw new Error('Metadata differs from catalog');
let assets=0,encodedBytes=0,chunkCount=0,planes=0;
const load=async entry=>{const encoded=await fs.readFile(new URL(entry.file,directory));if(encoded.byteLength!==entry.fileBytes||await sha256(encoded)!==entry.fileSha256)throw new Error('File hash/length mismatch: '+entry.file);assets++;encodedBytes+=encoded.byteLength;return gunzipSync(encoded);};
const actualPlanes=new Map();
for(const volume of manifest.volumes){
  const raw=await load(volume);if(raw.byteLength!==volume.rawBytes)throw new Error('Crop byte length mismatch');
  const chunkMap=new Map();
  for(const chunk of volume.chunks){
    const r=chunk.receipt;if(mortonCode(r.grid,shape).toString()!==chunk.chunkId||r.begin.some((n,i)=>n!==r.grid[i]*size[i]+scale.voxel_offset[i]))throw new Error('Native chunk integer alignment mismatch');
    if(await sha256(raw.subarray(chunk.offset,chunk.offset+chunk.bytes))!==r.decodedSha256)throw new Error('Decoded native chunk hash mismatch');
    chunkMap.set(r.grid.join(','),chunk);chunkCount++;
  }
  for(const plane of volume.planes){
    const pixels=await load(plane);if(await sha256(pixels)!==plane.decodedSha256)throw new Error('Starter hash mismatch');
    const copied=new Uint8Array(plane.width*plane.height);
    for(let y=0;y<plane.height;y++)for(let x=0;x<plane.width;x++){
      const point=[plane.begin[0]+x,plane.begin[1]+y,plane.begin[2]],grid=point.map((n,i)=>Math.floor((n-scale.voxel_offset[i])/size[i])),chunk=chunkMap.get(grid.join(','));
      if(!chunk)throw new Error('Starter extends beyond its source chunks');const local=point.map((n,i)=>n-chunk.receipt.begin[i]),d=chunk.receipt.dimensions;
      copied[x+plane.width*y]=raw[chunk.offset+local[0]+d[0]*(local[1]+d[1]*local[2])];
    }
    if(!Buffer.from(copied).equals(pixels))throw new Error('Starter pixels differ from native source chunks');actualPlanes.set(preparedPlaneKey(plane),plane);planes++;
  }
}
for(const task of catalog.tasks){
  const plan=planePlan({plane:'xy',centerNm:task.anchorNm,spanNm:4096},scale),plane=actualPlanes.get(preparedPlaneKey(plan));if(!plane?.taskIds.includes(task.id))throw new Error('Missing task starter: '+task.id);
  const warm=manifest.volumes.filter(v=>plane.warmVolumeIds.includes(v.id)),z=warm.flatMap(v=>v.chunks.map(c=>c.receipt.begin[2]));
  if(plan.center[2]-32<Math.min(...z)||plan.center[2]+32>=Math.max(...z)+16)throw new Error('Prepared neighborhood does not cover 32 sections each direction');
}
console.log(JSON.stringify({complete:true,checkedAt:new Date().toISOString(),assets,encodedBytes,volumes:manifest.volumes.length,nativeChunks:chunkCount,exactStarterPlanes:planes,tasks:catalog.tasks.length,starterPixelMismatches:0,sourceInfoSha256:manifest.infoSha256}));
