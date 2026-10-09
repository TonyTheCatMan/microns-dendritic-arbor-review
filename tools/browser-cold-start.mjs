/** Fresh disposable browser context; exact-pixel, loading, navigation and saved-work regressions. No screenshots. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {planePlan} from '../viewer/coordinates.js';

const base=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('data/prepared-em/manifest.json',root),'utf8'));
assert.equal(manifest.taskCount,50,'Run only after all prepared assets are complete');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const chunkIndex=new Map();for(const volume of manifest.volumes)for(const chunk of volume.chunks)if(!chunkIndex.has(chunk.chunkId))chunkIndex.set(chunk.chunkId,{volume,chunk});
const packs=new Map();
async function expectedHash(plane){
  const out=Buffer.alloc(plane.width*plane.height),coverage=Buffer.alloc(out.length);
  for(const receipt of plane.receipts){
    const entry=chunkIndex.get(receipt.chunkId);if(!entry)return null;
    const {volume,chunk}=entry;
    if(!packs.has(volume.id)){const encoded=await readFile(new URL('data/prepared-em/'+volume.file,root));assert.equal(sha(encoded),volume.fileSha256);packs.set(volume.id,gunzipSync(encoded));}
    const bytes=packs.get(volume.id).subarray(chunk.offset,chunk.offset+chunk.bytes);assert.equal(sha(bytes),chunk.receipt.decodedSha256);
    const [bx,by,bz]=chunk.receipt.begin,[sx,sy,sz]=chunk.receipt.dimensions,z=plane.begin[2];
    if(z<bz||z>=bz+sz)continue;
    for(let y=Math.max(by,plane.begin[1]);y<Math.min(by+sy,plane.end[1]);y++){
      const x=Math.max(bx,plane.begin[0]),endX=Math.min(bx+sx,plane.end[0]);
      if(endX<=x)continue;
      const source=((z-bz)*sy+y-by)*sx+x-bx,target=(y-plane.begin[1])*plane.width+x-plane.begin[0];
      bytes.copy(out,target,source,source+endX-x);coverage.fill(1,target,target+endX-x);
    }
  }
  assert.ok(coverage.every(x=>x===1),'Independent native pack reconstruction covers every displayed pixel');return sha(out);
}
const report={at:new Date().toISOString(),url:base,checks:[],first:null,steps:[],requests:[],errors:[],failures:[]};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1800,height:1300}}),page=await context.newPage();
page.on('pageerror',error=>report.errors.push(error.message));
page.on('request',r=>report.requests.push({url:r.url(),kind:r.resourceType()}));
page.on('requestfailed',r=>report.failures.push({url:r.url(),error:r.failure()?.errorText}));
await page.addInitScript(()=>{window.__timings={};setInterval(()=>{const v=window.ReviewApp?.viewer,q=window.__timings,status=document.querySelector('#imageStatus')?.textContent||'';if(status!==q.status){q.status=status;(q.changes||=[]).push({time:performance.now(),status});}if(!v)return;if(v.plane?.complete&&!q.plane)q.plane=performance.now();if(v.surface?.modelReady&&!q.mesh)q.mesh=performance.now();},10);});
const planeSnapshot=async()=>page.evaluate(async()=>{const v=ReviewApp.viewer,p=v.plane,hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',p.pixels))].map(n=>n.toString(16).padStart(2,'0')).join('');return{task:ReviewApp.task.id,viewerTask:v.task.id,depthNm:p.depthNm,begin:p.begin,end:p.end,width:p.width,height:p.height,complete:p.complete,receipts:p.receipts,hash,sourceBinding:p.sourceBinding,preparedVolumeId:p.preparedVolumeId};});
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.surface.modelReady,{timeout:60000});
  report.first=await page.evaluate(()=>{const v=ReviewApp.viewer;return{timings:window.__timings,elapsed:performance.now(),planeMs:v.plane.elapsedMs,firstUsefulMs:v.plane.firstUsefulMs,triangles:v.surface.meshes.reduce((n,m)=>n+m.faces,0),nativeSrc:v.frame.getAttribute('src'),sourceBytes:v.source.networkBytes,preparedBytes:v.source.prepared.networkBytes,preparedVolumeId:v.plane.preparedVolumeId,anchor:ReviewApp.current.anchorNm,task:ReviewApp.task.id,decision:ReviewApp.task.decision.status};});
  assert.ok(report.first.triangles>0);assert.equal(report.first.nativeSrc,null);assert.equal(report.first.sourceBytes,0);assert.ok(report.first.preparedVolumeId);assert.equal(report.first.decision,'unreviewed');
  assert.equal(report.requests.filter(r=>/vendor\/neuroglancer|bossdb-open-data|storage.googleapis.com/.test(r.url)).length,0);
  let plane=await planeSnapshot();assert.equal(plane.hash,await expectedHash(plane));report.checks.push('Clean visit automatically displays actual branch mesh and independently verified native plane, with no unsolicited Neuroglancer or live-source request');
  console.log('FIRST '+JSON.stringify(report.first));
  const firstId=report.first.task,anchor=report.first.anchor;
  report.coverage=await page.evaluate(()=>{const v=ReviewApp.viewer,s=v.source,p=v.plane,key=JSON.stringify([p.plane,p.begin,p.end]),entry=s.prepared.planeIndex.get(key),volumes=entry.plane.warmVolumeIds.map(id=>s.prepared.volumeIndex.get(id)),lo=Math.min(...volumes.flatMap(v=>v.chunks.map(c=>c.receipt.begin[2]))),hi=Math.max(...volumes.flatMap(v=>v.chunks.map(c=>c.receipt.begin[2]+c.receipt.dimensions[2])));return{startZ:lo,endZExclusive:hi,sections:hi-lo,relativeFirst:lo-p.center[2],relativeLast:hi-1-p.center[2],warmVolumeIds:volumes.map(v=>v.id)};});
  for(const direction of [1,-1]){
    await page.evaluate(anchor=>ReviewApp.viewer.setView({centerNm:anchor}),anchor);
    for(let i=1;i<=32;i++){
      const step=await page.evaluate(async({anchor,offset})=>{const v=ReviewApp.viewer,center=[...anchor];center[2]+=offset*40;const start=performance.now(),live=v.source.networkBytes,prepared=v.source.prepared.networkBytes,packs=v.source.prepared.completedPacks;await v.setView({centerNm:center});const elapsed=performance.now()-start,p=v.plane;return{offset,elapsed,rawElapsed:p.elapsedMs,depthNm:p.depthNm,complete:p.complete,liveBytes:v.source.networkBytes-live,preparedBytes:v.source.prepared.networkBytes-prepared,preparedPacks:v.source.prepared.completedPacks-packs,cacheHits:p.cacheHits,total:p.total,preparedReceipts:p.receipts.filter(r=>r.preparedAsset).length};},{anchor,offset:direction*i});
      assert.ok(step.complete);assert.equal(step.depthNm,anchor[2]+direction*i*40);
      plane=await planeSnapshot();const expected=await expectedHash(plane);step.independentHashMatches=expected===plane.hash;step.expectedPrepared=expected!==null;
      if(step.expectedPrepared){assert.equal(plane.hash,expected);assert.equal(step.liveBytes,0,'Prepared coverage must not refetch public source');}
      report.steps.push(step);
    }
    console.log('STEPS '+JSON.stringify({direction,maxMs:Math.max(...report.steps.filter(s=>Math.sign(s.offset)===direction).map(s=>s.elapsed)),liveSteps:report.steps.filter(s=>Math.sign(s.offset)===direction&&s.liveBytes>0)}));
  }
  report.checks.push('Every section across +32 and -32 offsets remains correctly positioned and matches independently reconstructed exact native chunk pixels where prepared');
  await page.evaluate(anchor=>ReviewApp.viewer.setView({centerNm:anchor}),anchor);
  await page.locator('#decisionNote').fill('QA persistence across prepared-image and task changes');
  await page.locator('[data-tool="point"]').click();await page.locator('#emCanvas').click();await page.locator('#itemLabel').fill('QA source-bound point');await page.locator('#itemNote').fill('QA exact coordinates retained');await page.locator('#commitEditor').click();await page.evaluate(()=>ReviewApp.saveAll());
  const preserved=await page.evaluate(()=>({note:ReviewApp.task.decision.note,marks:structuredClone(ReviewApp.task.marks),segments:structuredClone(ReviewApp.task.segments)}));
  const taskIds=await page.evaluate(()=>ReviewApp.catalog.tasks.slice(1,4).map(t=>t.id));
  const switchStart=Date.now();await page.evaluate(id=>ReviewApp.switchTask(id),taskIds[0]);await page.waitForFunction(()=>ReviewApp.viewer.surface.modelReady,{timeout:30000});
  report.newTask={elapsedWall:Date.now()-switchStart,...await planeSnapshot()};assert.equal(report.newTask.task,taskIds[0]);assert.equal(report.newTask.hash,await expectedHash(report.newTask));report.checks.push('A newly opened task gets its own correct native pixels and automatic branches');
  report.rapid=await page.evaluate(async({ids,last})=>{const pending=[];for(const id of ids){pending.push(ReviewApp.switchTask(id));await new Promise(r=>setTimeout(r,8));}pending.push(ReviewApp.switchTask(last));await Promise.allSettled(pending);await ReviewApp.viewer.defaultStructuresPromise;return{task:ReviewApp.task.id,viewerTask:ReviewApp.viewer.task.id,surfaceTask:ReviewApp.viewer.surface.task.id,view:ReviewApp.viewer.view,decision:ReviewApp.task.decision,marks:ReviewApp.task.marks,segments:ReviewApp.task.segments};},{ids:taskIds,last:firstId});
  assert.equal(report.rapid.task,firstId);assert.equal(report.rapid.viewerTask,firstId);assert.equal(report.rapid.surfaceTask,firstId);assert.equal(report.rapid.decision.note,preserved.note);assert.deepEqual(report.rapid.marks,preserved.marks);assert.deepEqual(report.rapid.segments,preserved.segments);
  plane=await planeSnapshot();const rapidExpected=planePlan(report.rapid.view,{resolution:[8,8,40]});assert.deepEqual(plane.begin,rapidExpected.begin);assert.deepEqual(plane.end,rapidExpected.end);assert.equal(plane.hash,await expectedHash(plane));report.checks.push('Rapid task changes leave the final task, plane, mesh and saved work consistent');
  report.cancelPending=await page.evaluate(async()=>{const a=ReviewApp,current=a.current.id,target=a.catalog.tasks.at(-1).id,load=a.store.load.bind(a.store);let release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);a.store.load=async id=>{if(id===target){entered();await gate;}return load(id);};try{const pending=a.switchTask(target);await ready;await a.switchTask(current);release();await pending;return{requestedLast:current,actual:a.current.id,task:a.task.id,viewer:a.viewer.task.id};}finally{release();a.store.load=load;}});
  assert.equal(report.cancelPending.actual,firstId);assert.equal(report.cancelPending.task,firstId);assert.equal(report.cancelPending.viewer,firstId);report.checks.push('Reselecting the current task cancels a pending asynchronous task change');
  await page.evaluate(()=>ReviewApp.saveAll());await page.reload();await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.surface.modelReady,{timeout:60000});
  const reloaded=await page.evaluate(()=>({note:ReviewApp.task.decision.note,marks:ReviewApp.task.marks,segments:ReviewApp.task.segments,nativeSrc:ReviewApp.viewer.frame.getAttribute('src')}));assert.equal(reloaded.note,preserved.note);assert.deepEqual(reloaded.marks,preserved.marks);assert.deepEqual(reloaded.segments,preserved.segments);assert.equal(reloaded.nativeSrc,null);report.checks.push('Reload preserves source-bound marks, notes and large string segment IDs');
  report.clearCache=await page.evaluate(async()=>{const v=ReviewApp.viewer,previous=v.source;await v.clearCache();return{before:previous.prepared.networkBytes,cacheMemoryBytes:previous.cache.bytes};});
  await page.reload();await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.surface.modelReady,{timeout:60000});
  const cleared=await page.evaluate(()=>({sourceBytes:ReviewApp.viewer.source.networkBytes,preparedBytes:ReviewApp.viewer.source.prepared.networkBytes,note:ReviewApp.task.decision.note,marks:ReviewApp.task.marks,nativeSrc:ReviewApp.viewer.frame.getAttribute('src')}));assert.equal(cleared.sourceBytes,0);assert.ok(cleared.preparedBytes>0);assert.equal(cleared.note,preserved.note);assert.deepEqual(cleared.marks,preserved.marks);assert.equal(cleared.nativeSrc,null);report.clearCache.after=cleared;report.checks.push('Image-cache clear and reload refill from prepared assets while reviewer work is retained');
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;report.passed=false;console.error(error);}finally{await writeFile(process.env.REVIEW_WITNESS||new URL('../docs/cold-start-witness.json',import.meta.url),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,coverage:report.coverage,error:report.error,first:report.first,steps:report.steps.length,maxSectionMs:Math.max(...report.steps.map(s=>s.elapsed)),liveSteps:report.steps.filter(s=>s.liveBytes>0)}));
if(!report.passed)process.exitCode=1;
