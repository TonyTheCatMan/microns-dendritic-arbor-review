/** Browser regressions for the unified restricted-review navigation. Text receipts only. */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const witness=process.env.REVIEW_WITNESS||'docs/scope-navigation-browser-witness.json';
const PRIMARY='preferred14.clean_extended',BROAD='all_export19.clean_extended';
const frozen=JSON.parse(await readFile(new URL('../data/review-scope.json',import.meta.url),'utf8'));
const workflow=JSON.parse(await readFile(new URL('../data/focused-workflow.json',import.meta.url),'utf8'));
const primary=frozen.pools.find(p=>p.id===PRIMARY),broader=frozen.pools.find(p=>p.id===BROAD);
const priority=new Map(primary.questions.map(q=>[q.id,q.priority]));
const baseApplicable=id=>['required','qualification'].includes(priority.get(id));
const expected=({view='stems',cell='',optional=false,restored=[]}={})=>workflow.questions.filter(q=>(view==='all'||q.view===view)&&(!cell||q.recipientId===cell)&&(optional||view==='all'||baseApplicable(q.id)||restored.includes(q.id))).map(q=>q.id);
const checks=[],errors=[],contexts=[];
const pass=(name,details={})=>{checks.push({name,passed:true,...details});console.log('PASS '+name);};
await mkdir('.local',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const fresh=async()=>{const context=await browser.newContext({viewport:{width:1680,height:1200},acceptDownloads:true});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;};
const ready=async page=>{await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.loadingKey===null,null,{timeout:180000});await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);};
const save=async page=>{await page.evaluate(()=>ReviewApp.saveAll());await page.waitForFunction(()=>/Сохранено|Saved/.test(document.querySelector('#saveStatus').textContent));};
const options=page=>page.locator('#taskSelect option').evaluateAll(nodes=>nodes.filter(n=>n.value&&!n.disabled).map(n=>({id:n.value,text:n.textContent})));
const queue=async page=>(await options(page)).map(o=>o.id);
const checkQueue=async(page,filter)=>{const ids=expected(filter);assert.deepEqual(await queue(page),ids,'ordinary dropdown equals the scoped view/cell queue');assert.match(await page.locator('#reviewArchiveCount').innerText(),new RegExp(`(?:В списке|In this list):\\s*${ids.length}(?!\\d)`),'header reflects the same scoped view/cell queue');};
const current=page=>page.evaluate(()=>ReviewApp.current.id);
const task=page=>page.evaluate(()=>structuredClone(ReviewApp.task));
const go=async(page,id)=>{await page.locator('#taskSelect').selectOption(id);await page.waitForFunction(id=>ReviewApp.current.id===id,id);await ready(page);};
const open=async(page,id)=>{await page.evaluate(id=>ReviewApp.focused.openQuestion(id),id);await page.waitForFunction(id=>ReviewApp.current.id===id,id);await ready(page);};
const tab=async(page,id)=>{await page.locator(`[data-review-view="${id}"]`).click();await page.waitForFunction(id=>ReviewApp.focused.context.viewId===id,id);await ready(page);};
const pool=async(page,id)=>{await page.locator('#reviewPool').selectOption(id);await page.waitForFunction(id=>ReviewApp.catalog.activeReviewPoolId===id&&!document.querySelector('#reviewPool').disabled,id);};
const body=page=>page.locator('body').innerText();
const stable=page=>page.evaluate(()=>({taskId:ReviewApp.current.id,marks:structuredClone(ReviewApp.task.marks),view:ReviewApp.viewer.getView(),epoch:ReviewApp.viewer.epoch,networkBytes:ReviewApp.viewer.source.networkBytes}));
const unchanged=async(page,before)=>{const after=await stable(page);assert.equal(after.taskId,before.taskId);assert.deepEqual(after.marks,before.marks);for(const key of ['centerNm','plane','spanNm','surfaceCamera'])assert.deepEqual(after.view[key],before.view[key],key+' preserved by scope/filter controls');assert.equal(after.epoch,before.epoch,'scope/filter controls do not reload the task');assert.equal(after.networkBytes,before.networkBytes,'scope/filter controls do not refetch image bytes');};
const clickSample=async(page,u,v)=>{await page.locator('#emCanvas').scrollIntoViewIfNeeded();const point=await page.evaluate(({u,v})=>{const viewer=ReviewApp.viewer,b=viewer.canvas.getBoundingClientRect(),r=viewer.drawRect;return{x:b.x+r.x+r.w*u,y:b.y+r.y+r.h*v};},{u,v});await page.mouse.click(point.x,point.y);};
const reveal=async locator=>locator.evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
const record=async(page,note)=>{await page.locator('#reviewNote').fill(note);await page.locator('#reviewOutcome').selectOption('uncertain');await save(page);};
const assertCounter=async(page,ids)=>{const id=await current(page),index=ids.indexOf(id);if(index>=0)assert.match(await page.locator('#taskMeta').innerText(),new RegExp(`${index+1}\\s*/\\s*${ids.length}(?!\\d)`));};
const exportJson=async(page,path)=>{await page.locator('#exportBtn').click();await page.locator('#exportScope').selectOption('current');await page.locator('#annotationJson').check();const download=page.waitForEvent('download',{timeout:180000});await page.locator('#downloadExport').click();await(await download).saveAs(path);await page.locator('#closeExchange').click();return JSON.parse(await readFile(path,'utf8'));};
const importJson=async(page,pkg)=>{await page.locator('#importFile').setInputFiles({name:'scope-navigation-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pkg))});await page.locator('#applyImport').waitFor();assert.ok(await page.locator('#importScopeNotice').isVisible());for(const select of await page.locator('[data-import-policy]').all())await select.selectOption('replace');assert.equal(await page.locator('#applyImport').isDisabled(),true);await page.locator('#importScopeAcknowledge').check();await page.locator('#applyImport').click();await page.locator('#exchangeDialog').waitFor({state:'hidden'});await ready(page);};

let page=await fresh();
try{
  await page.goto(origin);await ready(page);
  assert.equal(await page.locator('#reviewPool').inputValue(),PRIMARY);assert.equal(await page.locator('#reviewMaterials').isChecked(),false);assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  await checkQueue(page,{});assert.equal((await queue(page)).length,27);assert.equal(await page.evaluate(()=>ReviewApp.focused.progress().questions.total),45);
  const headline=await page.locator('#reviewWorkload').innerText(),summary=await page.locator('#focusedProgress').innerText();
  assert.doesNotMatch(headline,/50\s+(?:задач|tasks)/);assert.match(headline,/38/);assert.match(headline,/7/);assert.match(await page.locator('#reviewArchiveCount').innerText(),/50/);assert.match(summary,/45/);
  await assertCounter(page,expected());
  pass('Russian startup has 27 applicable soma/stem choices; dynamic workload distinguishes 38 priority dependencies, seven qualifications and the 50-record archive',{stems:27,branches:18,applicable:45,archive:50,headline,summary});

  await go(page,'MC264649.origin3362_to_soma');await page.locator('#nextTask').click();await page.waitForFunction(()=>ReviewApp.current.id==='MC264649.origin3944_to_soma');await ready(page);assert.equal(await current(page),'MC264649.origin3944_to_soma');
  await page.locator('#prevTask').click();await page.waitForFunction(()=>ReviewApp.current.id==='MC264649.origin3362_to_soma');await ready(page);
  await page.locator('#nextUnresolved').click();await page.waitForFunction(()=>ReviewApp.current.id==='MC264649.origin3944_to_soma');await ready(page);
  await page.locator('#prevUnresolved').click();await page.waitForFunction(()=>ReviewApp.current.id==='MC264649.origin3362_to_soma');await ready(page);
  pass('Exact reported next-task reproduction skips excluded origin 3639 in both ordinary and unresolved directions');

  await page.locator('#cellFilter').selectOption('MC264649');await checkQueue(page,{cell:'MC264649'});
  const cellIds=expected({cell:'MC264649'});await go(page,cellIds[0]);assert.equal(await page.locator('#prevTask').isDisabled(),true);
  const forward=[await current(page)];for(const id of cellIds.slice(1)){await page.locator('#nextTask').click();await page.waitForFunction(id=>ReviewApp.current.id===id,id);await ready(page);forward.push(await current(page));await assertCounter(page,cellIds);}
  assert.equal(await page.locator('#nextTask').isDisabled(),true);const backward=[await current(page)];for(const id of cellIds.slice(0,-1).reverse()){await page.locator('#prevTask').click();await page.waitForFunction(id=>ReviewApp.current.id===id,id);await ready(page);backward.push(await current(page));}
  assert.equal(await page.locator('#prevTask').isDisabled(),true);assert.deepEqual(forward,cellIds);assert.deepEqual(backward,[...cellIds].reverse());
  pass('Ordinary previous/next traverses the complete filtered cell queue in both directions with correct endpoint disabled states and denominators',{forward,backward});

  await page.locator('#cellFilter').selectOption('');await tab(page,'branches');await checkQueue(page,{view:'branches'});assert.equal((await queue(page)).length,18);
  const defaultBranchIds=await queue(page);for(const q of primary.questions.filter(q=>q.priority==='qualification'))assert.ok(defaultBranchIds.includes(q.id),q.id+' qualification stays applicable');
  await page.locator('#reviewMaterials').check();await checkQueue(page,{view:'branches',optional:true});assert.equal((await queue(page)).length,20);
  const deferredOption=(await options(page)).find(x=>x.id==='MC264824.cut2638');assert.match(deferredOption.text,/отлож|defer/i);
  await tab(page,'stems');await checkQueue(page,{optional:true});assert.equal((await queue(page)).length,30);assert.match((await options(page)).find(x=>x.id==='MC264649.origin3639_to_soma').text,/исключ|excluded/i);
  await tab(page,'all');await checkQueue(page,{view:'all'});assert.equal((await queue(page)).length,50);
  pass('Optional context exposes labeled excluded/deferred records while all seven real qualifications stay in the applicable branch queue',{defaultBranches:18,optionalBranches:20,optionalStems:30,allArchive:50});

  const excluded='MC264649.origin3639_to_soma';await open(page,excluded);await page.locator('#nextSlice').click();await ready(page);await page.locator('[data-tool="trace"]').click();await clickSample(page,.34,.46);await clickSample(page,.46,.49);await record(page,'Synthetic excluded-context trace kept as original evidence.');
  const excludedBefore=await task(page),draft=excludedBefore.marks.at(-1);assert.equal(draft.draft,true);
  await page.locator('#reviewMaterials').uncheck();await save(page);await page.reload();await ready(page);
  assert.equal(await current(page),excluded);assert.equal(await page.locator('#reviewMaterials').isChecked(),false);assert.equal(await page.locator('#optionalContextNotice').isVisible(),true);assert.equal(await page.locator('#returnApplicable').isVisible(),true);
  const resumed=await task(page);assert.deepEqual(resumed.marks,excludedBefore.marks);assert.deepEqual(resumed.view.centerNm,excludedBefore.view.centerNm);assert.equal(resumed.review.decisions.find(d=>d.questionId===excluded).note,'Synthetic excluded-context trace kept as original evidence.');
  assert.ok(!(await queue(page)).includes(excluded));assert.match(await page.locator('#taskQuestion').innerText(),/контекст|необяз|исключ|optional|excluded|context/i);
  assert.doesNotMatch(await page.locator('#taskQuestion').innerText(),/^(?:Проследите|Прослеживайте|Trace)\b/);
  await page.locator('#returnApplicable').click();await page.waitForFunction(id=>ReviewApp.current.id!==id,excluded);await ready(page);assert.ok(baseApplicable(await current(page)));assert.ok((await queue(page)).includes(await current(page)));
  assert.deepEqual(await page.evaluate(id=>ReviewApp.states.find(t=>t.id===id).marks,excluded),excludedBefore.marks);
  pass('An excluded saved draft resumes with explicit optional-context guidance and a return-to-applicable control without losing original slice, marks or note',{excludedId:excluded,markId:draft.id});

  await page.locator('#cellFilter').selectOption('');await tab(page,'branches');await page.locator('#reviewMaterials').check();await go(page,'MC264824.cut2638');await page.locator('#reviewMaterials').uncheck();
  assert.ok(!(await queue(page)).includes('MC264824.cut2638'));assert.match(await page.locator('#taskQuestion').innerText(),/отлож|контекст|defer|context/i);
  await reveal(page.locator('#scopeRelevanceReason'));await page.locator('#scopeRelevanceReason').fill('Synthetic retained-path observation restores this unresolved boundary question.');const beforeRelevance=await stable(page);await page.locator('#scopeRelevanceToggle').click();
  await checkQueue(page,{view:'branches',restored:['MC264824.cut2638']});assert.equal(await page.evaluate(()=>ReviewApp.focused.progress().questions.total),46);await assertCounter(page,expected({view:'branches',restored:['MC264824.cut2638']}));await unchanged(page,beforeRelevance);
  const relevance=(await task(page)).review.scopeRelevance.find(r=>r.questionId==='MC264824.cut2638');assert.equal(relevance.relevant,true);assert.equal(relevance.scopeBinding.poolId,PRIMARY);assert.match(await page.locator('#focusedProgress').innerText(),/46/);
  await pool(page,BROAD);await checkQueue(page,{view:'branches'});assert.equal(await page.evaluate(()=>ReviewApp.focused.progress().questions.total),45);assert.equal(await page.locator('#optionalContextNotice').isVisible(),true);
  await pool(page,PRIMARY);await checkQueue(page,{view:'branches',restored:['MC264824.cut2638']});assert.equal(await page.evaluate(()=>ReviewApp.focused.progress().questions.total),46);await unchanged(page,beforeRelevance);
  pass('Reasoned expert relevance dynamically restores a deferred question only in its bound pool and updates ordinary navigation, counters and focused navigation without moving the viewer',{restored:'MC264824.cut2638',primaryApplicable:46,broaderApplicable:45});

  await tab(page,'stems');await go(page,'MC298937.soma_identity');await page.locator('#nextSlice').click();await ready(page);await page.locator('[data-tool="trace"]').click();await clickSample(page,.32,.55);await clickSample(page,.43,.59);const beforeControls=await stable(page);assert.equal(beforeControls.marks.at(-1).draft,true);assert.equal(beforeControls.marks.at(-1).pointsNm.length,2);
  await page.locator('#cellFilter').selectOption('MC264824');await checkQueue(page,{cell:'MC264824'});await unchanged(page,beforeControls);
  await page.locator('#reviewMaterials').check();await checkQueue(page,{cell:'MC264824',optional:true});await unchanged(page,beforeControls);
  await pool(page,BROAD);await checkQueue(page,{cell:'MC264824',optional:true});await unchanged(page,beforeControls);assert.match(await page.locator('#reviewScopeSummary').innerText(),/641/);
  await pool(page,PRIMARY);await page.locator('#reviewMaterials').uncheck();await page.locator('#cellFilter').selectOption('');await checkQueue(page,{});await unchanged(page,beforeControls);
  await clickSample(page,.56,.62);const continued=(await task(page)).marks;assert.equal(continued.length,beforeControls.marks.length,'third point extends the same active draft');assert.equal(continued.at(-1).id,beforeControls.marks.at(-1).id);assert.equal(continued.at(-1).pointsNm.length,3);assert.deepEqual(continued.at(-1).pointsNm.slice(0,2),beforeControls.marks.at(-1).pointsNm);assert.equal(await page.locator('[data-tool="trace"]').getAttribute('aria-pressed'),'true');
  await page.locator('#fitButton').click();await ready(page);assert.deepEqual((await task(page)).view.centerNm,beforeControls.view.centerNm);assert.ok(await page.locator('#zoomSelect option[value="0.3333333333333333"]').count());assert.equal(await page.locator('#surfaceBounds').count(),0);
  pass('Cell, pool and optional-context controls preserve the active section, camera and image cache; a third click continues the same trace draft after all toggles; Fit and wider zoom remain available',{continuedDraftId:continued.at(-1).id,points:3});

  await tab(page,'contacts');assert.equal(await page.locator('#taskSelect').isDisabled(),true);assert.equal(await page.locator('#prevTask').isDisabled(),true);assert.equal(await page.locator('#nextTask').isDisabled(),true);assert.doesNotMatch(await page.locator('#taskMeta').innerText(),/\d+\s*\/\s*50/);assert.match(await page.locator('#focusedNavigation').innerText(),/поиск|найти|search|find/i);
  const broaderOnly=broader.contacts.find(c=>!primary.contacts.some(p=>p.id===c.id&&p.recipientId===c.recipientId));assert.ok(broaderOnly);
  await pool(page,BROAD);await page.evaluate(c=>ReviewApp.focused.openContact(c.recipientId,c.id),broaderOnly);await ready(page);await record(page,'Synthetic broader-only inspection; it must stay optional in the primary scope.');
  const broadRecord=(await task(page)).review.contacts.find(c=>c.contactId===broaderOnly.id);assert.equal(broadRecord.scopeBinding.poolId,BROAD);const broadPackage=await exportJson(page,'.local/scope-navigation-broader.json');
  await pool(page,PRIMARY);await tab(page,'contacts');assert.equal(await page.locator(`#focusedNavigation [data-review-contact="${broaderOnly.id}"]`).count(),0);
  await page.context().close();page=await fresh();await page.goto(origin);await ready(page);await importJson(page,broadPackage);await tab(page,'contacts');
  assert.equal(await page.locator('#reviewPool').inputValue(),PRIMARY);assert.equal(await page.locator(`#focusedNavigation [data-review-contact="${broaderOnly.id}"]`).count(),0);
  const imported=await page.evaluate(id=>ReviewApp.states.flatMap(t=>t.review?.contacts??[]).find(c=>c.contactId===id),broaderOnly.id);assert.deepEqual(imported,broadRecord);
  await page.reload();await ready(page);assert.equal(await page.locator(`#focusedNavigation [data-review-contact="${broaderOnly.id}"]`).count(),0);
  await page.locator('#reviewMaterials').check();assert.match(await page.locator('#focusedNavigation').innerText(),new RegExp(broaderOnly.id));assert.match(await page.locator('#focusedNavigation').innerText(),/вне выбранной группы|другая область|прежн|outside selected pool|prior|other scope/i);
  await page.locator('#reviewMaterials').uncheck();await page.locator('#focusedContactSearch').fill(broaderOnly.id);await page.locator('#focusedContactFind').click();const searchResult=page.locator(`[data-review-contact="${broaderOnly.id}"]`).first();await searchResult.waitFor();assert.match(await page.locator('#focusedNavigation').innerText(),/вне выбранной группы|outside selected pool/i);await searchResult.click();await ready(page);assert.equal(await page.locator('#reviewOutcome').inputValue(),'unreviewed');
  pass('Contact mode disables ordinary task traversal; a broader-only saved inspection survives explicit import and reload but stays out of the primary queue until optional context or exact-ID search',{contactId:broaderOnly.id,sourceRootId:broaderOnly.sourceRootId});

  const retained=primary.contacts.find(c=>c.recipientId===broaderOnly.recipientId),excludedContact=primary.recipients.find(r=>r.id===broaderOnly.recipientId).excludedContactIds[0];assert.ok(retained&&excludedContact);
  for(const [id,pattern,label]of[[retained.id,/в выбранной группе|in selected pool/i,'retained'],[excludedContact,/сохранённое исключение|preserved exclusion/i,'preserved exclusion'],[broaderOnly.id,/вне выбранной группы|outside selected pool/i,'outside selected pool']]){await page.locator('#contactQuery').fill(id);await page.locator('#findContact').click();await page.waitForFunction(id=>document.querySelector('#contactResults').textContent.includes(id),id);const selectedRow=page.locator('#contactResults .contact-row').filter({has:page.locator('code',{hasText:id})}).first();assert.match(await selectedRow.innerText(),pattern,label+' has active-pool membership label');}
  pass('Legacy raw-contact lookup labels selected-pool membership, preserved exclusions and outside-pool records consistently');

  await page.locator('#language').selectOption('en');assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.match(await page.locator('#contactResults').innerText(),/outside selected pool/i);assert.match(await page.locator('#focusedNavigation').innerText(),/outside selected pool/i);
  await tab(page,'stems');await checkQueue(page,{});const enHeadline=await page.locator('#reviewWorkload').innerText();assert.match(enHeadline,/38/);assert.match(enHeadline,/7/);assert.doesNotMatch(enHeadline,/50 tasks/);await page.locator('#reviewMaterials').check();await go(page,excluded);assert.match(await page.locator('#taskQuestion').innerText(),/excluded|optional|context/i);assert.doesNotMatch(await page.locator('#taskQuestion').innerText(),/^Trace\b/);await page.locator('#reviewMaterials').uncheck();assert.match(await page.locator('#optionalContextNotice').innerText(),/optional|outside|context/i);
  assert.doesNotMatch(await body(page),/[\u2190-\u21ff]|positive cell|negative cell|p-value|functional effect|reversal/i);
  pass('English labels, scope-aware navigation and optional guidance agree with Russian without introducing functional-result cues',{englishHeadline:enHeadline});
  assert.deepEqual(errors,[],'No page exceptions');
}catch(error){checks.push({name:'Failure',passed:false,message:error.stack});console.error(error);process.exitCode=1;}
finally{await writeFile(witness,JSON.stringify({origin,timestamp:new Date().toISOString(),scopeHash:frozen.scopeHash,workflowHash:workflow.workflowHash,checks,pageErrors:errors},null,2)+'\n');for(const context of contexts)await context.close().catch(()=>{});await browser.close();console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors:errors.length,witness}));}
