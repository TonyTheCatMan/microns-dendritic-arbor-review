import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {taskReviewContent} from '../core/review-task-content.js';
import {navigationSummary} from '../core/review-navigation.js';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const catalog=read('data/catalog.json'),workflow=read('data/focused-workflow.json'),scope=read('data/review-scope.json');
const primary='preferred14.clean_extended',broader='all_export19.clean_extended';
const fixture=poolId=>({...structuredClone(catalog),focusedWorkflow:structuredClone(workflow),reviewScope:structuredClone(scope),activeReviewPoolId:poolId??primary});
const ids=bookmarks=>bookmarks.map(bookmark=>bookmark.id);

test('cut4475 foregrounds retained child4661 and binds original child fields, not excluded child4315',()=>{
  const c=fixture(),content=taskReviewContent(c,'MC298937.cut4475');
  assert.deepEqual(content.retainedChildIds,['4661']);assert.deepEqual(content.counts,{contacts:62,sources:48});
  assert.match(content.title.ru,/4475.*4661/);assert.match(content.question.en,/4475.*4661/);
  assert.deepEqual(ids(content.primaryBookmarks),['node-4475','node-4661','node-4476']);
  assert.deepEqual(content.primaryFieldIds,['compartment','child_4661_compartment','child_4661_attachment']);
  assert.deepEqual(content.optionalFieldIds,['child_4315_compartment','child_4315_attachment']);
  const sibling=content.optionalBookmarks.find(bookmark=>bookmark.id==='node-4315');
  assert.deepEqual(sibling.membership,{contacts:0,sources:0,rawContacts:13});assert.equal(sibling.role,'optional-child');
  assert.match(sibling.label.ru,/дополнительный контекст/);assert.match(sibling.label.en,/optional context/);
});

test('broader cut4475 changes exact membership counts without changing source bookmarks or canonical field IDs',()=>{
  const a=taskReviewContent(fixture(),'MC298937.cut4475'),b=taskReviewContent(fixture(broader),'MC298937.cut4475');
  assert.deepEqual(b.counts,{contacts:65,sources:50});assert.deepEqual(b.primaryFieldIds,a.primaryFieldIds);
  assert.deepEqual(b.primaryBookmarks.map(({id,nm})=>({id,nm})),a.primaryBookmarks.map(({id,nm})=>({id,nm})));
  assert.match(b.inspect.ru,/65.*50/);assert.match(b.inspect.en,/65.*50/);
});

test('cut869 foregrounds child837 and its existing parent898 while child870 stays separate context',()=>{
  for(const poolId of [primary,broader]){
    const content=taskReviewContent(fixture(poolId),'MC264824.cut869');
    assert.deepEqual(content.retainedChildIds,['837']);assert.deepEqual(content.counts,{contacts:1,sources:1});
    assert.deepEqual(ids(content.primaryBookmarks),['node-869','node-837','node-898']);
    assert.deepEqual(content.primaryFieldIds,['compartment','child_837_compartment','child_837_attachment']);
    assert.deepEqual(content.optionalFieldIds,['child_870_compartment','child_870_attachment']);
    assert.equal(content.optionalBookmarks.find(bookmark=>bookmark.id==='node-870').membership.contacts,0);
  }
});

test('zero-descendant cuts retain all original fields and bookmarks without inventing a required child',()=>{
  for(const id of ['MC264824.cut2638','MC264824.cut5297']){
    const c=fixture(),content=taskReviewContent(c,id),source=c.tasks.find(task=>task.id===id);
    assert.deepEqual(content.retainedChildIds,[]);assert.deepEqual(content.counts,{contacts:0,sources:0});
    assert.deepEqual(content.primaryFieldIds,['compartment']);
    assert.deepEqual([...content.primaryFieldIds,...content.optionalFieldIds].sort(),source.fields.map(field=>field.key).sort());
    assert.ok(content.primaryBookmarks.every(bookmark=>bookmark.role!=='retained-child'));
    assert.deepEqual([...content.primaryBookmarks,...content.optionalBookmarks].map(bookmark=>bookmark.id).sort(),source.navigationAnchors.map(bookmark=>bookmark.id).sort());
  }
});

test('all nine relation tasks lead with shared-route reuse and reserve new tracing for missing intervals',()=>{
  const c=fixture(),relations=c.focusedWorkflow.questions.filter(question=>question.kind==='branch_relation');assert.equal(relations.length,9);
  for(const q of relations){
    const content=taskReviewContent(c,q.id);
    assert.match(content.inspect.ru,/Сначала.*уже сохранённые непрерывные/);assert.match(content.inspect.ru,/только недостающие или неясные участки/);
    assert.match(content.inspect.en,/First review the saved continuous routes/);assert.match(content.inspect.en,/trace only missing or ambiguous intervals/);
    assert.match(content.inspect.en,/pair decision does not establish a triple/);
    for(const origin of q.originIds)assert.ok(content.inspect.ru.includes(origin)&&content.inspect.en.includes(origin));
    assert.deepEqual(content.question,q.question);assert.deepEqual(content.primaryBookmarks,q.bookmarks);
  }
});

test('all fifty presentations preserve every source bookmark, field and scientific binding without changing applicability',()=>{
  const c=fixture(),before=structuredClone(c),summary=navigationSummary(c,[]);
  for(const q of c.focusedWorkflow.questions){
    const content=taskReviewContent(c,q.id),original=c.tasks.find(task=>task.id===q.id),allBookmarks=[...content.primaryBookmarks,...content.optionalBookmarks];
    assert.deepEqual(ids(allBookmarks).sort(),ids(q.bookmarks).sort(),q.id);
    for(const bookmark of allBookmarks){const source=q.bookmarks.find(row=>row.id===bookmark.id);assert.deepEqual(bookmark.nm,source.nm);assert.equal(bookmark.sourceParentId,source.sourceParentId);}
    assert.deepEqual([...content.primaryFieldIds,...content.optionalFieldIds].sort(),original.fields.map(field=>field.key).sort(),q.id);
    for(const field of original.fields)assert.ok(content.fieldLabels[field.key].ru&&content.fieldLabels[field.key].en);
  }
  assert.deepEqual(c,before);assert.equal(summary.applicable,45);assert.deepEqual(navigationSummary(c,[]),summary);
});
