/** Real browser storage tests; no screenshots and no user project database writes. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const origin = process.env.REVIEW_TEST_ORIGIN || 'http://127.0.0.1:8874';
const dbName = `dendritic-storage-tests-${Date.now()}`;
const browser = await chromium.launch({ headless: true, ...(process.env.REVIEW_BROWSER_CHANNEL ? { channel: process.env.REVIEW_BROWSER_CHANNEL } : { channel: 'msedge' }) });
const reports = [];
async function harness(context) {
  const page = await context.newPage();
  await page.route('**/__storage-tests__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Isolated storage tests</title>' }));
  await page.goto(`${origin}/__storage-tests__`);
  return page;
}
async function initialize(page, name) {
  return page.evaluate(async name => {
    window.model = await import('/core/model.js'); window.exchange = await import('/core/exchange.js'); window.storage = await import('/core/store.js');
    window.catalog = await (await fetch('/data/catalog.json')).json(); window.reviewStore = await storage.openStore(catalog, { dbName: name });
    return { taskIds: catalog.tasks.map(t => t.id), existing: (await reviewStore.all()).length };
  }, name);
}
try {
  const context = await browser.newContext(), page = await harness(context);
  const initial = await initialize(page, dbName); assert.equal(initial.existing, 0); assert.equal(initial.taskIds.length, 50);
  const saved = await page.evaluate(async () => {
    const first = await reviewStore.load(catalog.tasks[0].id), second = await reviewStore.load(catalog.tasks[1].id), time = new Date().toISOString();
    first.decision.note = 'Первый снимок';
    first.marks = [{ id: 'browser-test-point', kind: 'point', category: 'uncertain', label: 'Test point', note: 'Исходная заметка', visible: false, pointsNm: [catalog.tasks[0].anchorNm], plane: 'xy', sourceBinding: { catalogHash: catalog.catalogHash, sourceHash: catalog.sourceHash, coordinateConvention: 'integer-sample', source: catalog.sources.em.url, resolutionNm: [8,8,40] }, createdAt: time, updatedAt: time }];
    first.segments = [{ id: '864691136111111111', source: 'seg_m1300', version: 'v1300', visible: false, color: '#aabbcc', note: 'candidate', identityStatus: 'candidate' }];
    first.selections = [{ id: 'browser-test-selection', label: 'Saved view', note: 'Сохранённый вид', visible: true, view: { centerNm: catalog.tasks[0].anchorNm, plane: 'xy', spanNm: 4096 }, segments: structuredClone(first.segments), markIds: ['browser-test-point'], createdAt: time, updatedAt: time }];
    const one = reviewStore.save(first); first.decision.note = 'Второй снимок'; const two = reviewStore.save(first);
    second.decision.note = 'Переключение задачи'; const three = reviewStore.save(second); first.decision.note = 'Not saved';
    const [a,b,c] = await Promise.all([one,two,three]); await reviewStore.flush();
    return { firstSnapshot: a.decision.note, secondSnapshot: b.decision.note, firstRevision: a.revision, secondRevision: b.revision, otherTask: c.decision.note, status: reviewStore.status().state };
  });
  assert.deepEqual(saved, { firstSnapshot:'Первый снимок', secondSnapshot:'Второй снимок', firstRevision:1, secondRevision:2, otherTask:'Переключение задачи', status:'saved' });
  reports.push('PASS real IndexedDB serial writes, cloned snapshots and cross-task persistence');

  await page.reload(); await initialize(page, dbName);
  const reloaded = await page.evaluate(async () => { const task = await reviewStore.load(catalog.tasks[0].id); return { note: task.decision.note, segment: task.segments[0].id, mark: task.marks[0].note, selected: task.selections[0].markIds, state: task.decision.status }; });
  assert.deepEqual(reloaded, { note:'Второй снимок', segment:'864691136111111111', mark:'Исходная заметка', selected:['browser-test-point'], state:'unreviewed' });
  reports.push('PASS reload restores selections, exact large string IDs, notes and default unreviewed decision');

  const other = await harness(context); await initialize(other, dbName);
  await other.evaluate(async () => { window.staleTask = await reviewStore.load(catalog.tasks[0].id); });
  await page.evaluate(async () => { const task = await reviewStore.load(catalog.tasks[0].id); task.decision.note = 'Changed in first window'; await reviewStore.save(task); });
  const conflict = await other.evaluate(async () => { staleTask.decision.note = 'Unsaved second-window draft'; try { await reviewStore.save(staleTask); return { rejected: false }; } catch (error) { return { rejected: true, code: error.code, state: reviewStore.status().state, retained: reviewStore.unsaved()[0].decision.note }; } });
  assert.deepEqual(conflict, { rejected:true, code:'SAVE_CONFLICT', state:'error', retained:'Unsaved second-window draft' });
  reports.push('PASS real concurrent-window conflict rejects overwrite and retains unsaved draft');
  await other.close();

  const quota = await page.evaluate(async () => {
    const original = IDBObjectStore.prototype.put, task = await reviewStore.load(catalog.tasks[0].id); task.decision.note = 'Recoverable quota draft'; let failure;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'tasks') throw new DOMException('Injected disk quota failure', 'QuotaExceededError'); return original.apply(this, args); };
    try { await reviewStore.save(task); } catch (error) { failure = error.name; } finally { IDBObjectStore.prototype.put = original; }
    let flushRejected = false; try { await reviewStore.flush(); } catch { flushRejected = true; }
    const before = { failure, flushRejected, state: reviewStore.status().state, draft: reviewStore.unsaved()[0]?.decision.note };
    const backup = exchange.createAnnotationExport(catalog, await reviewStore.all(), { scope: 'current', taskId: task.id });
    const parsed = await exchange.parseImport(backup.blob, catalog);
    await reviewStore.retry(); return { before, backupNote: parsed.tasks[0].decision.note, after: reviewStore.status().state, recovered: (await reviewStore.load(task.id)).decision.note };
  });
  assert.deepEqual(quota, { before:{failure:'QuotaExceededError',flushRejected:true,state:'error',draft:'Recoverable quota draft'},backupNote:'Recoverable quota draft',after:'saved',recovered:'Recoverable quota draft' });
  reports.push('PASS injected quota-style failure aborts a real IDB transaction; backup, error state and retry work');

  const transfer = await page.evaluate(async () => {
    const tasks = await reviewStore.all(); const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
    const options = { scope:'all', language:'en', evidenceFiles:[{path:'evidence/panel/raw.png',taskId:catalog.tasks[0].id,selectionId:'browser-test-selection',blob:new Blob([png]),metadata:{nativePixels:true,resolutionNm:[8,8,40]}}] };
    const all = await exchange.createExport(catalog,tasks,options), selected = await exchange.createExport(catalog,tasks,{...options,scope:'selected',selectedIds:['browser-test-selection']});
    return { all:[...new Uint8Array(await all.blob.arrayBuffer())], selected:[...new Uint8Array(await selected.blob.arrayBuffer())], first:tasks.find(t=>t.id===catalog.tasks[0].id) };
  });
  const freshContext = await browser.newContext(), fresh = await harness(freshContext); assert.equal((await initialize(fresh, dbName)).existing, 0);
  const reconstruction = await fresh.evaluate(async transfer => {
    const parsed = await exchange.parseImport(new Blob([Uint8Array.from(transfer.all)]),catalog);
    for(const incoming of parsed.tasks) { const local = await reviewStore.load(incoming.id); await reviewStore.save(model.mergeTask(local,incoming,{policy:'replace',partial:parsed.partial}),{expectedRevision:local.revision}); }
    await reviewStore.flush(); const imported = await reviewStore.load(catalog.tasks[0].id), selected = await exchange.parseImport(new Blob([Uint8Array.from(transfer.selected)]),catalog);
    const exactFields = ['decision','marks','selections','segments','view'].every(key=>JSON.stringify(imported[key])===JSON.stringify(transfer.first[key]));
    return { exactFields, tasks:(await reviewStore.all()).length, unreviewed:(await reviewStore.all()).every(t=>t.decision.status==='unreviewed'), evidenceBytes:parsed.files.get('evidence/panel/raw.png').length, selectedTasks:selected.tasks.length, selectedMarks:selected.tasks[0].marks.length, selectedViews:selected.tasks[0].selections.length, partial:selected.partial };
  }, transfer);
  assert.deepEqual(reconstruction,{exactFields:true,tasks:50,unreviewed:true,evidenceBytes:70,selectedTasks:1,selectedMarks:1,selectedViews:1,partial:true});
  reports.push('PASS clean-profile all ZIP import reconstructs all 50 tasks and exact content; selected ZIP carries only linked selection/mark/evidence');
  await fresh.reload(); await initialize(fresh,dbName); assert.equal((await fresh.evaluate(async()=>reviewStore.all())).length,50);
  reports.push('PASS clean-profile imported state persists after reload');
  console.log(JSON.stringify({passed:reports.length,origin,isolatedDatabase:dbName,reports},null,2));
  await context.close(); await freshContext.close();
} finally { await browser.close(); }
