import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTask,mergeTask,validateTask} from '../core/model.js';
import {setQuestionDecision} from '../core/focused-review.js';
import {createAnnotationExport,createExport,parseImport} from '../core/exchange.js';
import {readZip,createZip} from '../core/zip.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const catalogData=read('data/catalog.json'),workflow=read('data/focused-workflow.json'),reviewScope=read('data/review-scope.json');
const routeId='MC298937.origin3447_to_soma',identityId='MC298937.soma_identity';
const time='2026-10-11T10:00:00.000Z';
function fixture(){
  const catalog={...structuredClone(catalogData),focusedWorkflow:structuredClone(workflow),reviewScope:structuredClone(reviewScope),activeReviewPoolId:'preferred14.clean_extended'};
  const view={centerNm:[752960,646592,858640],plane:'xy',spanNm:4096};
  const binding={catalogHash:catalog.catalogHash,sourceHash:catalog.sourceHash,coordinateConvention:'integer-sample'};
  const mark=id=>({id,kind:'point',category:'uncertain_continuation',label:id,note:'Local '+id,visible:true,pointsNm:[view.centerNm],plane:'xy',sourceBinding:binding,createdAt:time,updatedAt:time});
  const segment=id=>({id,source:'seg_m1300',label:'Segment '+id,note:'Local '+id});
  const identity=createTask(identityId,view),route=createTask(routeId,view);
  identity.marks=['linked-mark','unlinked-mark'].map(mark);
  identity.segments=['123','456'].map(segment);
  identity.selections=['linked-selection','unlinked-selection'].map((id,index)=>({id,label:id,note:'Local '+id,markIds:[identity.marks[index].id],segments:[identity.segments[index]],view,visible:true,sourceBinding:binding,createdAt:time,updatedAt:time}));
  setQuestionDecision(identity,catalog,identityId,{outcome:'uncertain',note:'Exact identity note',markIds:['linked-mark'],selectionIds:['linked-selection'],segments:[identity.segments[0]]});
  setQuestionDecision(route,catalog,routeId,{outcome:'uncertain',note:'Route evidence'});
  const incoming=structuredClone(identity);
  incoming.marks[0].note='Imported linked mark';incoming.selections[0].note='Imported linked selection';incoming.segments[0].note='Imported linked segment';
  validateTask(incoming,catalog);
  return {catalog,identity,route,incoming,mark,segment};
}
async function exported(format,catalog,tasks,options){return format==='zip'?await createExport(catalog,tasks,options):createAnnotationExport(catalog,tasks,options);}
async function withoutCompleteness(format,result){
  if(format==='json'){
    const payload=JSON.parse(await result.blob.text());delete payload.taskCompleteness;delete payload.currentTaskId;
    return new Blob([JSON.stringify(payload)]);
  }
  const files=await readZip(result.blob),manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
  delete manifest.taskCompleteness;delete manifest.currentTaskId;
  files.set('manifest.json',new TextEncoder().encode(JSON.stringify(manifest)));
  return createZip([...files].map(([path,data])=>({path,data})));
}
function replaceFrom(parsed,local){const incoming=parsed.tasks.find(task=>task.id===local.id);return mergeTask(local,incoming,{policy:'replace',partial:parsed.taskPartial[local.id]});}
function assertOverlay(parsed,fixture){
  const {catalog,identity,incoming}=fixture,subset=parsed.tasks.find(task=>task.id===identityId);
  assert.equal(parsed.taskPartial[identityId],true);
  assert.deepEqual(subset.marks.map(mark=>mark.id),['linked-mark']);
  assert.deepEqual(subset.selections.map(item=>item.id),['linked-selection']);
  assert.deepEqual(subset.segments.map(item=>item.id),['123']);
  const replaced=replaceFrom(parsed,identity);
  for(const field of ['marks','selections','segments']){
    assert.equal(replaced[field].length,2);
    assert.deepEqual(replaced[field][0],incoming[field][0]);
    assert.deepEqual(replaced[field][1],identity[field][1]);
  }
  assert.deepEqual(replaced.review,identity.review);
  assert.doesNotThrow(()=>validateTask(replaced,catalog));
  assert.deepEqual(mergeTask(identity,subset,{partial:true}),identity);
  assert.deepEqual(mergeTask(identity,subset,{policy:'merge',partial:true}),identity);
}

for(const format of ['json','zip'])for(const scope of ['current','selected']){
  test(`${format} ${scope}: partial dependency Replace preserves unrelated marks, selections and segments`,async()=>{
    const data=fixture(),options=scope==='current'?{scope,taskId:routeId}:{scope,selectedIds:['question:'+routeId]};
    const result=await exported(format,data.catalog,[data.route,data.incoming],options),parsed=await parseImport(result.blob,data.catalog);
    assertOverlay(parsed,data);
    assert.equal(parsed.taskPartial[routeId],scope==='selected');
    assert.equal(result.manifest.taskCompleteness[identityId],'partial');
    assert.equal(result.manifest.taskCompleteness[routeId],scope==='current'?'full':'partial');
    assert.equal(parsed.state.catalogHash,data.catalog.catalogHash);assert.equal(parsed.state.sourceHash,data.catalog.sourceHash);
    assert.equal(parsed.tasks.find(task=>task.id===routeId).review.decisions[0].scopeBinding.poolId,data.catalog.activeReviewPoolId);
  });
  test(`${format} legacy ${scope}: old packages infer dependency overlays without erasing unrelated work`,async()=>{
    const data=fixture(),options=scope==='current'?{scope,taskId:routeId}:{scope,selectedIds:['question:'+routeId]};
    const result=await exported(format,data.catalog,[data.route,data.incoming],options),parsed=await parseImport(await withoutCompleteness(format,result),data.catalog);
    assertOverlay(parsed,data);
    assert.equal(parsed.taskPartial[routeId],scope==='selected');
  });
}

for(const format of ['json','zip'])for(const scope of ['current','selected','all']){
  test(`${format} ${scope}: explicitly exported full tasks retain intentional whole-task Replace`,async()=>{
    const data=fixture(),local=structuredClone(data.route);local.marks.push(data.mark('local-only'));
    const options={scope,taskId:routeId,selectedIds:scope==='selected'?[routeId]:[]};
    const result=await exported(format,data.catalog,[data.route,data.incoming],options),parsed=await parseImport(result.blob,data.catalog);
    assert.equal(parsed.taskPartial[routeId],false);
    assert.deepEqual(replaceFrom(parsed,local).marks,[]);
    assert.equal(parsed.taskPartial[identityId],scope!=='all');
  });
}

test('legacy current packages with ambiguous owners remain overlays; one explicit owner remains full',async()=>{
  const catalog={catalogHash:'a'.repeat(64),sourceHash:'b'.repeat(64),tasks:[{id:'one'},{id:'two'}],focusedWorkflow:{workflowHash:'c'.repeat(64),groups:[],questions:[{id:'one',ownerTaskId:'one',dependencyQuestionIds:['two']},{id:'two',ownerTaskId:'two',dependencyQuestionIds:['one']}]}};
  const tasks=[createTask('one'),createTask('two')],result=createAnnotationExport(catalog,tasks,{scope:'current',taskId:'one'});
  const parsed=await parseImport(await withoutCompleteness('json',result),catalog);
  assert.deepEqual(parsed.taskPartial,{one:true,two:true});
  const exact=await parseImport(result.blob,catalog);assert.deepEqual(exact.taskPartial,{one:false,two:true});
});

test('inconsistent per-task completeness is rejected before changes can be applied',async()=>{
  const data=fixture(),result=createAnnotationExport(data.catalog,[data.route,data.incoming],{scope:'current',taskId:routeId});
  for(const corrupt of [payload=>payload.taskCompleteness[identityId]='full',payload=>delete payload.taskCompleteness[identityId],payload=>payload.taskCompleteness.extra='partial',payload=>delete payload.currentTaskId]){
    const payload=JSON.parse(await result.blob.text());corrupt(payload);
    await assert.rejects(parseImport(new Blob([JSON.stringify(payload)]),data.catalog),{code:'TASK_COMPLETENESS'});
  }
});
