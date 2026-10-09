import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localToNm,nmToLocal,nmToNg,ngToNm,planePlan,pixelToNm,projectPoint,mortonCode,normalizeSegments,normalizeView,RESOLUTION_NM} from '../viewer/coordinates.js';
import {decodeMinishard,shardLocation,RawSource,ChunkCache} from '../viewer/raw-source.js';
import {makeNgState,mergeNativeSegments,orthogonalPlane,assertNativeSources} from '../viewer/neuroglancer-state.js';
import {calibratedPng,overlaySvg} from '../viewer/figure.js';
import {ReviewViewer} from '../viewer/ReviewViewer.js';
import {safeJSON} from '../core/model.js';

test('default view and serial navigation remain strict JSON for autosave and ZIP export',async()=>{
  const view=normalizeView({nativeOblique:undefined});assert.equal(view.nativeOblique,false);assert.doesNotThrow(()=>safeJSON(view));
  const host={view,task:{anchorNm:view.centerNm},getView:ReviewViewer.prototype.getView,onViewChange:v=>safeJSON(v),publish(){},async load(){}};
  await ReviewViewer.prototype.setView.call(host,{centerNm:view.centerNm.map((n,i)=>n+(i===2?40:0))});assert.doesNotThrow(()=>safeJSON(host.view));assert.deepEqual(JSON.parse(JSON.stringify(host.view)),host.view);
  host.view.nativeOblique=true;await ReviewViewer.prototype.setView.call(host,{plane:'xz'});assert.equal(host.view.nativeOblique,false);assert.doesNotThrow(()=>safeJSON(host.view));
});

test('integer sample transforms explicitly do not inherit TIFF half voxel',()=>{
  const offset=[13824,13824,14816],local=[3,4,5],nm=[110616,110624,592840];
  assert.deepEqual(localToNm(local,offset),nm);assert.deepEqual(nmToLocal(nm,offset),local);assert.deepEqual(ngToNm(nmToNg(nm)),nm);
  assert.deepEqual(nmToNg([752960,646592,858640]),[94120,80824,21466]);
});
test('native XY XZ YZ grids retain anisotropic aspect and exact sample depths',()=>{
  const scale={resolution:RESOLUTION_NM};
  for(const plane of ['xy','xz','yz']){
    const p=planePlan({plane,centerNm:[752960,646592,858640],spanNm:4096},scale);
    assert.equal(p.width,512);assert.equal(p.height,plane==='xy'?512:102);
    assert.equal(p.physicalSizeNm[1],plane==='xy'?4096:4080);
    const sample=pixelToNm(p,10.8,12.7),projected=projectPoint(p,sample);assert.equal(projected.x,10);assert.equal(projected.y,12);assert.equal(projected.onPlane,true);
    assert.equal(sample[p.axes[2]],p.depthNm);
  }
});
test('compressed Morton drops exhausted grid axes and sharding preserves uint64 arithmetic',()=>{
  assert.equal(mortonCode([1,2,3],[4,4,4]),53n);assert.equal(mortonCode([3,1,0],[4,2,1]),7n);
  const s={hash:'identity',preshift_bits:9,minishard_bits:6,shard_bits:17};
  assert.deepEqual(shardLocation(478469439n,s),{mini:46,filename:'03909.shard',indexBytes:1024});
});
test('minishard delta offsets include prior byte lengths and large string identifiers',()=>{
  const bytes=new Uint8Array(48),d=new DataView(bytes.buffer),values=[9007199254740993n,2n,20n,30n,40n,50n];values.forEach((x,i)=>d.setBigUint64(i*8,x,true));
  const entries=decodeMinishard(bytes,1024);assert.deepEqual(entries.get('9007199254740993'),{start:1044,end:1084});assert.deepEqual(entries.get('9007199254740995'),{start:1114,end:1164});
});
test('release661 cannot be silently passed as a version-bound public segmentation pick',()=>{
  assert.throws(()=>normalizeSegments([{id:'864691135195576362',source:'release661'}]),/not interchangeable/);
  assert.throws(()=>normalizeSegments([{id:864691135195576362,source:'seg_m1300'}]));
  const state=makeNgState({id:'MC298937.soma',rootId:'864691135195576362'},{centerNm:[752960,646592,858640],plane:'xy',spanNm:4096});
  assert.deepEqual(state.layers.find(l=>l.type==='segmentation').segments,[]);assert.deepEqual(state.position,[94120,80824,21466]);
  const picks=mergeNativeSegments([],{layers:[{name:'seg_m1300',segments:['864691136123456789']}]});assert.equal(picks[0].id,'864691136123456789');assert.equal(picks[0].identityStatus,'candidate');
});
test('native settings preserve existing segment provenance and orthogonal camera identity',()=>{
  const segment={id:'864691136123456789',source:'seg_m1300',sourceUrl:'https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300',createdAt:'2026-10-09',note:'original note',identityStatus:'candidate'};
  const updated=mergeNativeSegments([segment],{layers:[{name:'seg_m1300',segments:[segment.id]}]});assert.equal(updated[0].createdAt,segment.createdAt);assert.equal(updated[0].sourceUrl,segment.sourceUrl);assert.equal(updated[0].note,segment.note);
  assert.equal(orthogonalPlane([0,0,0,1]),'xy');assert.equal(orthogonalPlane([Math.SQRT1_2,0,0,Math.SQRT1_2]),'xz');assert.equal(orthogonalPlane([0.5,0.5,0.5,0.5]),'yz');assert.equal(orthogonalPlane([0.1,0.2,0.3,0.9]),null);
});
test('editing upstream source or coordinate units cannot silently relabel native picks',()=>{
  const state=makeNgState({id:'t'},{centerNm:[800,800,800],plane:'xy',spanNm:1024});assert.doesNotThrow(()=>assertNativeSources(state));
  state.layers[1].source='precomputed://https://example.test/another-version';assert.throws(()=>assertNativeSources(state),/Native source changed/);
  state.layers[1].source='precomputed://https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300';state.dimensions.x=[4e-9,'m'];assert.throws(()=>assertNativeSources(state),/coordinate scale changed/);
});
test('all 50 exact anchors and their initial native planes are inside public source bounds',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const scale={resolution:RESOLUTION_NM,voxel_offset:[13824,13824,14816],size:[212992,180224,13088]};assert.equal(catalog.tasks.length,50);
  for(const task of catalog.tasks)for(const plane of ['xy','xz','yz']){const p=planePlan({centerNm:task.anchorNm,plane,spanNm:4096},scale);assert.ok(p.begin.every((n,i)=>n>=scale.voxel_offset[i]&&p.end[i]<=scale.voxel_offset[i]+scale.size[i]),task.id);}
});
test('bounded image cache eviction does not need review storage',async()=>{
  const cache=new ChunkCache({maxBytes:5});await cache.put('a',new Uint8Array(3));await cache.put('b',new Uint8Array(3));assert.equal(await cache.get('a'),null);assert.equal((await cache.get('b')).length,3);await cache.clear();assert.equal(cache.bytes,0);
});
test('failed raw ranges are rejected without downloading a full shard',async()=>{
  const source=new RawSource({fetcher:async()=>new Response(new Uint8Array(16),{status:200})});await assert.rejects(source.range('https://example.test',0,16),/no complete shard/);
});
test('native plane copies x-fastest samples, marks missing chunks, and supports cancellation',async()=>{
  const source=new RawSource();source.info={};source.scale={resolution:[8,8,40],voxel_offset:[0,0,0],size:[16,16,16],chunk_sizes:[[4,4,4]],key:'8_8_40',encoding:'raw'};
  source.chunk=async(grid)=>{const begin=grid.map(n=>n*4),data=new Uint8Array(64);for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<4;x++)data[x+4*(y+4*z)]=(begin[0]+x)+10*(begin[1]+y)+100*(begin[2]+z);return {data,begin,dimensions:[4,4,4],receipt:{grid}};};
  const xy=await source.plane({centerNm:[48,48,80],plane:'xy',spanNm:16});assert.equal(xy.complete,true);assert.deepEqual([...xy.pixels],[255,0,9,10]);
  const xz=await source.plane({centerNm:[48,48,80],plane:'xz',spanNm:16});assert.deepEqual([...xz.pixels],[9,10]);
  source.chunk=async()=>{throw new Error('offline');};const failed=await source.plane({centerNm:[48,48,80],plane:'xy',spanNm:16});assert.equal(failed.complete,false);assert.ok(failed.coverage.every(n=>n===0));
  const controller=new AbortController();controller.abort();await assert.rejects(source.plane({centerNm:[48,48,80],plane:'xy',spanNm:16},{signal:controller.signal}),e=>e.name==='AbortError');
});
test('SVG overlay respects z anisotropy and never connects off-plane trace vertices',()=>{
  const plan=planePlan({plane:'xz',centerNm:[800,800,800],spanNm:800},{resolution:RESOLUTION_NM});
  const overlay=overlaySvg(plan,[{id:'p',type:'point',pointNm:[800,800,800],label:'<point>'},{id:'route',type:'trace',pointsNm:[[800,800,800],[800,808,840]]}]);
  assert.equal(overlay.width,100);assert.equal(overlay.height,100);assert.match(overlay.svg,/&lt;point&gt;/);assert.doesNotMatch(overlay.svg,/<line /);
});
test('PNG physical pixel metadata writes native 8/40 nm anisotropy',async()=>{
  const png=new Uint8Array(50),output=new Uint8Array(await(await calibratedPng(new Blob([png]),[8,40])).arrayBuffer()),d=new DataView(output.buffer);
  assert.equal(new TextDecoder().decode(output.slice(37,41)),'pHYs');assert.equal(d.getUint32(41),125000000);assert.equal(d.getUint32(45),25000000);assert.equal(output[49],1);
});
