import {assetHash,preparedAssetCache} from './asset-cache.js';
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export async function attachFocusedData(catalog,contactCache=new Map()){
 const response=await fetch(new URL('../data/focused-workflow.json',import.meta.url));if(!response.ok)throw Error(`Focused workflow HTTP ${response.status}`);
 const workflow=await response.json(),{workflowHash,...content}=workflow;
 if(await assetHash(new TextEncoder().encode(JSON.stringify(sorted(content))))!==workflowHash)throw Error('Focused workflow integrity mismatch');
 if(workflow.catalogHash!==catalog.catalogHash||workflow.sourceHash!==catalog.sourceHash||workflow.coordinateConvention!==catalog.coordinateConvention)throw Error('Focused workflow does not match this catalog');
 if(workflow.questions.length!==catalog.tasks.length||new Set(workflow.questions.map(q=>q.taskId)).size!==catalog.tasks.length||workflow.questions.some(q=>!catalog.tasks.some(t=>t.id===q.taskId&&t.recipientId===q.recipientId)))throw Error('Focused question scopes differ from the catalog');
 catalog.focusedWorkflow=workflow;catalog.focusedContacts=new Map();const pending=new Map();
 async function loadContacts(recipientId){
  if(contactCache.has(recipientId))return contactCache.get(recipientId);if(pending.has(recipientId))return pending.get(recipientId);
  const recipient=catalog.recipients.find(r=>r.id===recipientId);if(!recipient)throw Error('Unknown contact recipient');
  const request=(async()=>{const {bytes}=await preparedAssetCache.load(new URL('../'+recipient.contactsUrl,import.meta.url).href,recipient.contactsHash),data=JSON.parse(new TextDecoder().decode(bytes));
   if(data.sourceHash!==catalog.sourceHash||data.recipientId!==recipientId||data.rootRelease661!==recipient.rootRelease661||data.coordinateConvention!==catalog.coordinateConvention)throw Error('Contact source version mismatch');
   for(const row of data.contacts)catalog.focusedContacts.set(`${recipientId}:${row.id}`,row);contactCache.set(recipientId,data);return data;
  })().finally(()=>pending.delete(recipientId));pending.set(recipientId,request);return request;
 }
 catalog.ensureFocusedContacts=async ids=>{await Promise.all([...new Set(ids)].map(loadContacts));};return loadContacts;
}
