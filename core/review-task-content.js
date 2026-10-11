/** Derived reviewer wording and source bookmarks; the canonical material records stay unchanged. */
import {activeReviewScope} from './review-scope.js';

const copy=value=>structuredClone(value);
const text=(ru,en)=>({ru,en});
const bilingual=value=>typeof value==='string'?text(value,value):copy(value??text('',''));
const unique=values=>[...new Set(values)];
const childField=key=>/^child_(.+)_(?:compartment|attachment)$/.exec(key)?.[1];

export function taskReviewContent(catalog,questionId){
  catalog=catalog.taskMap instanceof Map?catalog.catalog:catalog;
  const task=catalog.tasks.find(row=>row.id===questionId),question=catalog.focusedWorkflow.questions.find(row=>row.id===questionId);
  if(!task||!question)throw new Error('Unknown canonical review question: '+questionId);
  const pool=activeReviewScope(catalog)?.pool,scoped=pool?.questions.find(row=>row.id===questionId);
  const fields=task.fields??[],bookmarks=copy(question.bookmarks??task.navigationAnchors??[]);
  const reuse=bilingual(scoped?.reuse??text('Используйте сохранённые свидетельства общих маршрутов; каждый вопрос оценивается отдельно.','Reuse saved evidence of shared routes; judge each question separately.'));
  const result={questionId,kind:question.kind,title:bilingual(question.title),question:bilingual(question.question),inspect:bilingual(scoped?.inspect??question.detail),reuse,primaryBookmarks:bookmarks,optionalBookmarks:[],primaryFieldIds:fields.map(field=>field.key),optionalFieldIds:[],fieldLabels:Object.fromEntries(fields.map(field=>[field.key,bilingual(field.label)])),retainedChildIds:[],counts:{contacts:scoped?.contactIds.length??0,sources:scoped?.sourceRootIds.length??0}};

  if(question.kind==='branch_relation'){
    const origins=(question.originIds??[]).join(' / ');
    result.inspect=text(`Сначала рассмотрите уже сохранённые непрерывные маршруты начал ${origins} до проверенной сомы. Переиспользуйте эти свидетельства и прослеживайте только недостающие или неясные участки. По ним отдельно оцените указанное отношение: общую точку ветвления, окружённую плазматической мембраной, или отдельные входы в сому. Ответ о паре не устанавливает отношение тройки; сохраняйте противоречия, дополнительные связи и пробелы.`,`First review the saved continuous routes from origins ${origins} to the verified soma. Reuse this evidence and trace only missing or ambiguous intervals. Independently judge the nominated relationship: an enclosing plasma membrane around a shared branchpoint, or separate soma entries. A pair decision does not establish a triple relationship; retain contradictions, additional relationships and gaps.`);
    return result;
  }
  if(question.kind!=='compartment_cut')return result;

  const branches=pool?.cutBranches.filter(row=>row.questionId===questionId)??[];
  const cut=branches.find(row=>row.branchScope==='cut-node'),cutId=cut?.cutNode??cut?.branchNode;
  if(!cutId)return result;
  const children=branches.filter(row=>row.branchScope==='immediate-child-descendants');
  const retained=children.filter(row=>row.contactIds.length>0),retainedIds=new Set(retained.map(row=>String(row.branchNode)));
  result.retainedChildIds=[...retainedIds];
  result.primaryFieldIds=fields.filter(field=>!childField(field.key)||retainedIds.has(childField(field.key))).map(field=>field.key);
  result.optionalFieldIds=fields.filter(field=>childField(field.key)&&!retainedIds.has(childField(field.key))).map(field=>field.key);
  if(result.fieldLabels.compartment)result.fieldLabels.compartment=text(`Узел ${cutId}: локальный компартмент`,`Node ${cutId}: local compartment`);

  const cutBookmark=bookmarks.find(bookmark=>bookmark.id===`node-${cutId}`)??bookmarks.find(bookmark=>bookmark.id==='task-anchor');
  const parentId=cutBookmark?.sourceParentId;
  const primary=[];
  const append=(bookmark,branchId,role,label,membership)=>{if(bookmark)primary.push({...bookmark,branchId:String(branchId),role,label,...(membership?{membership}:{} )});};
  append(cutBookmark,cutId,'cut',text(`Узел ${cutId}: место проверки`,`Node ${cutId}: connection to inspect`));
  for(const child of retained){
    const membership={contacts:child.contactIds.length,sources:unique(child.sourceRootIds).length,rawContacts:child.rawTargetContactCount};
    append(bookmarks.find(bookmark=>bookmark.id===`node-${child.branchNode}`),child.branchNode,'retained-child',text(`Ветвь ${child.branchNode}: контакты ${membership.contacts}, источники ${membership.sources}`,`Child ${child.branchNode}: ${membership.contacts} contacts, ${membership.sources} sources`),membership);
  }
  if(parentId)append(bookmarks.find(bookmark=>bookmark.id===`node-${parentId}`),parentId,'parent',text(`Родительский узел ${parentId} по исходной аннотации`,`Parent node ${parentId} in the original annotation`));
  const primaryIds=new Set(primary.map(bookmark=>bookmark.id));
  result.primaryBookmarks=primary;
  result.optionalBookmarks=bookmarks.filter(bookmark=>!primaryIds.has(bookmark.id)).map(bookmark=>{
    const child=children.find(row=>bookmark.id===`node-${row.branchNode}`);
    if(!child)return {...bookmark,role:'source-context',label:text(`${bilingual(bookmark.label).ru} · исходный контекст`,`${bilingual(bookmark.label).en} · original context`)};
    const membership={contacts:child.contactIds.length,sources:unique(child.sourceRootIds).length,rawContacts:child.rawTargetContactCount};
    return {...bookmark,branchId:String(child.branchNode),role:'optional-child',membership,label:text(`Ветвь ${child.branchNode}: дополнительный контекст; включённых контактов ${membership.contacts}, исходных ${membership.rawContacts}`,`Child ${child.branchNode}: optional context; ${membership.contacts} included contacts, ${membership.rawContacts} raw contacts`)};
  });
  if(!retained.length)return result;

  const childNames=result.retainedChildIds.join(' / '),path=[parentId,cutId,childNames].filter(Boolean).join(' / ');
  result.title=text(`Узел ${cutId}, ветвь ${childNames}: прикрепление и компартмент`,`Node ${cutId}, child ${childNames}: attachment and compartment`);
  result.question=text(`Подтверждается ли соединение узла ${cutId} с дочерней ветвью ${childNames}, и каков её компартмент?`,`Does the evidence support the connection between node ${cutId} and child ${childNames}, and what is the child's compartment?`);
  result.inspect=text(`Проверьте путь ${path} по последовательным ЭМ-срезам. Раздельно запишите компартмент и наблюдение о прикреплении ветви ${childNames}. Этот вопрос касается точных сохранённых путей ${result.counts.contacts} контактов от ${result.counts.sources} источников. Другие дочерние ветви остаются отдельным дополнительным контекстом. Проверка общего постсинаптического участка не подтверждает каждый синапс или входящий аксон.`,`Inspect the path ${path} through serial EM sections. Record the compartment and attachment observation for child ${childNames} separately. This question concerns the exact saved paths of ${result.counts.contacts} contacts from ${result.counts.sources} sources. Other children remain separate optional context. Reviewing this shared postsynaptic interval does not certify each synapse or incoming axon.`);
  return result;
}
