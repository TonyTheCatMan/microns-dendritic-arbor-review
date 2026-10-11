import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTask} from '../core/model.js';
import {reviewScopeBinding,setScopeRelevance} from '../core/review-scope.js';
import {navigationQuestions,navigationSummary,navigationState,contactScopeStatus,savedContactQueue} from '../core/review-navigation.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const source=read('data/catalog.json'),workflow=read('data/focused-workflow.json'),scope=read('data/review-scope.json');
const primary='preferred14.clean_extended',broader='all_export19.clean_extended',excluded='MC264649.origin3639_to_soma',deferred='MC264824.cut2638';
const fixture=()=>({...structuredClone(source),focusedWorkflow:structuredClone(workflow),reviewScope:structuredClone(scope),activeReviewPoolId:primary});
const ids=list=>list.map(q=>q.id);
const savedContact=(c,contact,note='Saved inspection')=>({id:`contact:${contact.id}`,contactId:contact.id,recipientId:contact.recipientId,contact:structuredClone(contact),scopeBinding:reviewScopeBinding(c),note,outcome:'uncertain'});
const owner=(contact,record)=>({id:`${contact.recipientId}.soma_identity`,review:{contacts:[record]}});

test('ordinary traversal skips excluded origin 3639 in both directions and retains its explicit optional entry',()=>{
  const c=fixture(),options={cellId:'MC264649',viewId:'stems'};
  const after=navigationState(c,[],options,'MC264649.origin3362_to_soma');
  assert.equal(after.next.id,'MC264649.origin3944_to_soma');
  assert.equal(navigationState(c,[],options,after.next.id).previous.id,'MC264649.origin3362_to_soma');
  assert.ok(!ids(after.questions).includes(excluded));
  const optional=navigationState(c,[],{...options,includeOptional:true},'MC264649.origin3362_to_soma');
  assert.equal(optional.next.id,excluded);assert.equal(navigationState(c,[],{...options,includeOptional:true},excluded).previous.id,'MC264649.origin3362_to_soma');
  assert.equal(navigationState(c,[],options,after.questions[0].id).previous,null);
  assert.equal(navigationState(c,[],options,after.questions.at(-1).id).next,null);
});

test('scope-aware counters distinguish dependencies, qualifications and preserved optional context without changing source records',()=>{
  const c=fixture(),before=JSON.stringify(c);
  assert.deepEqual(navigationSummary(c,[]),{priority:38,qualification:7,restored:0,applicable:45,optional:5,archive:50,total:45});
  assert.equal(navigationSummary(c,[],{includeOptional:true}).total,50);
  assert.equal(navigationQuestions(c,[],{viewId:'stems'}).length,27);assert.equal(navigationQuestions(c,[],{viewId:'branches'}).length,18);
  assert.deepEqual(navigationQuestions(c,[],{viewId:'contacts'}),[]);
  assert.equal(navigationQuestions(c,[],{viewId:'all'}).length,45);
  assert.ok(ids(navigationQuestions(c,[])).includes('MC264649.boundary_excluded3639'),'real anatomical qualifications remain applicable');
  c.activeReviewPoolId=broader;assert.equal(navigationQuestions(c,[]).length,45);c.activeReviewPoolId=primary;
  assert.equal(JSON.stringify(c),before);
});

test('every navigation entry uses the same cell, view, search and language filters in original catalog order',()=>{
  const c=fixture();c.focusedWorkflow.questions.reverse();
  const options={cellId:'MC264649',viewId:'stems'},visible=navigationQuestions(c,[],options);
  assert.deepEqual(ids(visible),source.tasks.filter(t=>t.recipientId==='MC264649'&&workflow.questions.find(q=>q.id===t.id).view==='stems'&&t.id!==excluded).map(t=>t.id));
  assert.equal(visible.length,6);assert.equal(navigationSummary(c,[],options).archive,7);
  assert.deepEqual(ids(navigationQuestions(c,[],{...options,search:'3362'})),['MC264649.origin3362_to_soma']);
  assert.equal(navigationQuestions(c,[],{...options,search:'Идентичность сомы',language:'ru'}).length,1);
  assert.equal(navigationQuestions(c,[],{...options,search:'Soma identity',language:'en'}).length,1);
  assert.equal(navigationQuestions(c,[],{...options,search:'Soma identity',language:'ru'}).length,0);
  assert.equal(navigationQuestions(c,[],{cellId:'missing'}).length,0);
});

test('resuming excluded saved work never makes it a required task or loses its position, notes and draft',()=>{
  const c=fixture(),task=createTask(excluded);task.view={centerNm:[1,2,3],plane:'xy',spanNm:12288};task.marks=[{id:'trace',draft:true,pointsNm:[[1,2,3]]}];task.note='Existing note';
  const before=structuredClone(task),state=navigationState(c,[task],{cellId:'MC264649',viewId:'stems'},task.id);
  assert.equal(state.index,-1);assert.equal(state.current,null);assert.equal(state.previous,null);assert.equal(state.next.id,'MC264649.soma_identity');
  assert.deepEqual(task,before);assert.equal(navigationState(c,[task],{includeOptional:true},task.id).current.id,excluded);
});

test('expert relevance changes update visible lists and denominators only in the explicitly selected pool',()=>{
  const c=fixture(),tasks=[createTask(excluded),createTask(deferred),createTask('MC264649.boundary_excluded3639')],before=JSON.stringify(c);
  setScopeRelevance(tasks[0],c,excluded,{relevant:true,reason:'Observed continuity may affect a retained path'});
  setScopeRelevance(tasks[1],c,deferred,{relevant:true,reason:'Observed continuation changes a terminal claim'});
  assert.equal(navigationQuestions(c,tasks).length,47);assert.equal(navigationSummary(c,tasks).restored,2);assert.equal(navigationSummary(c,tasks).optional,3);
  assert.equal(navigationState(c,tasks,{cellId:'MC264649',viewId:'stems'},'MC264649.origin3362_to_soma').next.id,excluded);
  setScopeRelevance(tasks[2],c,tasks[2].id,{relevant:false,reason:'Recorded membrane concern does not affect retained paths'});
  assert.equal(navigationSummary(c,tasks).qualification,6);assert.equal(navigationSummary(c,tasks).total,46);
  c.activeReviewPoolId=broader;assert.equal(navigationSummary(c,tasks).total,45);assert.equal(navigationSummary(c,tasks).restored,0);
  c.activeReviewPoolId=primary;assert.equal(navigationSummary(c,tasks).total,46);assert.equal(JSON.stringify(c),before);
});

test('contact membership is exact by recipient and preserves raw exclusions separately from outside-pool contacts',()=>{
  const c=fixture(),pool=c.reviewScope.pools[0],retained=pool.contacts[0],excludedRow=pool.recipients.find(r=>r.excludedContactIds.length),broaderOnly=c.reviewScope.pools[1].contacts.find(row=>!pool.contacts.some(c=>c.id===row.id&&c.recipientId===row.recipientId));
  assert.equal(contactScopeStatus(c,retained.recipientId,retained.id),'included');
  assert.equal(contactScopeStatus(c,'wrong-recipient',retained.id),'outside');
  assert.equal(contactScopeStatus(c,excludedRow.id,excludedRow.excludedContactIds[0]),'excluded');
  assert.equal(contactScopeStatus(c,broaderOnly.recipientId,broaderOnly.id),'outside');
  c.activeReviewPoolId=broader;assert.equal(contactScopeStatus(c,broaderOnly.recipientId,broaderOnly.id),'included');
});

test('broader-only, unbound and excluded saved contacts remain optional history when primary is active',()=>{
  const c=fixture(),pool=c.reviewScope.pools[0],retained=pool.contacts[0],broaderOnly=c.reviewScope.pools[1].contacts.find(row=>!pool.contacts.some(c=>c.id===row.id&&c.recipientId===row.recipientId));
  const excludedRow=pool.recipients.find(r=>r.excludedContactIds.length),rawExcluded={id:excludedRow.excludedContactIds[0],recipientId:excludedRow.id};
  const primaryRecord=savedContact(c,retained),excludedRecord=savedContact(c,rawExcluded);c.activeReviewPoolId=broader;
  const broaderRecord=savedContact(c,broaderOnly),unbound=savedContact(c,pool.contacts[1]);delete unbound.scopeBinding;c.activeReviewPoolId=primary;
  const tasks=[owner(retained,primaryRecord),owner(broaderOnly,broaderRecord),owner(rawExcluded,excludedRecord),owner(pool.contacts[1],unbound)],before=structuredClone(tasks);
  assert.deepEqual(savedContactQueue(c,tasks).map(r=>r.id),[retained.id]);
  const optional=savedContactQueue(c,tasks,{includeOptional:true});assert.equal(optional.length,4);
  assert.equal(optional.find(r=>r.id===broaderOnly.id).scopeStatus,'other_pool');assert.equal(optional.find(r=>r.id===broaderOnly.id).membership,'outside');
  assert.equal(optional.find(r=>r.id===unbound.contactId).scopeStatus,'unbound');
  assert.equal(optional.find(r=>r.id===rawExcluded.id).membership,'excluded');
  assert.deepEqual(tasks,before);c.activeReviewPoolId=broader;
  assert.deepEqual(savedContactQueue(c,tasks).map(r=>r.id),[broaderOnly.id]);
});

test('active history participates in the saved contact queue while other-pool current notes remain unchanged',()=>{
  const c=fixture(),contact=c.reviewScope.pools[0].contacts[0],primaryRecord=savedContact(c,contact,'Primary history');
  c.activeReviewPoolId=broader;const broaderRecord=savedContact(c,contact,'Broader current');broaderRecord.scopeHistory=[primaryRecord];c.activeReviewPoolId=primary;
  const tasks=new Map([['owner',owner(contact,broaderRecord)]]),before=structuredClone(tasks),queue=savedContactQueue(c,tasks);
  assert.equal(queue.length,1);assert.equal(queue[0].record.note,'Primary history');assert.equal(queue[0].scopeStatus,'current');
  assert.equal(savedContactQueue(c,tasks,{cellId:'different-cell'}).length,0);assert.deepEqual(tasks,before);
  assert.equal(savedContactQueue(c,[...tasks.values(),...tasks.values()],{includeOptional:true}).length,1);
});
