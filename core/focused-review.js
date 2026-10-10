/** Additive anatomy review records. Completion never certifies contacts or source axons. */
import {catalogContext, clone, invariant, newId, validateBinding, validatePoint, validateSegments, validateView, uint64String} from './model.js';

export const REVIEW_OUTCOMES = Object.freeze(['unreviewed','supported','contradicted','uncertain','insufficient_coverage']);
export const REVIEW_VIEWS = Object.freeze(['stems','branches','contacts']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value : Object.values(value ?? {});
const text = (value, label, max=1000000) => invariant(typeof value === 'string' && value.length <= max, 'REVIEW_FIELD', `Invalid ${label}`);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const sameIds = (a,b) => Array.isArray(a) && a.length === new Set(a).size && [...a].sort().join('\n') === [...b].sort().join('\n');
const dated = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const resolved = outcome => outcome === 'supported' || outcome === 'contradicted';
export function focusedContext(catalog) {
  const ctx = catalog.taskMap instanceof Map ? catalog : catalogContext(catalog), workflow = ctx.catalog.focusedWorkflow;
  invariant(plain(workflow) && /^[a-f0-9]{64}$/i.test(workflow.workflowHash ?? ''), 'WORKFLOW_MISSING', 'The exact focused workflow is required for these review records');
  const questions = list(workflow.questions), groups = list(workflow.groups);
  return {...ctx, workflow, workflowHash:workflow.workflowHash, questionMap:new Map(questions.map(q=>[q.id,q])), groupMap:new Map(groups.map(g=>[g.id,g]))};
}
export function ensureReview(task, catalog) {
  const ctx=focusedContext(catalog);
  if (!task.review) task.review={version:1,workflowHash:ctx.workflowHash,decisions:[],contacts:[],issues:[]};
  invariant(task.review.version===1,'WORKFLOW_VERSION','This review record needs an explicit migration');
  invariant(task.review.workflowHash===ctx.workflowHash,'WORKFLOW_MISMATCH','Focused workflow differs; automatic question remapping is prohibited');
  return task.review;
}
const binding = ctx => ({catalogHash:ctx.catalogHash,sourceHash:ctx.sourceHash,workflowHash:ctx.workflowHash,coordinateConvention:'integer-sample',...(ctx.workflow.materialization!==undefined?{materialization:ctx.workflow.materialization}:{}),...(ctx.catalog.sources?.em?.version?{emVersion:ctx.catalog.sources.em.version}:{}),...(ctx.catalog.sources?.segmentation?.version?{segmentationVersion:ctx.catalog.sources.segmentation.version}:{})});
const questionProvenance = question => Object.fromEntries(['materialization','originalQuestionRef','sourceRefs'].filter(key=>question[key]!==undefined).map(key=>[key,clone(question[key])]));
function newEvidence(ctx, id, task, previous={}) {
  const time=new Date().toISOString();
  return {id,outcome:'unreviewed',alternative:'',customAlternative:'',note:'',markIds:[],selectionIds:[],segments:clone(task.segments),view:clone(task.view),sourceBinding:binding(ctx),createdAt:time,...clone(previous),updatedAt:time};
}
/** The caller mutates only the canonical owner task; dependants read this one record. */
export function setQuestionDecision(task, catalog, questionId, patch={}) {
  const ctx=focusedContext(catalog), question=ctx.questionMap.get(questionId);
  invariant(question,'REVIEW_QUESTION','Unknown focused anatomical question');
  invariant(task.id===question.ownerTaskId,'REVIEW_OWNER','Shared decisions must be saved on their canonical owner task');
  const review=ensureReview(task,ctx), previous=review.decisions.find(item=>item.questionId===questionId);
  const item={...newEvidence(ctx,`question:${questionId}`,task,previous),...clone(patch),id:`question:${questionId}`,questionId,groupId:question.groupId,ownerTaskId:question.ownerTaskId,taskIds:clone(question.taskIds),provenance:{...clone(previous?.provenance??{}),...questionProvenance(question)}};
  const candidate={...review,decisions:[...review.decisions.filter(d=>d.questionId!==questionId),item]};
  validateFocusedReview(candidate,task,ctx); task.review=candidate; return item;
}
/** One stable owner prevents the same contact being separately copied into route tasks. */
export function contactOwnerTask(catalog,recipientId) {
  const ctx=catalog.taskMap instanceof Map?catalog:catalogContext(catalog),tasks=[...ctx.taskMap.values()].filter(t=>t.recipientId===recipientId);
  return (tasks.find(t=>t.id===`${recipientId}.soma_identity`)??tasks.find(t=>t.category==='identity'||t.sourceTaskType==='identity')??tasks[0])?.id??null;
}
/** Contact decisions are explicit individual review; they are never derived from route decisions. */
export function setContactDecision(task,catalog,contact,patch={}) {
  const ctx=focusedContext(catalog), review=ensureReview(task,ctx), id=contact.id ?? contact.contactId;
  const previous=review.contacts.find(item=>item.contactId===id), recipient=ctx.catalog.recipients?.find(r=>r.id===(contact.recipientId ?? ctx.taskMap.get(task.id).recipientId));
  const item={...newEvidence(ctx,`contact:${id}`,task,previous),...clone(patch),id:`contact:${id}`,contactId:id,ownerTaskId:task.id,
    sourceRootId:contact.sourceRootId,targetRootId:contact.targetRootId ?? recipient?.rootRelease661,recipientId:contact.recipientId ?? ctx.taskMap.get(task.id).recipientId,
    contact:clone(contact)};
  if(item.targetRootId===undefined) delete item.targetRootId;
  if(item.recipientId===undefined) delete item.recipientId;
  const candidate={...review,contacts:[...review.contacts.filter(d=>d.contactId!==id),item]};
  validateFocusedReview(candidate,task,ctx); task.review=candidate; return item;
}
export function addCoverageIssue(task,catalog,patch={}) {
  const ctx=focusedContext(catalog), review=ensureReview(task,ctx);
  const item={...newEvidence(ctx,newId(),task),kind:'coverage_request',ownerTaskId:task.id,status:'open',...clone(patch)};
  const candidate={...review,issues:[...review.issues,item]};
  validateFocusedReview(candidate,task,ctx);task.review=candidate;return item;
}
export function setReviewContext(task,catalog,context) {
  const review=ensureReview(task,catalog),candidate={...review,lastContext:clone(context)};
  validateFocusedReview(candidate,task,catalog);task.review=candidate;return candidate.lastContext;
}
function positionKey(context) {return context?.viewId==='contacts'&&context.contactId?`contact:${context.contactId}`:context?.questionId?`question:${context.questionId}`:null;}
/** Navigation positions are separate from observations and never create review outcomes. */
export function saveReviewPosition(task,catalog,context,view,segments=task.segments) {
  const key=positionKey(context);if(!key)return null;
  const review=ensureReview(task,catalog),previous=review.positions?.[key];
  if(previous&&same(previous.context,context)&&same(previous.view,view)&&same(previous.segments,segments))return clone(previous);
  const position={context:clone(context),view:clone(view),segments:clone(segments),updatedAt:new Date().toISOString()};
  const candidate={...review,positions:{...clone(review.positions??{}),[key]:position}};
  validateFocusedReview(candidate,task,catalog);task.review=candidate;return clone(position);
}
export function reviewPosition(task,context) {const value=task?.review?.positions?.[positionKey(context)];return value?clone(value):null;}
export function findQuestionDecision(tasks,questionId) {
  return list(tasks instanceof Map ? Object.fromEntries(tasks) : tasks).flatMap(t=>t.review?.decisions ?? []).find(d=>d.questionId===questionId) ?? null;
}
export function findContactDecision(tasks,contactId) {
  return list(tasks instanceof Map ? Object.fromEntries(tasks) : tasks).flatMap(t=>t.review?.contacts ?? []).find(d=>d.contactId===contactId) ?? null;
}
function counts(items) {const values=items.map(d=>d?.outcome ?? 'unreviewed');return {total:values.length,recorded:values.filter(v=>v!=='unreviewed').length,resolved:values.filter(resolved).length,unresolved:values.filter(v=>!resolved(v)).length,uncertain:values.filter(v=>v==='uncertain').length,insufficientCoverage:values.filter(v=>v==='insufficient_coverage').length,unreviewed:values.filter(v=>v==='unreviewed').length};}
export function reviewProgress(tasks,catalog) {
  const ctx=focusedContext(catalog), records=list(tasks instanceof Map ? Object.fromEntries(tasks) : tasks), decisions=new Map(records.flatMap(t=>t.review?.decisions ?? []).map(d=>[d.questionId,d]));
  const groups=[...ctx.groupMap.values()].map(g=>({id:g.id,...counts([...ctx.questionMap.values()].filter(q=>q.groupId===g.id).map(q=>decisions.get(q.id)))}));
  return {questions:counts([...ctx.questionMap.keys()].map(id=>decisions.get(id))),groups,contacts:counts(records.flatMap(t=>t.review?.contacts ?? [])),issues:records.flatMap(t=>t.review?.issues ?? []).filter(i=>i.status!=='resolved').length};
}
function validateEvidence(item,task,ctx) {
  text(item.id,'review item ID',300);text(item.note,'review note');
  invariant(REVIEW_OUTCOMES.includes(item.outcome),'REVIEW_OUTCOME','Invalid anatomical review outcome');
  text(item.alternative,'review alternative',10000);text(item.customAlternative,'custom alternative',10000);
  invariant(dated(item.createdAt)&&dated(item.updatedAt),'INVALID_TIME','Invalid review timestamp');
  invariant(Array.isArray(item.markIds)&&new Set(item.markIds).size===item.markIds.length&&item.markIds.every(id=>task.marks.some(m=>m.id===id)),'REVIEW_MARK_REFERENCE','Review record references a missing mark');
  invariant(Array.isArray(item.selectionIds)&&new Set(item.selectionIds).size===item.selectionIds.length&&item.selectionIds.every(id=>task.selections.some(s=>s.id===id)),'REVIEW_SELECTION_REFERENCE','Review record references a missing saved view');
  validateSegments(item.segments,ctx);validateView(item.view,ctx);validateReviewView(item.view);
  validateBinding(item.sourceBinding,ctx);
  invariant(item.sourceBinding.catalogHash===ctx.catalogHash&&item.sourceBinding.sourceHash===ctx.sourceHash&&item.sourceBinding.workflowHash===ctx.workflowHash,'REVIEW_BINDING','Review record must retain exact catalog, source and workflow hashes');
  if(ctx.workflow.materialization!==undefined)invariant(item.sourceBinding.materialization===ctx.workflow.materialization,'REVIEW_BINDING','Review materialization differs');
  invariant(item.sourceBinding.coordinateConvention==='integer-sample','COORDINATE_CONVENTION','Review evidence uses integer sampling without half-voxel shifts');
}
function validateReviewView(view) {
  for(const key of ['spanNm','zoom']) if(view[key]!==undefined) invariant(Number.isFinite(view[key])&&view[key]>0,'REVIEW_VIEW','Review view scale must be positive');
  if(view.surfaceCamera!==undefined){const c=view.surfaceCamera;invariant(plain(c),'REVIEW_VIEW','Invalid saved surface camera');for(const key of ['center_nm','originNm','right','up','eye_direction'])if(c[key]!==undefined)validatePoint(c[key]);for(const key of ['yaw','pitch','zoom','frame_height_nm','radius_nm'])if(c[key]!==undefined)invariant(Number.isFinite(c[key])&&(!['zoom','frame_height_nm','radius_nm'].includes(key)||c[key]>0),'REVIEW_VIEW','Invalid saved surface camera scale');}
  if(view.ngState!==undefined){invariant(plain(view.ngState),'REVIEW_VIEW','Invalid saved native view');if(view.ngState.position!==undefined)validatePoint(view.ngState.position);for(const key of ['projectionOrientation','crossSectionOrientation'])if(view.ngState[key]!==undefined)invariant(Array.isArray(view.ngState[key])&&view.ngState[key].length===4&&view.ngState[key].every(Number.isFinite)&&Math.hypot(...view.ngState[key])>0,'REVIEW_VIEW','Invalid native camera orientation');for(const k of ['projectionScale','crossSectionScale'])if(view.ngState[k]!==undefined)invariant(Number.isFinite(view.ngState[k])&&view.ngState[k]>0,'REVIEW_VIEW','Invalid native camera scale');}
}
function validateContact(item,task,ctx) {
  uint64String(item.contactId,'contact ID');uint64String(item.sourceRootId,'source root ID');
  if(item.targetRootId!==undefined)uint64String(item.targetRootId,'target root ID');
  invariant(item.id===`contact:${item.contactId}`&&item.ownerTaskId===task.id,'REVIEW_CONTACT_SCOPE','Contact review has an inconsistent identity or owner');
  invariant(task.id===contactOwnerTask(ctx,item.recipientId),'REVIEW_CONTACT_OWNER','Contact decisions must be stored once on the target identity task');
  const definition=ctx.taskMap.get(task.id),contact=item.contact;
  invariant(plain(contact)&&(contact.id ?? contact.contactId)===item.contactId&&contact.sourceRootId===item.sourceRootId,'REVIEW_CONTACT_BINDING','Contact review must preserve the original contact identity');
  if(definition.recipientId)invariant(item.recipientId===definition.recipientId,'CONTACT_RECIPIENT','Reviewed contact belongs to another target');
  const recipient=ctx.catalog.recipients?.find(r=>r.id===item.recipientId);
  if(recipient?.rootRelease661)invariant(item.targetRootId===recipient.rootRelease661,'REVIEW_CONTACT_BINDING','Contact target differs from the release661 recipient');
  for(const key of ['preNm','postNm','centerNm'])validatePoint(contact[key]);
  for(const key of ['preSupervoxelId','postSupervoxelId','postLevel2Id'])if(contact[key]!==undefined&&contact[key]!==null)uint64String(contact[key],key);
  for(const key of ['sourceLine','footprintLine'])if(contact[key]!==undefined)invariant(Number.isSafeInteger(contact[key])&&contact[key]>0,'CONTACT_POINTER','Contact source pointers must be positive integers');
  const original=ctx.catalog.focusedContacts?.get(`${item.recipientId}:${item.contactId}`);
  invariant(original,'CONTACT_SOURCE_REQUIRED','Load the exact-version contact source before restoring contact review');
  for(const key of ['id','sourceRootId','preNm','postNm','centerNm','preSupervoxelId','postSupervoxelId','postLevel2Id','domainId','eligibleDomainId','eligibility','sourceLine','footprintLine','coveringVolumeIds']) invariant(same(contact[key],original[key]),'REVIEW_CONTACT_BINDING',`Reviewed contact differs from its exact source field ${key}`);
  if(contact.recipientId!==undefined)invariant(contact.recipientId===item.recipientId,'CONTACT_RECIPIENT','Contact source target differs');
  if(contact.targetRootId!==undefined)invariant(contact.targetRootId===item.targetRootId,'REVIEW_CONTACT_BINDING','Contact target source differs');
}
export function validateFocusedReview(review,task,catalog) {
  const ctx=focusedContext(catalog);
  invariant(plain(review)&&review.version===1,'WORKFLOW_VERSION','This review record needs an explicit migration');
  invariant(review.workflowHash===ctx.workflowHash,'WORKFLOW_MISMATCH','Focused workflow hash differs; no automatic question remapping is allowed');
  for(const field of ['decisions','contacts','issues'])invariant(Array.isArray(review[field])&&review[field].length<=100000,'REVIEW_ITEMS','Invalid focused review lists');
  const ids=new Set();
  for(const item of [...review.decisions,...review.contacts,...review.issues]){invariant(plain(item),'REVIEW_ITEM','Invalid review item');validateEvidence(item,task,ctx);invariant(!ids.has(item.id),'DUPLICATE_REVIEW','Duplicate focused review record');ids.add(item.id);}
  for(const item of review.decisions){const q=ctx.questionMap.get(item.questionId);invariant(q&&item.id===`question:${q.id}`,'REVIEW_QUESTION','Unknown or inconsistent anatomical question');invariant(item.ownerTaskId===q.ownerTaskId&&task.id===q.ownerTaskId&&item.groupId===q.groupId&&sameIds(item.taskIds,q.taskIds),'REVIEW_SCOPE','Shared question scope differs from its exact catalog definition');for(const [key,value]of Object.entries(questionProvenance(q)))invariant(same(item.provenance?.[key],value),'REVIEW_PROVENANCE','Question evidence provenance differs from its frozen source');const options=q.alternatives ?? q.options;if(item.alternative&&Array.isArray(options)&&options.length)invariant(item.alternative==='other'||item.alternative==='custom'||options.some(o=>(typeof o==='string'?o:o.value ?? o.id)===item.alternative),'REVIEW_ALTERNATIVE','Unknown anatomical alternative');}
  for(const item of review.contacts)validateContact(item,task,ctx);
  for(const item of review.issues){invariant(item.ownerTaskId===task.id&&['open','resolved'].includes(item.status)&&item.kind==='coverage_request','REVIEW_ISSUE','Invalid coverage request');if(item.questionId){const q=ctx.questionMap.get(item.questionId);invariant(q&&q.taskIds.includes(task.id),'REVIEW_SCOPE','Coverage issue belongs to another question');}if(item.contactId)uint64String(item.contactId,'coverage contact ID');}
  if(review.positions!==undefined){
    invariant(plain(review.positions)&&Object.keys(review.positions).length<=100000,'REVIEW_POSITIONS','Invalid saved review positions');
    for(const [key,position] of Object.entries(review.positions)){
      invariant(plain(position)&&plain(position.context)&&positionKey(position.context)===key,'REVIEW_POSITION','Saved navigation position has an inconsistent scope');
      const context=position.context;invariant(REVIEW_VIEWS.includes(context.viewId),'REVIEW_CONTEXT','Unknown focused review view');
      if(context.viewId==='contacts'){
        uint64String(context.contactId,'saved position contact ID');const recipientId=ctx.taskMap.get(task.id).recipientId;
        invariant(task.id===contactOwnerTask(ctx,recipientId),'REVIEW_CONTACT_OWNER','Contact positions must be stored on their target identity task');
        invariant(ctx.catalog.focusedContacts?.has(`${recipientId}:${context.contactId}`),'CONTACT_SOURCE_REQUIRED','Load the exact-version contact source before restoring contact positions');
      }else{const q=ctx.questionMap.get(context.questionId);invariant(q&&q.ownerTaskId===task.id&&(!q.view||q.view===context.viewId)&&(!context.groupId||context.groupId===q.groupId),'REVIEW_SCOPE','Question position differs from its canonical owner or group');}
      validateView(position.view,ctx);validateReviewView(position.view);validateSegments(position.segments,ctx);
      if(position.updatedAt!==undefined)invariant(dated(position.updatedAt),'INVALID_TIME','Invalid position timestamp');
    }
  }
  if(review.lastContext!==undefined){const c=review.lastContext;invariant(plain(c)&&REVIEW_VIEWS.includes(c.viewId),'REVIEW_CONTEXT','Unknown focused review view');if(c.groupId!==undefined)invariant(ctx.groupMap.has(c.groupId),'REVIEW_CONTEXT','Unknown last decision group');if(c.questionId!==undefined){const q=ctx.questionMap.get(c.questionId);invariant(q&&q.taskIds.includes(task.id)&&(!c.groupId||q.groupId===c.groupId),'REVIEW_CONTEXT','Last question belongs to another task or group');}if(c.contactId!==undefined)uint64String(c.contactId,'last contact ID');}
  return review;
}
export function reviewConflictDetails(local,incoming) {
  const a=local?.review,b=incoming?.review;
  const items=[];
  for(const field of ['decisions','contacts','issues']){const previous=new Map((a?.[field]??[]).map(i=>[i.id,i]));for(const item of b?.[field]??[]){const old=previous.get(item.id);if(old&&!same(old,item))items.push({id:item.id,kind:field,questionId:item.questionId??null,contactId:item.contactId??null,localOutcome:old.outcome,incomingOutcome:item.outcome,defaultResolution:'keep'});}}
  return {reviewConflicts:items,workflowMismatch:!!(a&&b&&(a.version!==b.version||a.workflowHash!==b.workflowHash)),localWorkflowHash:a?.workflowHash??null,incomingWorkflowHash:b?.workflowHash??null};
}
/** Partial overlays preserve unrelated records and unknown fields; merge keeps colliding local IDs. */
export function mergeFocusedReview(local,incoming,{policy='keep'}={}) {
  if(!incoming)return clone(local);
  if(!local)return clone(incoming);
  if(policy==='keep')return clone(local);
  invariant(local.version===incoming.version&&local.workflowHash===incoming.workflowHash,'WORKFLOW_MISMATCH','Cannot combine different workflow definitions');
  const result={...clone(incoming),...clone(local)};
  for(const field of ['decisions','contacts','issues']){const map=new Map(local[field].map(i=>[i.id,clone(i)]));for(const item of incoming[field])if(policy==='replace'||!map.has(item.id))map.set(item.id,clone(item));result[field]=[...map.values()];}
  if(local.positions||incoming.positions){result.positions=clone(local.positions??{});for(const [id,position] of Object.entries(incoming.positions??{}))if(policy==='replace'||!Object.hasOwn(result.positions,id))result.positions[id]=clone(position);}
  if(policy==='replace'&&incoming.lastContext)result.lastContext=clone(incoming.lastContext);
  return result;
}
/** Select review items with their referenced annotations, without altering their decision scope. */
export function selectedReview(review,selectedIds) {
  if(!review)return undefined;const ids=selectedIds instanceof Set?selectedIds:new Set(selectedIds),result=clone(review);
  for(const field of ['decisions','contacts','issues'])result[field]=review[field].filter(i=>ids.has(i.id)||ids.has(i.questionId)||ids.has(i.contactId));
  if(review.positions)result.positions=Object.fromEntries(Object.entries(review.positions).filter(([key,p])=>ids.has(key)||ids.has(p.context.questionId)||ids.has(p.context.contactId)));
  return result;
}
export function hasReviewWork(review){return !!review&&(['decisions','contacts','issues'].some(f=>review[f]?.length)||!!review.lastContext||Object.keys(review.positions??{}).length>0);}

/** Load only the recipient contact files needed to validate existing explicit review. */
export async function ensureReviewContactSources(tasks,catalog) {
  const ctx=catalog.taskMap instanceof Map?catalog:catalogContext(catalog);
  const recipients=[...new Set(list(tasks).flatMap(t=>[...(t.review?.contacts??[]).map(c=>c.recipientId),...(Object.values(t.review?.positions??{}).some(p=>p.context?.viewId==='contacts')?[ctx.taskMap.get(t.id)?.recipientId]:[])]).filter(Boolean))];
  if(recipients.length && typeof catalog.ensureFocusedContacts==='function') await catalog.ensureFocusedContacts(recipients);
}
