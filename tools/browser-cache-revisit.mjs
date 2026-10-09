/** Durable cache regression. No screenshots or user browser profile are used.
 * HTTP cache is disabled; every imagery/mesh source is actively blocked after
 * the first visit, so successful revisits cannot be hidden HTTP-cache hits.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const root=new URL('../',import.meta.url),base=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const emManifest=JSON.parse(await readFile(new URL('data/prepared-em/manifest.json',root),'utf8'));
const meshManifest=JSON.parse(await readFile(new URL('data/starter-meshes/manifest.json',root),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const chunks=new Map(),packs=new Map();
for(const volume of emManifest.volumes)for(const chunk of volume.chunks)if(!chunks.has(chunk.chunkId))chunks.set(chunk.chunkId,{volume,chunk});
async function independentPlaneHash(plane){
  assert.equal(plane.plane,'xy');
  const bytes=Buffer.alloc(plane.width*plane.height),coverage=Buffer.alloc(bytes.length);
  for(const receipt of plane.receipts){
    const entry=chunks.get(receipt.chunkId);assert.ok(entry,'Every sampled chunk has an independent preparation receipt');
    const {volume,chunk}=entry;
    assert.equal(receipt.source,emManifest.source);assert.equal(receipt.decodedSha256,chunk.receipt.decodedSha256);
    assert.deepEqual(receipt.begin,chunk.receipt.begin);assert.deepEqual(receipt.dimensions,chunk.receipt.dimensions);
    if(!packs.has(volume.id)){const encoded=await readFile(new URL('data/prepared-em/'+volume.file,root));assert.equal(sha(encoded),volume.fileSha256);packs.set(volume.id,gunzipSync(encoded));}
    const raw=packs.get(volume.id).subarray(chunk.offset,chunk.offset+chunk.bytes);assert.equal(sha(raw),chunk.receipt.decodedSha256);
    const [bx,by,bz]=chunk.receipt.begin,[sx,sy,sz]=chunk.receipt.dimensions,z=plane.begin[2];
    if(z<bz||z>=bz+sz)continue;
    for(let y=Math.max(by,plane.begin[1]);y<Math.min(by+sy,plane.end[1]);y++){
      const x=Math.max(bx,plane.begin[0]),end=Math.min(bx+sx,plane.end[0]);if(end<=x)continue;
      const source=((z-bz)*sy+y-by)*sx+x-bx,target=(y-plane.begin[1])*plane.width+x-plane.begin[0];
      raw.copy(bytes,target,source,source+end-x);coverage.fill(1,target,target+end-x);
    }
  }
  assert.ok(coverage.every(Boolean),'Independent native chunks cover all displayed pixels');return sha(bytes);
}
const sourcePattern=/\/data\/(prepared-em|starter-meshes)\/|bossdb-open-data|storage\.googleapis\.com/;
const report={checkedAt:new Date().toISOString(),url:base,screenshotsTaken:0,httpCacheDisabled:true,serviceWorkersBlocked:true,checks:[],phases:[],errors:[]};
const localRoot=fileURLToPath(new URL('.local/',root));await mkdir(localRoot,{recursive:true});
// Keep the profile prefix short: Chromium's IndexedDB backing-store paths can
// exceed Windows MAX_PATH when this already-long project path is expanded.
const profile=await mkdtemp(path.join(localRoot,'cr-'));
let context,page,phase,blockSources=false;
function beginPhase(name){phase={name,startedAt:new Date().toISOString(),attemptedSources:[],blockedSources:[],finishedSources:[],sourceTransferBytes:0};report.phases.push(phase);console.log('CACHE PHASE '+name);return phase;}
async function openBrowser(){
  context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader'],viewport:{width:1800,height:1300},serviceWorkers:'block'});
  await context.route(sourcePattern,async route=>{const url=route.request().url();phase.attemptedSources.push(url);if(blockSources){phase.blockedSources.push(url);await route.abort('internetdisconnected');}else await route.continue();});
}
async function openPage(){
  page=await context.newPage();const cdp=await context.newCDPSession(page),active=new Map();
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  cdp.on('Network.requestWillBeSent',event=>{if(sourcePattern.test(event.request.url))active.set(event.requestId,{url:event.request.url,phase});});
  cdp.on('Network.loadingFinished',event=>{const request=active.get(event.requestId);if(request){request.phase.finishedSources.push({url:request.url,encodedDataLength:event.encodedDataLength});request.phase.sourceTransferBytes+=event.encodedDataLength;active.delete(event.requestId);}});
  cdp.on('Network.loadingFailed',event=>active.delete(event.requestId));
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')(report.consoleErrors||=[]).push(message.text());});return page;
}
async function ready(){
  await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.surface.modelReady,undefined,{timeout:90000});
  await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);
}
async function warmed(){
  await page.waitForFunction(()=>{const s=ReviewApp.viewer.source.prepared;return s&&s.activePacks===0&&s.queue.length===0&&s.pendingWarm.length===0;},undefined,{timeout:90000});
  await page.evaluate(async()=>{await ReviewApp.viewer.source.cache.writeTail;await ReviewApp.viewer.source.prepared.assetCache.writeTail;});
  await page.waitForFunction(async()=>{
    const source=ReviewApp.viewer.source,p=source.prepared,plane=ReviewApp.viewer.plane;
    const entry=p.planeIndex.get(JSON.stringify([plane.plane,plane.begin,plane.end]));if(!entry)return true;
    const store=await caches.open('dendritic-arbor-em-v2');
    for(const id of entry.plane.warmVolumeIds||[entry.volume.id])for(const chunk of p.volumeIndex.get(id).chunks){if(!await store.match(source.cache.key(source.infoHash+':'+source.scale.key+':'+chunk.chunkId)))return false;}
    return true;
  },undefined,{timeout:90000});
}
async function snapshot(){return page.evaluate(async()=>{
  const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const app=ReviewApp,v=app.viewer,p=v.plane,s=v.surface,meshes=[];
  for(const [id,m]of s.rawMeshes){const bytes=new Uint8Array(8+m.vertices.byteLength+m.triangles.byteLength),header=new DataView(bytes.buffer);header.setUint32(0,m.vertices.length/3,true);header.setUint32(4,m.triangles.length/3,true);bytes.set(new Uint8Array(m.vertices.buffer,m.vertices.byteOffset,m.vertices.byteLength),8);bytes.set(new Uint8Array(m.triangles.buffer,m.triangles.byteOffset,m.triangles.byteLength),8+m.vertices.byteLength);meshes.push({id,sha256:await digest(bytes),vertices:m.vertices.length/3,triangles:m.triangles.length/3,provenance:m.provenance,signature:m.signature});}
  const camera=s.getNavigationState();
  const cutoutCenterNm=p.begin.map((n,i)=>i===p.axes[2]?p.depthNm:(n+p.end[i])/2*[8,8,40][i]);
  return{task:app.task.id,recipientId:app.current.recipientId,plane:{plane:p.plane,begin:p.begin,end:p.end,width:p.width,height:p.height,depthNm:p.depthNm,hash:await digest(p.pixels),complete:p.complete,receipts:p.receipts,sourceBinding:p.sourceBinding},meshes,camera:{...camera,globalCenterNm:camera.center_nm.map((n,i)=>n+s.originNm[i])},opacity:s.alpha,opacityControl:document.getElementById('surfaceOpacity').value,cutout:{centerNm:cutoutCenterNm,spanNm:v.view.spanNm},imageStatus:document.getElementById('imageStatus').textContent,nativeFrameStarted:v.frame.hasAttribute('src'),assetStats:v.source.prepared.assetCache?.stats||null,review:{note:app.task.decision.note,marks:structuredClone(app.task.marks),segments:structuredClone(app.task.segments)}};
});}
async function verify(snapshot){
  assert.ok(snapshot.plane.complete);assert.equal(snapshot.plane.hash,await independentPlaneHash(snapshot.plane));
  assert.equal(snapshot.plane.sourceBinding.source,emManifest.source);assert.equal(snapshot.plane.sourceBinding.infoSha256,emManifest.infoSha256);assert.equal(snapshot.plane.sourceBinding.convention,emManifest.convention);
  assert.equal(snapshot.meshes.length,1);const expected=meshManifest.recipients[snapshot.recipientId],actual=snapshot.meshes[0];
  assert.equal(actual.id,expected.segment.id);assert.equal(actual.sha256,expected.sha256);assert.equal(actual.triangles,expected.triangleCount);assert.equal(actual.vertices,expected.vertexCount);
  assert.deepEqual(actual.provenance,{...expected.provenance,starterAssetSha256:expected.sha256});assert.equal(snapshot.review.segments[0].sourceBinding.identityConfirmed,false);assert.equal(snapshot.nativeFrameStarted,false);
}
function sameLoaded(actual,expected){
  assert.equal(actual.task,expected.task);assert.equal(actual.plane.hash,expected.plane.hash);assert.deepEqual(actual.plane.begin,expected.plane.begin);assert.deepEqual(actual.plane.end,expected.plane.end);assert.deepEqual(actual.plane.sourceBinding,expected.plane.sourceBinding);assert.deepEqual(actual.meshes,expected.meshes);
}
function noSourceNetwork(item){assert.deepEqual(item.blockedSources,[],'Cached revisit should not even attempt a blocked source');assert.deepEqual(item.attemptedSources,[]);assert.equal(item.sourceTransferBytes,0);}
async function cacheInventory(){return page.evaluate(async()=>{const result={};for(const name of await caches.keys()){if(!/^dendritic-arbor-(em-v2|assets-v1)$/.test(name))continue;const cache=await caches.open(name),keys=await cache.keys();result[name]={entries:keys.length};}return result;});}
function sameReview(actual,expected){assert.deepEqual(actual.review,expected.review);}
try{
  beginPhase('first visit: HTTP cache disabled');await openBrowser();await openPage();await page.goto(base,{waitUntil:'domcontentloaded'});await ready();await warmed();
  report.first=await snapshot();await verify(report.first);assert.equal(report.first.opacity,.5);assert.equal(report.first.opacityControl,'50');
  for(let i=0;i<3;i++)assert.ok(Math.abs(report.first.camera.globalCenterNm[i]-report.first.cutout.centerNm[i])<.1,'Default 3D camera centers on the actual cutout');
  assert.ok(report.first.camera.physical_height_nm>=report.first.cutout.spanNm&&report.first.camera.physical_height_nm<=report.first.cutout.spanNm*4,'Default 3D camera is scaled to the cutout, not the full neuron');
  assert.ok(phase.attemptedSources.length>0);assert.ok(phase.sourceTransferBytes>0);report.checks.push('A new profile uses 50% opacity and a camera centered and scaled to the EM cutout. Plane bytes and entire branch geometry match independent local source receipts.');

  await page.locator('#decisionNote').fill('QA durable cache keeps reviewer notes');await page.locator('[data-tool="point"]').click();await page.locator('#emCanvas').click();await page.locator('#itemLabel').fill('QA durable cache point');await page.locator('#itemNote').fill('Exact source coordinates survive cache reuse');await page.locator('#commitEditor').click();await page.locator('[data-tool="navigate"]').click();
  await page.locator('#surfaceOpacity').evaluate(element=>{element.value='65';element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.evaluate(async()=>{const s=ReviewApp.viewer.surface;s.yaw+=.17;s.zoom*=.8;s.navigationChanged('rotate');await ReviewApp.saveAll();});
  const firstId=report.first.task,saved=await snapshot();assert.equal(saved.opacity,.65);assert.equal(saved.review.marks.length,1);
  const secondId=await page.evaluate(recipient=>ReviewApp.catalog.tasks.find(t=>t.recipientId!==recipient&&t.id.endsWith('.soma_identity')).id,report.first.recipientId);
  await page.evaluate(id=>ReviewApp.switchTask(id),secondId);await ready();await warmed();report.second=await snapshot();await verify(report.second);assert.equal(report.second.opacity,.5);await page.evaluate(()=>ReviewApp.saveAll());
  await page.evaluate(id=>ReviewApp.switchTask(id),firstId);await ready();await warmed();sameLoaded(await snapshot(),saved);report.cacheBeforeReload=await cacheInventory();assert.ok(report.cacheBeforeReload['dendritic-arbor-assets-v1']?.entries>0);

  blockSources=true;beginPhase('same tab reload: all data sources blocked');await page.reload({waitUntil:'domcontentloaded'});await ready();await warmed();report.reload=await snapshot();await verify(report.reload);sameLoaded(report.reload,saved);sameReview(report.reload,saved);assert.equal(report.reload.opacity,.65);assert.ok(Math.abs(report.reload.camera.yaw-saved.camera.yaw)<1e-6);assert.ok(Math.abs(report.reload.camera.physical_height_nm-saved.camera.physical_height_nm)<.1);noSourceNetwork(phase);report.checks.push('Reload with HTTP cache disabled and every image/mesh endpoint blocked restores byte-identical imagery, real branches, notes, marks, source identity, custom opacity and camera with zero source network bytes.');

  beginPhase('task and section revisits: all data sources blocked');report.sections=[];
  for(const id of [secondId,firstId]){await page.evaluate(id=>ReviewApp.switchTask(id),id);await ready();const actual=await snapshot();await verify(actual);sameLoaded(actual,id===firstId?saved:report.second);}
  const center=await page.evaluate(()=>[...ReviewApp.viewer.view.centerNm]);
  for(const offset of [1,2,-1,0]){const started=Date.now();await page.evaluate(async({center,offset})=>{const target=[...center];target[2]+=offset*40;await ReviewApp.viewer.setView({centerNm:target});},{center,offset});const actual=await snapshot();await verify(actual);report.sections.push({offset,wallMs:Date.now()-started,hash:actual.plane.hash});}
  sameReview(await snapshot(),saved);await page.evaluate(()=>ReviewApp.saveAll());noSourceNetwork(phase);report.checks.push('Switching between two previously visited cells and neighboring sections needs no image/mesh network request; independent native-pixel hashes remain exact.');

  beginPhase('new page: all data sources blocked');await page.close();await openPage();await page.goto(new URL('?task='+encodeURIComponent(firstId),base).href,{waitUntil:'domcontentloaded'});await ready();await warmed();report.newPage=await snapshot();await verify(report.newPage);sameLoaded(report.newPage,saved);sameReview(report.newPage,saved);noSourceNetwork(phase);report.checks.push('A new page reuses durable data without any prior JavaScript memory or source request.');

  await page.evaluate(()=>ReviewApp.saveAll());await context.close();context=null;beginPhase('browser restart: same profile, all data sources blocked');await openBrowser();await openPage();await page.goto(new URL('?task='+encodeURIComponent(firstId),base).href,{waitUntil:'domcontentloaded'});await ready();await warmed();report.restart=await snapshot();await verify(report.restart);sameLoaded(report.restart,saved);sameReview(report.restart,saved);noSourceNetwork(phase);report.checks.push('Closing and reopening the browser preserves the verified image/mesh cache and reviewer notes independently of HTTP cache.');

  beginPhase('explicit image-cache clear');await page.evaluate(()=>ReviewApp.viewer.clearCache());report.cacheAfterClear=await cacheInventory();for(const {entries}of Object.values(report.cacheAfterClear))assert.equal(entries,0);sameReview(await snapshot(),saved);
  blockSources=false;beginPhase('refill after image-cache clear');await page.reload({waitUntil:'domcontentloaded'});await ready();await warmed();report.refill=await snapshot();await verify(report.refill);sameLoaded(report.refill,saved);sameReview(report.refill,saved);assert.ok(phase.attemptedSources.length>0);assert.ok(phase.sourceTransferBytes>0);report.checks.push('Explicit image-cache clear empties only image/mesh stores; a fresh download refills them while saved notes, marks, identity and custom view remain unchanged.');
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;if(page&&!page.isClosed())report.failureState=await page.evaluate(()=>({url:location.href,app:!!window.ReviewApp,text:document.body.innerText.slice(0,5000),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize}))})).catch(()=>null);console.error(error);}
finally{
  if(context)await context.close();
  const relative=path.relative(localRoot,profile);if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(profile).startsWith('cr-'))await rm(profile,{recursive:true,force:true});
  await writeFile(process.env.REVIEW_WITNESS||new URL('../docs/cache-revisit-witness.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,phases:report.phases.map(({name,attemptedSources,blockedSources,sourceTransferBytes})=>({name,sourceRequests:attemptedSources.length,blockedRequests:blockedSources.length,sourceTransferBytes})),error:report.error}));
if(!report.passed)process.exitCode=1;
