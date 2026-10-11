import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalogContext,createTask} from '../core/model.js';
import {setQuestionDecision} from '../core/focused-review.js';
import {setScopeRelevance} from '../core/review-scope.js';
import {cellReviewQueue,cellReviewSummary,chooseCellCase} from '../core/guided-review.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const source=read('data/catalog.json'),workflow=read('data/focused-workflow.json'),scope=read('data/review-scope.json');
const primary='preferred14.clean_extended',broader='all_export19.clean_extended';
const catalog=()=>({...structuredClone(source),focusedWorkflow:structuredClone(workflow),reviewScope:structuredClone(scope),activeReviewPoolId:primary});
const counts={MC298937:7,MC264649:10,MC264920:12,MC264824:16};
const ids=queue=>queue.map(question=>question.id);
const task=id=>createTask(id,{centerNm:[752960,646592,858640],plane:'xy',spanNm:12288});

test('four cell queues reach all 45 distinct applicable questions across categories, without contacts or optional material',()=>{
  const c=catalog(),before=JSON.stringify(c),queues=Object.keys(counts).map(recipientId=>cellReviewQueue(c,[],recipientId));
  for(const [index,recipientId]of Object.keys(counts).entries()){
    const queue=queues[index];
    assert.equal(queue.length,counts[recipientId]);
    assert.equal(queue[0].id,`${recipientId}.soma_identity`);
    assert.ok(queue.every(question=>question.recipientId===recipientId));
    assert.deepEqual(new Set(queue.map(question=>question.view)),new Set(['stems','branches']));
    assert.ok(queue.every(question=>c.focusedWorkflow.questions.includes(question)),'return canonical question objects');
  }
  const all=queues.flat(),allIds=ids(all),required=c.reviewScope.pools[0].questions.filter(question=>['required','qualification'].includes(question.priority)).map(question=>question.id??question.questionId);
  assert.equal(all.length,45);assert.equal(new Set(allIds).size,45);
  assert.deepEqual([...allIds].sort(),required.sort());
  assert.deepEqual(Object.fromEntries([...new Set(all.map(question=>question.kind))].map(kind=>[kind,all.filter(question=>question.kind===kind).length])),{
    identity:4,origin_route:23,compartment_cut:2,targeted_boundary_or_damage:7,branch_relation:9,
  });
  assert.equal(c.reviewScope.pools[0].contacts.length,634);
  assert.ok(c.reviewScope.pools[0].questions.filter(question=>['excluded','deferred'].includes(question.priority)).every(question=>!allIds.includes(question.id??question.questionId)));
  assert.deepEqual(cellReviewQueue(c,[],'missing'),[]);assert.deepEqual(cellReviewQueue(c,[],''),[]);
  assert.equal(JSON.stringify(c),before);
});

test('queue ordering stays canonical and crosses the stems-to-branches boundary independently of advanced filters',()=>{
  const c=catalog();c.focusedWorkflow.questions.reverse();
  // Consumer preferences are intentionally outside the three-argument guided queue contract.
  const queue=cellReviewQueue(c,[],'MC298937',{viewId:'stems',search:'no match',includeOptional:true});
  assert.deepEqual(ids(queue),source.tasks.filter(item=>item.recipientId==='MC298937').map(item=>item.id));
  assert.equal(queue[4].id,'MC298937.origin4667_to_soma');assert.equal(queue[5].id,'MC298937.cut4475');
  assert.equal(queue[4].view,'stems');assert.equal(queue[5].view,'branches');
  assert.deepEqual(ids(cellReviewQueue(catalogContext(c),[],'MC298937')),ids(queue));
  assert.deepEqual(ids(cellReviewQueue(c,[],'MC264649')).slice(1,3),['MC264649.origin3362_to_soma','MC264649.origin3944_to_soma']);
});

test('recorded, resolved and unresolved counts remain distinct and navigation leaves every decision unchanged',()=>{
  const c=catalog(),recipientId='MC298937',queue=cellReviewQueue(c,[],recipientId),states=queue.slice(0,4).map(question=>task(question.id));
  const outcomes=['supported','contradicted','uncertain','insufficient_coverage'];
  states.forEach((state,index)=>setQuestionDecision(state,c,state.id,{outcome:outcomes[index],note:`Independent observation ${index}`}));
  const before=structuredClone(states),summary=cellReviewSummary(c,states,recipientId);
  assert.deepEqual(summary,{total:7,recorded:4,resolved:2,unresolved:5,unreviewed:3,questionIds:ids(queue),unresolvedIds:ids(queue).slice(2)});
  assert.equal(chooseCellCase(queue,queue[2].id,queue[0].id),queue[2].id);
  assert.equal(chooseCellCase(queue,'missing',queue[3].id),queue[3].id);
  assert.equal(chooseCellCase(queue,'MC264824.soma_identity','missing'),queue[0].id);
  assert.equal(chooseCellCase([],'missing',queue[0].id),null);
  assert.deepEqual(cellReviewSummary(c,new Map(states.map(state=>[state.id,state])),recipientId),summary);
  assert.deepEqual(cellReviewSummary(c,Object.fromEntries(states.map(state=>[state.id,state])),recipientId),summary);
  assert.deepEqual(states,before);
  assert.deepEqual(cellReviewSummary(c,states,'missing'),{total:0,recorded:0,resolved:0,unresolved:0,unreviewed:0,questionIds:[],unresolvedIds:[]});
});

test('expert relevance overrides change membership and denominator only within the explicit active pool',()=>{
  const c=catalog(),excluded=task('MC264649.origin3639_to_soma'),qualification=task('MC264649.boundary_excluded3639'),states=[excluded,qualification];
  setScopeRelevance(excluded,c,excluded.id,{relevant:true,reason:'Synthetic review: observed route affects a retained branch'});
  setQuestionDecision(excluded,c,excluded.id,{outcome:'uncertain'});
  let summary=cellReviewSummary(c,states,'MC264649');
  assert.equal(summary.total,11);assert.equal(summary.recorded,1);assert.equal(summary.resolved,0);assert.equal(summary.unresolved,11);
  assert.equal(ids(cellReviewQueue(c,states,'MC264649'))[2],excluded.id);
  setScopeRelevance(qualification,c,qualification.id,{relevant:false,reason:'Synthetic review: no relevance to retained routes'});
  summary=cellReviewSummary(c,states,'MC264649');assert.equal(summary.total,10);assert.ok(!summary.questionIds.includes(qualification.id));
  c.activeReviewPoolId=broader;
  summary=cellReviewSummary(c,states,'MC264649');assert.equal(summary.total,10);assert.equal(summary.recorded,0);
  assert.ok(!summary.questionIds.includes(excluded.id));assert.ok(summary.questionIds.includes(qualification.id));
  c.activeReviewPoolId=primary;
  assert.equal(cellReviewSummary(c,states,'MC264649').recorded,1);
});

test('active pool history controls queue progress while answers and notes in the other pool stay intact',()=>{
  const c=catalog(),state=task('MC298937.soma_identity');
  setQuestionDecision(state,c,state.id,{outcome:'supported',note:'Primary observation'});
  c.activeReviewPoolId=broader;
  assert.equal(cellReviewSummary(c,[state],'MC298937').recorded,0);
  setQuestionDecision(state,c,state.id,{outcome:'uncertain',note:'Broader uncertainty'});
  const before=structuredClone(state);
  assert.equal(cellReviewSummary(c,[state],'MC298937').resolved,0);
  c.activeReviewPoolId=primary;
  assert.equal(cellReviewSummary(c,[state],'MC298937').resolved,1);
  assert.deepEqual(state,before);
});

test('retained-cut cases stay unresolved until both exact child fields exist; optional sibling answers cannot resolve them',()=>{
  for(const {recipientId,cut,child,sibling}of [
    {recipientId:'MC298937',cut:'4475',child:'4661',sibling:'4315'},
    {recipientId:'MC264824',cut:'869',child:'837',sibling:'870'},
  ]){
    const c=catalog(),state=task(`${recipientId}.cut${cut}`);
    setQuestionDecision(state,c,state.id,{outcome:'supported',fieldAnswers:{[`child_${sibling}_attachment`]:'contradicted'}});
    let summary=cellReviewSummary(c,[state],recipientId);
    assert.equal(summary.recorded,0);assert.equal(summary.resolved,0);assert.ok(summary.unresolvedIds.includes(state.id));
    setQuestionDecision(state,c,state.id,{fieldAnswers:{[`child_${child}_attachment`]:'obscured'}});
    assert.equal(cellReviewSummary(c,[state],recipientId).resolved,0);
    setQuestionDecision(state,c,state.id,{fieldAnswers:{[`child_${child}_compartment`]:'dendritic child'}});
    summary=cellReviewSummary(c,[state],recipientId);
    assert.equal(summary.recorded,1);assert.equal(summary.resolved,1);assert.ok(!summary.unresolvedIds.includes(state.id));
    assert.equal(summary.total,counts[recipientId]);
  }
});
