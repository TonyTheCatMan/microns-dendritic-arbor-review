// Fresh-profile regression: neuron branches must appear without a click or any
// public volume server. This deliberately does not click Show/Add Structure.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:1800,height:1300}}),page=await context.newPage();
const errors=[],external=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
await page.route(/^https:\/\//,route=>{external.push(route.request().url());return route.abort();});
await page.addInitScript(()=>{window.firstBranchesMs=null;new MutationObserver(()=>{if(!window.firstBranchesMs&&Number(document.querySelector('#surfaceCanvas')?.dataset.triangleCount)>0)window.firstBranchesMs=performance.now();}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-triangle-count']});});
const report={checkedAt:new Date().toISOString(),screenshotsTaken:0,checks:[]};
try{
 await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8876/');
 await page.waitForFunction(()=>window.ReviewApp?.viewer.surface.modelReady,undefined,{timeout:120000});
 report.initial=await page.evaluate(()=>({firstBranchesMs,triangles:Number(document.querySelector('#surfaceCanvas').dataset.triangleCount),segments:ReviewApp.viewer.getSegments(),nativeStarted:document.querySelector('#ngFrame').hasAttribute('src'),decision:ReviewApp.task.decision.status,defaultInitialized:ReviewApp.task.view.defaultStructuresInitialized}));
 assert.ok(report.initial.triangles>60000);assert.equal(report.initial.segments.length,1);assert.equal(report.initial.segments[0].id,'864691136389585015');assert.equal(report.initial.segments[0].sourceBinding.identityConfirmed,false);assert.equal(report.initial.nativeStarted,false);assert.equal(report.initial.decision,'unreviewed');assert.equal(report.initial.defaultInitialized,true);
 report.checks.push('Fresh profile automatically displays real soma-picked branches without user action or a native iframe.');
 report.recipients=[];
 for(const id of ['MC264649','MC264920','MC264824','MC298937']){
  await page.evaluate(id=>ReviewApp.switchTask(id+'.soma_identity'),id);await page.waitForFunction(()=>ReviewApp.viewer.surface.modelReady);
  const result=await page.evaluate(()=>({id:ReviewApp.current.recipientId,triangles:ReviewApp.viewer.surface.meshes.reduce((n,m)=>n+m.faces,0),segment:ReviewApp.viewer.getSegments()[0],saved:ReviewApp.task.segments[0],decision:ReviewApp.task.decision.status}));
  assert.ok(result.triangles>60000);assert.equal(result.segment.sourceBinding.recipientId,id);assert.equal(result.saved.id,result.segment.id);assert.equal(result.decision,'unreviewed');report.recipients.push(result);
 }
 report.checks.push('All four recipients display their own source-bound candidate mesh and retain unreviewed decisions.');
 // Guard against a late mesh request for the prior recipient contaminating a switch.
 await page.evaluate(async()=>{const a=ReviewApp.switchTask('MC264824.origin2428_to_soma');const b=ReviewApp.switchTask('MC264920.origin5149_to_soma');await Promise.all([a,b]);});
 await page.waitForFunction(()=>ReviewApp.viewer.surface.modelReady&&ReviewApp.viewer.surface.task.id==='MC264920.origin5149_to_soma');
 assert.deepEqual(await page.evaluate(()=>ReviewApp.viewer.surface.meshes.map(m=>m.id)),['864691135777697453']);
 report.checks.push('Rapid task switching cannot attach the previous recipient mesh.');
 await page.evaluate(async()=>{const s=ReviewApp.viewer.surface;s.yaw+=.22;s.zoom*=.8;s.navigationChanged('rotate');await ReviewApp.saveAll();});
 const camera=await page.evaluate(()=>ReviewApp.task.view.surfaceCamera);
 await page.reload();await page.waitForFunction(()=>window.ReviewApp?.viewer.surface.modelReady,undefined,{timeout:120000});
 // Select the saved task explicitly so the assertion is independent of URL routing.
 await page.evaluate(()=>ReviewApp.switchTask('MC264920.origin5149_to_soma'));await page.waitForFunction(()=>ReviewApp.viewer.surface.modelReady);
 const restored=await page.evaluate(()=>({...ReviewApp.viewer.surface.getNavigationState(),originNm:ReviewApp.viewer.surface.originNm}));
 assert.ok(Math.abs(restored.yaw-camera.yaw)<1e-6);assert.ok(Math.abs(restored.physical_height_nm-camera.physical_height_nm)<.1);
 const savedAfterReload=await page.evaluate(()=>ReviewApp.task.view.surfaceCamera);assert.ok(Math.abs(savedAfterReload.physical_height_nm-camera.physical_height_nm)<.1);assert.ok(Math.abs(savedAfterReload.yaw-camera.yaw)<1e-6);
 await page.evaluate(()=>ReviewApp.saveAll());await page.reload();await page.waitForFunction(()=>window.ReviewApp?.viewer.surface.modelReady,undefined,{timeout:120000});
 assert.ok(Math.abs(await page.evaluate(()=>ReviewApp.viewer.surface.getNavigationState().physical_height_nm)-camera.physical_height_nm)<.1);
 report.checks.push('Saved selection and physical 3D camera survive reload.');
 // Exercise the actual remove control, then reload the same task.
 await page.locator('#segmentList .segment-row button').last().click();await page.evaluate(()=>ReviewApp.saveAll());
 await page.reload();await page.waitForFunction(()=>window.ReviewApp?.viewer,undefined,{timeout:120000});await page.evaluate(()=>ReviewApp.switchTask('MC264920.origin5149_to_soma'));await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);
 assert.equal(await page.evaluate(()=>ReviewApp.viewer.getSegments().length),0);assert.equal(await page.evaluate(()=>ReviewApp.viewer.surface.meshes.length),0);
 report.checks.push('An explicitly removed default remains removed on reload.');
 assert.equal(requests.some(url=>url.includes('/vendor/neuroglancer/')),false);assert.deepEqual(errors,[]);report.errors=errors;report.externalAttempts=external;report.meshRequests=requests.filter(url=>url.includes('/starter-meshes/'));report.passed=true;
 await writeFile(new URL('../docs/starter-mesh-witness.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,firstBranchesMs:report.initial.firstBranchesMs,triangles:report.initial.triangles,checks:report.checks,errors}));
}finally{await browser.close();}
