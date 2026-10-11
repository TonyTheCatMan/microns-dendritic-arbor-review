/** Additive analysis-pool bindings. These records never alter the frozen study. */
import {clone,invariant} from './model.js';

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const rows=value=>value instanceof Map?[...value.values()]:Array.isArray(value)?value:Object.values(value??{});
const rawCatalog=value=>value.taskMap instanceof Map?value.catalog:value;
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

export function activeReviewScope(catalog,poolId) {
  catalog=rawCatalog(catalog);const scope=catalog.reviewScope;
  if(!scope)return null;
  invariant(scope.version===1&&/^[a-f0-9]{64}$/i.test(scope.scopeHash??''),'REVIEW_SCOPE_VERSION','An exact versioned analysis scope is required');
  invariant(scope.catalogHash===catalog.catalogHash&&scope.sourceHash===catalog.sourceHash&&scope.workflowHash===catalog.focusedWorkflow?.workflowHash,'REVIEW_SCOPE_BINDING','Analysis scope differs from the original material catalog');
  invariant(scope.materialization===661,'REVIEW_SCOPE_MATERIALIZATION','Analysis scope must retain original materialization 661');
  const id=poolId??catalog.activeReviewPoolId??scope.defaultPoolId,pool=scope.pools.find(item=>item.id===id);
  invariant(pool,'REVIEW_POOL','Unknown analysis pool');return {scope,pool,poolId:id};
}
export function reviewScopeBinding(catalog,poolId) {
  const active=activeReviewScope(catalog,poolId);if(!active)return undefined;
  const {scope,pool}=active;
  const hashes=Object.fromEntries(['policyHash','manifestHash','sourceInventoryHash','dependencySummaryHash'].filter(key=>scope.provenance?.[key]!==undefined).map(key=>[key,scope.provenance[key]]));
  return {version:1,scopeHash:scope.scopeHash,poolId:pool.id,materialization:scope.materialization,catalogHash:scope.catalogHash,sourceHash:scope.sourceHash,workflowHash:scope.workflowHash,policy:clone(pool.policy),restriction:clone(pool.restriction),...hashes};
}
export function validateScopeBinding(binding,catalog) {
  if(binding===undefined)return;
  invariant(plain(binding),'REVIEW_SCOPE_BINDING','Invalid analysis-scope binding');
  const expected=reviewScopeBinding(catalog,binding.poolId);
  invariant(expected,'REVIEW_SCOPE_MISSING','The saved analysis-scope manifest is required');
  for(const [key,value]of Object.entries(expected))invariant(same(binding[key],value),key==='scopeHash'?'REVIEW_SCOPE_HASH':'REVIEW_SCOPE_BINDING',`Saved analysis scope differs at ${key}`);
}
export function recordScopeStatus(record,catalog,poolId) {
  if(!record?.scopeBinding)return 'unbound';
  const current=reviewScopeBinding(catalog,poolId);if(!current)return 'other_pool';
  return same(record.scopeBinding,current)?'current':'other_pool';
}
/** Explicit editing is the only operation that can accept old evidence into a pool. */
export function bindScopeRecord(record,previous,catalog,patch={}) {
  const binding=reviewScopeBinding(catalog);if(!binding)return record;
  const history=clone(previous?.scopeHistory??[]);
  if(previous&&!same(previous.scopeBinding,binding)){
    const snapshot=clone(previous);delete snapshot.scopeHistory;
    if(!history.some(item=>same(item,snapshot)))history.push(snapshot);
  }
  const result={...record,scopeBinding:binding};
  if(previous&&!scopedRecord(previous,catalog)&&!Object.hasOwn(patch,'outcome'))result.outcome='unreviewed';
  if(history.length)result.scopeHistory=history;
  return result;
}
export function scopedRecord(record,catalog,poolId) {
  if(!record)return null;if(!activeReviewScope(catalog,poolId))return record;
  if(recordScopeStatus(record,catalog,poolId)==='current')return record;
  return [...(record.scopeHistory??[])].reverse().find(item=>recordScopeStatus(item,catalog,poolId)==='current')??null;
}
export function findScopedQuestionDecision(tasks,questionId,catalog,poolId) {
  const record=rows(tasks).flatMap(task=>task.review?.decisions??[]).find(item=>item.questionId===questionId);
  return scopedRecord(record,catalog,poolId);
}
export function findScopedContactDecision(tasks,contactId,catalog,poolId) {
  const record=rows(tasks).flatMap(task=>task.review?.contacts??[]).find(item=>item.contactId===contactId);
  return scopedRecord(record,catalog,poolId);
}
export function scopeQuestionStatus(tasks,catalog,questionId,poolId) {
  const active=activeReviewScope(catalog,poolId);if(!active)return {questionId,priority:'required',applicable:true,override:null};
  const question=active.pool.questions.find(q=>(q.id??q.questionId)===questionId);
  invariant(question,'REVIEW_SCOPE_QUESTION','Question is absent from the analysis scope');
  const override=rows(tasks).flatMap(task=>task.review?.scopeRelevance??[]).find(item=>item.questionId===questionId&&recordScopeStatus(item,catalog,active.poolId)==='current')??null;
  const priority=question.priority;
  return {questionId,priority,applicable:override?override.relevant:['required','qualification'].includes(priority),override,question};
}
export function setScopeRelevance(task,catalog,questionId,{relevant,reason}={}) {
  const active=activeReviewScope(catalog);invariant(active,'REVIEW_SCOPE_MISSING','Analysis-scope manifest is required');
  const original=rawCatalog(catalog).focusedWorkflow.questions.find(q=>q.id===questionId);
  invariant(original&&original.ownerTaskId===task.id,'REVIEW_OWNER','Relevance is recorded on the canonical question owner');
  invariant(typeof relevant==='boolean'&&typeof reason==='string'&&reason.trim().length>0&&reason.length<=1000000,'REVIEW_SCOPE_REASON','Record a reason for changing review relevance');
  invariant(active.pool.questions.some(q=>(q.id??q.questionId)===questionId),'REVIEW_SCOPE_QUESTION','Question is absent from analysis scope');
  if(!task.review)task.review={version:1,workflowHash:active.scope.workflowHash,decisions:[],contacts:[],issues:[]};
  invariant(task.review.version===1&&task.review.workflowHash===active.scope.workflowHash,'WORKFLOW_MISMATCH','Cannot change relevance across workflow versions');
  const id=`relevance:${active.poolId}:${questionId}`,previous=task.review.scopeRelevance?.find(item=>item.id===id);
  const item={...clone(previous??{}),id,questionId,ownerTaskId:task.id,relevant,reason,scopeBinding:reviewScopeBinding(catalog),updatedAt:new Date().toISOString()};
  task.review.scopeRelevance=[...(task.review.scopeRelevance??[]).filter(value=>value.id!==id),item];return item;
}
export function validateScopeRelevance(review,task,catalog) {
  if(review.scopeRelevance===undefined)return;
  invariant(Array.isArray(review.scopeRelevance)&&review.scopeRelevance.length<=100000,'REVIEW_SCOPE_RELEVANCE','Invalid scope relevance records');
  const ids=new Set();
  for(const item of review.scopeRelevance){
    validateScopeBinding(item.scopeBinding,catalog);invariant(item.scopeBinding,'REVIEW_SCOPE_BINDING','Relevance requires an explicit scope');
    const {pool}=activeReviewScope(catalog,item.scopeBinding.poolId),original=rawCatalog(catalog).focusedWorkflow.questions.find(q=>q.id===item.questionId);
    invariant(original&&original.ownerTaskId===task.id&&item.ownerTaskId===task.id&&pool.questions.some(q=>(q.id??q.questionId)===item.questionId),'REVIEW_OWNER','Relevance belongs to another question or owner');
    invariant(item.id===`relevance:${pool.id}:${item.questionId}`&&!ids.has(item.id),'REVIEW_SCOPE_RELEVANCE','Duplicate or inconsistent relevance identity');ids.add(item.id);
    invariant(typeof item.relevant==='boolean'&&typeof item.reason==='string'&&item.reason.trim().length>0&&Number.isFinite(Date.parse(item.updatedAt)),'REVIEW_SCOPE_REASON','Relevance requires a reason and timestamp');
  }
}
export function scopeSnapshot(catalog) {
  const active=activeReviewScope(catalog);return active?{...reviewScopeBinding(catalog),definition:clone(active.scope)}:undefined;
}
export function validateScopeSnapshot(snapshot,catalog) {
  if(snapshot===undefined)return;
  validateScopeBinding(snapshot,catalog);
  invariant(same(snapshot.definition,rawCatalog(catalog).reviewScope),'REVIEW_SCOPE_MANIFEST','Analysis-scope provenance or dependency manifest differs');
}
export function scopeImportCompatibility(tasks,catalog,snapshot) {
  const active=activeReviewScope(catalog),items=rows(tasks).flatMap(task=>[...(task.review?.decisions??[]),...(task.review?.contacts??[]),...(task.review?.issues??[]),...(task.review?.scopeRelevance??[])]);
  const poolIds=[...new Set([snapshot?.poolId,...items.map(item=>item.scopeBinding?.poolId)].filter(Boolean))];
  return {scopeMismatch:!!active&&poolIds.some(id=>id!==active.poolId),priorScope:items.some(item=>!item.scopeBinding)||(!snapshot&&!!active),poolIds,activePoolId:active?.poolId??null};
}
/** Preserve the replaced scope's record for explicit later reuse or reconciliation. */
export function mergeScopedRecord(local,incoming,{replace=false}={}) {
  if(!local)return clone(incoming);if(!incoming)return clone(local);
  const chosen=replace?incoming:local,other=replace?local:incoming,result={...clone(other),...clone(chosen)},history=clone(chosen.scopeHistory??[]);
  // Missing structured answers mean unanswered, never inheritance from another pool or a legacy record.
  if(!Object.hasOwn(chosen,'fieldAnswers'))delete result.fieldAnswers;
  if(!Object.hasOwn(chosen,'legacyInterpretation'))delete result.legacyInterpretation;
  const preserveGeneric=chosen.fieldAnswers!==undefined&&other.fieldAnswers===undefined;
  const additions=[...(!same(local.scopeBinding,incoming.scopeBinding)||preserveGeneric?[other]:[]),...(other.scopeHistory??[])];
  for(const value of additions){const snapshot=clone(value);delete snapshot.scopeHistory;if(!history.some(item=>same(item,snapshot)))history.push(snapshot);}
  if(history.length)result.scopeHistory=history;
  return result;
}
export function reviewEvidenceRecords(review) {
  return ['decisions','contacts','issues'].flatMap(field=>(review?.[field]??[]).flatMap(item=>[item,...(item.scopeHistory??[])].flatMap(record=>[record,...(record.legacyInterpretation?[record.legacyInterpretation]:[])])));
}
