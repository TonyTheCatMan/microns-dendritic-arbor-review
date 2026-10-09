import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']}),manifest=JSON.parse(await readFile(new URL('../data/starter-meshes/manifest.json',import.meta.url))),url=process.env.REVIEW_URL||'http://127.0.0.1:8876/';
const report={checkedAt:new Date().toISOString(),screenshotsTaken:0,checks:[]};
try{
 const context=await browser.newContext(),page=await context.newPage();let fail=true;
 await page.route('**/data/starter-meshes/manifest.json',route=>fail?route.fulfill({status:503,body:'Temporary failure'}):route.continue());
 await page.goto(url);await page.waitForFunction(()=>window.ReviewApp&&document.querySelector('#surfaceStatus').classList.contains('error'));
 assert.equal(await page.evaluate(()=>ReviewApp.viewer.getSegments().length),0);fail=false;await page.locator('#surfaceRetry').click();await page.waitForFunction(()=>ReviewApp.viewer.surface.modelReady);
 assert.equal(await page.evaluate(()=>ReviewApp.viewer.getSegments()[0].id),manifest.recipients.MC298937.segment.id);
 report.checks.push('A failed first metadata load leaves review selections unchanged, and Retry loads default branches.');await context.close();
 const fallback=await browser.newContext({viewport:{width:1800,height:1300}}),p=await fallback.newPage();
 await p.route('**/data/starter-meshes/manifest.json',route=>route.fulfill({status:503,body:'Temporary failure'}));
 await p.goto(url);await p.waitForFunction(()=>window.ReviewApp&&document.querySelector('#surfaceStatus').classList.contains('error'));
 await p.evaluate(segment=>{const v=ReviewApp.viewer;v.updateSegments([segment]);v.onSegmentsChange(v.getSegments());},manifest.recipients.MC298937.segment);
 await p.waitForFunction(()=>ReviewApp.viewer.surface.modelReady,undefined,{timeout:120000});
 report.fallback=await p.evaluate(()=>({id:ReviewApp.viewer.getSegments()[0].id,triangles:ReviewApp.viewer.surface.meshes.reduce((n,m)=>n+m.faces,0),nativeStarted:document.querySelector('#ngFrame').hasAttribute('src'),prepared:!!ReviewApp.viewer.surface.rawMeshes.values().next().value.provenance.starterAssetSha256}));
 assert.equal(report.fallback.nativeStarted,true);assert.equal(report.fallback.prepared,false);assert.ok(report.fallback.triangles>0);assert.equal(report.fallback.id,manifest.recipients.MC298937.segment.id);
 report.checks.push('A saved segment falls back to genuine live-source mesh loading when prepared metadata is unavailable.');await fallback.close();
 report.passed=true;await writeFile(new URL('../docs/starter-recovery-witness.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
