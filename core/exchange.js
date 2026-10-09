import { PROJECT_ID, SCHEMA_VERSION, COORDINATE_SYSTEM, catalogContext, clone, createState, createTask, decisionAdapter, invariant, safeJSON, validateState, validateTask } from './model.js';
import { bytesOf, createZip, readZip, safePath } from './zip.js';

export { mergeTask, previewConflicts } from './model.js';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const FORMAT = 'microns-dendritic-arbor-review';
export async function sha256(value) { const bytes = await bytesOf(value), hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join(''); }
const json = value => JSON.stringify(value, null, 2) + '\n';
function normalizeTasks(tasks) { return Array.isArray(tasks) ? tasks : Object.values(tasks.tasks ?? tasks); }

function selectTasks(catalog, input, { scope = 'all', selectedIds = [], taskId } = {}) {
  const ctx = catalogContext(catalog), supplied = normalizeTasks(input).map(task => validateTask(task, ctx));
  invariant(['all', 'current', 'selected'].includes(scope), 'SCOPE', 'Export scope must be all, current or selected');
  const ids = new Set(selectedIds), byId = new Map(supplied.map(task => [task.id, task]));
  if (scope === 'all') return [...ctx.taskMap.keys()].map(id => byId.get(id) ?? createTask(id));
  if (scope === 'current') {
    const chosen = taskId ?? selectedIds.find(id => ctx.taskMap.has(id)) ?? (supplied.length === 1 ? supplied[0].id : null);
    invariant(chosen && ctx.taskMap.has(chosen), 'SCOPE_TASK', 'Current-task export requires a task ID or one task');
    return [byId.get(chosen) ?? createTask(chosen)];
  }
  invariant(ids.size > 0, 'EMPTY_SELECTION', 'Choose at least one saved selection or mark');
  const result = [];
  for (const task of supplied) {
    // Explicitly selected task IDs include the complete task, useful for batch review.
    if (ids.has(task.id)) { result.push(task); continue; }
    const selections = task.selections.filter(item => ids.has(item.id));
    const markIds = new Set([...ids, ...selections.flatMap(item => item.markIds)]);
    const marks = task.marks.filter(mark => markIds.has(mark.id));
    if (!selections.length && !marks.length) continue;
    const segmentIds = new Set(selections.flatMap(item => item.segments.map(segment => segment.id ?? segment.segmentId)));
    result.push({ ...task, marks, selections, segments: task.segments.filter(segment => segmentIds.has(segment.id ?? segment.segmentId)) });
  }
  invariant(result.length > 0, 'EMPTY_SELECTION', 'Selected items are not present in the supplied tasks');
  return result;
}
function sourceSnapshot(catalog, tasks) {
  const ctx = catalogContext(catalog);
  return { projectId: PROJECT_ID, catalogHash: ctx.catalogHash, sourceHash: ctx.sourceHash, coordinateSystem: COORDINATE_SYSTEM,
    coordinateContract: catalog.coordinateContract ?? catalog.coordinate_contract ?? null,
    sources: catalog.sources ?? catalog.sourceRegistry ?? catalog.provenance ?? null,
    tasks: tasks.map(task => clone(ctx.taskMap.get(task.id))) };
}

/** evidenceFiles: [{path, blob|data, taskId, selectionId?, metadata?}].
 * Evidence is a lossless caller-frozen capture; this module does not screenshot,
 * rescale, smooth or reinterpret pixels. Selected export filters task/item links.
 */
export async function createExport(catalog, input, options = {}) {
  const { scope = 'all', selectedIds = [], evidenceFiles = [], language = 'ru' } = options;
  const tasks = selectTasks(catalog, input, options), state = createState(catalog);
  state.tasks = Object.fromEntries(tasks.map(task => [task.id, task])); validateState(state, catalog);
  const selected = new Set(selectedIds), exported = new Map(tasks.map(task => [task.id, task]));
  const entries = [
    { path: 'review.json', data: json(state) },
    { path: 'sources.json', data: json(sourceSnapshot(catalog, tasks)) },
    { path: 'decisions-adapter.json', data: json(decisionAdapter(catalog, tasks)) },
  ];
  const evidence = [];
  for (const item of evidenceFiles) {
    if (!exported.has(item.taskId)) continue;
    if (scope === 'selected' && !selected.has(item.taskId) && item.selectionId && !selected.has(item.selectionId)) continue;
    if (scope === 'selected' && !selected.has(item.taskId) && !item.selectionId && !item.markId) continue;
    if (scope === 'selected' && item.markId && !exported.get(item.taskId).marks.some(mark => mark.id === item.markId)) continue;
    const path = safePath(item.path.startsWith('evidence/') ? item.path : `evidence/${item.path}`);
    invariant(/\.(png|tif|tiff|svg|json|txt|npy)$/i.test(path), 'EVIDENCE_FORMAT', 'Evidence files must be lossless PNG/TIFF, SVG, JSON, text or NPY');
    const data = await bytesOf(item.blob ?? item.data);
    if (/\.png$/i.test(path)) invariant(data.length >= 8 && [137,80,78,71,13,10,26,10].every((b, i) => data[i] === b), 'EVIDENCE_FORMAT', 'PNG evidence has an invalid signature');
    entries.push({ path, data });
    evidence.push({ path, taskId: item.taskId, selectionId: item.selectionId ?? null, markId: item.markId ?? null, metadata: clone(item.metadata ?? {}), sha256: await sha256(data), bytes: data.length });
  }
  const files = [];
  for (const entry of entries) { entry.data = await bytesOf(entry.data); files.push({ path: entry.path, bytes: entry.data.length, sha256: await sha256(entry.data) }); }
  const manifest = { format: FORMAT, schemaVersion: SCHEMA_VERSION, projectId: PROJECT_ID, catalogHash: state.catalogHash, sourceHash: state.sourceHash,
    exportedAt: new Date().toISOString(), language: language === 'en' ? 'en' : 'ru', scope, partial: scope === 'selected', selectedIds: [...selectedIds], taskIds: tasks.map(task => task.id),
    coordinateSystem: COORDINATE_SYSTEM, statePath: 'review.json', files, evidence,
    evidenceMode: evidence.length ? 'included-regional-files' : 'annotations-only',
    selfContainedEvidence: evidence.some(item => /\.(png|tif|tiff|npy)$/i.test(item.path)),
    completeness: 'Only explicitly included regional files are self-contained; no complete volume or anatomical coverage is implied.',
    anatomicalCertification: false, reviewerIdentity: null, qualifications: null };
  entries.push({ path: 'manifest.json', data: json(manifest) });
  const readme = language === 'en'
    ? 'Dendritic arbor review exchange\n\nImport this ZIP into the matching application. Review task, catalog and source compatibility before accepting changes. User notes are preserved verbatim. Keep-local is the default conflict choice. Selected-item packages merge only explicit items.\n\nreview.json: exact review state and global nanometre coordinates. sources.json: version-bound source pointers. decisions-adapter.json: compatibility adapter with null identity and qualifications. manifest.json: byte lengths, SHA-256 hashes and evidence links. Evidence files preserve their original bytes; regional captures do not establish whole-cell coverage or anatomical certification.\n'
    : 'Обмен результатами проверки дендритных ветвей\n\nИмпортируйте ZIP в эту же версию приложения. Перед применением проверьте совместимость каталога и источников. Заметки сохранены дословно. При конфликте по умолчанию сохраняется локальная работа. Пакет выбранных объектов переносит только явно выбранные элементы.\n\nreview.json: состояние проверки и координаты в нм. sources.json: версии и ссылки на источники. decisions-adapter.json: адаптер с пустыми полями личности и квалификации. manifest.json: размеры, SHA-256 и связи файлов доказательств. Файлы изображений сохранены без изменения байтов. Региональные снимки не подтверждают полноту анатомического покрытия или анатомические выводы.\n';
  entries.push({ path: 'README.txt', data: readme });
  return { blob: await createZip(entries), manifest };
}

export function createAnnotationExport(catalog, input, options = {}) {
  const state = createState(catalog), tasks = selectTasks(catalog, input, options);
  state.tasks = Object.fromEntries(tasks.map(task => [task.id, task])); validateState(state, catalog);
  const payload = { format: FORMAT, schemaVersion: SCHEMA_VERSION, scope: options.scope ?? 'all', partial: options.scope === 'selected', selectedIds: options.selectedIds ?? [], exportedAt: new Date().toISOString(), state };
  return { blob: new Blob([json(payload)], { type: 'application/json' }), manifest: payload };
}

function parseJSON(bytes, path) {
  invariant(bytes.length < 100 * 1024 * 1024, 'JSON_SIZE', `${path} exceeds 100 MiB`);
  let value; try { value = JSON.parse(decoder.decode(bytes)); } catch { invariant(false, 'JSON_INVALID', `Invalid JSON: ${path}`); }
  safeJSON(value); return value;
}
/** Parsing is read-only. Applying a preview is a separate explicit UI operation. */
export async function parseImport(file, catalog) {
  const bytes = await bytesOf(file); let manifest, state, files = new Map();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    files = await readZip(bytes);
    invariant(files.has('manifest.json'), 'MANIFEST_MISSING', 'ZIP does not contain an application manifest');
    manifest = parseJSON(files.get('manifest.json'), 'manifest.json');
    invariant(manifest.format === FORMAT, 'PROJECT_MISMATCH', 'ZIP belongs to a different application');
    invariant(manifest.schemaVersion === SCHEMA_VERSION, 'SCHEMA_MIGRATION_REQUIRED', 'This ZIP needs an explicit schema migration');
    invariant(Array.isArray(manifest.files), 'MANIFEST_FILES', 'Manifest file hashes are missing');
    const seen = new Set();
    for (const entry of manifest.files) {
      safePath(entry.path); invariant(!seen.has(entry.path), 'MANIFEST_DUPLICATE', 'Repeated file in manifest'); seen.add(entry.path);
      const data = files.get(entry.path); invariant(data, 'EVIDENCE_MISSING', `Missing exported file: ${entry.path}`);
      invariant(data.length === entry.bytes && await sha256(data) === entry.sha256, 'FILE_HASH', `File integrity check failed: ${entry.path}`);
    }
    for (const path of files.keys()) invariant(seen.has(path) || path === 'manifest.json' || path === 'README.txt', 'UNLISTED_FILE', `ZIP file is absent from its integrity manifest: ${path}`);
    invariant(seen.has(manifest.statePath) && files.has(manifest.statePath), 'STATE_MISSING', 'Review state is not included in integrity manifest');
    state = parseJSON(files.get(manifest.statePath), manifest.statePath);
    for (const entry of manifest.evidence ?? []) {
      invariant(seen.has(entry.path) && files.has(entry.path), 'EVIDENCE_MISSING', 'Manifest evidence is absent or unverified');
      invariant(await sha256(files.get(entry.path)) === entry.sha256, 'EVIDENCE_HASH', 'Evidence link hash differs');
    }
  } else {
    const value = parseJSON(bytes, 'annotations.json');
    if (value.state) { manifest = value; invariant(value.format === FORMAT, 'PROJECT_MISMATCH', 'JSON belongs to a different application'); state = value.state; }
    else { state = value; manifest = { format: FORMAT, schemaVersion: value.schemaVersion, scope: 'all', partial: false, evidence: [] }; }
  }
  const validated = validateState(state, catalog);
  if (manifest.taskIds) invariant(Array.isArray(manifest.taskIds) && [...manifest.taskIds].sort().join('\n') === Object.keys(validated.tasks).sort().join('\n'), 'TASK_MANIFEST', 'Manifest task list differs from review state');
  if (manifest.catalogHash) invariant(manifest.catalogHash === state.catalogHash, 'MANIFEST_IDENTITY', 'Manifest catalog differs from review state');
  if (manifest.sourceHash) invariant(manifest.sourceHash === state.sourceHash, 'MANIFEST_IDENTITY', 'Manifest source differs from review state');
  if (manifest.projectId) invariant(manifest.projectId === state.projectId, 'PROJECT_MISMATCH', 'Manifest project differs from review state');
  invariant(['all', 'current', 'selected'].includes(manifest.scope), 'SCOPE', 'Unknown import scope');
  invariant((manifest.scope === 'selected') === (manifest.partial === true), 'PARTIAL_SCOPE', 'Partial import flag differs from selected-item scope');
  for (const entry of manifest.evidence ?? []) {
    invariant(Object.hasOwn(validated.tasks, entry.taskId), 'EVIDENCE_REFERENCE', 'Evidence references a task outside this package');
    if (entry.selectionId) invariant(validated.tasks[entry.taskId].selections.some(s => s.id === entry.selectionId), 'EVIDENCE_REFERENCE', 'Evidence references an absent selection');
    if (entry.markId) invariant(validated.tasks[entry.taskId].marks.some(m => m.id === entry.markId), 'EVIDENCE_REFERENCE', 'Evidence references an absent mark');
  }
  return { tasks: Object.values(validated.tasks), state: validated, manifest, files, scope: manifest.scope, partial: manifest.partial === true, compatibility: { project: true, catalog: true, sources: true, schema: true }, conflicts: [] };
}
