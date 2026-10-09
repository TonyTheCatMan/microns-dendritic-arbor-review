import {EM_URL, RESOLUTION_NM, COORDINATE_CONVENTION} from './coordinates.js';

const digest=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof data==='string'?new TextEncoder().encode(data):data))].map(n=>n.toString(16).padStart(2,'0')).join('');
export const preparedPlaneKey=plan=>JSON.stringify([plan.plane,plan.begin,plan.end]);

/** Bounded, lossless copies of public native EM; never reviewer annotations. */
export class PreparedSource {
  constructor({url=new URL('../data/prepared-em/manifest.json',import.meta.url),fetcher=globalThis.fetch.bind(globalThis),onWarning=()=>{}}={}) {
    this.url=new URL(url);this.fetcher=fetcher;this.onWarning=onWarning;this.manifest=null;this.request=null;this.packRequests=new Map();this.chunkIndex=new Map();this.planeIndex=new Map();this.volumeIndex=new Map();this.activePacks=0;this.queue=[];this.networkBytes=0;this.completedPacks=0;this.pendingWarm=[];this.onChunk=()=>{};
  }
  async init() {
    if(this.manifest)return this.manifest;if(this.request)return this.request;
    this.request=(async()=>{
      const response=await this.fetcher(this.url);if(!response.ok)throw new Error('Prepared EM manifest HTTP '+response.status);
      const manifest=await response.json();
      if(manifest.schemaVersion!==1||manifest.source!==EM_URL||manifest.convention!==COORDINATE_CONVENTION||!manifest.resolutionNm?.every((n,i)=>n===RESOLUTION_NM[i])||await digest(manifest.infoText)!==manifest.infoSha256)throw new Error('Prepared EM source metadata does not match its integrity receipt');
      for(const volume of manifest.volumes){
        this.volumeIndex.set(volume.id,volume);
        if(!volume.chunks.length||volume.rawBytes>32*1024*1024)throw new Error('Invalid prepared EM crop');
        for(const chunk of volume.chunks){if(chunk.offset<0||chunk.offset+chunk.bytes>volume.rawBytes)throw new Error('Prepared EM chunk exceeds its crop');if(!this.chunkIndex.has(chunk.chunkId))this.chunkIndex.set(chunk.chunkId,{volume,chunk});}
        for(const plane of volume.planes)this.planeIndex.set(preparedPlaneKey(plane),{volume,plane});
      }
      this.manifest=manifest;return manifest;
    })().finally(()=>{this.request=null;});return this.request;
  }
  assetUrl(file){
    if(!/^[a-zA-Z0-9_.-]+$/.test(file))throw new Error('Invalid prepared EM asset path');return new URL(file,this.url);
  }
  async asset(file,sha256,bytes){
    const response=await this.fetcher(this.assetUrl(file));if(!response.ok)throw new Error('Prepared EM asset HTTP '+response.status);
    const encoded=new Uint8Array(await response.arrayBuffer());this.networkBytes+=encoded.byteLength;
    if(await digest(encoded)!==sha256)throw new Error('Prepared EM compressed asset integrity mismatch');
    const raw=new Uint8Array(await new Response(new Blob([encoded]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    if(raw.byteLength!==bytes)throw new Error('Prepared EM decoded asset length mismatch');return raw;
  }
  async starter(plan){
    const entry=this.planeIndex.get(preparedPlaneKey(plan));if(!entry)return null;
    const {plane,volume}=entry,pixels=await this.asset(plane.file,plane.fileSha256,plan.width*plan.height);
    if(await digest(pixels)!==plane.decodedSha256)throw new Error('Prepared EM plane integrity mismatch');
    this.warm((plane.warmVolumeIds||[volume.id]).map(id=>this.volumeIndex.get(id)).filter(Boolean));
    return {pixels,receipts:volume.chunks.map(chunk=>({...chunk.receipt,fromCache:false,preparedAsset:plane.file,preparedPlaneSha256:plane.decodedSha256})),volumeId:volume.id};
  }
  warm(volumes){this.pendingWarm=[...volumes];for(const volume of volumes)for(const chunk of volume.chunks)this.chunkIndex.set(chunk.chunkId,{volume,chunk});clearTimeout(this.warmTimer);this.warmTimer=setTimeout(()=>this.pumpWarm(),0);}
  pumpWarm(){
    while(this.pendingWarm.length&&this.activePacks<2){const volume=this.pendingWarm.shift();this.pack(volume).catch(error=>this.onWarning(error.message));}
  }
  pump(){while(this.activePacks<2&&this.queue.length){this.activePacks++;this.queue.shift()();}}
  pack(volume){
    if(this.packRequests.has(volume.id))return this.packRequests.get(volume.id);
    const promise=(async()=>{
      await new Promise(resolve=>{this.queue.push(resolve);this.pump();});
      try{
        const raw=await this.asset(volume.file,volume.fileSha256,volume.rawBytes),chunks=new Map();
        // Validate the entire bounded pack before exposing any pixels to callers.
        for(const chunk of volume.chunks){const data=raw.subarray(chunk.offset,chunk.offset+chunk.bytes);if(await digest(data)!==chunk.receipt.decodedSha256)throw new Error('Prepared EM native chunk integrity mismatch');chunks.set(chunk.chunkId,{data,receipt:{...chunk.receipt,preparedAsset:volume.file}});}
        for(const [id,chunk] of chunks)this.onChunk(id,chunk);
        this.completedPacks++;return chunks;
      }finally{this.activePacks--;this.pump();this.pumpWarm();}
    })().finally(()=>this.packRequests.delete(volume.id));this.packRequests.set(volume.id,promise);return promise;
  }
  async chunk(id){const entry=this.chunkIndex.get(id);return entry?(await this.pack(entry.volume)).get(id):null;}
}
