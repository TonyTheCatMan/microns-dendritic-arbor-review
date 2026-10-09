import test from 'node:test';
import assert from 'node:assert/strict';
import {RawSource,ChunkCache} from '../viewer/raw-source.js';
import {mortonCode,RESOLUTION_NM} from '../viewer/coordinates.js';

const intensity=(x,y,z)=>(3*x+7*y+17*z)%256;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

// A complete synthetic precomputed raw shard exercises real range, index,
// cache, and plane code. Its intensity function is independent of reslicing.
function fixture({size=[128,128,16],chunkSize=[64,64,4],holdPayloads=false}={}){
  const shape=size.map((n,i)=>Math.ceil(n/chunkSize[i])),chunks=[];
  for(let z=0;z<shape[2];z++)for(let y=0;y<shape[1];y++)for(let x=0;x<shape[0];x++){
    const grid=[x,y,z],begin=grid.map((n,i)=>n*chunkSize[i]),dimensions=grid.map((n,i)=>Math.min(chunkSize[i],size[i]-begin[i]));
    const bytes=new Uint8Array(dimensions.reduce((a,b)=>a*b,1));
    for(let k=0;k<dimensions[2];k++)for(let j=0;j<dimensions[1];j++)for(let i=0;i<dimensions[0];i++)bytes[i+dimensions[0]*(j+dimensions[1]*k)]=intensity(begin[0]+i,begin[1]+j,begin[2]+k);
    chunks.push({id:mortonCode(grid,shape),bytes});
  }
  chunks.sort((a,b)=>a.id<b.id?-1:1);
  const indexLength=chunks.length*24,dataStart=16+indexLength,shard=new Uint8Array(dataStart+chunks.reduce((n,c)=>n+c.bytes.length,0)),view=new DataView(shard.buffer);
  view.setBigUint64(0,0n,true);view.setBigUint64(8,BigInt(indexLength),true);
  let previous=0n,position=dataStart;
  chunks.forEach((chunk,i)=>{
    view.setBigUint64(16+i*8,chunk.id-previous,true);previous=chunk.id;
    view.setBigUint64(16+(chunks.length+i)*8,i===0?BigInt(indexLength):0n,true);
    view.setBigUint64(16+(2*chunks.length+i)*8,BigInt(chunk.bytes.length),true);
    shard.set(chunk.bytes,position);position+=chunk.bytes.length;
  });
  const info={data_type:'uint8',num_channels:1,scales:[{key:'8_8_40',resolution:[...RESOLUTION_NM],size,voxel_offset:[0,0,0],chunk_sizes:[chunkSize],encoding:'raw',sharding:{hash:'identity',preshift_bits:0,minishard_bits:0,shard_bits:0,minishard_index_encoding:'raw',data_encoding:'raw'}}]};
  const calls=[],pending=[];let active=0,maxActive=0,resolveFirst;
  const firstPayload=new Promise(resolve=>{resolveFirst=resolve;});
  const fetcher=async(url,options={})=>{
    if(url.endsWith('/info')){calls.push({kind:'info'});await tick();return new Response(JSON.stringify(info));}
    assert.match(options.headers.Range,/^bytes=\d+-\d+$/);
    const [start,last]=options.headers.Range.slice(6).split('-').map(Number),end=last+1,kind=start===0?'header':start<dataStart?'index':'payload';
    calls.push({kind,start,end});
    if(kind==='payload'){
      active++;maxActive=Math.max(active,maxActive);resolveFirst();
      if(holdPayloads)await new Promise(resolve=>pending.push(resolve));else await tick();
      active--;
    }
    return new Response(shard.slice(start,end),{status:206});
  };
  return {fetcher,calls,firstPayload,get maxActive(){return maxActive;},release(){holdPayloads=false;pending.splice(0).forEach(resolve=>resolve());}};
}

function verifyPlane(plane){
  assert.equal(plane.complete,true);assert.ok(plane.coverage.every(n=>n===1));
  const [u,v]=plane.axes;
  for(let y=0;y<plane.height;y++)for(let x=0;x<plane.width;x++){
    const point=[...plane.begin];point[u]+=x;point[v]+=y;
    assert.equal(plane.pixels[y*plane.width+x],intensity(...point),`${plane.plane} native pixel ${x}, ${y}`);
  }
}

test('cached neighboring sections and overlapping pans use zero extra source requests',async()=>{
  const input=fixture(),source=new RawSource({fetcher:input.fetcher});
  const view={plane:'xy',centerNm:[512,512,320],spanNm:256};
  const first=await source.plane(view);verifyPlane(first);
  assert.equal(first.cacheHits,0);assert.equal(first.total,4);
  assert.equal(input.calls.filter(c=>c.kind==='header').length,1);
  assert.equal(input.calls.filter(c=>c.kind==='index').length,1);
  const bytes=source.networkBytes,requests=input.calls.length;
  const next=await source.plane({...view,centerNm:[520,512,360]});verifyPlane(next);
  assert.equal(next.cacheHits,next.total);assert.equal(source.networkBytes,bytes);assert.equal(input.calls.length,requests);
  assert.deepEqual(next.receipts.map(r=>r.decodedSha256).sort(),first.receipts.map(r=>r.decodedSha256).sort());
  assert.ok(next.receipts.every(r=>r.decodedSha256.length===64));
});

test('cancelling a view promptly releases it but shares useful in-flight chunks with its successor',async()=>{
  const input=fixture({holdPayloads:true}),source=new RawSource({fetcher:input.fetcher,concurrency:2}),controller=new AbortController();
  const view={plane:'xy',centerNm:[512,512,320],spanNm:256};
  const obsolete=source.plane(view,{signal:controller.signal});
  const rejection=assert.rejects(obsolete,error=>error.name==='AbortError');
  await input.firstPayload;
  const successor=source.plane({...view,centerNm:[512,512,360]});
  await tick();controller.abort();await rejection;
  // No payload was allowed to finish before cancellation was observed.
  input.release();const plane=await successor;verifyPlane(plane);
  assert.ok(plane.sharedChunks>=2);
  assert.equal(input.calls.filter(c=>c.kind==='info').length,1);
  assert.equal(input.calls.filter(c=>c.kind==='payload').length,4);
  assert.ok(input.maxActive<=2);
});

test('rapid abandoned requests never exceed source concurrency or download obsolete queued chunks',async()=>{
  const input=fixture({holdPayloads:true}),source=new RawSource({fetcher:input.fetcher,concurrency:1});await source.init();
  const active=source.chunk([0,0,0]);await input.firstPayload;
  const cancellations=[];
  for(let z=1;z<4;z++){
    const controller=new AbortController(),waiting=source.chunk([0,0,z],controller.signal);
    cancellations.push(assert.rejects(waiting,error=>error.name==='AbortError'));
    await tick();controller.abort();
  }
  await Promise.all(cancellations);input.release();await active;await tick();
  assert.equal(input.maxActive,1);assert.equal(input.calls.filter(c=>c.kind==='payload').length,1);
  const retry=await source.chunk([0,0,3]);assert.equal(retry.data[0],intensity(0,0,12));
  assert.equal(input.calls.filter(c=>c.kind==='payload').length,2);
});

test('stride reslicing retains exact XY, XZ and YZ intensities including shortened edge chunks',async()=>{
  const input=fixture({size:[70,67,10]}),source=new RawSource({fetcher:input.fetcher});
  for(const plane of ['xy','xz','yz']){
    const result=await source.plane({plane,centerNm:[512,512,320],spanNm:32});verifyPlane(result);
    assert.deepEqual(result.pixelSizeNm,plane==='xy'?[8,8]:[8,40]);
  }
});

test('decoded hash promises follow cached bytes and can be collected after cache eviction',async()=>{
  const source=new RawSource(),bytes=new Uint8Array([0,1,127,255]);
  assert.equal(source.decodedHash(bytes),source.decodedHash(bytes));
  const clone=bytes.slice();assert.notEqual(source.decodedHash(bytes),source.decodedHash(clone));
  assert.equal(await source.decodedHash(bytes),await source.decodedHash(clone));
  assert.ok(source.decodedHashes instanceof WeakMap);
});

test('a failed shared chunk request is removed so a later request can retry',async()=>{
  const input=fixture(),source=new RawSource({fetcher:input.fetcher});await source.init();
  const fetcher=source.fetcher;let fail=true;
  source.fetcher=async(...args)=>{if(fail){fail=false;throw new Error('temporary source failure');}return fetcher(...args);};
  await assert.rejects(source.chunk([0,0,0]),/temporary source failure/);
  const recovered=await source.chunk([0,0,0]);assert.equal(recovered.data[0],0);
  assert.equal(source.activeChunkLoads,0);assert.equal(source.chunkRequests.size,0);assert.equal(source.indexRequests.size,0);
});

test('cached full-resolution 512 by 512 reslice produces exact pixels without network',async t=>{
  const input=fixture({size:[512,512,16],chunkSize:[128,128,16]}),source=new RawSource({fetcher:input.fetcher,cache:new ChunkCache({maxBytes:8*1024*1024})});
  const view={plane:'xy',centerNm:[2048,2048,320],spanNm:4096};
  await source.plane(view);const bytes=source.networkBytes;
  const measurements=[];let plane;
  for(let z=1;z<=8;z++){plane=await source.plane({...view,centerNm:[2048,2048,z*40]});measurements.push(plane.elapsedMs);}
  verifyPlane(plane);assert.equal(plane.cacheHits,16);assert.equal(source.networkBytes,bytes);
  const median=measurements.sort((a,b)=>a-b)[Math.floor(measurements.length/2)];
  t.diagnostic(`Cached 512×512 native reslice median ${median.toFixed(2)} ms; 16/16 cache hits; 0 network bytes.`);
  // Timing is evidence, not a flaky machine-speed pass/fail requirement.
});
