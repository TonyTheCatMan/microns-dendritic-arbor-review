import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseImport} from '../core/exchange.js';

// All annotations are created in isolated test browser profiles. No screenshots
// are read or generated here, and no anatomical judgments enter the catalog.
const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874';
const witness=process.env.REVIEW_WITNESS||'docs/annotation-browser-witness.json';
const catalog=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
await fs.mkdir('.local',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1680,height:1100},acceptDownloads:true});
const page=await context.newPage(),checks=[],errors=[];
const track=p=>p.on('pageerror',error=>errors.push(error.message));track(page);
const pass=(name,data={})=>{checks.push({name,passed:true,...data});console.log('PASS '+name);};
const ready=async p=>{
  await p.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.loadingKey===null,null,{timeout:90000});
  await p.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);
};
const task=async p=>p.evaluate(()=>structuredClone(ReviewApp.task));
const save=async p=>{await p.keyboard.press('Control+s');await p.waitForFunction(()=>/Сохранено|Saved/.test(document.querySelector('#saveStatus').textContent));};
const coords=async(p,x,y)=>{
  await p.locator('#emCanvas').scrollIntoViewIfNeeded();
  return p.evaluate(async({x,y})=>{
    const v=ReviewApp.viewer,b=v.canvas.getBoundingClientRect(),r=v.drawRect;
    const clientX=Math.round(b.x+r.x+r.w*x),clientY=Math.round(b.y+r.y+r.h*y);
    const {pixelToNm}=await import('./viewer/coordinates.js');
    return{x:clientX,y:clientY,nm:pixelToNm(v.plane,(clientX-b.x-r.x)/r.w*v.plane.width,(clientY-b.y-r.y)/r.h*v.plane.height)};
  },{x,y});
};
const pointerClick=async(p,x,y)=>{const a=await coords(p,x,y);await p.mouse.click(a.x,a.y);return a;};
const pointerDrag=async(p,a,b)=>{
  const start=await coords(p,...a),end=await coords(p,...b);
  await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:14});await p.mouse.up();
  return[start,end];
};
const editor=async(p,label,note)=>{
  await p.locator('#editorDialog').waitFor({state:'visible'});
  await p.locator('#itemLabel').fill(label);await p.locator('#itemNote').fill(note);
  await p.locator('#commitEditor').click();await p.locator('#editorDialog').waitFor({state:'hidden'});
};
const exportFile=async(p,{scope='current',json=false,evidence=false,path})=>{
  await p.locator('#exportBtn').click();await p.locator('#exportScope').selectOption(scope);
  if(json)await p.locator('#annotationJson').check();if(evidence)await p.locator('#includeEvidence').check();
  const download=p.waitForEvent('download',{timeout:120000});await p.locator('#downloadExport').click();
  await(await download).saveAs(path);await p.locator('#closeExchange').click();
  return parseImport(new Blob([await fs.readFile(path)]),catalog);
};
const importFile=async(p,path,taskId)=>{
  await p.locator('#importFile').setInputFiles(path);await p.locator('#applyImport').waitFor({state:'visible'});
  await p.locator(`[data-import-policy="${taskId}"]`).selectOption('replace');
  await p.locator('#applyImport').click();await p.locator('#exchangeDialog').waitFor({state:'hidden'});await ready(p);
};
const stateFields=['marks','selections','segments','view','decision'];
const markBy=async(p,id)=>p.evaluate(id=>structuredClone(ReviewApp.task.marks.find(m=>m.id===id)),id);
const markScreen=async(p,id,index=0)=>{
  await p.locator('#emCanvas').scrollIntoViewIfNeeded();
  return p.evaluate(({id,index})=>{
    const v=ReviewApp.viewer,m=ReviewApp.task.marks.find(m=>m.id===id),point=m.pointsNm[index],plan=v.plane;
    const r=v.drawRect,b=v.canvas.getBoundingClientRect(),[u,w]=plan.axes;
    return{x:b.x+r.x+(point[u]/plan.resolutionNm[u]-plan.begin[u]+.5)*r.w/plan.width,y:b.y+r.y+(point[w]/plan.resolutionNm[w]-plan.begin[w]+.5)*r.h/plan.height};
  },{id,index});
};

try{
  await page.goto(origin);await ready(page);
  assert.equal(await page.locator('[data-task]').count(),50);
  assert.equal(await page.locator('#decisionStatus').count(),0);
  assert.ok(!/РЕШЕНИЕ ПО ЗАДАЧЕ/i.test(await page.locator('body').innerText()));
  const initial=await task(page);assert.equal(initial.decision.status,'unreviewed');assert.deepEqual(initial.decision.answers,{});
  pass('50 tasks load without the decision form; anatomy remains unreviewed');

  const geometries=[
    {kind:'arrow',a:[.23,.25],b:[.44,.28],label:'Кандидат мембраны A',note:'Первая стрелка: проверить контур, не вывод.'},
    {kind:'point',a:[.72,.25],label:'Начало ветви',note:'Точка наблюдения β.'},
    {kind:'trace',a:[.19,.49],middle:[.27,.43],b:[.36,.51],label:'Открытая мембрана',note:'Три просмотренные точки; линия открыта.'},
    {kind:'freehand',a:[.51,.43],b:[.69,.51],label:'Непрерывный штрих',note:'Свободный контур на одном срезе.'},
    {kind:'roi',a:[.16,.64],b:[.33,.80],label:'Повреждение / граница',note:'Область данных с сомнительной границей.'},
    {kind:'ellipse',a:[.43,.66],b:[.57,.80],label:'Внутренний ободок',note:'Кандидат органеллы, не плазматическая мембрана.'},
    {kind:'distance',a:[.68,.64],b:[.82,.80],label:'Локальное расстояние',note:'Геометрическая длина, без интерполяции.'},
  ];
  const created=[];
  for(const geometry of geometries){
    await page.locator(`[data-tool="${geometry.kind}"]`).click();
    let samples;
    if(geometry.kind==='point')samples=[await pointerClick(page,...geometry.a)];
    else if(geometry.kind==='trace'){
      samples=[await pointerClick(page,...geometry.a),await pointerClick(page,...geometry.middle),await pointerClick(page,...geometry.b)];
      await page.locator('#finishMark').click();
    }else samples=await pointerDrag(page,geometry.a,geometry.b);
    await page.locator('#editorDialog').waitFor({state:'visible'});
    if(geometry.kind==='arrow'){
      await page.locator('#itemColor').fill('#ed4e88');await page.locator('#itemLineWidth').fill('4');
      await page.locator('#itemCategory').selectOption('membrane');
    }
    await editor(page,geometry.label,geometry.note);
    const m=(await task(page)).marks.at(-1);assert.equal(m.kind,geometry.kind);assert.equal(m.draft,false);
    assert.equal(m.label,geometry.label);assert.equal(m.note,geometry.note);
    assert.deepEqual(m.pointsNm[0],samples[0].nm,`${geometry.kind} start is the native integer sample`);
    assert.deepEqual(m.pointsNm.at(-1),samples.at(-1).nm,`${geometry.kind} end is the native integer sample`);
    assert.ok(m.pointsNm.every(p=>p[2]===initial.view.centerNm[2]));
    assert.equal(m.sourceBinding.catalogHash,catalog.catalogHash);assert.equal(m.sourceBinding.sourceHash,catalog.sourceHash);
    assert.deepEqual(m.sourceBinding.resolutionNm,[8,8,40]);
    if(geometry.kind==='trace')assert.equal(m.pointsNm.length,3);
    if(geometry.kind==='freehand')assert.ok(m.pointsNm.length>2);
    created.push(m);
  }
  const arrow=created[0];assert.equal(arrow.color,'#ed4e88');assert.equal(arrow.strokeWidth,4);assert.equal(arrow.category,'membrane');
  pass('seven tools draw native-coordinate point, arrow, open trace, freehand, rectangle, ellipse and calibrated distance',{kinds:created.map(m=>m.kind),freehandVertices:created.find(m=>m.kind==='freehand').pointsNm.length});

  await page.locator('[data-tool="select"]').click();
  const firstPoint=await markScreen(page,arrow.id,0),lastPoint=await markScreen(page,arrow.id,1);
  await page.mouse.click((firstPoint.x+lastPoint.x)/2,(firstPoint.y+lastPoint.y)/2);
  await page.waitForFunction(id=>ReviewApp.viewer.activeMarkId===id,arrow.id);
  await page.locator('#activeMarkLabel').fill('Мембрана A: исправлено');
  await page.locator('#activeMarkNote').fill('Исправленная заметка\nСохраняется дословно: α / β.');
  await page.locator('#activeMarkColor').fill('#12c8b0');await page.locator('#activeMarkWidth').fill('5');
  await page.locator('#activeMarkCategory').selectOption('alternative');await page.locator('#activeMarkLabel').focus();
  await save(page);
  const edited=await markBy(page,arrow.id);assert.equal(edited.label,'Мембрана A: исправлено');assert.equal(edited.note,'Исправленная заметка\nСохраняется дословно: α / β.');assert.equal(edited.color,'#12c8b0');assert.equal(edited.strokeWidth,5);assert.equal(edited.category,'alternative');
  pass('clicking a mark selects its editable note, label, color, width and anatomical category');

  const beforeDrag=await markBy(page,arrow.id),handle=await markScreen(page,arrow.id,1),newHandle=await coords(page,.49,.34);
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(newHandle.x,newHandle.y,{steps:10});await page.mouse.up();
  const reshaped=await markBy(page,arrow.id);assert.deepEqual(reshaped.pointsNm[0],beforeDrag.pointsNm[0]);assert.deepEqual(reshaped.pointsNm[1],newHandle.nm);assert.notDeepEqual(reshaped.pointsNm,beforeDrag.pointsNm);
  await page.locator('#undo').click();assert.deepEqual((await markBy(page,arrow.id)).pointsNm,beforeDrag.pointsNm);
  await page.locator('#redo').click();assert.deepEqual((await markBy(page,arrow.id)).pointsNm,reshaped.pointsNm);
  pass('dragging a selected endpoint edits geometry; undo and redo restore exact coordinates');

  await page.locator('[data-tool="select"]').click();
  const s0=await markScreen(page,arrow.id,0),s1=await markScreen(page,arrow.id,1),mid={x:(s0.x+s1.x)/2,y:(s0.y+s1.y)/2};
  await page.mouse.move(mid.x,mid.y);await page.mouse.down();await page.mouse.move(mid.x+19,mid.y+12,{steps:9});await page.mouse.up();
  const translated=await markBy(page,arrow.id),delta=translated.pointsNm[0].map((n,i)=>n-reshaped.pointsNm[0][i]);
  assert.ok(delta.some(Boolean));assert.deepEqual(translated.pointsNm[1].map((n,i)=>n-reshaped.pointsNm[1][i]),delta);assert.equal(delta[2],0);
  pass('dragging a mark body translates the whole geometry on the same source section');

  const originalDepth=await page.evaluate(()=>ReviewApp.viewer.plane.depthNm);
  await page.locator('#nextSlice').click();await ready(page);
  assert.equal(await page.evaluate(()=>ReviewApp.viewer.plane.depthNm),originalDepth+40);
  const offSection=await page.evaluate(async id=>{const {overlaySvg}=await import('./viewer/figure.js');return overlaySvg(ReviewApp.viewer.plane,ReviewApp.task.marks).svg.includes(id);},arrow.id);
  assert.equal(offSection,false);assert.deepEqual((await markBy(page,arrow.id)).pointsNm,translated.pointsNm);
  await page.locator('#evidenceFilter').selectOption('current');assert.equal(await page.locator('#evidenceList [data-item]').count(),0);
  await page.locator('#evidenceFilter').selectOption('all');assert.equal(await page.locator('#evidenceList [data-item]').count(),7);
  await page.locator('#prevSlice').click();await ready(page);
  pass('marks belong to their source section; current-section filtering never alters saved geometry');

  await page.locator('[data-tool="trace"]').click();await pointerClick(page,.76,.39);await pointerClick(page,.82,.44);
  await page.locator('#nextSlice').click();await ready(page);
  const retained=(await task(page)).marks.find(m=>m.draft);
  assert.ok(retained);assert.equal(retained.kind,'trace');assert.equal(retained.pointsNm.length,2);assert.ok(retained.pointsNm.every(p=>p[2]===originalDepth));
  await page.locator('#prevSlice').click();await ready(page);
  pass('a section change saves an unfinished open trace without connecting separate sections');

  await page.locator('.task-notes summary').click();
  await page.locator('#taskNote').fill('Общее наблюдение для задачи: проверить непрерывность.');
  await page.locator('#saveSelection').click();await editor(page,'Сохранённый вид с разметкой','Исходный срез для возврата.');
  await save(page);const preReload=await task(page);
  await page.reload();await ready(page);const afterReload=await task(page);
  for(const key of stateFields)assert.deepEqual(afterReload[key],preReload[key],`reload ${key}`);
  assert.equal(afterReload.decision.status,'unreviewed');assert.deepEqual(afterReload.decision.answers,{});
  assert.equal(await page.locator('#taskNote').inputValue(),'Общее наблюдение для задачи: проверить непрерывность.');
  pass('Ctrl+S and reload preserve every mark, style, note, selected structure and saved view exactly');

  await page.locator('#language').selectOption('en');assert.equal(await page.locator('#saveBtn').innerText(),'Save');
  assert.deepEqual((await task(page)).marks,afterReload.marks);assert.equal(await page.locator('#taskNote').inputValue(),afterReload.decision.note);
  pass('English labels leave handwritten labels and notes unchanged');

  const annotatedDownload=page.waitForEvent('download');await page.locator('#downloadAnnotated').click();
  await(await annotatedDownload).saveAs('.local/annotation-current.png');
  const png=await fs.readFile('.local/annotation-current.png');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  pass('one-click annotated image downloads a real PNG',{bytes:png.length});

  const expected=await task(page);
  const zip=await exportFile(page,{scope:'all',path:'.local/annotation-current.zip'});
  assert.equal(zip.tasks.length,50);
  const compact=await exportFile(page,{scope:'current',json:true,path:'.local/annotation-current.json'});
  for(const parsed of [zip,compact])for(const key of stateFields)assert.deepEqual(parsed.tasks[0][key],expected[key],`download ${key}`);
  pass('complete 50-task ZIP and compact task JSON preserve exact geometry, styles, notes and provenance');

  await page.locator(`#evidenceList [data-item="${arrow.id}"] input[type="checkbox"]`).check();await page.locator('#selectedExport').click();await page.locator('#includeEvidence').check();
  const evidenceDownload=page.waitForEvent('download',{timeout:120000});await page.locator('#downloadExport').click();await(await evidenceDownload).saveAs('.local/annotation-selected-evidence.zip');await page.locator('#closeExchange').click();
  const evidence=await parseImport(new Blob([await fs.readFile('.local/annotation-selected-evidence.zip')]),catalog);
  assert.equal(evidence.tasks[0].marks.length,1);assert.equal(evidence.tasks[0].marks[0].id,arrow.id);assert.equal(evidence.manifest.evidence.length,4);
  const svgPath=[...evidence.files.keys()].find(path=>path.endsWith('/overlay.svg')),svg=new TextDecoder().decode(evidence.files.get(svgPath));
  assert.ok(svg.includes(arrow.id));assert.ok(svg.includes('#12c8b0'));assert.ok(svg.includes('Исправленная заметка'));
  const metadataPath=[...evidence.files.keys()].find(path=>path.endsWith('/figure-metadata.json')),metadata=JSON.parse(new TextDecoder().decode(evidence.files.get(metadataPath)));
  assert.deepEqual(metadata.marks[0],expected.marks.find(m=>m.id===arrow.id));assert.deepEqual(metadata.plane.nativePixelSizeNm,[8,8]);assert.equal(metadata.raw.resampled,false);
  pass('selected evidence ZIP contains source-linked raw PNG, annotated PNG, vector arrow and metadata');

  for(const [label,path]of [['ZIP','.local/annotation-current.zip'],['JSON','.local/annotation-current.json']]){
    const clean=await browser.newContext({viewport:{width:1680,height:1100}}),q=await clean.newPage();track(q);
    await q.goto(origin);await ready(q);assert.equal((await task(q)).marks.length,0);
    await importFile(q,path,expected.id);await q.reload();await ready(q);const actual=await task(q);
    for(const key of stateFields)assert.deepEqual(actual[key],expected[key],`${label} import ${key}`);
    await q.locator('#importFile').setInputFiles(path);await q.locator('#applyImport').waitFor({state:'visible'});
    assert.equal(await q.locator(`[data-import-policy="${expected.id}"]`).inputValue(),'keep');await q.locator('#closeExchange').click();
    await clean.close();pass(`fresh-profile ${label} upload and reload restore exact work; conflicting upload defaults to keep`);
  }

  assert.deepEqual(errors,[]);pass('no uncaught browser errors');
  await fs.writeFile(witness,JSON.stringify({testedAt:new Date().toISOString(),origin,browser:'Edge Chromium headless',checks,anatomicalReview:false,defaultProjectUnchanged:true},null,2)+'\n');
}catch(error){
  console.error(error);await fs.writeFile('.local/annotation-browser-failure.json',JSON.stringify({message:error.message,stack:error.stack,checks,errors,body:await page.locator('body').innerText()},null,2));process.exitCode=1;
}finally{await browser.close();}
