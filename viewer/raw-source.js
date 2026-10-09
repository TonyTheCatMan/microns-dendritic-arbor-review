import {EM_URL, RESOLUTION_NM, mortonCode, planePlan} from './coordinates.js';

export async function sha256(data) {
  const bytes=typeof data==='string'?new TextEncoder().encode(data):data;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function inflate(bytes, encoding) {
  if(encoding!=='gzip') return bytes;
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
// Cancelling a view releases that caller immediately. Already-started source reads
// may finish and become useful to the next view, instead of restarting each pan.
function observe(promise,signal,onFinish=()=>{}) {
  return new Promise((resolve,reject)=>{
    let finished=false;
    const finish=(callback,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',abort);onFinish();callback(value);};
    const abort=()=>finish(reject,signal.reason||new DOMException('Aborted','AbortError'));
    promise.then(value=>finish(resolve,value),error=>finish(reject,error));
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  });
}
export function shardLocation(id, sharding) {
  if(sharding.hash!=='identity') throw new Error('Unsupported source shard hash');
  const hashed=id>>BigInt(sharding.preshift_bits), mini=Number(hashed&((1n<<BigInt(sharding.minishard_bits))-1n));
  const shard=(hashed>>BigInt(sharding.minishard_bits))&((1n<<BigInt(sharding.shard_bits))-1n);
  return {mini,filename:shard.toString(16).padStart(Math.ceil(sharding.shard_bits/4),'0')+'.shard',indexBytes:16*2**sharding.minishard_bits};
}
export function decodeMinishard(bytes,indexBytes) {
  if(bytes.byteLength%24) throw new Error('Invalid minishard index length');
  const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), n=bytes.byteLength/24, entries=new Map();let id=0n, end=BigInt(indexBytes);
  for(let i=0;i<n;i++) {
    id+=d.getBigUint64(i*8,true);const start=end+d.getBigUint64((n+i)*8,true),size=d.getBigUint64((2*n+i)*8,true);end=start+size;
    if(end>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid shard byte offset');
    entries.set(id.toString(),{start:Number(start),end:Number(end)});
  }
  return entries;
}

/** Reusable image cache is isolated from annotations; clearing it cannot touch review work. */
export class ChunkCache {
  constructor({maxBytes=32*1024*1024,persistentLimit=96,onWarning=()=>{}}={}) {
    this.maxBytes=maxBytes;this.persistentLimit=persistentLimit;this.onWarning=onWarning;this.memory=new Map();this.bytes=0;this.cache=null;this.persistenceDisabled=false;
  }
  async open() {
    if(!this.cache&&!this.persistenceDisabled&&globalThis.caches)try{this.cache=await caches.open('dendritic-arbor-em-v2');}catch(e){this.persistenceDisabled=true;this.onWarning(e.message);}
  }
  key(id) {return EM_URL+'/__dendritic_native_cache__/'+encodeURIComponent(id);}
  remember(id,value) {
    if(this.memory.has(id)){this.bytes-=this.memory.get(id).byteLength;this.memory.delete(id);}
    this.memory.set(id,value);this.bytes+=value.byteLength;
    while(this.bytes>this.maxBytes&&this.memory.size){const first=this.memory.keys().next().value;this.bytes-=this.memory.get(first).byteLength;this.memory.delete(first);}
  }
  async get(id) {
    if(this.memory.has(id)){const b=this.memory.get(id);this.memory.delete(id);this.memory.set(id,b);return b;}
    await this.open();if(this.cache)try {const response=await this.cache.match(this.key(id));if(response){const b=new Uint8Array(await response.arrayBuffer());this.remember(id,b);return b;}}catch{}
    return null;
  }
  async put(id,value) {
    this.remember(id,value);await this.open();if(!this.cache)return;
    try {
      await this.cache.put(this.key(id),new Response(value));const keys=await this.cache.keys();
      for(let i=0;i<keys.length-this.persistentLimit;i++)await this.cache.delete(keys[i]);
    }catch(e){this.persistenceDisabled=true;this.cache=null;this.onWarning('Image cache: '+e.message);}
  }
  async clear() {this.memory.clear();this.bytes=0;this.cache=null;if(globalThis.caches)await caches.delete('dendritic-arbor-em-v2');}
}

export class RawSource {
  constructor({fetcher=globalThis.fetch.bind(globalThis),cache=new ChunkCache(),concurrency=4}={}) {
    this.fetcher=fetcher;this.cache=cache;this.concurrency=Math.max(1,Math.floor(concurrency));this.indexes=new Map();this.info=null;this.infoHash=null;this.scale=null;this.networkBytes=0;
    this.initRequest=null;this.indexRequests=new Map();this.chunkRequests=new Map();this.chunkQueue=[];this.activeChunkLoads=0;this.decodedHashes=new WeakMap();
  }
  async init(signal) {
    signal?.throwIfAborted();
    if(this.info)return this.info;
    if(!this.initRequest)this.initRequest=(async()=>{
      const r=await this.fetcher(EM_URL+'/info');if(!r.ok)throw new Error('EM metadata HTTP '+r.status);
      const text=await r.text(),info=JSON.parse(text);const sorted=[...info.scales].sort((a,b)=>a.resolution.reduce((p,n)=>p*n,1)-b.resolution.reduce((p,n)=>p*n,1));const scale=sorted[0];
      if(info.data_type!=='uint8'||info.num_channels!==1||scale.encoding!=='raw'||!scale.resolution.every((r,i)=>r===RESOLUTION_NM[i]))throw new Error('EM source changed: expected finest raw uint8 8 × 8 × 40 nm. Review source binding before use.');
      this.infoHash=await sha256(text);this.info=info;this.scale=scale;return info;
    })().finally(()=>{this.initRequest=null;});
    return observe(this.initRequest,signal);
  }
  async range(url,start,end,signal) {
    signal?.throwIfAborted();
    const response=await this.fetcher(url,{signal,headers:{Range:`bytes=${start}-${end-1}`}});
    if(response.status!==206)throw new Error(`EM byte range HTTP ${response.status}; no complete shard download is permitted.`);
    const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength!==end-start)throw new Error('Truncated EM range');
    this.networkBytes+=bytes.byteLength;return bytes;
  }
  pumpChunks() {
    while(this.activeChunkLoads<this.concurrency&&this.chunkQueue.length){
      const job=this.chunkQueue.shift();
      if(!job.entry.waiters){job.reject(new DOMException('Superseded view','AbortError'));continue;}
      this.activeChunkLoads++;job.entry.started=true;
      job.resolve(()=>{this.activeChunkLoads--;this.pumpChunks();});
    }
  }
  index(url,loc) {
    const key=url+':'+loc.mini;
    if(this.indexes.has(key))return Promise.resolve(this.indexes.get(key));
    if(!this.indexRequests.has(key))this.indexRequests.set(key,(async()=>{
      const header=await this.range(url,loc.mini*16,loc.mini*16+16),d=new DataView(header.buffer,header.byteOffset,16);
      const start=Number(d.getBigUint64(0,true))+loc.indexBytes,end=Number(d.getBigUint64(8,true))+loc.indexBytes;
      if(start===end)throw new Error('No EM chunk at this location');
      const bytes=await inflate(await this.range(url,start,end),this.scale.sharding.minishard_index_encoding);
      const entries=decodeMinishard(bytes,loc.indexBytes);this.indexes.set(key,entries);if(this.indexes.size>64)this.indexes.delete(this.indexes.keys().next().value);
      return entries;
    })().finally(()=>this.indexRequests.delete(key)));
    return this.indexRequests.get(key);
  }
  decodedHash(data) {
    // The weak key follows the cache's decoded byte allocation, so eviction also
    // releases its hash. Persistent bytes are verified once when read into memory.
    if(!this.decodedHashes.has(data))this.decodedHashes.set(data,sha256(data));
    return this.decodedHashes.get(data);
  }
  chunk(grid,signal) {
    signal?.throwIfAborted();
    const s=this.scale,size=s.chunk_sizes[0],shape=s.size.map((n,i)=>Math.ceil(n/size[i])),id=mortonCode(grid,shape);
    const cacheId=this.infoHash+':'+s.key+':'+id;
    const begin=grid.map((n,i)=>n*size[i]+(s.voxel_offset?.[i]||0));const dimensions=grid.map((n,i)=>Math.min(size[i],s.size[i]-n*size[i]));
    let entry=this.chunkRequests.get(cacheId);const shared=!!entry;
    if(!entry){
      entry={waiters:0,started:false};
      entry.promise=(async()=>{
        const cached=await this.cache.get(cacheId);let data=cached,receipt;
        if(!data){
          const release=await new Promise((resolve,reject)=>{this.chunkQueue.push({entry,resolve,reject});this.pumpChunks();});
          try{
            const loc=shardLocation(id,s.sharding),url=EM_URL+'/'+s.key+'/'+loc.filename,entries=await this.index(url,loc);
            const position=entries.get(id.toString());if(!position)throw new Error('No EM chunk at this location');
            data=await inflate(await this.range(url,position.start,position.end),s.sharding.data_encoding);
            if(data.byteLength!==dimensions.reduce((p,n)=>p*n,1))throw new Error('EM chunk length differs from native uint8 shape');
            // remember() happens synchronously. Durable browser cache bookkeeping
            // can finish after the pixels are available to this and the next view.
            this.cache.put(cacheId,data).catch(error=>this.cache.onWarning?.('Image cache: '+error.message));
            receipt={url,rangeBytes:[position.start,position.end]};
          }finally{release();}
        }
        return {data,begin,dimensions,receipt:{source:EM_URL,scale:s.key,chunkId:id.toString(),grid,begin,dimensions,decodedSha256:await this.decodedHash(data),fromCache:!!cached,...receipt}};
      })().finally(()=>{if(this.chunkRequests.get(cacheId)===entry)this.chunkRequests.delete(cacheId);});
      this.chunkRequests.set(cacheId,entry);
    }
    entry.waiters++;
    return observe(entry.promise,signal,()=>{
      entry.waiters--;
      if(!entry.waiters&&!entry.started&&this.chunkRequests.get(cacheId)===entry)this.chunkRequests.delete(cacheId);
      this.pumpChunks();
    }).then(chunk=>({...chunk,receipt:{...chunk.receipt,sharedRequest:shared}}));
  }
  async plane(view,{signal,onProgress=()=>{}}={}) {
    const started=performance.now();await this.init(signal);signal?.throwIfAborted();const s=this.scale,p=planePlan(view,s),size=s.chunk_sizes[0],offset=s.voxel_offset||[0,0,0];
    if(p.begin.some((n,i)=>n<offset[i]||p.end[i]>offset[i]+s.size[i]))throw new Error('Requested plane is outside public EM coverage. Move inward or reduce the field.');
    const first=p.begin.map((n,i)=>Math.floor((n-offset[i])/size[i])),last=p.end.map((n,i)=>Math.floor((n-1-offset[i])/size[i])),grids=[];
    for(let z=first[2];z<=last[2];z++)for(let y=first[1];y<=last[1];y++)for(let x=first[0];x<=last[0];x++)grids.push([x,y,z]);
    // Central chunks produce a useful partial image first; unfilled pixels remain explicitly masked.
    grids.sort((a,b)=>a.reduce((sum,n,i)=>sum+(n-(first[i]+last[i])/2)**2,0)-b.reduce((sum,n,i)=>sum+(n-(first[i]+last[i])/2)**2,0));
    const result={...p,pixels:new Uint8Array(p.width*p.height),coverage:new Uint8Array(p.width*p.height),receipts:[],complete:false,loaded:0,total:grids.length,cacheHits:0,sharedChunks:0,elapsedMs:0};let cursor=0,failures=[];
    const [u,v,d]=p.axes;
    const worker=async()=>{while(cursor<grids.length){signal?.throwIfAborted();const grid=grids[cursor++];try{
      const chunk=await this.chunk(grid,signal);signal?.throwIfAborted();const startU=Math.max(p.begin[u],chunk.begin[u]),endU=Math.min(p.end[u],chunk.begin[u]+chunk.dimensions[u]),startV=Math.max(p.begin[v],chunk.begin[v]),endV=Math.min(p.end[v],chunk.begin[v]+chunk.dimensions[v]);
      const strides=[1,chunk.dimensions[0],chunk.dimensions[0]*chunk.dimensions[1]],rowWidth=endU-startU;
      let native=(p.begin[d]-chunk.begin[d])*strides[d]+(startV-chunk.begin[v])*strides[v]+(startU-chunk.begin[u])*strides[u];
      for(let y=startV;y<endV;y++,native+=strides[v]){
        const output=(y-p.begin[v])*p.width+startU-p.begin[u];
        if(strides[u]===1)result.pixels.set(chunk.data.subarray(native,native+rowWidth),output);
        else for(let x=0,input=native;x<rowWidth;x++,input+=strides[u])result.pixels[output+x]=chunk.data[input];
        result.coverage.fill(1,output,output+rowWidth);
      }
      if(chunk.receipt.fromCache)result.cacheHits++;if(chunk.receipt.sharedRequest)result.sharedChunks++;
      result.receipts.push(chunk.receipt);if(result.firstUsefulMs===undefined)result.firstUsefulMs=performance.now()-started;
    }catch(e){if(signal?.aborted)throw e;failures.push({grid,error:e.message});}result.loaded++;result.elapsedMs=performance.now()-started;onProgress(result);}};
    await Promise.all(Array.from({length:Math.min(this.concurrency,grids.length)},worker));signal?.throwIfAborted();result.complete=failures.length===0;result.failures=failures;result.elapsedMs=performance.now()-started;
    result.sourceBinding={source:EM_URL,scale:s.key,encoding:s.encoding,resolutionNm:s.resolution,infoSha256:this.infoHash,convention:p.convention};
    onProgress(result);return result;
  }
}
