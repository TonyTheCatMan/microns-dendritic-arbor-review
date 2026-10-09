import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {VerifiedAssetCache,assetHash,PREPARED_MANIFEST_SHA256,MESH_MANIFEST_SHA256} from '../viewer/asset-cache.js';

class MemoryStorage {
  constructor(){this.stores=new Map();this.deleted=[];this.failWrites=false;}
  async open(name){
    if(!this.stores.has(name)){
      const entries=new Map(),owner=this;
      this.stores.set(name,{
        entries,
        async keys(){return [...entries.keys()].map(url=>({url}));},
        async match(key){return entries.get(key.url||String(key))?.clone();},
        async put(key,response){if(owner.failWrites)throw new DOMException('Storage is full','QuotaExceededError');entries.set(key.url||String(key),response.clone());},
        async delete(key){return entries.delete(key.url||String(key));}
      });
    }
    return this.stores.get(name);
  }
  async delete(name){this.deleted.push(name);return this.stores.delete(name);}
}
const bytes=text=>new TextEncoder().encode(text);

test('a new loader reuses verified persistent assets without any HTTP request',async()=>{
  const storage=new MemoryStorage(),url='https://site.test/data/plane.bin.gz',data=bytes('native source bytes'),hash=await assetHash(data);let calls=0;
  const first=new VerifiedAssetCache({cacheStorage:storage});
  assert.equal((await first.load(url,hash,{fetcher:async()=>{calls++;return new Response(data);}})).fromCache,false);
  const reloaded=new VerifiedAssetCache({cacheStorage:storage});
  const result=await reloaded.load(url,hash,{fetcher:async()=>{throw new Error('offline');}});
  assert.equal(result.fromCache,true);assert.deepEqual(result.bytes,data);assert.equal(calls,1);assert.equal(reloaded.stats.cacheHits,1);assert.equal(reloaded.stats.networkRequests,0);
});

test('changed source hashes cannot reuse earlier deployment assets at the same URL',async()=>{
  const cache=new VerifiedAssetCache({cacheStorage:new MemoryStorage()}),url='https://site.test/manifest.json',old=bytes('old'),current=bytes('current');let calls=0;
  await cache.load(url,await assetHash(old),{fetcher:async()=>new Response(old)});
  const result=await cache.load(url,await assetHash(current),{fetcher:async()=>{calls++;return new Response(current);}});
  assert.deepEqual(result.bytes,current);assert.equal(result.fromCache,false);assert.equal(calls,1);
});

test('a damaged persistent copy is rejected and replaced only with verified network bytes',async()=>{
  const storage=new MemoryStorage(),cache=new VerifiedAssetCache({cacheStorage:storage}),url='https://site.test/mesh.bin',data=bytes('mesh'),hash=await assetHash(data),warnings=[];
  await cache.load(url,hash,{fetcher:async()=>new Response(data)});
  await cache.cache.put(cache.key(url,hash),new Response(bytes('corrupt')));
  const result=await cache.load(url,hash,{fetcher:async()=>new Response(data),onWarning:message=>warnings.push(message)});
  assert.deepEqual(result.bytes,data);assert.equal(result.fromCache,false);assert.match(warnings[0],/damaged/);
  const invalid=bytes('wrong');
  await assert.rejects(cache.load('https://site.test/other.bin',hash,{fetcher:async()=>new Response(invalid)}),/integrity mismatch/);
  assert.equal(await cache.cache.match(cache.key('https://site.test/other.bin',hash)),undefined);
});

test('concurrent loads share one request and enforce byte and entry limits',async()=>{
  const storage=new MemoryStorage(),cache=new VerifiedAssetCache({cacheStorage:storage,maxBytes:12,maxEntries:2}),data=bytes('123456'),hash=await assetHash(data);let calls=0;
  const fetcher=async()=>{calls++;return new Response(data);};
  const [a,b]=await Promise.all([cache.load('https://site.test/a',hash,{fetcher}),cache.load('https://site.test/a',hash,{fetcher})]);
  assert.strictEqual(a,b);assert.equal(calls,1);
  await Promise.all(['b','c','d'].map(name=>cache.load('https://site.test/'+name,hash,{fetcher})));
  assert.ok(cache.stats.persistentBytes<=12);assert.ok((await cache.cache.keys()).length<=2);
  const refreshed=new VerifiedAssetCache({cacheStorage:storage,maxBytes:6,maxEntries:1});await refreshed.open(()=>{});
  assert.equal(refreshed.stats.persistentBytes,6);assert.equal((await refreshed.cache.keys()).length,1);
});

test('quota exhaustion and unavailable storage do not block source loading',async()=>{
  const data=bytes('pixels'),hash=await assetHash(data),storage=new MemoryStorage();storage.failWrites=true;
  for(const cacheStorage of [storage,{open:async()=>{throw new Error('Storage denied');}},undefined]){
    const cache=new VerifiedAssetCache({cacheStorage}),warnings=[];
    const result=await cache.load('https://site.test/plane.bin.gz',hash,{fetcher:async()=>new Response(data),onWarning:message=>warnings.push(message)});
    assert.deepEqual(result.bytes,data);assert.equal(result.fromCache,false);assert.ok(warnings.length<=1);
  }
});

test('clearing source assets affects only their own cache and does not refill from old in-flight reads',async()=>{
  const storage=new MemoryStorage(),cache=new VerifiedAssetCache({cacheStorage:storage}),data=bytes('pixels'),hash=await assetHash(data);let release;
  await storage.open('unrelated-cache');
  const pending=cache.load('https://site.test/plane.bin.gz',hash,{fetcher:async()=>{await new Promise(resolve=>{release=resolve;});return new Response(data);}});
  while(!release)await new Promise(resolve=>setTimeout(resolve,0));await cache.clear();release();await pending;
  assert.deepEqual(storage.deleted,['dendritic-arbor-assets-v1']);assert.equal(storage.stores.has('unrelated-cache'),true);assert.equal(cache.stats.persistentBytes,0);
});

test('the pinned manifest digests match the exact shipped EM and mesh provenance',async()=>{
  for(const [file,hash]of [['prepared-em',PREPARED_MANIFEST_SHA256],['starter-meshes',MESH_MANIFEST_SHA256]]){
    const content=await fs.readFile(new URL('../data/'+file+'/manifest.json',import.meta.url));assert.equal(await assetHash(content),hash,file+' manifest changed: update its verified asset version');
  }
});
