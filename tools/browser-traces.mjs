/** Connected trace and non-disruptive drawing regressions in an isolated profile. */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {parseImport} from '../core/exchange.js';

const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const witness=process.env.REVIEW_WITNESS||'docs/trace-browser-witness.json';
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
await mkdir('.local',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1100},acceptDownloads:true});
const page=await context.newPage(),checks=[],errors=[];
const track=p=>p.on('pageerror',error=>errors.push(error.message));track(page);
const check=(label,data={})=>{checks.push({label,passed:true,...data});console.log('PASS '+label);};
const ready=async p=>{await p.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.loadingKey===null,null,{timeout:90000});await p.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);};
const task=p=>p.evaluate(()=>structuredClone(ReviewApp.task));
const mark=(p,id)=>p.evaluate(id=>structuredClone(ReviewApp.task.marks.find(m=>m.id===id)),id);
const last=p=>p.evaluate(()=>structuredClone(ReviewApp.task.marks.at(-1)));
const quiet=async(p,message)=>{
  assert.equal(await p.locator('#editorDialog').isVisible(),false,message);
  assert.equal(await p.evaluate(()=>document.activeElement?.closest('dialog')!==null),false,`${message}: no modal focus`);
};
const coords=async(p,x,y)=>{
  await p.locator('#emCanvas').scrollIntoViewIfNeeded();
  return p.evaluate(({x,y})=>{const v=ReviewApp.viewer,b=v.canvas.getBoundingClientRect(),r=v.drawRect;return{x:b.x+r.x+r.w*x,y:b.y+r.y+r.h*y};},{x,y});
};
const click=async(p,x,y)=>{const c=await coords(p,x,y);const scroll=await p.evaluate(()=>({x:scrollX,y:scrollY}));await p.mouse.click(c.x,c.y);await quiet(p,'Drawing stays in the image');assert.deepEqual(await p.evaluate(()=>({x:scrollX,y:scrollY})),scroll,'Drawing does not scroll the reviewer to the inspector');};
const drag=async(p,a,b)=>{const start=await coords(p,...a),end=await coords(p,...b);await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:8});await p.mouse.up();await quiet(p,'Dragging saves without a popup');};
const firstPoint=async(p,id)=>{
  await p.locator('#emCanvas').scrollIntoViewIfNeeded();
  return p.evaluate(({id})=>{const v=ReviewApp.viewer,m=ReviewApp.task.marks.find(mark=>mark.id===id),point=m.pointsNm[0],plan=v.plane,r=v.drawRect,b=v.canvas.getBoundingClientRect(),[u,w]=plan.axes;return{x:b.x+r.x+(point[u]/plan.resolutionNm[u]-plan.begin[u]+.5)*r.w/plan.width,y:b.y+r.y+(point[w]/plan.resolutionNm[w]-plan.begin[w]+.5)*r.h/plan.height};},{id});
};
const trace=async(points)=>{await page.locator('[data-tool="trace"]').click();for(const p of points)await click(page,...p);return last(page);};
const exportFile=async(json,path)=>{
  await page.locator('#markupExport').click();await page.locator('#exportScope').selectOption('current');
  if(json)await page.locator('#annotationJson').check();
  const event=page.waitForEvent('download',{timeout:120000});await page.locator('#downloadExport').click();await(await event).saveAs(path);await page.locator('#closeExchange').click();
  return parseImport(new Blob([await readFile(path)]),catalog);
};
try{
  await page.goto(origin);await ready(page);
  assert.equal((await task(page)).marks.length,0);
  await page.locator('[data-tool="point"]').click();await click(page,.18,.2);await click(page,.25,.2);
  assert.equal((await task(page)).marks.length,2);assert.ok((await task(page)).marks.every(mark=>mark.kind==='point'&&mark.draft===false));
  await page.locator('[data-tool="arrow"]').click();await drag(page,[.33,.2],[.42,.28]);await drag(page,[.48,.2],[.57,.28]);
  assert.equal((await task(page)).marks.length,4);assert.ok((await task(page)).marks.every(mark=>mark.draft===false));
  check('Repeated points and arrows save immediately without a dialog or scrolling away from the image');

  const unfinished=await trace([[.17,.43],[.28,.36]]);
  assert.equal(await page.locator('#closeTrace').isDisabled(),true,'Two vertices cannot close a trace');
  await page.locator('#finishMark').click();await quiet(page,'Finish leaves notes optional');
  const open=await mark(page,unfinished.id);assert.equal(open.draft,false);assert.notEqual(open.closed,true);assert.equal(open.pointsNm.length,2);
  const entered=await trace([[.36,.42],[.44,.36],[.52,.43]]);await page.keyboard.press('Enter');await quiet(page,'Enter leaves notes optional');
  const enterOpen=await mark(page,entered.id);assert.equal(enterOpen.draft,false);assert.notEqual(enterOpen.closed,true);assert.equal(enterOpen.pointsNm.length,3);
  check('Finish and Enter save open traces without opening the editor; fewer than three vertices cannot close');

  const triangle=await trace([[.63,.38],[.8,.4],[.74,.58]]),first=await firstPoint(page,triangle.id);
  await page.mouse.click(first.x+3,first.y+3);await quiet(page,'Clicking the first vertex closes without a popup');
  const closed=await mark(page,triangle.id);assert.equal(closed.closed,true);assert.equal(closed.draft,false);assert.equal(closed.pointsNm.length,3);assert.deepEqual(closed.pointsNm,triangle.pointsNm);
  assert.notDeepEqual(closed.pointsNm[0],closed.pointsNm.at(-1));assert.equal(await page.locator('#finishMark').isDisabled(),true);
  check('Clicking near the starting vertex joins the tail with a closing edge and no duplicate vertex');

  await page.locator('#activeMarkLabel').fill('Замкнутый контур β');await page.locator('#activeMarkNote').fill('Тестовая заметка: сохраняется при замыкании и продолжении.');
  const noted=await mark(page,triangle.id);assert.equal(noted.note,'Тестовая заметка: сохраняется при замыкании и продолжении.');
  await page.locator('#activeTraceToggle').click();assert.notEqual((await mark(page,triangle.id)).closed,true);await quiet(page,'Reopening uses the inspector');
  await page.locator('#activeTraceToggle').click();assert.equal((await mark(page,triangle.id)).closed,true);assert.deepEqual((await mark(page,triangle.id)).pointsNm,triangle.pointsNm);
  check('The selected-trace control reopens and closes the same mark without losing its label, note or vertices');

  const buttonDraft=await trace([[.2,.65],[.35,.64],[.3,.82]]);assert.equal(await page.locator('#closeTrace').isEnabled(),true);
  await page.locator('#closeTrace').click();await quiet(page,'Close trace completes directly');const buttonClosed=await mark(page,buttonDraft.id);
  assert.equal(buttonClosed.closed,true);assert.equal(buttonClosed.draft,false);assert.deepEqual(buttonClosed.pointsNm,buttonDraft.pointsNm);
  check('The explicit Close trace button joins a draft with at least three vertices');

  await page.locator(`[data-item="${triangle.id}"] .item-actions button`).filter({hasText:/Продолжить|Continue/}).click();await ready(page);
  const continued=await mark(page,triangle.id);assert.notEqual(continued.closed,true);assert.equal(continued.draft,true);
  await click(page,.61,.57);await page.locator('#finishMark').click();await quiet(page,'Continuing then finishing stays in the image');
  const extended=await mark(page,triangle.id);assert.equal(extended.id,triangle.id);assert.equal(extended.pointsNm.length,4);assert.equal(extended.draft,false);assert.notEqual(extended.closed,true);assert.equal(extended.note,noted.note);assert.equal(extended.label,noted.label);
  await page.locator('#activeTraceToggle').click();assert.equal((await mark(page,triangle.id)).closed,true);
  check('Continue explicitly reopens a closed trace, appends a vertex, and preserves its identity and notes');

  await page.locator('#activeMarkEdit').click();await page.locator('#editorDialog').waitFor({state:'visible'});await page.locator('#itemNote').fill(noted.note+'\nРедактор открыт по запросу.');await page.locator('#commitEditor').click();await page.locator('#editorDialog').waitFor({state:'hidden'});
  assert.equal((await mark(page,triangle.id)).closed,true);
  check('The detailed note editor still opens on an explicit Edit action and retains closure');

  const beforeDelayedContinue=await mark(page,triangle.id);
  await page.evaluate(()=>{
    const viewer=ReviewApp.viewer;window.__originalSetView=viewer.setView;
    viewer.setView=async function(...args){await window.__originalSetView.apply(this,args);await new Promise(resolve=>{window.__releaseTraceContinuation=resolve;});};
  });
  await page.locator(`[data-item="${triangle.id}"] .item-actions button`).filter({hasText:/Продолжить|Continue/}).click();
  await page.waitForFunction(()=>typeof window.__releaseTraceContinuation==='function');
  await page.locator('[data-tool="point"]').click();await click(page,.48,.75);const laterPoint=await last(page);
  await page.evaluate(async()=>{ReviewApp.viewer.setView=window.__originalSetView;window.__releaseTraceContinuation();await new Promise(requestAnimationFrame);delete window.__releaseTraceContinuation;delete window.__originalSetView;});
  assert.deepEqual(await mark(page,triangle.id),beforeDelayedContinue,'Stale Continue must leave the old completed trace unchanged');
  assert.equal(await page.evaluate(()=>ReviewApp.viewer.activeMarkId),laterPoint.id,'Stale Continue must not steal selection from later drawing');
  assert.equal(await page.locator('[data-tool="point"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#finishMark').isDisabled(),true);await quiet(page,'Interrupted Continue stays non-disruptive');
  check('A delayed Continue cannot reopen an old trace or steal selection after the user changes tool and draws another mark');

  await page.waitForFunction(()=>ReviewApp.store.status().state==='saved');const beforeReload=await task(page);
  await page.reload();await ready(page);const afterReload=await task(page);assert.deepEqual(afterReload.marks,beforeReload.marks);assert.equal(afterReload.decision.status,'unreviewed');assert.deepEqual(afterReload.decision.answers,{});
  check('Automatic saving and reload preserve every open and closed trace, notes and native coordinates without changing anatomical decisions');

  for(const [kind,json,path]of [['ZIP',false,'.local/trace-review.zip'],['JSON',true,'.local/trace-review.json']]){
    const exported=await exportFile(json,path);assert.deepEqual(exported.tasks[0].marks,afterReload.marks,`${kind} exact marks`);
    const clean=await browser.newContext({viewport:{width:1680,height:1100}}),q=await clean.newPage();track(q);
    await q.goto(origin);await ready(q);await q.locator('#importFile').setInputFiles(path);await q.locator('#applyImport').waitFor({state:'visible'});await q.locator(`[data-import-policy="${afterReload.id}"]`).selectOption('replace');await q.locator('#applyImport').click();await q.locator('#exchangeDialog').waitFor({state:'hidden'});await q.reload();await ready(q);assert.deepEqual((await task(q)).marks,afterReload.marks,`${kind} import exact marks`);await clean.close();
    check(`${kind} download, fresh-profile upload and reload preserve closed traces exactly`);
  }
  assert.deepEqual(errors,[]);check('No uncaught browser errors');
  await writeFile(witness,JSON.stringify({testedAt:new Date().toISOString(),origin,browser:'Edge Chromium headless',checks,errors,screenshotsTaken:0,anatomicalReview:false},null,2)+'\n');
}catch(error){console.error(error);await writeFile('.local/trace-browser-failure.json',JSON.stringify({error:error.stack,checks,errors,text:await page.locator('body').innerText()},null,2));process.exitCode=1;}finally{await browser.close();}
