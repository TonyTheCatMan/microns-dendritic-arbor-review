import {cellReviewQueue,cellReviewSummary,chooseCellCase} from '../core/guided-review.js';
import {caseGuidance} from '../core/case-guidance.js';
import {taskReviewContent} from '../core/review-task-content.js';
import {effectiveQuestionOutcome} from '../core/focused-review.js';
import {findScopedQuestionDecision} from '../core/review-scope.js';

const $=id=>document.getElementById(id),KEY='dendritic-arbor-v2-guided-queue';
const node=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){if(key==='text')n.textContent=value;else if(key==='class')n.className=value;else n.setAttribute(key,value);}n.append(...children.flat().filter(Boolean));return n;};
const load=()=>{try{const saved=JSON.parse(localStorage.getItem(KEY));return saved?.version===1&&saved.byPool? saved:{version:1,byPool:{}};}catch{return {version:1,byPool:{}};}};

/** A guided presentation of the existing question records; navigation never answers them. */
export function createGuidedWorkflow(catalog,host){
 const initialCell=new URL(location).searchParams.get('cell');
 let memory=load(),busy=false,atEnd=false,selectedCellId=null,queueSignature='',emptySelection=false;
 const L=(ru,en)=>host.language()==='en'?en:ru,loc=x=>x?.[host.language()]||x?.ru||x?.en||'';
 const pool=()=>catalog.activeReviewPoolId||catalog.reviewScope.defaultPoolId;
 const cell=()=>selectedCellId||host.current()?.recipientId||$('cellFilter').value||catalog.recipients[0].id;
 const queue=(id=cell())=>cellReviewQueue(catalog,host.states(),id);
 const remembered=id=>memory.byPool[pool()]?.[id];
 const write=()=>{try{localStorage.setItem(KEY,JSON.stringify(memory));}catch{/* Reviewer records use their existing durable store. */}};
 const remember=(id,questionId,end=false)=>{memory.lastCellId=id;(memory.byPool[pool()]??={})[id]={questionId,atEnd:end,questionIds:queue(id).map(q=>q.id)};write();};
 function state(){const rows=queue(),context=host.focused().context,currentId=host.current()?.id,index=rows.findIndex(q=>q.id===currentId),empty=!rows.length&&emptySelection,external=!empty&&(!context.questionId||context.viewId==='contacts'||context.viewId==='all'||index<0);return {cellId:cell(),currentId,index,total:rows.length,atEnd,busy,external,empty,summary:cellReviewSummary(catalog,host.states(),cell())};}
 const button=(id,action,cls='')=>{const b=node('button',{id,type:'button',class:cls});b.onclick=()=>run(action);return b;};
 async function run(action){if(busy)return;busy=true;render();try{await host.saveAll();await action();}catch(error){host.error(error);}finally{busy=false;render();}}
 async function openCase(id,{end=false}={}){atEnd=false;emptySelection=false;await host.focused().openQuestion(id);if(host.current()?.id!==id)throw Error(L('Случай не открыт. Текущая работа сохранена.','The case did not open. Current work was saved.'));const url=new URL(location);url.searchParams.set('task',id);url.searchParams.delete('cell');history.replaceState(null,'',url);$('cellFilter').value=host.current().recipientId;atEnd=end;remember(cell(),id,atEnd);render();}
 async function selectCell(id){if(!catalog.recipients.some(r=>r.id===id))return;const rows=queue(id),saved=remembered(id),idToOpen=chooseCellCase(rows,saved?.questionId,host.current()?.id);$('taskSearch').value='';$('reviewMaterials').checked=false;if(idToOpen)await openCase(idToOpen,{end:!!saved?.atEnd&&idToOpen===saved.questionId&&idToOpen===rows.at(-1)?.id&&JSON.stringify(saved.questionIds)===JSON.stringify(rows.map(q=>q.id))});else{selectedCellId=id;emptySelection=true;atEnd=true;remember(id,null,true);const url=new URL(location);url.searchParams.delete('task');url.searchParams.set('cell',id);history.replaceState(null,'',url);}}
 async function step(direction){const s=state();if(s.external){await selectCell(s.cellId);return;}if(atEnd){atEnd=false;remember(s.cellId,s.currentId,false);return;}const rows=queue(),destination=rows[s.index+direction];if(destination)await openCase(destination.id);else if(direction>0&&s.index===rows.length-1){atEnd=true;remember(s.cellId,s.currentId,true);}}
 async function unresolved(){const s=state(),ids=s.summary.unresolvedIds;if(!ids.length)return;const next=queue().find((q,i)=>i>s.index&&ids.includes(q.id))?.id||ids[0];await openCase(next);}
 function observe(context){if(!context.questionId&&!context.contactId)return;emptySelection=false;selectedCellId=host.current()?.recipientId;if(!context.questionId||context.viewId==='contacts')return;const rows=queue(),q=rows.find(q=>q.id===context.questionId);if(!q)return;const saved=remembered(q.recipientId);atEnd=!!saved?.atEnd&&saved.questionId===q.id&&rows.at(-1)?.id===q.id&&JSON.stringify(saved.questionIds)===JSON.stringify(rows.map(q=>q.id));remember(q.recipientId,q.id,atEnd);}

 document.documentElement.classList.add('guided-review');
 const sidebar=document.querySelector('.sidebar'),workspace=$('workspace'),oldCurrent=document.querySelector('.task-current');
 const advanced=node('details',{id:'advancedReview',class:'advanced-review'},node('summary',{id:'advancedReviewLabel'}),node('p',{id:'advancedReviewHint',class:'hint'}));
 const advancedBody=node('div',{class:'advanced-review-body'});advanced.append(advancedBody);
 // Move the original controls intact, keeping their event handlers and IDs.
 const cellField=$('cellFilter').closest('label');cellField.remove();
 advancedBody.append($('focusedViews'),...Array.from(sidebar.children));
 $('annotationsWorkspace').after(advanced);
 advancedBody.append(document.querySelector('.search-scope'),document.querySelector('.viewer-neuroglancer-actions'));
 // Image retry remains beside the image, including when advanced tools are closed.
 $('imageStatus').after($('retryImage'));advancedBody.append(document.querySelector('.loading-line'));
 const header=node('section',{id:'guidedReview',class:'guided-cell-bar','aria-label':'Cell review queue'},cellField,node('div',{class:'case-progress-block'},node('strong',{id:'casePosition','aria-live':'polite'}),node('p',{id:'caseProgress'})));
 const jump=node('details',{id:'caseJumpDetails'},node('summary',{id:'caseJumpLabel'}),node('label',{class:'field'},node('span',{id:'caseJumpHint'}),node('select',{id:'caseJump'})),button('caseUnresolved',unresolved));header.append(jump);
 document.querySelector('.annotation-savebar').before(header);
 const caseHeader=node('section',{id:'caseHeader',class:'case-header'},node('p',{id:'caseInstructionLabel',class:'eyebrow'}),node('strong',{id:'caseInstruction'}),node('ol',{id:'caseSteps'}),node('div',{id:'caseLocations'}));
 const details=node('details',{id:'caseDetails'},node('summary',{id:'caseDetailsLabel'}),oldCurrent);caseHeader.append(details);
 workspace.prepend(caseHeader);
 const answers=node('div',{class:'case-answer-scroll'},$('focusedDecisionPanel'));
 const nav=node('div',{id:'caseNavigation',class:'case-navigation'},node('p',{id:'caseSaveHint',class:'hint'}),button('casePrevious',()=>step(-1)),button('caseNext',()=>step(1),'primary'),button('returnCase',()=>selectCell(cell())));
 const end=node('section',{id:'caseEnd',class:'case-end',hidden:''},node('h2',{id:'caseEndTitle'}),node('p',{id:'caseEndSummary'}),button('endUnresolved',unresolved),button('nextCell',async()=>{const i=catalog.recipients.findIndex(r=>r.id===cell()),next=catalog.recipients[i+1];if(next)await selectCell(next.id);else{$('cellFilter').focus();$('cellFilter').scrollIntoView({block:'center'});}}),node('details',{},node('summary',{id:'caseEndListLabel'}),node('div',{id:'caseEndList'})));
 sidebar.append(nav,answers,end);
 const markOptions=node('details',{id:'markOptions'},node('summary',{id:'markOptionsLabel'}),document.querySelector('.markup-options'));
 markOptions.append($('downloadAnnotated'),$('markupExport'),$('markupImport'));document.querySelector('.annotation-toolbar').append(markOptions);
 // Secondary traversal stays with the secondary controls, not beside Next case.
 advancedBody.append($('prevUnresolved').parentElement);
 $('caseJump').onchange=()=>{const id=$('caseJump').value;run(()=>openCase(id));};
 $('cellFilter').onchange=()=>{const id=$('cellFilter').value;run(()=>selectCell(id));};

 function render(){
  if(!host.current())return;const rows=queue(),ids=rows.map(q=>q.id),signature=JSON.stringify([pool(),cell(),ids]);
  if(signature!==queueSignature){const saved=remembered(cell());atEnd=!rows.length||!!saved?.atEnd&&saved.questionId===host.current().id&&rows.at(-1)?.id===host.current().id&&JSON.stringify(saved.questionIds)===JSON.stringify(ids);queueSignature=signature;}
  const s=state();$('cellFilter').value=s.cellId;$('guidedReview').setAttribute('aria-label',L('Очередь проверки клетки','Cell review queue'));
  const label=$('cellFilter').closest('label').querySelector('span');label.removeAttribute('data-i18n');label.textContent=L('1. Выберите клетку','1. Select a cell');
  $('advancedReviewLabel').textContent=L('Дополнительно: поиск, контакты и область анализа','Advanced: search, contacts and analysis scope');
  $('advancedReviewHint').textContent=L('Для обычной проверки достаточно выбрать клетку и переходить к следующему случаю. Эти инструменты открывают отдельный контекст и сохранённые источники.','For normal review, select a cell and move to the next case. These tools open separate context and preserved sources.');
  $('casePosition').textContent=s.empty?L('Нет актуальных случаев','No applicable cases'):s.external?L('Дополнительный контекст','Additional context'):L(`Случай ${s.index+1} из ${s.total}`,`Case ${s.index+1} of ${s.total}`);
  const p=s.summary;$('caseProgress').textContent=L(`Итогов записано: ${p.recorded}/${p.total} · Определённых: ${p.resolved} · Без определённого ответа: ${p.unresolved}`,`Outcomes recorded: ${p.recorded}/${p.total} · Definite: ${p.resolved} · Unresolved: ${p.unresolved}`);
  $('caseJumpLabel').textContent=L('Перейти к случаю','Jump to a case');$('caseJumpHint').textContent=L('Все случаи этой клетки','All cases for this cell');
  const outcome=id=>effectiveQuestionOutcome(catalog,findScopedQuestionDecision(host.states(),id,catalog));
  const status=id=>({unreviewed:L('не проверено','unreviewed'),uncertain:L('неопределённо','uncertain'),insufficient_coverage:L('недостаточно изображений','insufficient coverage'),supported:L('подтверждается','supported'),contradicted:L('противоречит наблюдениям','contradicted')})[outcome(id)];
  $('caseJump').replaceChildren(...rows.map((q,i)=>node('option',{value:q.id,text:`${i+1}. ${loc(taskReviewContent(catalog,q.id).title)} · ${status(q.id)}`})));$('caseJump').value=s.external?'':s.currentId;
  $('caseUnresolved').textContent=$('endUnresolved').textContent=L(`Вернуться к нерешённым (${p.unresolved})`,`Return to unresolved (${p.unresolved})`);$('caseUnresolved').disabled=$('endUnresolved').disabled=busy||!p.unresolved;
  $('caseInstructionLabel').textContent=L('2. Что проверить в этом случае','2. What to check in this case');
  const guidance=s.empty?{instruction:{ru:'Для этой клетки нет актуальных случаев в выбранной области. Проверьте отложенные вопросы в дополнительных инструментах или выберите другую клетку.',en:'This cell has no applicable cases in the selected scope. Review deferred questions in the advanced tools or choose another cell.'},steps:[]}:s.external?{instruction:{ru:$('taskTitle').textContent,en:$('taskTitle').textContent},steps:[]}:caseGuidance(catalog,s.currentId);
  $('caseInstruction').textContent=loc(guidance.instruction);$('caseSteps').replaceChildren(...guidance.steps.map(text=>node('li',{text:loc(text)})));
  $('caseDetailsLabel').textContent=L('Ориентиры, связанные наблюдения и источники','Landmarks, related observations and sources');
  const locations=$('focusedQuestionPanel').querySelector('#primaryReviewLocations');if(locations)$('caseLocations').replaceChildren(locations);if(s.external||s.empty)$('caseLocations').replaceChildren();
  document.querySelector('.image-area').hidden=s.empty;answers.hidden=s.empty;$('caseDetails').hidden=s.empty;
  $('markOptionsLabel').textContent=L('Цвет, стиль и сохранение изображения','Color, style and image download');
  $('casePrevious').textContent=L('Предыдущий случай','Previous case');$('caseNext').textContent=L('Следующий случай','Next case');
  $('casePrevious').disabled=busy||s.external||s.empty||s.index<=0&&!atEnd;$('caseNext').disabled=busy||s.external||atEnd||!rows.length;
  $('returnCase').textContent=L('Вернуться к очереди клетки','Return to the cell queue');$('returnCase').hidden=!s.external;$('returnCase').disabled=busy;
  $('caseSaveHint').textContent=busy?L('Сохранение и открытие случая…','Saving and opening the case…'):L('3. Запишите наблюдение и продолжайте. Переход сохраняет работу; ответа за вас не выбирает.','3. Record your observation and continue. Moving on saves your work without choosing an answer.');
  $('caseNext').setAttribute('aria-busy',String(busy));$('cellFilter').disabled=$('caseJump').disabled=busy;
  $('caseEnd').hidden=!atEnd||s.external;$('caseEndTitle').textContent=L('Конец очереди клетки','End of this cell’s queue');
  $('caseEndSummary').textContent=L(`Все ${p.total} случаев доступны для повторного просмотра. Без определённого ответа: ${p.unresolved}; из них не проверено: ${p.unreviewed}. Достижение конца очереди не подтверждает анатомические решения.`,`All ${p.total} cases remain available to revisit. Unresolved: ${p.unresolved}; unreviewed: ${p.unreviewed}. Reaching the end does not confirm the anatomical decisions.`);
  const next=catalog.recipients[catalog.recipients.findIndex(r=>r.id===s.cellId)+1];$('nextCell').textContent=next?L(`Следующая клетка: ${next.id}`,`Next cell: ${next.id}`):L('Выбрать другую клетку','Choose another cell');$('nextCell').disabled=busy;
  $('caseEndListLabel').textContent=L(`Нерешённые случаи: ${p.unresolved}`,`Unresolved cases: ${p.unresolved}`);$('caseEndList').replaceChildren(...rows.filter(q=>p.unresolvedIds.includes(q.id)).map(q=>{const b=node('button',{type:'button',text:loc(taskReviewContent(catalog,q.id).title)});b.onclick=()=>run(()=>openCase(q.id));return b;}));
  if(s.external)$('advancedReview').open=true;
 }
 async function initialize(){if(initialCell&&catalog.recipients.some(r=>r.id===initialCell)){await selectCell(initialCell);render();return;}const s=state();if(s.external){render();return;}const saved=remembered(s.cellId);atEnd=saved?.questionId===s.currentId&&!!saved.atEnd;remember(s.cellId,s.currentId,atEnd);render();}
 return {render,observe,initialize,poolChanged:()=>emptySelection?run(()=>selectCell(cell())):render(),get state(){return state();},openCell:id=>run(()=>selectCell(id)),step:direction=>run(()=>step(direction))};
}
