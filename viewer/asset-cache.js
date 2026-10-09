export const ASSET_CACHE_NAME='dendritic-arbor-assets-v1';
export const PREPARED_MANIFEST_SHA256='df8d3058a9bdb235620305b2e63cacfda75cd2b48c458a6643b86a67bbac3e20';
export const MESH_MANIFEST_SHA256='5bb9489ee29d12aab27e27ad7f12d815d5c8e7b48d8185b5cb4a207e843b6ee3';

export async function assetHash(bytes){
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}

/** Immutable source assets only. Reviewer work lives in a separate IndexedDB.
 * Keys include their expected digest, so a deployment cannot reuse older bytes.
 * This bounded cache is an optimization: storage denial never blocks viewing.
 */
export class VerifiedAssetCache {
  constructor({cacheName=ASSET_CACHE_NAME,maxBytes=256*1024*1024,maxEntries=512,cacheStorage=globalThis.caches}={}){
    this.cacheName=cacheName;this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.storage=cacheStorage;
    this.cache=null;this.openRequest=null;this.writeTail=Promise.resolve();this.inflight=new Map();this.entries=new Map();this.disabled=false;this.generation=0;this.warned=false;
    this.stats={cacheHits:0,networkRequests:0,networkBytes:0,persistentBytes:0};
  }
  key(url,hash){
    if(!/^[0-9a-f]{64}$/.test(hash))throw new Error('Source asset requires a SHA-256 digest');
    const key=new URL(url);key.searchParams.set('__dendritic_sha256',hash);return key.href;
  }
  warn(onWarning,error){if(!this.warned){this.warned=true;onWarning('Browser image cache: '+error.message);}}
  async open(onWarning){
    if(this.cache||this.disabled||!this.storage)return this.cache;
    if(!this.openRequest)this.openRequest=(async()=>{
      try{
        const cache=await this.storage.open(this.cacheName),keys=await cache.keys();
        const entries=await Promise.all(keys.map(async key=>{const response=await cache.match(key);return [key.url,Number(response?.headers.get('x-dendritic-bytes'))];}));
        for(const [key,bytes]of entries){
          if(!Number.isSafeInteger(bytes)||bytes<=0){await cache.delete(key);continue;}
          this.entries.set(key,{bytes,access:Date.now()});this.stats.persistentBytes+=bytes;
        }
        this.cache=cache;await this.trim();return cache;
      }catch(error){this.disabled=true;this.warn(onWarning,error);return null;}
    })().finally(()=>{this.openRequest=null;});
    return this.openRequest;
  }
  async remove(key){
    await this.cache?.delete(key);const previous=this.entries.get(key);
    if(previous){this.stats.persistentBytes-=previous.bytes;this.entries.delete(key);}
  }
  async trim(reserveBytes=0,reserveEntries=0){
    while(this.entries.size&&(this.stats.persistentBytes+reserveBytes>this.maxBytes||this.entries.size+reserveEntries>this.maxEntries)){
      let oldest;for(const entry of this.entries)if(!oldest||entry[1].access<oldest[1].access)oldest=entry;
      await this.remove(oldest[0]);
    }
  }
  async save(key,bytes,onWarning,generation){
    const work=this.writeTail.then(async()=>{
      if(generation!==this.generation||bytes.byteLength>this.maxBytes)return;
      const cache=await this.open(onWarning);if(!cache)return;
      try{
        await this.remove(key);await this.trim(bytes.byteLength,1);
        const response=()=>new Response(bytes,{headers:{'Content-Type':'application/octet-stream','x-dendritic-bytes':String(bytes.byteLength)}});
        try{await cache.put(key,response());}
        catch(error){
          if(error.name!=='QuotaExceededError')throw error;
          // Make room only in this disposable cache, never in annotation storage.
          const count=Math.max(1,Math.ceil(this.entries.size/4));
          for(let i=0;i<count&&this.entries.size;i++)await this.remove(this.entries.keys().next().value);
          await cache.put(key,response());
        }
        this.entries.set(key,{bytes:bytes.byteLength,access:Date.now()});this.stats.persistentBytes+=bytes.byteLength;
      }catch(error){this.warn(onWarning,error);}
    });
    this.writeTail=work.catch(()=>{});await work;
  }
  async load(url,hash,{fetcher=globalThis.fetch.bind(globalThis),onWarning=()=>{}}={}){
    const key=this.key(url,hash);if(this.inflight.has(key))return this.inflight.get(key);
    const generation=this.generation;
    const request=(async()=>{
      const cache=await this.open(onWarning);
      if(cache)try{
        const response=await cache.match(key);
        if(response){
          const bytes=new Uint8Array(await response.arrayBuffer());
          if(await assetHash(bytes)===hash){this.stats.cacheHits++;const entry=this.entries.get(key);if(entry)entry.access=Date.now();return {bytes,fromCache:true};}
          await this.remove(key);onWarning('Browser image cache contained a damaged asset; downloading a verified copy.');
        }
      }catch(error){this.warn(onWarning,error);}
      const response=await fetcher(url);this.stats.networkRequests++;
      if(!response.ok)throw new Error('Source asset HTTP '+response.status);
      const bytes=new Uint8Array(await response.arrayBuffer());this.stats.networkBytes+=bytes.byteLength;
      if(await assetHash(bytes)!==hash)throw new Error('Source asset integrity mismatch');
      await this.save(key,bytes,onWarning,generation);return {bytes,fromCache:false};
    })().finally(()=>this.inflight.delete(key));
    this.inflight.set(key,request);return request;
  }
  async clear(){
    this.generation++;await this.writeTail;await this.openRequest;
    this.cache=null;this.entries.clear();this.stats.persistentBytes=0;this.disabled=false;this.warned=false;
    if(this.storage)await this.storage.delete(this.cacheName);
  }
}

export const preparedAssetCache=new VerifiedAssetCache();
export const clearPreparedAssetCache=()=>preparedAssetCache.clear();
