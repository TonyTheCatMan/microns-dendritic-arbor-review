import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTask,validateTask,mergeTask} from '../core/model.js';
import {setQuestionDecision,setContactDecision,addCoverageIssue,reviewProgress,saveReviewPosition} from '../core/focused-review.js';
import {activeReviewScope,recordScopeStatus,findScopedQuestionDecision,scopeQuestionStatus,setScopeRelevance} from '../core/review-scope.js';
import {createAnnotationExport,createExport,parseImport,selectExportTasks} from '../core/exchange.js';
import {openStore} from '../core/store.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const catalogData=read('data/catalog.json'),workflow=read('data/focused-workflow.json'),reviewScope=read('data/review-scope.json');
const primary='preferred14.clean_extended',broader='all_export19.clean_extended',identity='MC298937.soma_identity',deferred='MC264824.cut2638';
function fixture(){return {...structuredClone(catalogData),focusedWorkflow:structuredClone(workflow),reviewScope:structuredClone(reviewScope),activeReviewPoolId:primary};}
const task=id=>createTask(id??identity,{centerNm:[752960,646592,858640],plane:'xy',spanNm:12288,surfaceCamera:{zoom:18}});
function draft(c){return {id:'kept-trace',kind:'trace',draft:true,category:'uncertain_continuation',label:'Наблюдение',note:'Exact original note',visible:true,pointsNm:[[752960,646592,858640]],plane:'xy',sourceBinding:{catalogHash:c.catalogHash,sourceHash:c.sourceHash,coordinateConvention:'integer-sample'},createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z'};}

test('analysis pools remain separately bound and all 50 questions survive with 45 applicable initial decisions',()=>{
  const c=fixture();assert.equal(c.tasks.length,50);assert.equal(c.focusedWorkflow.questions.length,50);
  const a=activeReviewScope(c),b=activeReviewScope(c,broader);
  assert.deepEqual([a.pool.counts.contacts,a.pool.counts.distinctSources,a.pool.counts.memberships],[634,249,370]);
  assert.deepEqual([b.pool.counts.contacts,b.pool.counts.distinctSources,b.pool.counts.memberships],[641,253,374]);
  assert.equal(a.pool.questions.length,50);assert.equal(reviewProgress([],c).questions.total,45);assert.equal(reviewProgress([],c).allQuestions.total,50);assert.equal(reviewProgress([],c).deferred,5);
  const cut=a.pool.cutBranches.find(item=>item.questionId==='MC298937.cut4475'&&String(item.branchNode)==='4661');
  assert.deepEqual([cut.contactIds.length,cut.sourceRootIds.length],[62,48]);assert.equal(a.pool.questions.find(q=>q.id==='MC298937.cut4475').contactIds.length,62);
  assert.equal(a.pool.questions.find(q=>q.id==='MC264824.cut869').contactIds.length,1);
  assert.equal(scopeQuestionStatus([],c,deferred).applicable,false);assert.equal(scopeQuestionStatus([],c,'MC264824.cut5297').applicable,false);
});

test('unbound old evidence remains unchanged on load and note-only acceptance does not promote its old outcome',()=>{
  const c=fixture(),old=task();delete c.reviewScope;old.marks=[draft(c)];old.futureTaskField={keep:true};setQuestionDecision(old,c,identity,{outcome:'supported',note:'Старая запись',markIds:['kept-trace']});
  const before=structuredClone(old);c.reviewScope=structuredClone(reviewScope);
  assert.deepEqual(validateTask(old,c),before);assert.equal(findScopedQuestionDecision([old],identity,c),null);assert.equal(reviewProgress([old],c).questions.resolved,0);
  setQuestionDecision(old,c,identity,{note:'New scoped note'});
  const record=old.review.decisions[0];assert.equal(record.outcome,'unreviewed');assert.equal(record.scopeHistory.length,1);assert.deepEqual(record.scopeHistory[0],before.review.decisions[0]);assert.equal(recordScopeStatus(record,c),'current');assert.deepEqual(old.marks,before.marks);assert.deepEqual(old.futureTaskField,before.futureTaskField);
  setQuestionDecision(old,c,identity,{outcome:'supported'});assert.equal(reviewProgress([old],c).questions.resolved,1);assert.equal(old.review.contacts.length,0);
});

test('per-pool decisions preserve prior notes and explicit outcomes without cross-pool certification',()=>{
  const c=fixture(),t=task();setQuestionDecision(t,c,identity,{outcome:'supported',note:'Primary observation'});const original=structuredClone(t.review.decisions[0]);
  c.activeReviewPoolId=broader;assert.equal(findScopedQuestionDecision([t],identity,c),null);assert.equal(reviewProgress([t],c).questions.resolved,0);
  setQuestionDecision(t,c,identity,{note:'Broader concern'});assert.equal(t.review.decisions[0].outcome,'unreviewed');assert.deepEqual(t.review.decisions[0].scopeHistory[0],original);
  setQuestionDecision(t,c,identity,{outcome:'contradicted'});const foreign=structuredClone(t.review.decisions[0]);
  c.activeReviewPoolId=primary;assert.equal(findScopedQuestionDecision([t],identity,c).note,'Primary observation');setQuestionDecision(t,c,identity,{customAlternative:'Primary detail'});
  assert.equal(t.review.decisions[0].note,'Primary observation');assert.equal(t.review.decisions[0].outcome,'supported');assert.equal(t.review.decisions[0].scopeBinding.poolId,primary);
  assert.ok(t.review.decisions[0].scopeHistory.some(record=>record.note===foreign.note));assert.doesNotThrow(()=>validateTask(t,c));
  assert.equal(t.decision.status,'unreviewed');assert.equal(t.review.contacts.length,0);
});

test('deferred annotations persist and explicit relevance changes require reasons, remain per-pool, and never resolve the question',()=>{
  const c=fixture(),t=task(deferred);t.marks=[draft(c)];const frozen=JSON.stringify(c.reviewScope);
  assert.throws(()=>setScopeRelevance(t,c,deferred,{relevant:true,reason:''}),{code:'REVIEW_SCOPE_REASON'});
  setScopeRelevance(t,c,deferred,{relevant:true,reason:'Observed continuity may implicate retained path'});
  assert.equal(scopeQuestionStatus([t],c,deferred).applicable,true);assert.equal(reviewProgress([t],c).questions.total,46);assert.equal(reviewProgress([t],c).questions.resolved,0);assert.equal(t.review.decisions.length,0);
  c.activeReviewPoolId=broader;assert.equal(scopeQuestionStatus([t],c,deferred).applicable,false);assert.equal(JSON.stringify(c.reviewScope),frozen);assert.equal(t.marks.length,1);assert.doesNotThrow(()=>validateTask(t,c));
});

test('JSON and ZIP selected/current/all transfers preserve scoped history, annotations, exact source provenance and conflict choices',async()=>{
  const c=fixture(),t=task();t.marks=[draft(c)];setQuestionDecision(t,c,identity,{outcome:'uncertain',note:'Primary',markIds:['kept-trace']});c.activeReviewPoolId=broader;setQuestionDecision(t,c,identity,{outcome:'supported',note:'Broader'});
  for(const scope of ['selected','current','all'])for(const mode of ['json','zip']){
    const options={scope,taskId:identity,selectedIds:['question:'+identity],language:'ru'},result=mode==='zip'?await createExport(c,[t],options):createAnnotationExport(c,[t],options);
    c.activeReviewPoolId=primary;const imported=await parseImport(result.blob,c);assert.equal(imported.compatibility.scopeMismatch,true);assert.equal(imported.manifest.reviewScope.poolId,broader);assert.equal(imported.state.reviewScope.definition.provenance.sourceInventoryHash,reviewScope.provenance.sourceInventoryHash);
    assert.equal(imported.state.reviewScope.definition.pools[0].sources.length,370);assert.equal(imported.state.reviewScope.definition.materialization,661);
    const incoming=imported.tasks.find(row=>row.id===identity);assert.deepEqual(incoming.review,t.review);assert.deepEqual(incoming.marks,t.marks);
    assert.deepEqual(mergeTask(task(),incoming,{scopeMismatch:true,policy:'keep'}),task());assert.deepEqual(mergeTask(undefined,incoming,{scopeMismatch:true,policy:'keep'}),createTask(identity));
    assert.equal(mergeTask(task(),incoming,{scopeMismatch:true,policy:'replace'}).review.decisions[0].scopeBinding.poolId,broader);
    c.activeReviewPoolId=broader;
  }
});

test('scope identity, materialization, dependency manifest and policy edits fail closed, old v2 remains importable',async()=>{
  const c=fixture(),t=task();setQuestionDecision(t,c,identity,{outcome:'uncertain'});const payload=JSON.parse(await createAnnotationExport(c,[t],{scope:'current'}).blob.text());
  for(const mutate of [p=>p.state.tasks[identity].review.decisions[0].scopeBinding.scopeHash='f'.repeat(64),p=>p.state.reviewScope.materialization=1300,p=>p.state.reviewScope.definition.pools[0].questions[0].contactIds.pop(),p=>p.state.tasks[identity].review.decisions[0].scopeBinding.policy='all_export19',p=>p.reviewScope.poolId=broader]){
    const modified=structuredClone(payload);mutate(modified);await assert.rejects(parseImport(new Blob([JSON.stringify(modified)]),c),error=>error.code.startsWith('REVIEW_SCOPE'));
  }
  const legacy=structuredClone(payload);delete legacy.reviewScope;delete legacy.state.reviewScope;delete legacy.state.tasks[identity].review.decisions[0].scopeBinding;
  const imported=await parseImport(new Blob([JSON.stringify(legacy)]),c);assert.equal(imported.compatibility.priorScope,true);assert.equal(imported.compatibility.scopeMismatch,false);assert.equal(imported.tasks[0].review.decisions[0].scopeBinding,undefined);
});

test('foreign pool merges keep explicit local decisions and preserve incoming scoped history and per-pool overrides',()=>{
  const c=fixture(),local=task(deferred),incoming=task(deferred);setQuestionDecision(local,c,deferred,{outcome:'uncertain',note:'Local primary'});setScopeRelevance(local,c,deferred,{relevant:true,reason:'Local path concern'});
  c.activeReviewPoolId=broader;setQuestionDecision(incoming,c,deferred,{outcome:'contradicted',note:'Incoming broader'});setScopeRelevance(incoming,c,deferred,{relevant:true,reason:'Broader path concern'});
  for(const partial of [true,false]){
    const merged=mergeTask(local,incoming,{policy:'merge',partial});assert.equal(merged.review.decisions[0].note,'Local primary');assert.equal(findScopedQuestionDecision([merged],deferred,c).note,'Incoming broader');assert.equal(merged.review.scopeRelevance.length,2);assert.doesNotThrow(()=>validateTask(merged,c));
    const replaced=mergeTask(local,incoming,{policy:'replace',partial});assert.equal(replaced.review.decisions[0].note,'Incoming broader');c.activeReviewPoolId=primary;assert.equal(findScopedQuestionDecision([replaced],deferred,c).note,'Local primary');c.activeReviewPoolId=broader;
  }
});

test('deferred scope relevance alone survives selected transfer and autosave/reload preserves old views and drafts',async()=>{
  const c=fixture(),t=task(deferred);t.marks=[draft(c)];setScopeRelevance(t,c,deferred,{relevant:true,reason:'Inspect newly observed branch'});setQuestionDecision(t,c,deferred,{outcome:'insufficient_coverage',markIds:['kept-trace']});
  const q=c.focusedWorkflow.questions.find(q=>q.id===deferred);saveReviewPosition(t,c,{viewId:q.view,groupId:q.groupId,questionId:deferred},t.view);
  const selected=selectExportTasks(c,[t],{scope:'selected',selectedIds:['question:'+deferred]});assert.equal(selected.find(row=>row.id===deferred).review.scopeRelevance.length,1);
  let metadata;const rows=new Map(),backend={metadata:async()=>metadata,setMetadata:async v=>metadata=structuredClone(v),read:async id=>structuredClone(rows.get(id)),all:async()=>[...rows.values()].map(v=>structuredClone(v)),close(){},write:async value=>{const saved={...structuredClone(value),revision:(rows.get(value.id)?.revision??0)+1,updatedAt:new Date().toISOString()};rows.set(value.id,saved);return saved;}};
  const store=await openStore(c,{backend});await store.save(t);await store.flush();const loaded=await store.load(deferred);assert.deepEqual(loaded.review,t.review);assert.deepEqual(loaded.marks,t.marks);assert.deepEqual(loaded.view,t.view);assert.equal(loaded.decision.status,'unreviewed');await store.close();
});

test('explicit contact decisions preserve exact source IDs and do not certify other retained assignments',()=>{
  const c=fixture(),retained=activeReviewScope(c).pool.contacts[0],data=read('data/contacts/'+retained.recipientId+'.json');
  const original=data.contacts.find(item=>item.id===retained.id),t=task(retained.recipientId+'.soma_identity');c.focusedContacts=new Map([[retained.recipientId+':'+retained.id,original]]);
  setContactDecision(t,c,{...original,recipientId:retained.recipientId},{outcome:'supported',note:'Only this contact inspected'});
  assert.equal(t.review.contacts[0].scopeBinding.poolId,primary);assert.equal(t.review.contacts[0].sourceRootId,retained.sourceRootId);assert.equal(t.review.contacts.length,1);assert.equal(t.review.decisions.length,0);assert.equal(reviewProgress([t],c).questions.resolved,0);
  c.activeReviewPoolId=broader;setContactDecision(t,c,{...original,recipientId:retained.recipientId},{note:'Different scope note'});assert.equal(t.review.contacts[0].outcome,'unreviewed');assert.equal(t.review.contacts[0].scopeHistory[0].outcome,'supported');assert.doesNotThrow(()=>validateTask(t,c));
});

test('selected export retains marks used only by prior scope and merge retains incoming history under the same current scope',async()=>{
  const c=fixture(),local=task(),incoming=task();incoming.marks=[draft(c)];setQuestionDecision(incoming,c,identity,{outcome:'supported',note:'Earlier primary',markIds:['kept-trace']});
  c.activeReviewPoolId=broader;setQuestionDecision(incoming,c,identity,{outcome:'uncertain',note:'Broader',markIds:[]});
  setQuestionDecision(local,c,identity,{outcome:'contradicted',note:'Keep local broader'});incoming.review.decisions[0].futureRecordField={preserved:true};
  const merged=mergeTask(local,incoming,{policy:'merge',partial:true});assert.equal(merged.review.decisions[0].note,'Keep local broader');assert.equal(merged.review.decisions[0].scopeHistory[0].note,'Earlier primary');assert.deepEqual(merged.review.decisions[0].futureRecordField,{preserved:true});assert.doesNotThrow(()=>validateTask(merged,c));
  const selected=await parseImport(createAnnotationExport(c,[incoming],{scope:'selected',selectedIds:['question:'+identity]}).blob,c);
  assert.equal(selected.tasks[0].marks[0].id,'kept-trace');assert.deepEqual(selected.tasks[0].review,incoming.review);
});

test('figure metadata identifies its original scoped observation and cannot attach to another pool outcome',async()=>{
  const c=fixture(),t=task();setQuestionDecision(t,c,identity,{outcome:'uncertain'});const original=structuredClone(t.review.decisions[0]);c.activeReviewPoolId=broader;setQuestionDecision(t,c,identity,{outcome:'contradicted'});
  const file={path:'figure-metadata.json',data:'{}',taskId:identity,reviewId:original.id,metadata:{scopeBinding:original.scopeBinding,reviewId:original.id,reviewUpdatedAt:original.updatedAt}};
  const result=await createExport(c,[t],{scope:'selected',selectedIds:[original.id],evidenceFiles:[file]});const imported=await parseImport(result.blob,c);assert.equal(imported.manifest.evidence[0].metadata.scopeBinding.poolId,primary);
  await assert.rejects(createExport(c,[t],{scope:'current',evidenceFiles:[{...file,metadata:{...file.metadata,reviewUpdatedAt:'2000-01-01T00:00:00Z'}}]}),{code:'EVIDENCE_SCOPE'});
  await assert.rejects(createExport(c,[t],{scope:'current',evidenceFiles:[{...file,metadata:{...file.metadata,scopeBinding:{...original.scopeBinding,scopeHash:'f'.repeat(64)}}}]}),{code:'REVIEW_SCOPE_HASH'});
});

test('selected contact exports carry exact scoped route and relation evidence without broad cut context or unrelated contacts',async()=>{
  const c=fixture(),pool=activeReviewScope(c).pool;
  const contacts=[pool.contacts.find(contact=>contact.exactCutQuestionIds.length),pool.contacts.find(contact=>contact.relationQuestionIds.length)];
  for(const retained of contacts){
    const source=read('data/contacts/'+retained.recipientId+'.json'),owner=task(retained.identityQuestionId),raw=source.contacts.find(contact=>contact.id===retained.id),unrelatedRaw=source.contacts.find(contact=>contact.id!==retained.id);
    c.focusedContacts=new Map(source.contacts.map(contact=>[retained.recipientId+':'+contact.id,contact]));
    setContactDecision(owner,c,{...raw,recipientId:retained.recipientId},{outcome:'uncertain',note:'Chosen attachment concern'});
    setContactDecision(owner,c,{...unrelatedRaw,recipientId:retained.recipientId},{outcome:'supported',note:'Unrelated review stays out'});
    const all=c.focusedWorkflow.questions.map(question=>question.id===owner.id?owner:task(question.id));
    for(const row of all){row.marks=[{...draft(c),id:'mark-'+row.id}];setQuestionDecision(row,c,row.id,{outcome:'uncertain',note:'Independent '+row.id,markIds:[row.marks[0].id]});}
    const expected=new Set([retained.identityQuestionId,retained.originRouteQuestionId,...retained.relationQuestionIds,...retained.exactCutQuestionIds]);
    for(const id of expected)for(const dep of c.focusedWorkflow.questions.find(q=>q.id===id).dependencyQuestionIds)expected.add(dep);
    for(const mode of ['json','zip']){
      const options={scope:'selected',selectedIds:['contact:'+retained.id]},result=mode==='zip'?await createExport(c,all,options):createAnnotationExport(c,all,options),restored=await parseImport(result.blob,c);
      assert.deepEqual(new Set(restored.tasks.map(row=>row.id)),expected);
      for(const row of restored.tasks){assert.equal(row.review.decisions[0].note,'Independent '+row.id);assert.deepEqual(row.marks,[{...draft(c),id:'mark-'+row.id}]);}
      assert.deepEqual(restored.tasks.flatMap(row=>row.review?.contacts??[]).map(contact=>contact.contactId),[retained.id]);
      for(const id of retained.domainContextQuestionIds.filter(id=>!expected.has(id)))assert.ok(!restored.tasks.some(row=>row.id===id));
    }
    const current=selectExportTasks(c,all,{scope:'current',taskId:owner.id});assert.ok(current.some(row=>row.id===retained.originRouteQuestionId));assert.equal(current.find(row=>row.id===owner.id).review.contacts.length,2);
  }
});

test('contact dependencies use preserved original history pools and selected coverage issues carry their own question evidence',async()=>{
  const c=fixture(),a=activeReviewScope(c).pool,b=activeReviewScope(c,broader).pool,retained=b.contacts.find(contact=>!a.contacts.some(original=>original.id===contact.id&&original.recipientId===contact.recipientId));
  const data=read('data/contacts/'+retained.recipientId+'.json'),raw=data.contacts.find(contact=>contact.id===retained.id),owner=task(retained.identityQuestionId),route=task(retained.originRouteQuestionId);
  c.focusedContacts=new Map(data.contacts.map(contact=>[retained.recipientId+':'+contact.id,contact]));
  c.activeReviewPoolId=broader;setQuestionDecision(route,c,route.id,{outcome:'uncertain',note:'Broader route evidence'});setContactDecision(owner,c,{...raw,recipientId:retained.recipientId},{outcome:'uncertain'});
  c.activeReviewPoolId=primary;setContactDecision(owner,c,{...raw,recipientId:retained.recipientId},{note:'Context observation outside primary retained set'});
  const selected=selectExportTasks(c,[owner,route],{scope:'selected',selectedIds:['contact:'+retained.id]});assert.equal(selected.find(row=>row.id===route.id).review.decisions[0].note,'Broader route evidence');
  const issue=addCoverageIssue(route,c,{questionId:route.id,note:'Missing section interval'});
  const restored=await parseImport(createAnnotationExport(c,[owner,route],{scope:'selected',selectedIds:[issue.id]}).blob,c);
  assert.equal(restored.tasks.find(row=>row.id===route.id).review.decisions[0].note,'Broader route evidence');assert.equal(restored.tasks.find(row=>row.id===route.id).review.issues[0].id,issue.id);assert.equal(restored.tasks.flatMap(row=>row.review?.contacts??[]).length,0);assert.ok(restored.tasks.some(row=>row.id===retained.identityQuestionId));
});
