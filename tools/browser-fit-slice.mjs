/** Fit-to-window navigation regression. Isolated browser storage; no screenshots. */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const witness=process.env.REVIEW_WITNESS||'docs/fit-slice-browser-witness.json';
await mkdir('.local',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1100}}),page=await context.newPage();
const checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const pass=(name,details={})=>{checks.push({name,passed:true,...details});console.log('PASS '+name);};
const ready=()=>page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.loadingKey===null,null,{timeout:90000});
const state=()=>page.evaluate(()=>({view:ReviewApp.viewer.getView(),depth:ReviewApp.viewer.plane.depthNm,depthInput:Number(document.querySelector('#depth').value),slider:Number(document.querySelector('#sliceSlider').value),marks:structuredClone(ReviewApp.task.marks),activeMarkId:ReviewApp.viewer.activeMarkId,finishDisabled:document.querySelector('#finishMark').disabled}));
async function point(u,v){
  await page.locator('#emCanvas').scrollIntoViewIfNeeded();
  return page.evaluate(({u,v})=>{const b=ReviewApp.viewer.canvas.getBoundingClientRect(),r=ReviewApp.viewer.drawRect;return {x:b.left+r.x+r.w*u,y:b.top+r.y+r.h*v};},{u,v});
}
async function clickSample(u,v){const p=await point(u,v);await page.mouse.click(p.x,p.y);}
try{
  await page.goto(origin);await ready();await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);
  const initial=await state();
  await page.locator('#nextSlice').click();await ready();
  await page.locator('[data-tool="navigate"]').click();
  const a=await point(.45,.45),b=await point(.49,.48);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await ready();
  await page.locator('#zoomIn').click();await ready();
  const moved=await state();
  assert.equal(moved.view.plane,'xy');assert.equal(moved.view.centerNm[2],initial.view.centerNm[2]+40);
  assert.notDeepEqual(moved.view.centerNm.slice(0,2),initial.view.centerNm.slice(0,2));assert.notEqual(moved.view.spanNm,4096);
  await page.locator('[data-tool="point"]').click();await clickSample(.28,.32);
  await page.locator('[data-tool="trace"]').click();await clickSample(.40,.45);await clickSample(.52,.51);
  const before=await state();assert.equal(before.marks.length,2);assert.equal(before.finishDisabled,false);assert.equal(before.marks[1].draft,true);
  await page.locator('#fitButton').click();await ready();const fitted=await state();
  assert.equal(fitted.view.plane,before.view.plane);assert.deepEqual(fitted.view.centerNm,before.view.centerNm);assert.equal(fitted.view.spanNm,4096);
  assert.equal(fitted.depth,before.depth);assert.equal(fitted.depthInput,before.depthInput);assert.equal(fitted.slider,before.slider);
  assert.equal(await page.evaluate(()=>ReviewApp.viewer.plane.complete),true);
  pass('Real XY slice stepping, pointer pan and zoom followed by Fit retain the exact XYZ center and loaded section',{centerNm:fitted.view.centerNm,depthNm:fitted.depth,spanNm:fitted.view.spanNm});
  assert.deepEqual(fitted.marks,before.marks);assert.equal(fitted.activeMarkId,before.activeMarkId);assert.equal(fitted.finishDisabled,false);
  await clickSample(.60,.58);const continued=await state();assert.equal(continued.marks.length,2);assert.equal(continued.marks[1].id,before.marks[1].id);assert.equal(continued.marks[1].pointsNm.length,3);assert.equal(continued.marks[1].draft,true);
  assert.equal(await page.locator('#editorDialog').evaluate(dialog=>dialog.open),false);
  pass('Fit leaves saved marks and the active trace draft unchanged, allowing the same draft to continue without a popup');
  await page.locator('#finishMark').click();await page.locator('#nextSlice').click();await ready();const next=await state();
  assert.equal(next.view.centerNm[2],fitted.view.centerNm[2]+40);assert.equal(next.depth,fitted.depth+40);assert.deepEqual(next.view.centerNm.slice(0,2),fitted.view.centerNm.slice(0,2));
  await page.locator('#prevSlice').click();await ready();await page.evaluate(()=>ReviewApp.saveAll());const saved=await state();
  await page.reload();await ready();await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);const restored=await state();
  assert.deepEqual(restored.view.centerNm,saved.view.centerNm);assert.equal(restored.view.plane,saved.view.plane);assert.equal(restored.view.spanNm,4096);assert.deepEqual(restored.marks,saved.marks);
  pass('Next and previous section remain relative to the fitted section; autosaved center, plane, zoom and marks survive reload');

  // Supplemental state checks use the real handlers and normal setView but skip
  // orthogonal EM downloads. The fully rendered XY check above uses real data.
  await page.evaluate(()=>{window.fitOriginalLoad=ReviewApp.viewer.load;ReviewApp.viewer.load=async function(){return this.plane;};});
  try{
    for(const plane of ['xy','xz','yz']){
      const axis={xy:2,xz:1,yz:0}[plane],step=[8,8,40][axis];
      const center=saved.view.centerNm.map((n,i)=>Math.round(n/[8,8,40][i])*[8,8,40][i]+[80,96,120][i]);
      await page.evaluate(({plane,center})=>ReviewApp.viewer.setView({plane,centerNm:center,spanNm:2048}),{plane,center});
      const prior=await state();await page.locator('#fitButton').click();const result=await state();
      assert.equal(result.view.plane,plane);assert.deepEqual(result.view.centerNm,prior.view.centerNm);assert.equal(result.view.spanNm,4096);assert.equal(result.depthInput,center[axis]);assert.equal(result.slider,center[axis]/step);assert.deepEqual(result.marks,prior.marks);
      await page.locator('#nextSlice').click();const advanced=await state();const expected=[...center];expected[axis]+=step;assert.deepEqual(advanced.view.centerNm,expected);
      pass(`${plane.toUpperCase()} real Fit and section button handlers preserve the current center and correct depth axis`,{imagery:'not loaded in supplemental state check',centerNm:center,stepNm:step});
    }
  }finally{
    await page.evaluate(async view=>{ReviewApp.viewer.load=window.fitOriginalLoad;delete window.fitOriginalLoad;await ReviewApp.viewer.setView(view);},saved.view);await ready();
  }
  assert.deepEqual(errors,[]);pass('No uncaught browser errors');
  await writeFile(witness,JSON.stringify({testedAt:new Date().toISOString(),origin,checks,errors,screenshotsTaken:0,anatomicalReview:false},null,2)+'\n');
}catch(error){
  console.error(error);await writeFile('.local/fit-slice-failure.json',JSON.stringify({error:error.stack,checks,errors,state:await state().catch(()=>null)},null,2)+'\n');process.exitCode=1;
}finally{await browser.close();}
