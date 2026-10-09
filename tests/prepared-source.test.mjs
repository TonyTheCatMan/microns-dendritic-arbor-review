import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {PreparedSource,preparedPlaneKey} from '../viewer/prepared-source.js';
import {RawSource,sha256} from '../viewer/raw-source.js';
import {EM_URL,RESOLUTION_NM,COORDINATE_CONVENTION,mortonCode,planePlan} from '../viewer/coordinates.js';

const intensity=(x,y,z)=>(3*x+7*y+17*z)%256;
const delay=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture({holdPacks=false}={}){
  const info={data_type:'uint8',num_channels:1,scales:[{key:'8_8_40',resolution:[...RESOLUTION_NM],size:[128,64,96],voxel_offset:[0,0,0],chunk_sizes:[[32,32,16]],encoding:'raw',sharding:{hash:'identity',preshift_bits:0,minishard_bits:0,shard_bits:0,minishard_index_encoding:'raw',data_encoding:'raw'}}]},infoText=JSON.stringify(info),infoSha256=await sha256(infoText);
  const manifest={schemaVersion:1,source:EM_URL,infoText,infoSha256,resolutionNm:[...RESOLUTION_NM],convention:COORDINATE_CONVENTION,volumes:[]},assets=new Map(),calls=[],held=[];
  const view={plane:'xy',centerNm:[256,256,1600],spanNm:512};
  for(let slab=0;slab<5;slab++){
    const raw=new Uint8Array(64*64*16),chunks=[];let offset=0;
    for(let y=0;y<2;y++)for(let x=0;x<2;x++){
      const grid=[x,y,slab],begin=[x*32,y*32,slab*16],dimensions=[32,32,16],chunkId=mortonCode(grid,[4,2,6]).toString(),bytes=32*32*16,data=raw.subarray(offset,offset+bytes);
      for(let z=0;z<16;z++)for(let j=0;j<32;j++)for(let i=0;i<32;i++)data[i+32*(j+32*z)]=intensity(begin[0]+i,begin[1]+j,begin[2]+z);
      chunks.push({chunkId,offset,bytes,receipt:{source:EM_URL,scale:'8_8_40',chunkId,grid,begin,dimensions,decodedSha256:await sha256(data),url:EM_URL+'/8_8_40/0.shard',rangeBytes:[offset,offset+bytes]}});offset+=bytes;
    }
    const file=`crop-${slab}.bin.gz`,encoded=gzipSync(raw);assets.set(file,encoded);manifest.volumes.push({id:'crop-'+slab,file,fileSha256:await sha256(encoded),rawBytes:raw.byteLength,chunks,planes:[]});
  }
  const plan=planePlan(view,info.scales[0]),pixels=new Uint8Array(plan.width*plan.height);for(let y=0;y<plan.height;y++)for(let x=0;x<plan.width;x++)pixels[x+plan.width*y]=intensity(x,y,40);
  const encoded=gzipSync(pixels),file='plane.bin.gz';assets.set(file,encoded);manifest.volumes[2].planes.push({...plan,file,fileSha256:await sha256(encoded),decodedSha256:await sha256(pixels),warmVolumeIds:['crop-2','crop-3','crop-1','crop-4','crop-0']});
  const fetcher=async input=>{const url=String(input),file=url.split('/').pop();calls.push(url);if(file==='manifest.json')return Response.json(manifest);if(url===EM_URL+'/info')return new Response(infoText);if(!assets.has(file))throw new Error('Unexpected network access '+url);if(file.startsWith('crop-')&&holdPacks)await new Promise(resolve=>held.push(resolve));return new Response(assets.get(file));};
  const prepared=new PreparedSource({url:'https://prepared.test/manifest.json',fetcher,manifestSha256:await sha256(JSON.stringify(manifest))}),source=new RawSource({fetcher,prepared});
  return {manifest,assets,calls,view,prepared,source,release(){holdPacks=false;held.splice(0).forEach(resolve=>resolve());}};
}
function exact(plane){assert.equal(plane.complete,true);const [u,v]=plane.axes;for(let y=0;y<plane.height;y++)for(let x=0;x<plane.width;x++){const p=[...plane.begin];p[u]+=x;p[v]+=y;assert.equal(plane.pixels[y*plane.width+x],intensity(...p));}}
async function warmed(prepared,target=5){for(let i=0;i<1000&&prepared.completedPacks<target;i++)await delay();assert.equal(prepared.completedPacks,target);}

test('cold first useful native plane precedes its crop packs and never waits for the public source',async()=>{
  const f=await fixture({holdPacks:true}),plane=await f.source.plane(f.view);exact(plane);
  assert.equal(plane.preparedVolumeId,'crop-2');assert.equal(f.source.networkBytes,0);assert.ok(f.calls.every(url=>url.startsWith('https://prepared.test/')));
  assert.equal(f.calls.filter(url=>url.endsWith('plane.bin.gz')).length,1);assert.equal(f.prepared.completedPacks,0);
  assert.equal(plane.sourceBinding.infoSha256,f.manifest.infoSha256);assert.ok(plane.receipts.every(r=>r.preparedPlaneSha256.length===64&&r.rangeBytes.length===2));
  f.release();await warmed(f.prepared);
});

test('80 exact neighboring sections cross four native chunk boundaries with zero additional requests',async()=>{
  const f=await fixture();await f.source.plane(f.view);await warmed(f.prepared);const requests=f.calls.length,bytes=f.prepared.networkBytes;
  for(let z=0;z<80;z++){const plane=await f.source.plane({...f.view,centerNm:[256,256,z*40]});exact(plane);assert.equal(plane.cacheHits,4);}
  for(const plane of ['xz','yz'])exact(await f.source.plane({...f.view,plane}));
  assert.equal(f.calls.length,requests);assert.equal(f.prepared.networkBytes,bytes);assert.equal(f.source.networkBytes,0);assert.ok(f.prepared.activePacks<=2);
});

test('warming an already decoded crop reuses verified chunks without reading its compressed pack again',async()=>{
  const f=await fixture();await f.source.plane(f.view);await warmed(f.prepared);const requests=f.calls.length,bytes=f.prepared.networkBytes;
  const chunks=await f.prepared.pack(f.manifest.volumes[2]);assert.equal(chunks.size,4);assert.equal(f.prepared.reusedPacks,1);
  assert.equal(f.calls.length,requests);assert.equal(f.prepared.networkBytes,bytes);assert.ok([...chunks.values()].every(chunk=>chunk.receipt.fromCache));
});

test('damaged decoded cache bytes are replaced before they can be shown as verified imagery',async()=>{
  const f=await fixture();await f.source.plane(f.view);await warmed(f.prepared);
  const chunk=f.manifest.volumes[2].chunks[0],key=f.source.infoHash+':'+f.source.scale.key+':'+chunk.chunkId;
  const corrupted=(await f.source.cache.get(key)).slice();corrupted[0]^=1;await f.source.cache.put(key,corrupted);
  const plane=await f.source.plane(f.view);exact(plane);assert.equal(await sha256(await f.source.cache.get(key)),chunk.receipt.decodedSha256);
});

test('clearing while crop downloads are active prevents old warm work from repopulating decoded images',async()=>{
  const f=await fixture({holdPacks:true});await f.source.plane(f.view);
  while(!f.prepared.activePacks)await delay();f.prepared.stopWarming();await f.source.cache.clear();
  f.release();await Promise.allSettled([...f.prepared.packRequests.values()]);await delay();
  assert.equal(f.source.cache.memory.size,0);assert.equal(f.prepared.pendingWarm.length,0);assert.equal(f.prepared.activePacks,0);
});

test('corrupt starter and corrupt crop cannot expose unverified pixels',async()=>{
  const f=await fixture();await f.prepared.init();f.assets.get('plane.bin.gz')[5]^=1;await assert.rejects(f.prepared.starter(planePlan(f.view,JSON.parse(f.manifest.infoText).scales[0])),/integrity mismatch/);
  let exposed=0;f.prepared.onChunk=()=>exposed++;f.assets.get('crop-2.bin.gz')[5]^=1;await assert.rejects(f.prepared.pack(f.manifest.volumes[2]),/integrity mismatch/);assert.equal(exposed,0);
});

test('public-source fallback refuses changed metadata rather than mixing source versions',async()=>{
  const f=await fixture();await f.source.init();f.source.fetcher=async url=>{assert.equal(url,EM_URL+'/info');return new Response(f.manifest.infoText+' ');};
  const result=await f.source.plane({...f.view,centerNm:[768,256,960]});assert.equal(result.complete,false);assert.ok(result.failures.every(f=>/Refusing to mix source versions/.test(f.error)));assert.equal(f.source.networkBytes,0);
});

test('clearing runtime imagery permits a verified prepared reload and preserves source binding',async()=>{
  const f=await fixture();const first=await f.source.plane(f.view);await warmed(f.prepared);await f.source.cache.clear();
  const second=await f.source.plane(f.view);exact(second);assert.deepEqual(first.sourceBinding,second.sourceBinding);await warmed(f.prepared,10);
});

test('every catalog task has a bounded native starter plus adjacent Z slabs with verifiable receipts',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../data/prepared-em/manifest.json',import.meta.url),'utf8')),catalog=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const info=JSON.parse(manifest.infoText),volumes=new Map(manifest.volumes.map(v=>[v.id,v])),planes=new Map(manifest.volumes.flatMap(v=>v.planes.map(p=>[preparedPlaneKey(p),p])));
  assert.equal(await sha256(manifest.infoText),catalog.sources.em.metadataSha256);assert.equal(manifest.taskCount,50);
  for(const task of catalog.tasks){const key=preparedPlaneKey(planePlan({plane:'xy',centerNm:task.anchorNm,spanNm:4096},info.scales[0])),plane=planes.get(key);assert.ok(plane,task.id);assert.ok(plane.taskIds.includes(task.id));assert.equal(plane.warmVolumeIds.length,5);for(const id of plane.warmVolumeIds)assert.ok(volumes.has(id));}
  for(const volume of manifest.volumes){assert.ok(volume.fileBytes<10*1024*1024);for(const chunk of volume.chunks){assert.equal(chunk.bytes,chunk.receipt.dimensions.reduce((a,b)=>a*b,1));assert.equal(chunk.receipt.decodedSha256.length,64);assert.ok(chunk.receipt.url.startsWith(EM_URL+'/'));assert.ok(chunk.receipt.rangeBytes[1]>chunk.receipt.rangeBytes[0]);}}
  // An independent decode of one genuine crop checks every starter byte against
  // its source chunks; the remaining files are hashed by the preparation tool.
  const volume=manifest.volumes.find(v=>v.planes.length),plane=volume.planes[0],raw=gunzipSync(await fs.readFile(new URL('../data/prepared-em/'+volume.file,import.meta.url))),pixels=gunzipSync(await fs.readFile(new URL('../data/prepared-em/'+plane.file,import.meta.url)));
  for(let y=0;y<plane.height;y++)for(let x=0;x<plane.width;x++){
    const p=[plane.begin[0]+x,plane.begin[1]+y,plane.begin[2]],chunk=volume.chunks.find(c=>p.every((n,i)=>n>=c.receipt.begin[i]&&n<c.receipt.begin[i]+c.receipt.dimensions[i])),local=p.map((n,i)=>n-chunk.receipt.begin[i]),d=chunk.receipt.dimensions;
    assert.equal(pixels[x+plane.width*y],raw[chunk.offset+local[0]+d[0]*(local[1]+d[1]*local[2])]);
  }
});
