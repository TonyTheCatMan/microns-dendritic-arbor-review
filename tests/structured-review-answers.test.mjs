import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTask,validateTask,mergeTask} from '../core/model.js';
import {questionAnswerFields,setQuestionDecision,effectiveQuestionOutcome,reviewProgress} from '../core/focused-review.js';
import {findScopedQuestionDecision} from '../core/review-scope.js';
import {createAnnotationExport,createExport,parseImport} from '../core/exchange.js';
import {openStore} from '../core/store.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const source=read('data/catalog.json'),workflow=read('data/focused-workflow.json'),scope=read('data/review-scope.json');
const primary='preferred14.clean_extended',broader='all_export19.clean_extended';
const cuts=[{id:'MC298937.cut4475',child:'4661',sibling:'4315'},{id:'MC264824.cut869',child:'837',sibling:'870'}];
const catalog=()=>({...structuredClone(source),focusedWorkflow:structuredClone(workflow),reviewScope:structuredClone(scope),activeReviewPoolId:primary});
const task=id=>createTask(id,{centerNm:[752960,646592,858640],plane:'xy',spanNm:12288,surfaceCamera:{zoom:18}});
const record=t=>t.review.decisions[0];
function mark(c,id='legacy-mark'){return {id,kind:'trace',draft:true,category:'uncertain_continuation',label:'Original annotation',note:'Original mark note',visible:true,pointsNm:[[752960,646592,858640]],plane:'xy',sourceBinding:{catalogHash:c.catalogHash,sourceHash:c.sourceHash,coordinateConvention:'integer-sample'},createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'};}

test('all 50 questions expose immutable exact canonical fields rather than flattened alternatives',()=>{
  const c=catalog(),frozen=JSON.stringify(c);
  for(const q of c.focusedWorkflow.questions){
    const fields=questionAnswerFields(c,q.id),original=c.tasks.find(t=>t.id===q.taskId).fields;
    assert.deepEqual(fields,original);assert.notEqual(fields,original);
    fields[0].label.en='Do not mutate source';assert.notEqual(original[0].label.en,fields[0].label.en);
  }
  assert.equal(c.tasks.filter(t=>t.fields.length>1).length,4);
  assert.ok(c.tasks.filter(t=>t.fields.length>1).every(t=>t.sourceTaskType==='compartment_cut'));
  assert.equal(JSON.stringify(c),frozen);
  assert.throws(()=>questionAnswerFields(c,'wrong-question'),{code:'REVIEW_QUESTION'});
});

test('each consequential cut records independent exact child attachment, compartment and optional sibling values',()=>{
  for(const {id,child,sibling} of cuts){
    const c=catalog(),t=task(id),compartment=`child_${child}_compartment`,attachment=`child_${child}_attachment`,optional=`child_${sibling}_attachment`;
    setQuestionDecision(t,c,id,{fieldAnswers:{[compartment]:'dendritic child'},note:'Retained child observation'});
    setQuestionDecision(t,c,id,{fieldAnswers:{[attachment]:'obscured'}});
    assert.deepEqual(record(t).fieldAnswers,{[compartment]:'dendritic child',[attachment]:'obscured'});
    assert.equal(record(t).fieldAnswers[optional],undefined);assert.equal(record(t).alternative,'');
    setQuestionDecision(t,c,id,{fieldAnswers:{[optional]:'contradicted',compartment:'unresolved'},outcome:'uncertain'});
    setQuestionDecision(t,c,id,{fieldAnswers:{[attachment]:''}});
    assert.equal(record(t).fieldAnswers[optional],'contradicted');assert.equal(record(t).fieldAnswers[compartment],'dendritic child');assert.equal(record(t).fieldAnswers[attachment],'');
    assert.equal(record(t).note,'Retained child observation');assert.doesNotThrow(()=>validateTask(t,c));
    assert.equal(t.decision.status,'unreviewed');
  }
});

test('identity, origin, boundary and every relation retain independent canonical question scopes',()=>{
  const c=catalog(),tasks=[];
  for(const kind of ['identity','origin_route','targeted_boundary_or_damage','branch_relation']){
    const definitions=kind==='branch_relation'?c.tasks.filter(t=>t.sourceTaskType===kind):[c.tasks.find(t=>t.sourceTaskType===kind)];
    for(const definition of definitions){const t=task(definition.id),field=questionAnswerFields(c,t.id)[0];setQuestionDecision(t,c,t.id,{fieldAnswers:{[field.key]:field.options[0].value},note:t.id});tasks.push(t);assert.equal(record(t).questionId,t.id);assert.deepEqual(record(t).taskIds,[t.id]);assert.doesNotThrow(()=>validateTask(t,c));}
  }
  const pair=tasks.find(t=>t.id==='MC264920.relation_5149_5498'),triple=tasks.find(t=>t.id==='MC264920.relation_5149_5498_6127');
  const original=structuredClone(triple);setQuestionDecision(pair,c,pair.id,{fieldAnswers:{branch_relation:'unresolved'}});assert.deepEqual(triple,original);
});

test('ambiguous generic cut judgments stay legacy context and first field edit cannot inherit their certification',()=>{
  const c=catalog(),t=task(cuts[0].id);t.marks=[mark(c)];t.decision.answers={child_4315_attachment:'contradicted'};t.decision.note='Original catalog decision';
  setQuestionDecision(t,c,t.id,{outcome:'supported',alternative:'dendritic child',note:'Old generic choice',markIds:['legacy-mark']});
  const old=structuredClone(record(t)),originalDecision=structuredClone(t.decision);
  assert.equal(effectiveQuestionOutcome(c,record(t)),'unreviewed');assert.equal(record(t).outcome,'supported');assert.equal(reviewProgress([t],c).questions.resolved,0);
  assert.equal(record(t).fieldAnswers,undefined);
  setQuestionDecision(t,c,t.id,{fieldAnswers:{child_4661_attachment:'obscured'},markIds:[]});
  assert.equal(record(t).outcome,'unreviewed');assert.deepEqual(record(t).legacyInterpretation,old);assert.equal(record(t).alternative,'dendritic child');assert.equal(record(t).note,'Old generic choice');assert.deepEqual(t.decision,originalDecision);
  assert.equal(record(t).fieldAnswers.child_4661_compartment,undefined);assert.equal(record(t).fieldAnswers.child_4315_attachment,undefined);
  setQuestionDecision(t,c,t.id,{outcome:'uncertain',fieldAnswers:{child_4661_compartment:'unresolved'}});assert.equal(effectiveQuestionOutcome(c,record(t)),'uncertain');assert.deepEqual(record(t).legacyInterpretation,old);
  const explicit=task(cuts[1].id);setQuestionDecision(explicit,c,explicit.id,{outcome:'supported',alternative:'dendritic child'});setQuestionDecision(explicit,c,explicit.id,{fieldAnswers:{child_837_compartment:'dendritic child',child_837_attachment:'supported_to_candidate'},outcome:'supported'});assert.equal(effectiveQuestionOutcome(c,record(explicit)),'supported');
  const coverage=task(cuts[1].id);setQuestionDecision(coverage,c,coverage.id,{outcome:'insufficient_coverage'});assert.equal(effectiveQuestionOutcome(c,record(coverage)),'insufficient_coverage');
  const identity=task('MC298937.soma_identity');setQuestionDecision(identity,c,identity.id,{outcome:'supported'});assert.equal(effectiveQuestionOutcome(c,record(identity)),'supported');
});

test('structured answers and legacy interpretation remain in their own pool across edits and conflict merges',()=>{
  const c=catalog(),t=task(cuts[0].id);setQuestionDecision(t,c,t.id,{outcome:'supported',alternative:'dendritic child',note:'Primary old choice'});setQuestionDecision(t,c,t.id,{fieldAnswers:{child_4661_attachment:'obscured'},note:'Primary exact observation'});const initial=structuredClone(record(t));
  c.activeReviewPoolId=broader;setQuestionDecision(t,c,t.id,{note:'Broader needs separate review'});assert.equal(record(t).fieldAnswers,undefined);assert.equal(record(t).legacyInterpretation,undefined);assert.equal(record(t).outcome,'unreviewed');assert.deepEqual(record(t).scopeHistory[0],initial);
  setQuestionDecision(t,c,t.id,{fieldAnswers:{child_4661_compartment:'unresolved'}});assert.deepEqual(record(t).fieldAnswers,{child_4661_compartment:'unresolved'});
  c.activeReviewPoolId=primary;setQuestionDecision(t,c,t.id,{fieldAnswers:{child_4661_compartment:'dendritic child'}});assert.deepEqual(record(t).fieldAnswers,{child_4661_attachment:'obscured',child_4661_compartment:'dendritic child'});
  assert.deepEqual(findScopedQuestionDecision([t],t.id,c,broader).fieldAnswers,{child_4661_compartment:'unresolved'});assert.doesNotThrow(()=>validateTask(t,c));
  const generic=task(t.id);setQuestionDecision(generic,c,generic.id,{outcome:'uncertain',alternative:'unresolved'});
  const replaced=mergeTask(t,generic,{policy:'replace',partial:true});assert.equal(record(replaced).fieldAnswers,undefined);assert.equal(record(replaced).legacyInterpretation,undefined);
  c.activeReviewPoolId=broader;const foreign=task(t.id);setQuestionDecision(foreign,c,foreign.id,{note:'Broader generic'});
  const kept=mergeTask(foreign,t,{policy:'merge',partial:true});assert.equal(record(kept).fieldAnswers,undefined);assert.equal(findScopedQuestionDecision([kept],t.id,c,primary).fieldAnswers.child_4661_attachment,'obscured');assert.doesNotThrow(()=>validateTask(kept,c));
});

test('unknown child IDs, cross-field options, invalid answer containers and altered legacy snapshots fail closed',()=>{
  const c=catalog(),t=task(cuts[0].id);
  for(const fieldAnswers of [{child_837_attachment:'obscured'},{child_4661_attachment:'dendritic child'},{child_4661_compartment:'supported_to_candidate'},{child_4661_compartment:4},{child_4661_compartment:{value:'unresolved'}},null,[],undefined])assert.throws(()=>setQuestionDecision(t,c,t.id,{fieldAnswers}),error=>error.code.startsWith('REVIEW_'));
  setQuestionDecision(t,c,t.id,{outcome:'supported',alternative:'dendritic child'});setQuestionDecision(t,c,t.id,{fieldAnswers:{child_4661_attachment:'obscured'}});
  for(const mutate of [x=>x.fieldAnswers.child_4661_attachment='dendritic child',x=>x.legacyInterpretation.questionId=cuts[1].id,x=>x.legacyInterpretation.fieldAnswers={child_4661_attachment:'contradicted'},x=>x.legacyInterpretation.scopeBinding.poolId=broader]){const changed=structuredClone(t);mutate(record(changed));assert.throws(()=>validateTask(changed,c),error=>error.code.startsWith('REVIEW_'));}
});

test('JSON and ZIP selected/current transfers preserve both cut IDs, independent fields, old choices, pools, notes and legacy-only evidence',async()=>{
  const c=catalog(),tasks=cuts.map(({id,child,sibling})=>{
    const t=task(id);t.marks=[mark(c,'legacy-'+id)];setQuestionDecision(t,c,id,{outcome:'supported',alternative:'dendritic child',note:'Verbatim old note '+id,markIds:[t.marks[0].id]});setQuestionDecision(t,c,id,{fieldAnswers:{[`child_${child}_attachment`]:'obscured',[`child_${child}_compartment`]:'dendritic child',[`child_${sibling}_attachment`]:'contradicted'},markIds:[],note:'Exact note '+id});return t;
  });
  for(const t of tasks){
    c.activeReviewPoolId=broader;setQuestionDecision(t,c,t.id,{fieldAnswers:{[questionAnswerFields(c,t.id).find(f=>f.key.endsWith('_attachment')).key]:'unresolved'},note:'Separate broader record'});c.activeReviewPoolId=primary;
    for(const transferScope of ['selected','current'])for(const mode of ['json','zip']){
      const options={scope:transferScope,taskId:t.id,selectedIds:['question:'+t.id]};const exported=mode==='zip'?await createExport(c,[t],options):createAnnotationExport(c,[t],options);const fresh=catalog(),imported=await parseImport(exported.blob,fresh),incoming=imported.tasks.find(row=>row.id===t.id);
      assert.deepEqual(incoming.review,t.review);assert.deepEqual(incoming.marks,t.marks);assert.deepEqual(incoming.view,t.view);assert.deepEqual(incoming.decision,t.decision);assert.equal(imported.state.catalogHash,c.catalogHash);assert.equal(imported.state.sourceHash,c.sourceHash);assert.equal(imported.manifest.reviewScope.poolId,primary);
      const restored=mergeTask(task(t.id),incoming,{policy:'replace',partial:imported.manifest.partial});assert.deepEqual(restored.review,t.review);assert.equal(findScopedQuestionDecision([restored],t.id,fresh,primary).note,'Exact note '+t.id);assert.doesNotThrow(()=>validateTask(restored,fresh));
    }
  }
});

test('structured values and preserved generic context autosave without translating source field IDs',async()=>{
  const c=catalog(),t=task(cuts[1].id);setQuestionDecision(t,c,t.id,{alternative:'dendritic child',outcome:'supported',note:'Old generic'});setQuestionDecision(t,c,t.id,{fieldAnswers:{child_837_attachment:'obscured',child_837_compartment:'unresolved'},note:'New exact answers'});
  let metadata;const rows=new Map(),backend={metadata:async()=>metadata,setMetadata:async v=>metadata=structuredClone(v),read:async id=>structuredClone(rows.get(id)),all:async()=>[...rows.values()].map(v=>structuredClone(v)),close(){},write:async value=>{const saved={...structuredClone(value),revision:(rows.get(value.id)?.revision??0)+1,updatedAt:new Date().toISOString()};rows.set(value.id,saved);return saved;}};
  const store=await openStore(c,{backend});await store.save(t);await store.flush();const loaded=await store.load(t.id);assert.deepEqual(loaded.review,t.review);assert.deepEqual(loaded.decision,t.decision);await store.close();
  const payload=JSON.parse(await createAnnotationExport(c,[loaded],{scope:'current'}).blob.text());payload.state.tasks[t.id].review.decisions[0].fieldAnswers.child_870_attachment='dendritic child';await assert.rejects(parseImport(new Blob([JSON.stringify(payload)]),c),{code:'REVIEW_ANSWER_VALUE'});
});


test('importing a structured replacement retains local generic answers and their linked evidence as history',()=>{
  const c=catalog(),local=task(cuts[0].id),incoming=task(cuts[0].id);local.marks=[mark(c)];
  setQuestionDecision(local,c,local.id,{outcome:'supported',alternative:'dendritic child',note:'Original local generic answer',markIds:['legacy-mark']});
  const original=structuredClone(record(local));
  setQuestionDecision(incoming,c,incoming.id,{fieldAnswers:{child_4661_attachment:'obscured'},outcome:'uncertain',note:'Incoming exact answer'});
  for(const partial of [false,true]){
    const replaced=mergeTask(local,incoming,{policy:'replace',partial});assert.deepEqual(record(replaced).fieldAnswers,{child_4661_attachment:'obscured'});assert.ok(record(replaced).scopeHistory.some(item=>JSON.stringify(item)===JSON.stringify(original)));assert.deepEqual(replaced.marks,local.marks);assert.doesNotThrow(()=>validateTask(replaced,c));
  }
});


test('both analysis pools require attachment and compartment for the exact retained cut child',()=>{
  for(const poolId of [primary,broader])for(const {id,child,sibling}of cuts)for(const outcome of ['supported','contradicted']){
    const c=catalog();c.activeReviewPoolId=poolId;
    const incomplete=[
      {[`child_${sibling}_compartment`]:'dendritic child'},
      {[`child_${sibling}_compartment`]:'dendritic child',[`child_${sibling}_attachment`]:'supported_to_candidate'},
      {compartment:'dendritic child'},
      {[`child_${child}_compartment`]:'dendritic child'},
      {[`child_${child}_attachment`]:'supported_to_candidate'},
      {[`child_${child}_attachment`]:'supported_to_candidate',[`child_${sibling}_compartment`]:'dendritic child'},
      {[`child_${child}_attachment`]:'supported_to_candidate',[`child_${child}_compartment`]:''},
      {[`child_${child}_attachment`]:null,[`child_${child}_compartment`]:'dendritic child'}
    ];
    for(const fieldAnswers of incomplete){
      const t=task(id);setQuestionDecision(t,c,id,{fieldAnswers,outcome,note:'Explicit but incomplete declaration'});const saved=structuredClone(record(t));
      assert.equal(effectiveQuestionOutcome(c,record(t)),'unreviewed',`${poolId} ${id}: ${JSON.stringify(fieldAnswers)}`);assert.equal(reviewProgress([t],c).questions.resolved,0);assert.deepEqual(record(t),saved);
      for(const unresolvedOutcome of ['uncertain','insufficient_coverage'])assert.equal(effectiveQuestionOutcome(c,{...record(t),outcome:unresolvedOutcome}),unresolvedOutcome);
    }
    const complete=task(id);setQuestionDecision(complete,c,id,{fieldAnswers:{[`child_${child}_attachment`]:'supported_to_candidate',[`child_${child}_compartment`]:'dendritic child'},outcome});
    const saved=structuredClone(record(complete));assert.equal(effectiveQuestionOutcome(c,record(complete)),outcome);assert.equal(reviewProgress([complete],c).questions.resolved,1);assert.deepEqual(record(complete),saved);assert.equal(record(complete).fieldAnswers[`child_${sibling}_attachment`],undefined);
    assert.equal(effectiveQuestionOutcome(c,{...saved,fieldAnswers:{...saved.fieldAnswers,[`child_${child}_attachment`]:'dendritic child'}}),'unreviewed');
  }
});

test('cut answer specificity preserves independent pool history and does not add requirements to zero-descendant cuts',()=>{
  const c=catalog(),t=task(cuts[0].id);setQuestionDecision(t,c,t.id,{fieldAnswers:{child_4661_attachment:'supported_to_candidate',child_4661_compartment:'dendritic child'},outcome:'supported'});const primaryRecord=structuredClone(record(t));
  c.activeReviewPoolId=broader;setQuestionDecision(t,c,t.id,{fieldAnswers:{child_4315_attachment:'supported_to_candidate',child_4315_compartment:'dendritic child'},outcome:'supported'});assert.equal(effectiveQuestionOutcome(c,record(t)),'unreviewed');assert.deepEqual(record(t).scopeHistory[0],primaryRecord);
  c.activeReviewPoolId=primary;assert.equal(effectiveQuestionOutcome(c,findScopedQuestionDecision([t],t.id,c)),'supported');assert.doesNotThrow(()=>validateTask(t,c));
  for(const id of ['MC264824.cut2638','MC264824.cut5297']){const deferred=task(id);setQuestionDecision(deferred,c,id,{fieldAnswers:{compartment:'dendritic child'},outcome:'supported'});assert.equal(effectiveQuestionOutcome(c,record(deferred)),'supported');}
});
