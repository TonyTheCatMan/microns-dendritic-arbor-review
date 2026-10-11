/** One scope-aware source for both familiar and focused navigation. No saved evidence is changed. */
import {activeReviewScope,recordScopeStatus,scopeQuestionStatus,scopedRecord} from './review-scope.js';

const rows=value=>value instanceof Map?[...value.values()]:Array.isArray(value)?value:Object.values(value??{});
const rawCatalog=catalog=>catalog.taskMap instanceof Map?catalog.catalog:catalog;
const local=(value,language)=>typeof value==='string'?value:value?.[language]??value?.ru??value?.en??'';

function candidates(catalog,{cellId='',viewId=null,search='',language='ru'}={}) {
  const source=rawCatalog(catalog),questions=new Map((source.focusedWorkflow?.questions??[]).map(q=>[q.id,q]));
  const query=String(search).trim().toLocaleLowerCase();
  // Keep the original catalog order, even if another consumer sorts the workflow array.
  return source.tasks.map(task=>questions.get(task.id)).filter(q=>q
    &&(!cellId||q.recipientId===cellId)
    &&(!viewId||viewId==='all'||q.view===viewId)
    &&(!query||`${q.id} ${local(q.title,language)} ${local(q.question,language)}`.toLocaleLowerCase().includes(query)));
}

export function navigationQuestions(catalog,tasks,options={}) {
  return candidates(catalog,options).filter(q=>options.includeOptional||scopeQuestionStatus(tasks,catalog,q.id).applicable);
}

/** These are question/dependency record counts, never counts of independent tracing jobs. */
export function navigationSummary(catalog,tasks,options={}) {
  const questions=candidates(catalog,options),summary={priority:0,qualification:0,restored:0,applicable:0,optional:0,archive:questions.length,total:0};
  for(const q of questions){
    const status=scopeQuestionStatus(tasks,catalog,q.id);
    if(!status.applicable){summary.optional++;continue;}
    summary.applicable++;
    if(status.priority==='required')summary.priority++;
    else if(status.priority==='qualification')summary.qualification++;
    else summary.restored++;
  }
  summary.total=options.includeOptional?summary.archive:summary.applicable;
  return summary;
}

/** An optional-context resume has no previous item; Next returns to the applicable queue. */
export function navigationState(catalog,tasks,options={},currentId=null) {
  const questions=navigationQuestions(catalog,tasks,options),index=questions.findIndex(q=>q.id===currentId);
  return {questions,index,total:questions.length,current:questions[index]??null,previous:index>0?questions[index-1]:null,next:questions[index+1]??null};
}

export function contactScopeStatus(catalog,recipientId,contactId) {
  const active=activeReviewScope(catalog);if(!active)return 'outside';
  const id=String(contactId);
  if(active.pool.contacts.some(c=>c.recipientId===recipientId&&c.id===id))return 'included';
  if(active.pool.recipients.find(r=>r.id===recipientId)?.excludedContactIds.includes(id))return 'excluded';
  return 'outside';
}

/** Default work contains only current-scope inspections of retained contacts. History stays available explicitly. */
export function savedContactQueue(catalog,tasks,{cellId='',includeOptional=false}={}) {
  const source=rawCatalog(catalog),owners=new Map(source.tasks.map(task=>[task.id,task.recipientId])),queue=new Map();
  for(const task of rows(tasks))for(const saved of task.review?.contacts??[]){
    const active=scopedRecord(saved,catalog),record=active??(includeOptional?saved:null);if(!record)continue;
    const recipientId=record.recipientId??record.contact?.recipientId??owners.get(task.id),id=record.contactId??record.contact?.id;
    if(!recipientId||!id||(cellId&&recipientId!==cellId))continue;
    const membership=contactScopeStatus(catalog,recipientId,id),scopeStatus=recordScopeStatus(record,catalog);
    if(!includeOptional&&(membership!=='included'||scopeStatus!=='current'))continue;
    const row={...record.contact,recipientId,id,contactId:id,record,ownerTaskId:task.id,scopeStatus,membership};
    const key=`${recipientId}:${id}`,previous=queue.get(key);
    if(!previous||(previous.scopeStatus!=='current'&&scopeStatus==='current'))queue.set(key,row);
  }
  return [...queue.values()];
}
