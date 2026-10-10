/** Focused anatomy workflow acceptance. Synthetic reviewer actions, isolated storage.
 * No screenshots and no scientific verdicts are written into delivered source data.
 */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {readZip} from '../core/zip.js';

const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const witness=process.env.REVIEW_WITNESS||'docs/focused-browser-witness.json';
await mkdir('.local',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[],contexts=[];
const pass=(name,details={})=>{checks.push({name,passed:true,...details});console.log('PASS '+name);};
const fresh=async()=>{const context=await browser.newContext({viewport:{width:1680,height:1200},acceptDownloads:true});contexts.push(context);const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));return p;};
const ready=async p=>{await p.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.loadingKey===null,null,{timeout:120000});await p.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);};
const save=async p=>{await p.keyboard.press('Control+s');await p.waitForFunction(()=>/Сохранено|Saved/.test(document.querySelector('#saveStatus').textContent));};
const state=p=>p.evaluate(()=>structuredClone(ReviewApp.task));
const states=p=>p.evaluate(()=>structuredClone(ReviewApp.states));
const originalFields=['marks','selections','segments','decision'];
const sameWork=(actual,expected)=>{for(const key of [...originalFields,'review'])assert.deepEqual(actual[key],expected[key],expected.id+': '+key);assert.deepEqual(actual.view.centerNm,expected.view.centerNm);assert.equal(actual.view.plane,expected.view.plane);assert.equal(actual.view.spanNm,expected.view.spanNm);if(expected.view.surfaceCamera)assert.deepEqual(actual.view.surfaceCamera,expected.view.surfaceCamera);};
const clickSample=async(p,u,v)=>{await p.locator('#emCanvas').scrollIntoViewIfNeeded();const point=await p.evaluate(({u,v})=>{const viewer=ReviewApp.viewer,b=viewer.canvas.getBoundingClientRect(),r=viewer.drawRect;return{x:b.x+r.x+r.w*u,y:b.y+r.y+r.h*v};},{u,v});await p.mouse.click(point.x,point.y);};
const exportFile=async(p,{scope='all',json=false,evidence=false,path,button='#exportBtn'})=>{await p.locator(button).click();await p.locator('#exportScope').selectOption(scope);if(json)await p.locator('#annotationJson').check();if(evidence)await p.locator('#includeEvidence').check();const event=p.waitForEvent('download',{timeout:180000});await p.locator('#downloadExport').click();await(await event).saveAs(path);await p.locator('#closeExchange').click();if(json)return JSON.parse(await readFile(path,'utf8'));const files=await readZip(await readFile(path));return {files,manifest:JSON.parse(new TextDecoder().decode(files.get('manifest.json'))),state:JSON.parse(new TextDecoder().decode(files.get('review.json')))};};
const previewImport=async(p,input)=>{await p.locator('#importFile').setInputFiles(typeof input==='string'?input:{name:'focused-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});await p.locator('#applyImport').waitFor({state:'visible',timeout:30000});};
const applyImport=async(p,{policy='replace',taskIds}={})=>{for(const control of await p.locator('[data-import-policy]').all()){if(!taskIds||taskIds.includes(await control.getAttribute('data-import-policy')))await control.selectOption(policy);}await p.locator('#applyImport').click();await p.locator('#exchangeDialog').waitFor({state:'hidden'});await ready(p);};
const snapshot=async p=>p.evaluate(()=>({taskId:ReviewApp.current.id,task:structuredClone(ReviewApp.task),view:ReviewApp.viewer.getView(),body:document.body.innerText}));
const question=async(p,id)=>{const q=await p.evaluate(id=>ReviewApp.catalog.focusedWorkflow.questions.find(q=>q.id===id),id);assert.ok(q,id);await p.locator(`[data-review-view="${q.view}"]`).click();await p.locator(`[data-review-group="${q.groupId}"]`).click();if(!await p.locator(`[data-review-question="${id}"]`).first().isVisible())await p.locator('#focusedQuestionPanel > details > summary').first().click();await p.locator(`[data-review-question="${id}"]`).first().click();await p.waitForFunction(id=>ReviewApp.current.id===id,id);await ready(p);};
const decision=async(p,{outcome,note,alternative,custom})=>{if(alternative)await p.locator('#reviewAlternative').selectOption(alternative);if(custom)await p.locator('#reviewCustomAlternative').fill(custom);await p.locator('#reviewNote').fill(note);await p.locator('#reviewOutcome').selectOption(outcome);await save(p);};
const questionRecord=(p,id)=>p.evaluate(id=>structuredClone(ReviewApp.states.flatMap(t=>t.review?.decisions??[]).find(d=>d.questionId===id)),id);
const page=await fresh();
try {
  await page.goto(origin);await ready(page);
  const workflow=await page.evaluate(()=>structuredClone(ReviewApp.catalog.focusedWorkflow));
  assert.ok(workflow,'Focused workflow is attached to the source catalog');
  assert.equal(workflow.groups.length,15);assert.equal(workflow.questions.length,50);
  assert.equal(new Set(workflow.questions.map(q=>q.ownerTaskId)).size,50);
  assert.deepEqual(workflow.groups.flatMap(g=>g.questionIds).sort(),workflow.questions.map(q=>q.id).sort());
  assert.equal(workflow.contactConcerns.length,891);assert.equal(workflow.counts.allContacts,27099);
  assert.equal(workflow.auditProtocol.sampleSize,null);assert.equal(workflow.denominators.manualReviewQuota,null);
  assert.equal(workflow.inheritedTargetProofreading.length,4);
  assert.ok(workflow.inheritedTargetProofreading.every(t=>t.dendriteStatus==='extended'&&t.taskSpecificNativeReview==='unreviewed'&&t.incomingAxonQualityInferred===false));
  assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  assert.equal(await page.locator('[data-task]').count(),50);
  assert.ok((await states(page)).every(t=>t.decision.status==='unreviewed'&&!(t.review?.decisions.length)&&!(t.review?.contacts.length)));
  pass('Russian default retains 50 independent questions in 15 navigation groups, inherited curation and an optional 891-contact concern queue',{navigationGroups:15,originalQuestions:50,concernContacts:891,allSearchableContacts:27099,auditSampleSize:null});

  assert.ok(workflow.questions.every(q=>typeof q.rootRelease661==='string'&&/^\d{18}$/.test(q.rootRelease661)&&q.materialization===661&&q.anchorNm.every(Number.isInteger)));
  const blinded=await page.locator('body').innerText();assert.doesNotMatch(blinded,/[\u2190-\u21ff]/);assert.doesNotMatch(blinded,/positive cell|negative cell|p-value|p\s*=\s*0\.|functional effect|функциональн.{0,15}эффект|положительн.{0,10}клет|отрицательн.{0,10}клет|reversal/i);
  assert.equal(await page.locator('#surfaceAxes').count(),0);assert.equal(await page.locator('#surfaceBounds').count(),0);
  pass('Researcher default is blinded and retains exact 18-digit release661 identities and integer coordinates');

  const stemId='MC298937.soma_identity';await question(page,stemId);
  await page.locator('[data-tool="trace"]').click();await clickSample(page,.35,.4);await clickSample(page,.46,.46);await save(page);
  const legacyDraft=structuredClone((await state(page)).marks.at(-1));assert.equal(legacyDraft.draft,true);
  const oldPackage=await exportFile(page,{scope:'current',json:true,path:'.local/focused-legacy-fixture.json'});
  for(const task of Object.values(oldPackage.state.tasks))delete task.review;
  delete oldPackage.workflowHash;oldPackage.state.tasks[stemId].legacyExtra={exact:'Preserved unknown v2 field β'};
  oldPackage.state.tasks[stemId].decision.note='Legacy note retained verbatim α';
  await previewImport(page,oldPackage);await applyImport(page);await page.reload();await ready(page);
  assert.deepEqual((await state(page)).marks.find(m=>m.id===legacyDraft.id),legacyDraft);
  assert.equal((await state(page)).legacyExtra.exact,'Preserved unknown v2 field β');assert.equal((await state(page)).decision.note,'Legacy note retained verbatim α');assert.equal((await state(page)).decision.status,'unreviewed');
  pass('Existing v2 drafts, exact notes, legacy decision and unknown fields survive additive workflow migration');

  await page.locator('[data-tool="point"]').click();await clickSample(page,.6,.5);assert.equal(await page.locator('#editorDialog').isVisible(),false);
  const markId=(await state(page)).marks.at(-1).id;await page.locator('#activeMarkNote').fill('Synthetic evidence note: β / α');
  await decision(page,{outcome:'supported',note:'Synthetic stem check only. Заметка сохраняется дословно β.'});
  const stem=await questionRecord(page,stemId);assert.equal(stem.outcome,'supported');assert.equal(stem.ownerTaskId,stemId);assert.deepEqual(stem.taskIds,[stemId]);
  assert.equal(stem.sourceBinding.catalogHash,workflow.catalogHash);assert.equal(stem.sourceBinding.sourceHash,workflow.sourceHash);assert.equal(stem.sourceBinding.workflowHash,workflow.workflowHash);assert.equal(stem.sourceBinding.coordinateConvention,'integer-sample');
  assert.equal((await state(page)).decision.status,'unreviewed');assert.equal((await states(page)).flatMap(t=>t.review?.contacts??[]).length,0);
  const stemCurrent=await exportFile(page,{scope:'current',json:true,path:'.local/focused-stem-current.json'});assert.equal(stemCurrent.state.tasks[stemId].review.decisions[0].outcome,'supported');
  pass('Soma/stem decision with source-bound marks and verbatim notes exports without certifying contacts or rewriting legacy status');
  await page.locator('#selectReviewExport').check();
  const selected=await exportFile(page,{scope:'selected',json:true,path:'.local/focused-selected.json',button:'#exportReviewSelection'});
  assert.equal(selected.partial,true);assert.equal(selected.state.tasks[stemId].review.decisions[0].questionId,stemId);assert.ok(selected.state.tasks[stemId].marks.some(m=>m.id===markId));
  const evidenceZip=await exportFile(page,{scope:'selected',evidence:true,path:'.local/focused-selected-evidence.zip',button:'#exportReviewSelection'});
  const reviewEvidence=evidenceZip.manifest.evidence.find(e=>e.reviewId===stem.id&&e.path.endsWith('figure-metadata.json'));assert.ok(reviewEvidence,'Selected review item has its own evidence panel');
  const metadata=JSON.parse(new TextDecoder().decode(evidenceZip.files.get(reviewEvidence.path))),prefix=reviewEvidence.path.replace('figure-metadata.json','');
  assert.deepEqual(metadata.view.centerNm,stem.view.centerNm);assert.equal(metadata.plane.plane,stem.view.plane);assert.equal(metadata.plane.coordinateConvention,'integer-sampling-no-half-voxel');assert.equal(metadata.raw.resampled,false);assert.ok(metadata.chunks.length);assert.ok(metadata.sourceBinding);
  const png=Buffer.from(evidenceZip.files.get(prefix+'annotated-physical.png')),dimensions=[png.readUInt32BE(16),png.readUInt32BE(20)];assert.deepEqual(dimensions,metadata.annotated.dimensions);assert.equal(dimensions[0]/dimensions[1],metadata.plane.physicalSizeNm[0]/metadata.plane.physicalSizeNm[1]);assert.ok(metadata.scaleBar.nm>0);
  const svg=new TextDecoder().decode(evidenceZip.files.get(prefix+'overlay.svg'));assert.ok(svg.includes(markId));assert.match(svg,/Synthetic evidence note/);assert.match(metadata.interpretation,/автоматически|automatically/);
  pass('Selected review figures preserve physical aspect, scale, exact plane/location, linked marks and native source receipts');
  const selectedFresh=await fresh();await selectedFresh.goto(origin);await ready(selectedFresh);await previewImport(selectedFresh,'.local/focused-selected.json');await applyImport(selectedFresh);
  const selectedRestored=await state(selectedFresh);assert.equal(selectedRestored.review.decisions[0].note,stem.note);assert.ok(selectedRestored.marks.some(m=>m.id===markId));assert.equal(selectedRestored.review.contacts.length,0);
  pass('Selected question export carries its linked evidence and restores independently without inventing contact review');

  await page.locator('#nextSlice').click();await ready(page);await page.locator('#zoomIn').click();await ready(page);const beforeFit=await state(page);
  await page.locator('#fitButton').click();await ready(page);assert.deepEqual((await state(page)).view.centerNm,beforeFit.view.centerNm);assert.equal((await state(page)).view.plane,beforeFit.view.plane);
  await page.locator('[data-tool="trace"]').click();await clickSample(page,.25,.6);await clickSample(page,.4,.55);await clickSample(page,.4,.73);await page.locator('#closeTrace').click();
  assert.equal((await state(page)).marks.at(-1).closed,true);assert.equal(await page.locator('#editorDialog').isVisible(),false);await save(page);
  pass('Current-section Fit and explicitly closed traces remain functional with no automatic note dialog');const savedStemPosition=structuredClone((await state(page)).view);

  const routeId='MC264824.origin2601_to_soma',branchId='MC264824.relation_2601_2710';await question(page,routeId);
  await decision(page,{outcome:'supported',note:'Synthetic shared route decision: only the exact route.'});
  const routeBefore=await questionRecord(page,routeId),dependants=workflow.questions.filter(q=>q.dependencyQuestionIds.includes(routeId));assert.ok(dependants.length>=3);
  await question(page,branchId);assert.ok((await page.locator('body').innerText()).includes(routeId));
  await decision(page,{outcome:'uncertain',alternative:'reviewer_alternative',custom:'Possible third continuation; not established.',note:'Synthetic unresolved parentage β.'});
  const branch=await questionRecord(page,branchId);assert.equal(branch.outcome,'uncertain');assert.equal(branch.alternative,'reviewer_alternative');assert.equal(branch.customAlternative,'Possible third continuation; not established.');
  assert.deepEqual(await questionRecord(page,routeId),routeBefore);assert.equal((await states(page)).flatMap(t=>t.review?.decisions??[]).filter(d=>d.questionId===routeId).length,1);
  assert.ok(dependants.filter(q=>q.id!==branchId).every(q=>!(workflow.questions.find(x=>x.id===q.id).inheritedDecision)));assert.equal((await states(page)).flatMap(t=>t.review?.contacts??[]).length,0);
  let progress=await page.evaluate(()=>ReviewApp.focused.progress());assert.ok(progress.questions.uncertain>=1&&progress.questions.unresolved>=47);
  pass('Shared route is stored once and linked to three independent branch questions; uncertain alternative remains unresolved and contacts remain unreviewed',{routeId,dependentQuestionIds:dependants.map(q=>q.id)});

  const missingId='MC264824.cut869';await question(page,missingId);
  await decision(page,{outcome:'insufficient_coverage',note:'Synthetic coverage limitation; endpoint is still unknown.'});
  await page.locator('#reviewCoverage > summary').click();await page.locator('#coverageIssueNote').fill('Need native sections spanning the uncertain attachment; synthetic request.');await page.locator('#addCoverageIssue').click();await save(page);
  const missing=await state(page);assert.equal(missing.review.decisions.find(d=>d.questionId===missingId).outcome,'insufficient_coverage');assert.equal(missing.review.issues.at(-1).kind,'coverage_request');assert.equal(missing.review.issues.at(-1).status,'open');assert.match(missing.review.issues.at(-1).note,/Need native sections/);
  const beforeNext=await page.evaluate(()=>ReviewApp.current.id);await page.locator('#nextUnresolved').click();await page.waitForFunction(id=>ReviewApp.current.id!==id,beforeNext);await ready(page);await save(page);
  const resumed=await snapshot(page);await page.reload();await ready(page);assert.equal(await page.evaluate(()=>ReviewApp.current.id),resumed.taskId);assert.deepEqual((await state(page)).view.centerNm,resumed.view.centerNm);assert.deepEqual((await state(page)).review.lastContext,resumed.task.review.lastContext);
  progress=await page.evaluate(()=>ReviewApp.focused.progress());assert.ok(progress.questions.insufficientCoverage>=1&&progress.questions.unresolved>=47);
  pass('Missing coverage saves an unresolved decision and reusable request; next unresolved and reload resume permit continuing other work');

  await page.locator('[data-review-view="contacts"]').click();await page.locator('#focusedContactSearch').fill('171510858');await page.locator('#focusedContactFind').click();await page.locator('[data-review-contact="171510858"]').first().click();await page.waitForFunction(()=>ReviewApp.focused.context.contactId==='171510858');await ready(page);
  assert.equal(await page.evaluate(()=>ReviewApp.current.id),stemId);
  const contact=workflow.contactConcerns.find(c=>c.recipientId==='MC298937'&&c.id==='171510858');assert.ok(contact);
  const contactText=await page.locator('body').innerText();assert.match(contactText,/864691135561790148/);assert.match(contactText,/864691135195576362/);
  await page.locator('#focusedQuestionPanel > details > summary').first().click();const footprint=await page.evaluate(async id=>{const data=await(await fetch('data/contacts/MC298937.json')).json();return data.footprints.find(f=>f.sourceRootId===id);},contact.sourceRootId);
  assert.ok(footprint?.contactIds.length);assert.deepEqual((await page.locator('[data-footprint-contact]').evaluateAll(nodes=>nodes.map(n=>n.dataset.footprintContact))).sort(),[...footprint.contactIds].sort());
  for(const position of ['pre','post','center']){await page.locator(`[data-contact-position="${position}"]`).first().click();await ready(page);assert.deepEqual((await state(page)).view.centerNm,contact[position+'Nm']);}
  await page.locator('[data-tool="point"]').click();await clickSample(page,.57,.49);const contactAMark=(await state(page)).marks.at(-1).id;await decision(page,{outcome:'uncertain',note:'Synthetic selected-contact check; source quality remains pending.'});
  const contactRecord=(await state(page)).review.contacts.find(c=>c.contactId===contact.id);assert.ok(contactRecord);assert.equal(contactRecord.sourceRootId,'864691135561790148');assert.equal(contactRecord.targetRootId,'864691135195576362');assert.equal(contactRecord.outcome,'uncertain');assert.deepEqual(contactRecord.markIds,[contactAMark]);assert.ok(!contactRecord.markIds.includes(markId));
  for(const field of ['preNm','postNm','centerNm','sourceLine','footprintLine'])assert.deepEqual(contactRecord.contact[field],contact[field]);
  assert.equal((await states(page)).flatMap(t=>t.review?.contacts??[]).length,1);assert.equal(workflow.sourceQuality.status,'pending-native-quality-audit');
  pass('Explicit contact check retains exact pre/post/center coordinates, 18-digit roots and row pointers; shared decisions certify no other contact',{contactId:contact.id,sourceRootId:contact.sourceRootId,sourceLine:contact.sourceLine,footprintLine:contact.footprintLine});

  await page.locator('#focusedContactSearch').fill('194477431');await page.locator('#focusedContactFind').click();await page.locator('[data-review-contact="194477431"]').first().click();await page.waitForFunction(()=>ReviewApp.focused.context.contactId==='194477431');await ready(page);
  assert.equal(await page.locator('#reviewOutcome').inputValue(),'unreviewed');assert.equal(await page.locator('[data-footprint-contact]').count(),7);assert.equal((await states(page)).flatMap(t=>t.review?.contacts??[]).length,1);
  await decision(page,{outcome:'uncertain',note:'Synthetic second-contact review with no borrowed marks.'});const contactB=(await state(page)).review.contacts.find(c=>c.contactId==='194477431');assert.deepEqual(contactB.markIds,[]);assert.equal((await state(page)).review.contacts.find(c=>c.contactId===contact.id).markIds[0],contactAMark);
  await page.locator('#focusedContactSearch').fill(contact.id);await page.locator('#focusedContactFind').click();await page.locator(`[data-review-contact="${contact.id}"]`).first().click();await page.waitForFunction(id=>ReviewApp.focused.context.contactId===id,contact.id);await ready(page);
  assert.equal(await page.locator('#reviewOutcome').inputValue(),'uncertain');
  pass('An exact contact outside the concern queue remains searchable with its complete seven-contact source footprint and begins unreviewed');
  assert.deepEqual((await state(page)).view.centerNm,contactRecord.view.centerNm);
  await question(page,stemId);assert.deepEqual((await state(page)).view.centerNm,savedStemPosition.centerNm);assert.equal((await state(page)).view.spanNm,savedStemPosition.spanNm);
  await page.locator('[data-review-view="contacts"]').click();await page.locator('#focusedContactSearch').fill(contact.id);await page.locator('#focusedContactFind').click();await page.locator(`[data-review-contact="${contact.id}"]`).first().click();await page.waitForFunction(id=>ReviewApp.focused.context.contactId===id,contact.id);await ready(page);
  assert.deepEqual((await state(page)).view.centerNm,contactRecord.view.centerNm);assert.deepEqual((await state(page)).review.contacts.find(c=>c.contactId===contact.id).markIds,[contactAMark]);
  pass('Question and per-contact positions survive context switches; marks from contact A are not attached to contact B');

  await page.locator('#language').selectOption('en');assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('#saveBtn').innerText(),'Save');assert.equal(await page.locator('#reviewNote').inputValue(),contactRecord.note);
  assert.doesNotMatch(await page.locator('body').innerText(),/[\u2190-\u21ff]|positive cell|negative cell|p-value|p\s*=\s*0\.|reversal/i);await save(page);
  const allJson=await exportFile(page,{scope:'all',json:true,path:'.local/focused-all.json'});
  const allZip=await exportFile(page,{scope:'all',path:'.local/focused-all.zip'});assert.equal(Object.keys(allZip.state.tasks).length,50);assert.equal(allZip.manifest.language,'en');assert.equal(allZip.manifest.anatomicalCertification,false);assert.equal(allZip.manifest.workflowHash,workflow.workflowHash);
  const expected=structuredClone(allJson.state.tasks);for(const id of Object.keys(expected))sameWork(allZip.state.tasks[id],expected[id]);
  pass('Russian and English preserve original notes; all-work ZIP and JSON carry all 50 original tasks, focused decisions and exact evidence bindings');

  for(const file of ['.local/focused-all.json','.local/focused-all.zip']){const clean=await fresh();await clean.goto(origin);await ready(clean);await previewImport(clean,file);await applyImport(clean);assert.deepEqual(await clean.evaluate(()=>ReviewApp.focused.context),expected[stemId].review.lastContext,'Import immediately restores the saved focused view and selected contact');await clean.reload();await ready(clean);const restored=await states(clean);for(const row of restored)if(expected[row.id])sameWork(row,expected[row.id]);assert.equal(restored.flatMap(t=>t.review?.contacts??[]).length,2);assert.equal(restored.flatMap(t=>t.review?.issues??[]).length,1);assert.deepEqual(await clean.evaluate(()=>ReviewApp.focused.context),expected[stemId].review.lastContext);assert.equal(await clean.locator('#reviewNote').inputValue(),contactRecord.note);}
  pass('Fresh profiles restore stem, branch, contact and coverage work from both JSON and ZIP, including drafts and exact camera/coordinate state');

  const conflicting=structuredClone(allJson);conflicting.state.tasks[stemId].review.decisions.find(d=>d.questionId===stemId).outcome='contradicted';conflicting.state.tasks[stemId].review.decisions.find(d=>d.questionId===stemId).note='Synthetic incoming conflict';
  await previewImport(page,conflicting);assert.equal(await page.locator(`[data-import-policy="${stemId}"]`).inputValue(),'keep');assert.match(await page.locator('#exchangeContent').innerText(),/supported|contradicted|подтверж|опроверг/i);await applyImport(page,{policy:'keep'});assert.equal((await questionRecord(page,stemId)).outcome,'supported');
  await previewImport(page,conflicting);await applyImport(page,{policy:'merge'});assert.equal((await questionRecord(page,stemId)).outcome,'supported');
  await previewImport(page,conflicting);await applyImport(page,{policy:'replace'});assert.equal((await questionRecord(page,stemId)).outcome,'contradicted');assert.equal((await states(page)).flatMap(t=>t.review?.contacts??[]).length,2);
  await previewImport(page,allJson);await applyImport(page);
  pass('Conflicting decisions are visible, default to keep-local, survive merge, and change only with explicit replace');

  const reject=async(payload,pattern)=>{await page.locator('#importFile').setInputFiles({name:'invalid-focused.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await page.waitForFunction(pattern=>new RegExp(pattern,'i').test(document.querySelector('#toast').innerText),pattern,{timeout:30000});assert.equal(await page.locator('#exchangeDialog').isVisible(),false);};
  const wrongVersion=structuredClone(allJson);wrongVersion.workflowHash='0'.repeat(64);await reject(wrongVersion,'workflow|version|hash');
  const wrongPosition=structuredClone(allJson);wrongPosition.state.tasks[stemId].review.contacts[0].contact.preNm[0]+=8;await reject(wrongPosition,'source field|binding|differs|coordinate');
  assert.equal((await questionRecord(page,stemId)).outcome,'supported');assert.equal((await state(page)).review.contacts[0].contact.preNm[0],contact.preNm[0]);
  pass('Changed workflow identity and altered original contact coordinates are rejected without mutating local review');
  const raced=await fresh();await raced.goto(origin);await ready(raced);let startedResolve,releaseResolve;const started=new Promise(resolve=>startedResolve=resolve),release=new Promise(resolve=>releaseResolve=resolve);
  await raced.route('**/data/contacts/MC298937.json',async route=>{startedResolve();await release;await route.continue();});
  await raced.locator('[data-review-view="contacts"]').click();await raced.locator('[data-review-contact="171510858"]').first().click();await started;
  await raced.locator('[data-review-view="stems"]').click();await raced.locator('[data-review-question="MC298937.origin3447_to_soma"]').first().click();await raced.waitForFunction(()=>ReviewApp.current.id==='MC298937.origin3447_to_soma');await ready(raced);
  const delayedResponse=raced.waitForResponse(response=>response.url().endsWith('data/contacts/MC298937.json'));releaseResolve();await(await delayedResponse).finished();await raced.waitForTimeout(500);
  assert.equal(await raced.evaluate(()=>ReviewApp.current.id),'MC298937.origin3447_to_soma');assert.equal(await raced.evaluate(()=>ReviewApp.focused.context.questionId),'MC298937.origin3447_to_soma');assert.equal(await raced.evaluate(()=>ReviewApp.focused.context.contactId),undefined);
  pass('A delayed contact source fetch cannot replace a newer explicit question navigation');
  assert.deepEqual(errors,[]);pass('No uncaught browser errors');
  await writeFile(witness,JSON.stringify({testedAt:new Date().toISOString(),origin,browser:'Edge Chromium headless',checks,errors,screenshotsTaken:0,anatomicalReview:false,syntheticTemporaryProfileOnly:true,sourceRecordsModified:false},null,2)+'\n');
} catch(error) {
  console.error(error);await writeFile('.local/focused-browser-failure.json',JSON.stringify({testedAt:new Date().toISOString(),origin,error:error.stack,checks,errors,state:await snapshot(page).catch(()=>null)},null,2)+'\n');process.exitCode=1;
} finally {await browser.close();}
