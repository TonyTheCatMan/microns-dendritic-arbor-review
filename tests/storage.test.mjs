import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, createTask, createState, validateState, validateTask, mergeTask, previewConflicts, decisionAdapter } from '../core/model.js';
import { createExport, createAnnotationExport, parseImport } from '../core/exchange.js';
import { createZip, readZip, crc32 } from '../core/zip.js';
import { openStore } from '../core/store.js';

const catalog = { catalogHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), tasks: [{ id: 'MC1_SOMA' }, { id: 'MC2_ORIGIN' }], coordinateContract: { pixelOrigin: 'integer-sample' }, sources: [{ version: 'release661', rootId: '864691135195576362' }] };
const time = '2026-10-09T10:00:00.000Z';
const binding = { catalogHash: catalog.catalogHash, sourceHash: catalog.sourceHash, coordinateConvention: 'integer-sample', resolutionNm: [8,8,40], rootId: '864691135195576362' };
function worked() {
  const task = createTask('MC1_SOMA', { plane: 'xy', positionNm: [752960,646592,858640], zoom: 1.25 });
  task.revision = 3; task.updatedAt = time;
  task.decision = { status: 'in_progress', answers: { identity: 'uncertain' }, note: 'Проверить мембрану; keep original language' };
  task.marks = [
    { id: 'm1', kind: 'trace', category: 'candidate_plasma_membrane', label: 'Контур', note: 'Не замыкать', visible: true, pointsNm: [[752960,646592,858640],[752968,646608,858640]], plane: 'xy', sourceBinding: binding, createdAt: time, updatedAt: time },
    { id: 'm2', kind: 'point', category: 'damage', label: 'Other', note: '', visible: false, pointsNm: [[752992,646608,858640]], plane: 'xy', sourceBinding: binding, createdAt: time, updatedAt: time },
  ];
  task.segments = [{ id: '864691136111111111', source: 'seg_m1300', version: 'v1300', identityConfirmed: false, visible: false, color: '#eeaabb' }];
  task.selections = [{ id: 's1', label: 'Область', note: 'Selection note', visible: true, view: clone(task.view), segments: clone(task.segments), markIds: ['m1'], createdAt: time, updatedAt: time }];
  return task;
}
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64'));
function memoryBackend() {
  let meta; const rows = new Map();
  return { rows, fail: null, metadata: async () => clone(meta), setMetadata: async value => { meta = clone(value); }, read: async id => clone(rows.get(id)), all: async () => [...rows.values()].map(clone), close() {},
    async write(task, expected) {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (this.fail) throw this.fail;
      const previous = rows.get(task.id); if ((previous?.revision ?? 0) !== expected) throw Object.assign(new Error('Changed in another window'), { code: 'SAVE_CONFLICT' });
      const result = { ...clone(task), revision: expected + 1, updatedAt: new Date(Date.now()).toISOString() }; rows.set(task.id, result); return clone(result);
    },
  };
}

test('all ZIP roundtrip reconstructs exact work, all catalog tasks and evidence bytes', async () => {
  const task = worked(), { blob, manifest } = await createExport(catalog, [task], { scope: 'all', language: 'ru', evidenceFiles: [{ path: 's1/raw.png', blob: new Blob([png]), taskId: task.id, selectionId: 's1', metadata: { plane: 'xy', resolutionNm: [8,8,40] } }] });
  assert.equal(manifest.taskIds.length, 2); assert.equal(manifest.evidence.length, 1);
  const imported = await parseImport(blob, catalog);
  assert.deepEqual(imported.tasks[0], task); assert.deepEqual(imported.tasks[1], createTask('MC2_ORIGIN'));
  assert.deepEqual(imported.files.get('evidence/s1/raw.png'), png);
  assert.equal(imported.tasks[0].segments[0].id, '864691136111111111');
  assert.equal(imported.tasks[1].decision.status, 'unreviewed');
  assert.equal(imported.manifest.anatomicalCertification, false);
});

test('selected ZIP includes selection dependencies and exact notes/views but no unrelated marks or evidence', async () => {
  const task = worked();
  const { blob, manifest } = await createExport(catalog, [task], { scope: 'selected', selectedIds: ['s1'], evidenceFiles: [{ path: 's1/raw.png', blob: new Blob([png]), taskId: task.id, selectionId: 's1' }, { path: 'unselected/raw.png', blob: new Blob([png]), taskId: task.id, selectionId: 's2' }] });
  const imported = await parseImport(blob, catalog);
  assert.equal(imported.partial, true); assert.equal(imported.tasks.length, 1);
  assert.deepEqual(imported.tasks[0].marks, [task.marks[0]]);
  assert.deepEqual(imported.tasks[0].selections, task.selections);
  assert.deepEqual(imported.tasks[0].view, task.view);
  assert.equal(manifest.evidence.length, 1);
});

test('annotation JSON supports selected and current task exact reconstruction', async () => {
  const task = worked();
  const current = await parseImport(createAnnotationExport(catalog, [task], { scope: 'current' }).blob, catalog);
  assert.deepEqual(current.tasks, [task]);
  const selected = await parseImport(createAnnotationExport(catalog, [task], { scope: 'selected', selectedIds: ['m2'] }).blob, catalog);
  assert.deepEqual(selected.tasks[0].marks, [task.marks[1]]); assert.equal(selected.tasks[0].selections.length, 0);
});

test('conflicts default to keep local; explicit replacement and partial merge are predictable', () => {
  const local = worked(), incoming = worked(); local.updatedAt = '2026-10-10T12:00:00.000Z'; local.decision.note = 'Newer local note';
  const [preview] = previewConflicts([incoming], [local]);
  assert.equal(preview.conflict, true); assert.equal(preview.localIsNewer, true); assert.equal(preview.defaultResolution, 'keep');
  assert.deepEqual(mergeTask(local, incoming), local);
  assert.deepEqual(mergeTask(local, incoming, { policy: 'replace' }), incoming);
  incoming.marks = [incoming.marks[0]]; incoming.marks[0].note = 'Incoming chosen note';
  const merged = mergeTask(local, incoming, { policy: 'replace', partial: true });
  assert.equal(merged.marks.length, 2); assert.equal(merged.marks[0].note, 'Incoming chosen note'); assert.equal(merged.marks[1].id, 'm2');
  assert.equal(mergeTask(local, incoming, { policy: 'merge', partial: true }).marks[0].note, local.marks[0].note);
});

test('import rejects other project, changed catalog or source, future schema and unknown task', async () => {
  const exported = createAnnotationExport(catalog, [worked()], { scope: 'current' });
  for (const [field, value, code] of [['projectId','other','PROJECT_MISMATCH'],['catalogHash','c'.repeat(64),'CATALOG_MISMATCH'],['sourceHash','d'.repeat(64),'SOURCE_MISMATCH'],['schemaVersion',3,'SCHEMA_MIGRATION_REQUIRED']]) {
    const payload = JSON.parse(await exported.blob.text()); payload.state[field] = value;
    await assert.rejects(parseImport(new Blob([JSON.stringify(payload)]), catalog), { code });
  }
  const bad = worked(); bad.id = 'foreign'; assert.throws(() => validateTask(bad, catalog), { code: 'UNKNOWN_TASK' });
});

test('source bindings reject incorrect hashes, half-voxel coordinates and numeric large IDs', () => {
  for (const [key,value,code] of [['sourceHash','c'.repeat(64),'SOURCE_MISMATCH'],['coordinateConvention','voxel-center-half','COORDINATE_CONVENTION'],['rootId',864691135195576362,'UNSAFE_NUMBER']]) {
    const task = clone(worked()); task.marks[0].sourceBinding[key] = value;
    assert.throws(() => validateTask(task, catalog), { code });
  }
  const bad = worked(); bad.selections[0].markIds = ['missing']; assert.throws(() => validateTask(bad, catalog), { code: 'MARK_REFERENCE' });
});

test('2D traces cannot interpolate between sections; single-vertex drafts remain recoverable', () => {
  const task = worked(); task.marks[0].pointsNm[1][2] += 40;
  assert.throws(() => validateTask(task, catalog), { code: 'NONCOPLANAR_MARK' });
  const draft = worked(); draft.marks[0].pointsNm.pop(); draft.marks[0].draft = true;
  assert.deepEqual(validateTask(draft, catalog), draft);
  delete draft.marks[0].draft; assert.throws(() => validateTask(draft, catalog), { code: 'POINTS' });
});

test('real catalog fields reject unrecognized answers while empty or null remain unreviewed', () => {
  const known = { ...catalog, tasks: [{ id: 'MC1_SOMA', fields: [{ key: 'native_identity', options: [{ value: 'unresolved' }] }] }] };
  const task = createTask('MC1_SOMA'); task.decision.answers.native_identity = null; validateTask(task, known);
  task.decision.answers.native_identity = ''; validateTask(task, known);
  task.decision.answers.native_identity = 'unresolved'; validateTask(task, known);
  task.decision.answers.native_identity = 'invented'; assert.throws(() => validateTask(task, known), { code: 'DECISION_ANSWER' });
  task.decision.answers = { hidden_unknown: 'unresolved' }; assert.throws(() => validateTask(task, known), { code: 'DECISION_FIELD' });
});

test('portable selected segments match canonical viewer source, uint64 and candidate identity contract', () => {
  for (const [key, value, code] of [['source','release661','SEGMENT_SOURCE'],['source','https://example.test/seg_m1300','SEGMENT_SOURCE'],['sourceUrl','https://example.test/seg_m1300','SEGMENT_SOURCE'],['version','v661','SEGMENT_VERSION'],['id','0','IDENTIFIER_STRING'],['id','18446744073709551616','IDENTIFIER_STRING'],['id','000123','IDENTIFIER_STRING'],['identityStatus','confirmed','IDENTITY_MAPPING'],['identityConfirmed',true,'IDENTITY_MAPPING'],['color','blue','SEGMENT_COLOR']]) {
    const task = worked(); task.segments[0][key] = value;
    assert.throws(() => validateTask(task, catalog), { code });
  }
  const task = worked(); task.segments[0].sourceUrl = 'precomputed://https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300/';
  assert.deepEqual(validateTask(task, catalog),task);
  task.selections[0].segments[0].source = 'unbound'; assert.throws(() => validateTask(task,catalog),{code:'SEGMENT_SOURCE'});
});

test('saved contact navigation retains separate positions and internally consistent source footprints', async () => {
  const task = worked(), contact = { id:'164163900',sourceRootId:'864691135685113603',preNm:[733048,563752,935240],postNm:[733040,563632,935000],centerNm:[732944,563848,934960],preSupervoxelId:'89941976371580422',postSupervoxelId:'89941976371574486',postLevel2Id:'161999570409095869',eligibility:'eligible_dendritic_domain',sourceLine:1,footprintLine:3295,focusedPosition:'post',footprint:{sourceRootId:'864691135685113603',sourceLine:3295,contactIds:['164163900','164163901'],eligibleContactIds:['164163900']} };
  task.selections[0].sourceContacts = [contact];
  const imported = await parseImport(createAnnotationExport(catalog,[task],{scope:'selected',selectedIds:['s1']}).blob,catalog);
  assert.deepEqual(imported.tasks[0].selections[0].sourceContacts,[contact]);
  const numeric = clone(task); numeric.selections[0].sourceContacts[0].id = 164163900; assert.throws(()=>validateTask(numeric,catalog),{code:'IDENTIFIER_STRING'});
  const position = clone(task); position.selections[0].sourceContacts[0].preNm = [1,2]; assert.throws(()=>validateTask(position,catalog),{code:'COORDINATE'});
  const footprint = clone(task); footprint.selections[0].sourceContacts[0].footprint.contactIds = ['42']; assert.throws(()=>validateTask(footprint,catalog),{code:'CONTACT_FOOTPRINT'});
});

test('ZIP CRC is standard and corrupt evidence or unsafe paths cannot be imported', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const blob = await createZip([{ path: 'data.txt', data: 'original' }]); const bytes = new Uint8Array(await blob.arrayBuffer()); bytes[38] ^= 1;
  await assert.rejects(readZip(bytes), { code: 'ZIP_CRC' });
  await assert.rejects(createZip([{ path: '../escaped.json', data: '{}' }]), { code: 'ZIP_PATH' });
  await assert.rejects(createZip([{ path: 'same', data: '' }, { path: 'same', data: '' }]), { code: 'ZIP_DUPLICATE' });
});

test('integrity manifest detects rebuilt ZIP tampering even with valid CRC', async () => {
  const { blob } = await createExport(catalog, [worked()], { scope: 'current' });
  const files = await readZip(blob); const task = JSON.parse(new TextDecoder().decode(files.get('review.json'))); task.tasks.MC1_SOMA.decision.note = 'tampered'; files.set('review.json', new TextEncoder().encode(JSON.stringify(task)));
  const altered = await createZip([...files].map(([path,data]) => ({ path,data })));
  await assert.rejects(parseImport(altered, catalog), { code: 'FILE_HASH' });
});

test('source decision adapter keeps identity and qualifications null without expert claims', () => {
  const adapted = decisionAdapter(catalog, [worked()]);
  assert.equal(adapted.records.MC1_SOMA.reviewer_name, null); assert.equal(adapted.records.MC1_SOMA.qualifications, null);
  assert.equal(adapted.records.MC1_SOMA.status, 'DRAFT'); assert.equal(adapted.anatomical_certification, false);
});

test('serialized autosave captures snapshots before task switches and preserves revisions', async () => {
  const backend = memoryBackend(), store = await openStore(catalog, { backend }), statuses = []; store.onStatus(s => statuses.push(s.state));
  const a = await store.load('MC1_SOMA'), b = await store.load('MC2_ORIGIN'); a.decision.note = 'first';
  const one = store.save(a); a.decision.note = 'second'; const two = store.save(a); b.decision.note = 'other task'; const three = store.save(b); a.decision.note = 'never saved';
  const [saved1,saved2] = await Promise.all([one,two,three]); await store.flush();
  assert.equal(saved1.decision.note, 'first'); assert.equal(saved2.revision, 2);
  assert.equal((await store.load(a.id)).decision.note, 'second'); assert.equal((await store.load(b.id)).decision.note, 'other task');
  assert.equal(statuses.at(-1), 'saved'); assert.equal((await store.all()).length, 2);
});

test('failed save exposes error, retains recovery draft and retries without false saved state', async () => {
  const backend = memoryBackend(), store = await openStore(catalog, { backend }); const task = await store.load('MC1_SOMA');
  task.decision.note = 'precious unsaved note'; backend.fail = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
  await assert.rejects(store.save(task)); await assert.rejects(store.flush());
  assert.equal(store.status().state, 'error'); assert.equal(store.unsaved()[0].decision.note, task.decision.note);
  assert.equal((await store.load(task.id)).decision.note, task.decision.note);
  backend.fail = null; await store.retry(); assert.equal(store.status().state, 'saved'); assert.equal(store.unsaved().length, 0);
});

test('two store clients reject silent cross-window overwrites and retain draft', async () => {
  const backend = memoryBackend(), first = await openStore(catalog, { backend }), second = await openStore(catalog, { backend });
  const a = await first.load('MC1_SOMA'), b = await second.load('MC1_SOMA'); a.decision.note = 'first window'; b.decision.note = 'second window';
  await first.save(a); await assert.rejects(second.save(b), { code: 'SAVE_CONFLICT' });
  assert.equal(backend.rows.get(a.id).decision.note, 'first window'); assert.equal(second.unsaved()[0].decision.note, 'second window');
});

test('storage namespace identity is checked before reading existing tasks', async () => {
  const backend = memoryBackend(); await openStore(catalog, { backend });
  await assert.rejects(openStore({ ...catalog, sourceHash: 'c'.repeat(64) }, { backend }), { code: 'STORAGE_IDENTITY' });
});
