/** Annotation integrity regressions. Isolated profile, no screenshots. */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {readZip} from '../core/zip.js';

const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
await mkdir('.local',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1200},acceptDownloads:true}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const ready=()=>page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete,undefined,{timeout:90000});
const check=label=>{checks.push({label,passed:true});console.log('PASS '+label);};
async function clickSample(u,v){await page.locator('#emCanvas').scrollIntoViewIfNeeded();const point=await page.evaluate(({u,v})=>{const rect=document.getElementById('emCanvas').getBoundingClientRect(),r=ReviewApp.viewer.drawRect;return {x:rect.left+r.x+r.w*u,y:rect.top+r.y+r.h*v};},{u,v});await page.mouse.click(point.x,point.y);}
try{
  await page.goto(origin);await ready();await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);await page.evaluate(()=>ReviewApp.saveAll());
  await page.locator('[data-tool="trace"]').click();await clickSample(.35,.4);await clickSample(.5,.45);
  const original=await page.evaluate(()=>structuredClone(ReviewApp.task.marks[0]));assert.equal(original.pointsNm.length,2);
  await page.locator('#undo').click();await ready();assert.equal(await page.evaluate(()=>ReviewApp.task.marks[0].pointsNm.length),1);
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>ReviewApp.store.status().state==='saved');
  assert.deepEqual(await page.evaluate(()=>ReviewApp.task.marks[0].pointsNm),[original.pointsNm[0]]);
  await page.reload();await ready();assert.deepEqual(await page.evaluate(()=>ReviewApp.task.marks[0].pointsNm),[original.pointsNm[0]]);check('Undo then Ctrl+S and reload cannot resurrect the removed trace vertex');

  const fixture=await page.evaluate(async()=>{
    const {createAnnotationExport}=await import('./core/exchange.js'),task=structuredClone(ReviewApp.task),base=task.marks[0],center=[...ReviewApp.viewer.view.centerNm],timestamp=new Date().toISOString();
    const make=(id,plane,pointsNm,kind='point')=>({...base,id,kind,plane,pointsNm,draft:false,label:id,note:'Exact legacy note '+id,color:'#e23555',strokeWidth:4,view:structuredClone(task.view),updatedAt:timestamp});
    task.marks=[make('compat-object',{axis:'z'},[[center[0]-160,center[1],center[2]]]),make('compat-uppercase','XY',[[center[0]+160,center[1],center[2]]]),make('depth-edit','xy',[[center[0]-160,center[1]-160,center[2]],[center[0]+160,center[1]+160,center[2]]],'arrow')];
    task.selections=[];task.decision={...task.decision,status:'uncertain',note:'Preserved earlier decision note'};
    return {taskId:task.id,center,marks:task.marks,payload:await createAnnotationExport(ReviewApp.catalog,[task],{scope:'current'}).blob.text()};
  });
  await page.locator('#importFile').setInputFiles({name:'legacy-plane-annotations.json',mimeType:'application/json',buffer:Buffer.from(fixture.payload)});
  await page.locator('#applyImport').waitFor({state:'visible'});await page.locator(`[data-import-policy="${fixture.taskId}"]`).selectOption('replace');await page.locator('#applyImport').click();await page.locator('#exchangeDialog').waitFor({state:'hidden'});await ready();
  assert.equal(await page.locator('[data-item]').count(),3);assert.deepEqual(await page.evaluate(()=>ReviewApp.task.marks.map(mark=>mark.plane)),[{axis:'z'},'XY','xy']);
  await page.locator('#evidenceFilter').selectOption('current');assert.equal(await page.locator('[data-item]').count(),3);
  for(const id of ['compat-object','compat-uppercase']){
    await page.locator(`[data-item="${id}"] .mark-title`).click();assert.match(await page.locator('#activeMarkPosition').innerText(),/^XY/);
    await page.locator(`[data-item="${id}"] .item-actions button`).first().click();await ready();assert.equal(await page.evaluate(()=>ReviewApp.viewer.view.plane),'xy');
    assert.deepEqual(await page.evaluate(()=>ReviewApp.viewer.view.centerNm),fixture.marks.find(mark=>mark.id===id).pointsNm[0]);
  }
  await page.locator('#nextSlice').click();await ready();assert.equal(await page.locator('[data-item]').count(),0);await page.locator('#prevSlice').click();await ready();assert.equal(await page.locator('[data-item]').count(),3);
  assert.equal(await page.evaluate(()=>ReviewApp.task.decision.status),'uncertain');assert.equal(await page.locator('#taskNote').inputValue(),'Preserved earlier decision note');check('Legacy object and uppercase planes import, display, navigate and filter while prior decisions remain intact');

  await page.locator('[data-item="depth-edit"] .item-actions button').nth(1).click();await page.locator('#editorDialog').waitFor({state:'visible'});
  const newDepth=fixture.center[2]+40;
  await page.locator('#geometryEditor input[aria-label="1 Z"]').fill(String(newDepth));await page.locator('#geometryEditor input[aria-label="2 Z"]').fill(String(newDepth));await page.locator('#itemNote').fill('Edited section note retained');await page.locator('#commitEditor').click();await page.locator('#editorDialog').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>ReviewApp.task.marks.find(mark=>mark.id==='depth-edit').pointsNm.map(point=>point[2])),[newDepth,newDepth]);
  await page.locator('#evidenceFilter').selectOption('all');await page.locator('[data-item="depth-edit"] input[type="checkbox"]').check();await page.locator('#selectedExport').click();await page.locator('#includeEvidence').check();
  const downloaded=page.waitForEvent('download',{timeout:120000});await page.locator('#downloadExport').click();const download=await downloaded;await download.saveAs('.local/annotation-depth-regression.zip');await page.locator('#closeExchange').click();
  const files=await readZip(await readFile('.local/annotation-depth-regression.zip')),prefix=`evidence/${fixture.taskId}/depth-edit/`,decoder=new TextDecoder();
  const metadata=JSON.parse(decoder.decode(files.get(prefix+'figure-metadata.json'))),svg=decoder.decode(files.get(prefix+'overlay.svg'));
  assert.equal(metadata.plane.depthNm,newDepth);assert.equal(metadata.view.centerNm[2],newDepth);assert.equal(metadata.view.spanNm,fixture.marks[2].view.spanNm);assert.match(svg,/id="depth-edit"/);assert.match(svg,/Edited section note retained/);assert.match(svg,/<polyline /);
  const png=files.get(prefix+'annotated-physical.png');assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);
  const pixels=await page.evaluate(async bytes=>{const blob=new Blob([new Uint8Array(bytes)],{type:'image/png'}),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let colored=0;for(let i=0;i<data.length;i+=4)if(data[i]>150&&data[i]>data[i+1]*1.8&&data[i]>data[i+2]*1.5)colored++;return {width:canvas.width,height:canvas.height,colored};},[...png]);
  assert.ok(pixels.colored>30,'Exported PNG contains the red edited arrow, not only grayscale image data');check('Editing section coordinates exports the new depth with visible SVG and colored annotated PNG, retaining zoom and note');
  assert.deepEqual(errors,[]);check('No uncaught browser errors during annotation integrity regressions');
  await writeFile('docs/browser-annotation-regressions.json',JSON.stringify({testedAt:new Date().toISOString(),origin,checks,errors,screenshotsTaken:0,anatomicalReview:false},null,2)+'\n');
}catch(error){console.error(error);await writeFile('.local/annotation-regression-failure.json',JSON.stringify({error:error.stack,checks,errors,text:await page.locator('body').innerText()},null,2));process.exitCode=1;}finally{await browser.close();}
