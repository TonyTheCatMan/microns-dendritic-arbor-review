import test from 'node:test';
import assert from 'node:assert/strict';
import {createTask,validateTask,mergeTask,previewConflicts} from '../core/model.js';
import {ensureReview,setQuestionDecision,setContactDecision,addCoverageIssue,setReviewContext,reviewProgress,findQuestionDecision,saveReviewPosition,reviewPosition} from '../core/focused-review.js';
import {createAnnotationExport,createExport,parseImport,selectExportTasks} from '../core/exchange.js';
import {openStore} from '../core/store.js';
const root='864691135195576362',source='864691135685113603',time='2026-10-10T00:00:00.000Z';
const contact={id:'164163900',sourceRootId:source,preNm:[733048,563752,935240],postNm:[733040,563632,935000],centerNm:[732944,563848,934960],preSupervoxelId:'89941976371580422',postSupervoxelId:'89941976371574486',postLevel2Id:'161999570409095869',domainId:'stem-A',eligibleDomainId:'stem-A',eligibility:'eligible_dendritic_domain',sourceLine:1,footprintLine:3,coveringVolumeIds:['tile1']};
function fixture(){return {catalogHash:'a'.repeat(64),sourceHash:'b'.repeat(64),tasks:[{id:'stem',recipientId:'MC1'},{id:'relation',recipientId:'MC1'},{id:'independent',recipientId:'MC1'}],recipients:[{id:'MC1',rootRelease661:root}],focusedContacts:new Map([['MC1:'+contact.id,structuredClone(contact)]]),focusedWorkflow:{workflowHash:'c'.repeat(64),groups:[{id:'stems',questionIds:['stem']},{id:'branches',questionIds:['relation','independent']}],questions:[{id:'stem',groupId:'stems',ownerTaskId:'stem',taskIds:['stem'],dependencyQuestionIds:[]},{id:'relation',groupId:'branches',ownerTaskId:'relation',taskIds:['relation'],dependencyQuestionIds:['stem'],alternatives:[{value:'same'},{value:'different'}]},{id:'independent',groupId:'branches',ownerTaskId:'independent',taskIds:['independent'],dependencyQuestionIds:['stem']}]}};}
function task(id='stem'){return createTask(id,{centerNm:[752960,646592,858640],plane:'xy',spanNm:4096,surfaceCamera:{zoom:18,center_nm:[100,200,300],originNm:[752000,646000,858000],frame_height_nm:7000,radius_nm:10000,yaw:.3,pitch:.2}});}
function mark(catalog){return {id:'m1',kind:'trace',draft:true,category:'uncertain_continuation',label:'Черновик',note:'Original note remains\nБез перевода',visible:true,pointsNm:[[752960,646592,858640]],plane:'xy',sourceBinding:{catalogHash:catalog.catalogHash,sourceHash:catalog.sourceHash,coordinateConvention:'integer-sample'},createdAt:time,updatedAt:time};}

test('additive review preserves v2 drafts, unknown fields and legacy decisions without interpreting their status',async()=>{
  const catalog=fixture(),old=task();old.marks=[mark(catalog)];old.decision={status:'uncertain',answers:{old:'unresolved'},note:'Older decision'};old.futureTaskField={original:true};
  const original=structuredClone(old);assert.deepEqual(validateTask(old,catalog),original);
  const imported=await parseImport(createAnnotationExport(catalog,[old],{scope:'current'}).blob,catalog);assert.deepEqual(imported.tasks,[original]);
  ensureReview(old,catalog);assert.deepEqual(old.decision,original.decision);assert.deepEqual(old.marks,original.marks);assert.equal(old.review.decisions.length,0);
});

test('one route decision is reused only by dependency, with independent questions and contacts still unreviewed',()=>{
  const catalog=fixture(),a=task(),b=task('relation'),c=task('independent');
  setQuestionDecision(a,catalog,'stem',{outcome:'supported',note:'Observed stem'});
  assert.equal(findQuestionDecision([a,b,c],'stem').note,'Observed stem');assert.equal(b.review,undefined);assert.equal(c.review,undefined);
  const progress=reviewProgress([a,b,c],catalog);assert.equal(progress.questions.total,3);assert.equal(progress.questions.resolved,1);assert.equal(progress.questions.unresolved,2);assert.equal(progress.contacts.total,0);
  assert.equal(a.decision.status,'unreviewed');assert.throws(()=>setQuestionDecision(b,catalog,'stem',{outcome:'supported'}),{code:'REVIEW_OWNER'});
  setQuestionDecision(b,catalog,'relation',{outcome:'uncertain',alternative:'different',note:'Ambiguous junction'});
  assert.equal(reviewProgress([a,b,c],catalog).questions.unresolved,2);assert.equal(reviewProgress([a,b,c],catalog).questions.recorded,2);
});

test('uncertainty and missing coverage remain unresolved with independent saved issue markers',()=>{
  const catalog=fixture(),a=task();setQuestionDecision(a,catalog,'stem',{outcome:'insufficient_coverage',note:'Outside available route'});
  addCoverageIssue(a,catalog,{questionId:'stem',note:'Need missing section range'});setReviewContext(a,catalog,{viewId:'stems',groupId:'stems',questionId:'stem'});
  assert.deepEqual(a.review.lastContext,{viewId:'stems',groupId:'stems',questionId:'stem'});const p=reviewProgress([a],catalog);assert.equal(p.questions.recorded,1);assert.equal(p.questions.resolved,0);assert.equal(p.questions.insufficientCoverage,1);assert.equal(p.issues,1);
  assert.equal(a.review.contacts.length,0);assert.equal(a.decision.status,'unreviewed');
});

test('selected question export includes its route decision once with referenced marks and excludes independent review',async()=>{
  const catalog=fixture(),a=task(),b=task('relation'),c=task('independent');a.marks=[mark(catalog)];
  setQuestionDecision(a,catalog,'stem',{outcome:'supported',markIds:['m1'],note:'Route note'});setQuestionDecision(b,catalog,'relation',{outcome:'contradicted',alternative:'other',customAlternative:'Two separate stems',note:'Иная связь'});setQuestionDecision(c,catalog,'independent',{outcome:'uncertain'});
  for(const mode of ['json','zip']){const options={scope:'selected',selectedIds:['question:relation'],language:'en'},exported=mode==='zip'?await createExport(catalog,[a,b,c],options):createAnnotationExport(catalog,[a,b,c],options),imported=await parseImport(exported.blob,catalog);
    assert.equal(imported.partial,true);assert.deepEqual(imported.tasks.map(t=>t.id),['stem','relation']);assert.deepEqual(imported.tasks[0].marks,a.marks);assert.deepEqual(imported.tasks[0].review.decisions,a.review.decisions);assert.equal(imported.tasks.flatMap(t=>t.review.decisions).filter(d=>d.questionId==='stem').length,1);assert.equal(imported.tasks[1].review.decisions[0].note,'Иная связь');assert.equal(imported.tasks[0].review.decisions[0].view.surfaceCamera.zoom,18);
  }
  const current=await parseImport(createAnnotationExport(catalog,[a,b,c],{scope:'current',taskId:'relation'}).blob,catalog);assert.deepEqual(current.tasks.map(t=>t.id),['stem','relation']);
});

test('review conflicts expose individual decisions and preserve unrelated partial items, legacy fields and future data',()=>{
  const catalog=fixture(),local=task(),incoming=task();setQuestionDecision(local,catalog,'stem',{outcome:'uncertain',note:'Local'});addCoverageIssue(local,catalog,{questionId:'stem',note:'Keep issue'});setQuestionDecision(incoming,catalog,'stem',{outcome:'supported',note:'Incoming'});local.review.future={saved:true};incoming.review.incomingFuture={saved:true};local.futureTaskField='keep';
  const [preview]=previewConflicts([incoming],[local]);assert.equal(preview.defaultResolution,'keep');assert.equal(preview.reviewConflicts.length,1);assert.equal(preview.reviewConflicts[0].localOutcome,'uncertain');assert.equal(preview.reviewConflicts[0].incomingOutcome,'supported');
  assert.deepEqual(mergeTask(local,incoming),local);assert.equal(mergeTask(local,incoming,{policy:'merge',partial:true}).review.decisions[0].note,'Local');
  const replace=mergeTask(local,incoming,{policy:'replace',partial:true});assert.equal(replace.review.decisions[0].note,'Incoming');assert.equal(replace.review.issues.length,1);assert.deepEqual(replace.review.future,{saved:true});assert.deepEqual(replace.review.incomingFuture,{saved:true});assert.equal(replace.futureTaskField,'keep');
  const older=task();assert.deepEqual(mergeTask(local,older,{policy:'replace',partial:true}).review,local.review);assert.deepEqual(mergeTask(local,older,{policy:'replace'}).review,local.review);
  const foreign=structuredClone(incoming);foreign.review.workflowHash='d'.repeat(64);assert.equal(previewConflicts([foreign],[local])[0].workflowMismatch,true);assert.throws(()=>mergeTask(local,foreign,{policy:'merge',partial:true}),{code:'WORKFLOW_MISMATCH'});
});

test('explicit contact review preserves 18-digit identities and original positions without modifying computational assignment',async()=>{
  const catalog=fixture(),a=task();setContactDecision(a,catalog,contact,{outcome:'uncertain',note:'Attachment ambiguous'});assert.equal(a.review.contacts[0].sourceRootId,source);assert.equal(a.review.contacts[0].targetRootId,root);assert.deepEqual(a.review.contacts[0].contact,contact);assert.equal(a.review.decisions.length,0);
  const exported=await createExport(catalog,[a],{scope:'selected',selectedIds:['contact:'+contact.id]});const imported=await parseImport(exported.blob,catalog);assert.deepEqual(imported.tasks[0].review.contacts,a.review.contacts);assert.equal(imported.tasks[0].decision.status,'unreviewed');
  for(const [key,value] of [['preNm',[1,2,3]],['sourceRootId','864691135685113604'],['eligibility','invented']]){const bad=structuredClone(a);bad.review.contacts[0].contact[key]=value;assert.throws(()=>validateTask(bad,catalog),{code:'REVIEW_CONTACT_BINDING'});}
  const numeric=structuredClone(a);numeric.review.contacts[0].sourceRootId=864691135685113603;assert.throws(()=>validateTask(numeric,catalog),{code:'UNSAFE_NUMBER'});
});

test('import lazily obtains only required exact-version contact sources before validation',async()=>{
  const catalog=fixture(),a=task();setContactDecision(a,catalog,contact,{outcome:'supported'});const exported=createAnnotationExport(catalog,[a],{scope:'current'});const other=fixture();other.focusedContacts.clear();const calls=[];other.ensureFocusedContacts=async ids=>{calls.push(ids);other.focusedContacts.set('MC1:'+contact.id,structuredClone(contact));};
  await parseImport(exported.blob,other);assert.deepEqual(calls,[['MC1']]);
  const missing=fixture();missing.focusedContacts.clear();await assert.rejects(parseImport(exported.blob,missing),{code:'CONTACT_SOURCE_REQUIRED'});
});

test('workflow, decision scope, exact source binding and invalid saved views are rejected before import',async()=>{
  const catalog=fixture(),a=task();setQuestionDecision(a,catalog,'stem',{outcome:'supported'});
  const cases=[[(t)=>t.review.workflowHash='d'.repeat(64),'WORKFLOW_MISMATCH'],[(t)=>t.review.decisions[0].taskIds=['relation'],'REVIEW_SCOPE'],[(t)=>t.review.decisions[0].sourceBinding.sourceHash='d'.repeat(64),'SOURCE_MISMATCH'],[(t)=>t.review.decisions[0].view.spanNm=-1,'REVIEW_VIEW'],[(t)=>t.review.decisions[0].view.surfaceCamera.zoom=-1,'REVIEW_VIEW'],[(t)=>t.review.decisions[0].markIds=['missing'],'REVIEW_MARK_REFERENCE']];
  for(const [change,code]of cases){const value=structuredClone(a);change(value);assert.throws(()=>validateTask(value,catalog),{code});}
  const payload=JSON.parse(await createAnnotationExport(catalog,[a],{scope:'current'}).blob.text());payload.workflowHash='d'.repeat(64);await assert.rejects(parseImport(new Blob([JSON.stringify(payload)]),catalog),{code:'WORKFLOW_MISMATCH'});
});

test('focused decisions and resume context survive serialized autosave, reload and lazy source verification',async()=>{
  const catalog=fixture();let metadata;const rows=new Map(),backend={metadata:async()=>metadata,setMetadata:async v=>metadata=structuredClone(v),read:async id=>structuredClone(rows.get(id)),all:async()=>[...rows.values()].map(v=>structuredClone(v)),close(){},write:async t=>{const saved={...structuredClone(t),revision:(rows.get(t.id)?.revision??0)+1,updatedAt:new Date().toISOString()};rows.set(t.id,saved);return saved;}};
  const store=await openStore(catalog,{backend}),a=await store.load('stem');a.marks=[mark(catalog)];setQuestionDecision(a,catalog,'stem',{outcome:'uncertain',markIds:['m1'],note:'Saved note'});setContactDecision(a,catalog,contact,{outcome:'insufficient_coverage'});setReviewContext(a,catalog,{viewId:'contacts',contactId:contact.id});await store.save(a);await store.flush();
  const loaded=await store.load('stem');assert.deepEqual(loaded.review,a.review);assert.deepEqual(loaded.marks,a.marks);assert.equal(loaded.decision.status,'unreviewed');assert.equal(loaded.revision,1);
});

test('replacing from an older v2 package preserves evidence referenced by additive review',()=>{
  const catalog=fixture(),local=task();local.marks=[mark(catalog)];setQuestionDecision(local,catalog,'stem',{outcome:'uncertain',markIds:['m1']});
  const older=task(),result=mergeTask(local,older,{policy:'replace'});assert.deepEqual(result.review,local.review);assert.deepEqual(result.marks,local.marks);assert.doesNotThrow(()=>validateTask(result,catalog));
});

test('the same contact cannot be duplicated under a dependent branch question',()=>{
  const catalog=fixture(),dependent=task('relation');assert.throws(()=>setContactDecision(dependent,catalog,contact,{outcome:'supported'}),{code:'REVIEW_CONTACT_OWNER'});
});

test('dependency owners with no saved review export as explicit untouched tasks without synthetic decisions',async()=>{
  const catalog=fixture(),relation=task('relation');setQuestionDecision(relation,catalog,'relation',{outcome:'uncertain'});
  for(const options of [{scope:'current',taskId:'relation'},{scope:'selected',selectedIds:['question:relation']}]){
    const selected=selectExportTasks(catalog,[relation],options);assert.deepEqual(selected.map(t=>t.id),['stem','relation']);assert.deepEqual(selected[0],createTask('stem'));assert.equal(selected[0].review,undefined);
    const restored=await parseImport(createAnnotationExport(catalog,[relation],options).blob,catalog);assert.deepEqual(restored.tasks,selected);
  }
});

test('selected focused-review figures retain question, contact and issue links while excluding unrelated evidence',async()=>{
  const catalog=fixture(),a=task();setQuestionDecision(a,catalog,'stem',{outcome:'uncertain'});setContactDecision(a,catalog,contact,{outcome:'insufficient_coverage'});const issue=addCoverageIssue(a,catalog,{questionId:'stem',note:'Request this missing region'});
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64'));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"></svg>';
  const evidenceFiles=[{path:'question.png',data:png,taskId:'stem',reviewId:'question:stem',metadata:{plane:'xy',pixelSizeNm:[8,8],sourceHash:catalog.sourceHash}},{path:'contact.svg',data:svg,taskId:'stem',reviewId:'contact:'+contact.id},{path:'issue.png',data:png,taskId:'stem',reviewId:issue.id},{path:'unselected.png',data:png,taskId:'stem',reviewId:'question:absent'},{path:'plain.png',data:png,taskId:'stem'}];
  for(const reviewId of ['question:stem','contact:'+contact.id,issue.id]){
    const {blob,manifest}=await createExport(catalog,[a],{scope:'selected',selectedIds:[reviewId],evidenceFiles});const restored=await parseImport(blob,catalog);
    assert.equal(manifest.evidence.length,1);assert.equal(manifest.evidence[0].reviewId,reviewId);assert.equal(restored.manifest.evidence[0].reviewId,reviewId);assert.ok(restored.files.has(manifest.evidence[0].path));assert.equal(restored.files.has('evidence/plain.png'),false);assert.equal(restored.files.has('evidence/unselected.png'),false);
  }
});

test('question and contact navigation positions save independently without creating scientific decisions',async()=>{
  const catalog=fixture(),a=task(),question={viewId:'stems',questionId:'stem',groupId:'stems'},selectedContact={viewId:'contacts',contactId:contact.id};
  saveReviewPosition(a,catalog,question,a.view,a.segments);const contactView={...a.view,centerNm:contact.postNm,plane:'xz'};saveReviewPosition(a,catalog,selectedContact,contactView,[]);
  assert.deepEqual(reviewPosition(a,question).view,a.view);assert.deepEqual(reviewPosition(a,selectedContact).view,contactView);assert.equal(a.review.decisions.length,0);assert.equal(a.review.contacts.length,0);assert.equal(a.decision.status,'unreviewed');
  const exported=createAnnotationExport(catalog,[a],{scope:'current'}),other=fixture();other.focusedContacts.clear();const loaded=[];other.ensureFocusedContacts=async ids=>{loaded.push(ids);other.focusedContacts.set('MC1:'+contact.id,structuredClone(contact));};const imported=await parseImport(exported.blob,other);assert.deepEqual(imported.tasks[0].review.positions,a.review.positions);assert.deepEqual(loaded,[['MC1']]);
  const selected=await parseImport(createAnnotationExport(catalog,[a],{scope:'selected',selectedIds:['contact:'+contact.id]}).blob,catalog);assert.deepEqual(Object.keys(selected.tasks[0].review.positions),['contact:'+contact.id]);
  const copy=reviewPosition(a,question);copy.view.centerNm[0]=0;assert.notEqual(reviewPosition(a,question).view.centerNm[0],0);
});

test('position merge preserves independent contexts and rejects foreign scopes or invalid cameras',()=>{
  const catalog=fixture(),a=task(),b=task(),question={viewId:'stems',questionId:'stem',groupId:'stems'},selectedContact={viewId:'contacts',contactId:contact.id};
  saveReviewPosition(a,catalog,question,a.view,[]);saveReviewPosition(b,catalog,question,{...b.view,spanNm:2048},[]);saveReviewPosition(b,catalog,selectedContact,{...b.view,centerNm:contact.postNm},[]);
  const keep=mergeTask(a,b,{policy:'merge',partial:true});assert.equal(reviewPosition(keep,question).view.spanNm,4096);assert.equal(reviewPosition(keep,selectedContact).view.centerNm[0],contact.postNm[0]);const replace=mergeTask(a,b,{policy:'replace',partial:true});assert.equal(reviewPosition(replace,question).view.spanNm,2048);
  assert.throws(()=>saveReviewPosition(task('relation'),catalog,selectedContact,b.view,[]),{code:'REVIEW_CONTACT_OWNER'});assert.throws(()=>saveReviewPosition(a,catalog,{viewId:'branches',questionId:'relation'},a.view,[]),{code:'REVIEW_SCOPE'});assert.throws(()=>saveReviewPosition(a,catalog,question,{...a.view,spanNm:-1},[]),{code:'REVIEW_VIEW'});
});

test('saving an unchanged navigation position is idempotent for transfer and preserves its evidence timestamp',()=>{
  const catalog=fixture(),a=task(),context={viewId:'stems',questionId:'stem',groupId:'stems'};saveReviewPosition(a,catalog,context,a.view,a.segments);a.review.positions['question:stem'].updatedAt=time;
  const before=structuredClone(a),review=a.review,position=a.review.positions['question:stem'];const returned=saveReviewPosition(a,catalog,structuredClone(context),structuredClone(a.view),structuredClone(a.segments));
  assert.deepEqual(a,before);assert.equal(a.review,review);assert.equal(a.review.positions['question:stem'],position);assert.notEqual(returned,position);assert.equal(returned.updatedAt,time);
});
