/** Physical 3D zoom regression on all actual starter meshes; fresh profiles only. */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const witness=process.env.REVIEW_WITNESS||'docs/physical-zoom-browser-witness.json';
const checks=[],errors=[],contexts=[];
let screenshotsTaken=0;
const pass=(name,details={})=>{checks.push({name,passed:true,...details});console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const ready=async page=>{await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.loadingKey===null,undefined,{timeout:180000});await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);await page.waitForFunction(()=>ReviewApp.viewer.surface.modelReady,undefined,{timeout:90000});};
const fresh=async()=>{const context=await browser.newContext({viewport:{width:1800,height:1300},acceptDownloads:true});contexts.push(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await ready(page);return page;};
const open=async(page,id)=>{await page.evaluate(id=>ReviewApp.focused.openQuestion(id),id);await page.waitForFunction(id=>ReviewApp.current.id===id,id);await ready(page);};
const camera=page=>page.evaluate(()=>{const s=ReviewApp.viewer.surface,c=s.getNavigationState();return {...c,globalCenterNm:c.center_nm.map((n,i)=>n+s.originNm[i]),triangles:s.meshes.reduce((n,m)=>n+m.faces,0)};});
const em=page=>page.evaluate(()=>{const v=ReviewApp.viewer;return {centerNm:[...v.view.centerNm],spanNm:v.view.spanNm,plane:v.view.plane,displayWindow:v.view.displayWindow,sequence:v.sequence,loadedKey:v.loadedKey,networkBytes:v.source.networkBytes,pixels:Array.from(v.plane.pixels)};});
const close=(actual,expected,message,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,message+': '+actual+' versus '+expected);
const vector=(actual,expected,message)=>{assert.equal(actual.length,expected.length);actual.forEach((n,i)=>close(n,expected[i],message+' '+i));};
const unchangedPose=(actual,expected)=>{vector(actual.globalCenterNm,expected.globalCenterNm,'camera center');vector(actual.right,expected.right,'camera right');vector(actual.up,expected.up,'camera up');vector(actual.eye_direction,expected.eye_direction,'eye direction');close(actual.frame_height_nm,expected.frame_height_nm,'reference frame');};
const save=async page=>{await page.evaluate(()=>ReviewApp.saveAll());await page.waitForFunction(()=>/Сохранено|Saved/.test(document.querySelector('#saveStatus').textContent));};
const focus=async page=>{await page.locator('#surfaceStage').scrollIntoViewIfNeeded();await page.locator('#surfaceStage').focus();await page.locator('#surfaceStage').hover();};
const wheel=async(page,delta)=>{const old=(await camera(page)).zoom;await page.mouse.wheel(0,delta);await page.waitForFunction(old=>ReviewApp.viewer.surface.zoom!==old,old);};
await mkdir('.local',{recursive:true});
try{
  const page=await fresh();
  for(const recipient of ['MC298937','MC264649','MC264920','MC264824']){
    await open(page,recipient+'.soma_identity');const beforeEM=await em(page);
    await page.locator('#surfaceOverview').click();const overview=await camera(page);assert.ok(overview.triangles>0);assert.equal(overview.zoom,1);assert.ok(overview.frame_height_nm*.08>256);
    await focus(page);for(let n=0;n<12;n++)await wheel(page,-150);
    const belowOldStop=await camera(page);assert.ok(belowOldStop.zoom<.08);assert.ok(belowOldStop.physical_height_nm<overview.frame_height_nm*.08);unchangedPose(belowOldStop,overview);
    for(let n=0;n<75;n++)await page.keyboard.press('=');const nearest=await camera(page);close(nearest.physical_height_nm,256,'physical nearest extent');unchangedPose(nearest,overview);
    await page.keyboard.press('=');close((await camera(page)).physical_height_nm,256,'stable nearest boundary');
    for(let n=0;n<110;n++)await page.keyboard.press('-');const farthest=await camera(page);assert.equal(farthest.zoom,18);unchangedPose(farthest,overview);assert.deepEqual(await em(page),beforeEM);
    await focus(page);for(let n=0;n<70;n++)await page.mouse.wheel(0,-150);await page.waitForFunction(()=>Math.abs(ReviewApp.viewer.surface.camera().height-256)<1e-6);const wheelNearest=await camera(page);unchangedPose(wheelNearest,overview);
    assert.deepEqual(await em(page),beforeEM);
    pass(recipient+' wheel crosses the former whole-neuron stop; both input paths reach 256 nm and retain zoom-out maximum 18',{taskId:recipient+'.soma_identity',triangles:overview.triangles,overviewHeightNm:overview.physical_height_nm,formerMinimumHeightNm:overview.frame_height_nm*.08,newMinimumHeightNm:nearest.physical_height_nm,minimumRatio:nearest.zoom,unchangedCenterOrientationAndEM:true});
  }
  const savedCamera=await camera(page),savedEM=await em(page);await save(page);await page.reload();await ready(page);const restored=await camera(page);unchangedPose(restored,savedCamera);close(restored.physical_height_nm,256,'reload physical extent');assert.ok(restored.zoom<.001);vector((await em(page)).centerNm,savedEM.centerNm,'restored section');
  pass('A saved close camera below the old ratio floor survives a real browser reload',{heightNm:restored.physical_height_nm,zoom:restored.zoom});

  await page.locator('#exportBtn').click();await page.locator('#exportScope').selectOption('current');await page.locator('#annotationJson').check();const download=page.waitForEvent('download');await page.locator('#downloadExport').click();await(await download).saveAs('.local/physical-zoom-current.json');await page.locator('#closeExchange').click();const exported=JSON.parse(await readFile('.local/physical-zoom-current.json','utf8'));const id=await page.evaluate(()=>ReviewApp.current.id);assert.ok(exported.state.tasks[id].view.surfaceCamera.zoom<.001);
  const imported=await fresh();await imported.locator('#importFile').setInputFiles('.local/physical-zoom-current.json');await imported.locator('#applyImport').waitFor();for(const select of await imported.locator('[data-import-policy]').all())await select.selectOption('replace');if(await imported.locator('#importScopeAcknowledge').count())await imported.locator('#importScopeAcknowledge').check();await imported.locator('#applyImport').click();await imported.locator('#exchangeDialog').waitFor({state:'hidden'});await open(imported,id);const incoming=await camera(imported);unchangedPose(incoming,savedCamera);close(incoming.physical_height_nm,256,'import physical extent');await imported.context().close();
  pass('Current-question JSON export and import into a fresh browser profile retain the close physical camera',{taskId:id,heightNm:incoming.physical_height_nm,zoom:incoming.zoom});

  await page.locator('#neuroglancerTab').click();await page.waitForFunction(()=>document.querySelector('#ngFrame').contentWindow?.DendriticBridge,undefined,{timeout:90000});const frame=page.frames().find(f=>f.url().includes('/vendor/neuroglancer/'));await frame.waitForFunction(()=>window.viewer?.display?.panels?.size>0,undefined,{timeout:90000});
  await frame.evaluate(()=>viewer.state.children.get('projectionScale').restoreState(16));await page.waitForFunction(()=>ReviewApp.viewer.surface.camera().height<256,undefined,{timeout:30000});
  const nativeNear=await camera(page);assert.ok(nativeNear.zoom<.001);close(nativeNear.frame_height_nm,savedCamera.frame_height_nm,'native close camera retains whole-neuron frame');
  await page.locator('a[href="#viewer"]').first().click();await focus(page);const beforeIn=(await camera(page)).physical_height_nm;await page.keyboard.press('=');close((await camera(page)).physical_height_nm,beforeIn,'closer imported camera does not jump outward on inward input');await page.keyboard.press('-');close((await camera(page)).physical_height_nm,beforeIn*1.15,'closer imported camera zooms outward smoothly');
  pass('A closer native Neuroglancer camera synchronizes without rebasing the frame or jumping outward on the next inward key',{nativeHeightNm:nativeNear.physical_height_nm,zoom:nativeNear.zoom,frameHeightNm:nativeNear.frame_height_nm});

  if(process.env.REVIEW_CAPTURE==='1'){
    await open(page,'MC298937.soma_identity');await page.locator('#surfaceOverview').click();await page.evaluate(()=>{const v=ReviewApp.viewer,s=v.surface;s.applyNavigationState({center_nm:v.view.centerNm.map((n,i)=>n-s.originNm[i])},{emit:true});});await focus(page);
    while((await camera(page)).physical_height_nm>5000)await wheel(page,-150);
    const captured=await camera(page);assert.ok(captured.zoom<.08);await page.locator('#surfaceStage').evaluate(n=>n.scrollIntoView({block:'center'}));await page.screenshot({path:'.local/physical-zoom-near.png',fullPage:false});screenshotsTaken++;
    pass('Captured one uninspected side-by-side EM and 3D screenshot at the source anchor below the former zoom stop',{heightNm:captured.physical_height_nm,screenshot:'.local/physical-zoom-near.png'});
  }
  assert.deepEqual(errors,[]);pass('No uncaught browser errors');
}catch(error){checks.push({name:'Failure',passed:false,message:error.stack});console.error(error);process.exitCode=1;}
finally{await writeFile(witness,JSON.stringify({origin,checkedAt:new Date().toISOString(),browser:'Microsoft Edge, headless, fresh ephemeral profiles',screenshotsTaken,checks,pageErrors:errors},null,2)+'\n');for(const context of contexts)await context.close().catch(()=>{});await browser.close();console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors:errors.length,witness}));}
