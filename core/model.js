/** Pure, source-bound review records. Never modifies acquisition or catalog data. */
export const PROJECT_ID = 'microns-dendritic-arbor-review';
export const SCHEMA_VERSION = 2;
export const COORDINATE_SYSTEM = 'global_nm_integer_sample';
export const SEGMENTATION_URL = 'https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300';
export const MARK_KINDS = Object.freeze(['point', 'arrow', 'ellipse', 'freehand', 'trace', 'roi', 'distance']);
export const clone = value => structuredClone(value);
export const newId = () => globalThis.crypto.randomUUID();
export class ReviewError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ReviewError'; this.code = code; this.details = details; }
}
export function invariant(condition, code, message) { if (!condition) throw new ReviewError(code, message); }
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, field, max = 1000000) => invariant(typeof value === 'string' && value.length <= max, 'INVALID_FIELD', `Invalid ${field}`);
export function safeJSON(value, path = 'record', depth = 0) {
  invariant(depth <= 60, 'INVALID_DEPTH', `Excessive nesting: ${path}`);
  if (typeof value === 'number') invariant(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'UNSAFE_NUMBER', `Unsafe numeric value at ${path}; large identifiers must be strings`);
  else if (typeof value === 'string') string(value, path);
  else if (value !== null && typeof value === 'object') {
    invariant(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'INVALID_OBJECT', `Invalid object at ${path}`);
    for (const [key, item] of Object.entries(value)) {
      invariant(!['__proto__', 'prototype', 'constructor'].includes(key), 'UNSAFE_KEY', `Unsafe key at ${path}`);
      safeJSON(item, `${path}.${key}`, depth + 1);
    }
  } else invariant(value === null || typeof value === 'boolean', 'INVALID_VALUE', `Non-JSON value at ${path}`);
}
export function catalogContext(catalog) {
  const catalogHash = catalog.catalogHash ?? catalog.catalogSha256 ?? catalog.catalog_sha256 ?? catalog.provenance?.catalogSha256;
  const sourceHash = catalog.sourceHash ?? catalog.sourceRegistryHash ?? catalog.source_registry_sha256 ?? catalog.provenance?.sourceRegistrySha256;
  invariant(typeof catalogHash === 'string' && /^[a-f0-9]{64}$/i.test(catalogHash), 'CATALOG_HASH', 'Catalog must have its exact SHA-256 hash');
  invariant(typeof sourceHash === 'string' && /^[a-f0-9]{64}$/i.test(sourceHash), 'SOURCE_HASH', 'Catalog must have its exact source identity SHA-256 hash');
  const tasks = Array.isArray(catalog.tasks) ? catalog.tasks : Object.values(catalog.tasks ?? {});
  const taskMap = new Map(tasks.map(task => [task.id ?? task.task_id, task]));
  invariant(tasks.length > 0 && taskMap.size === tasks.length && [...taskMap.keys()].every(id => typeof id === 'string' && id.length), 'TASK_CATALOG', 'Catalog must contain unique string task IDs');
  return { projectId: PROJECT_ID, catalogHash, sourceHash, taskMap, catalog };
}
export function createTask(id, view = {}) {
  return { id, revision: 0, updatedAt: null, decision: { status: 'unreviewed', answers: {}, note: '' }, marks: [], selections: [], segments: [], view: clone(view) };
}
export function createState(catalog) {
  const ctx = catalogContext(catalog);
  return { schemaVersion: SCHEMA_VERSION, projectId: PROJECT_ID, catalogHash: ctx.catalogHash, sourceHash: ctx.sourceHash, tasks: {} };
}
function timestamp(value, label, optional = false) {
  invariant((optional && value === null) || (typeof value === 'string' && Number.isFinite(Date.parse(value))), 'INVALID_TIME', `Invalid ${label}`);
}
export function validatePoint(point) {
  invariant(Array.isArray(point) && point.length === 3 && point.every(Number.isFinite), 'COORDINATE', 'Expected three finite nanometre coordinates');
}
/** Geometry-only validation is also used before applying edits in the annotation dialog. */
export function validateMarkGeometry(mark) {
  invariant(MARK_KINDS.includes(mark.kind), 'MARK_KIND', 'Unknown annotation kind');
  invariant(mark.draft === undefined || typeof mark.draft === 'boolean', 'MARK_DRAFT', 'Invalid annotation draft state');
  invariant(Array.isArray(mark.pointsNm) && mark.pointsNm.length >= 1 && mark.pointsNm.length <= 100000, 'POINTS', 'Annotation requires finite points');
  mark.pointsNm.forEach(validatePoint);
  invariant(mark.kind !== 'point' || mark.pointsNm.length === 1, 'POINTS', 'Point annotations contain one point');
  invariant(mark.kind === 'point' || mark.pointsNm.length >= 2 || mark.draft === true, 'POINTS', 'Finished shapes require at least two points; incomplete drafts must be explicit');
  invariant(!['arrow', 'ellipse'].includes(mark.kind) || mark.pointsNm.length <= 2, 'POINTS', 'Arrows and ellipses contain two endpoints');
  invariant(!['trace', 'freehand'].includes(mark.kind) || mark.closed !== true, 'CLOSED_TRACE', 'An open route must not be silently closed');
  invariant(['xy', 'xz', 'yz', 'XY', 'XZ', 'YZ'].includes(mark.plane) || plain(mark.plane), 'PLANE', 'Annotation requires a plane');
  const planeValue = typeof mark.plane === 'string' ? mark.plane : mark.plane.plane ?? ({x:'yz',y:'xz',z:'xy'}[mark.plane.axis]);
  const plane = typeof planeValue === 'string' ? planeValue.toLowerCase() : undefined;
  const depthAxis = { xy: 2, xz: 1, yz: 0 }[plane];
  invariant(depthAxis !== undefined, 'PLANE', 'Annotation plane must identify XY, XZ or YZ');
  invariant(mark.pointsNm.every(point => Math.abs(point[depthAxis] - mark.pointsNm[0][depthAxis]) <= 1e-6), 'NONCOPLANAR_MARK', 'A 2D mark cannot interpolate between sections; save a separate mark on each plane');
  if (mark.draft !== true && ['arrow', 'ellipse', 'freehand'].includes(mark.kind)) {
    invariant(mark.pointsNm.some(point => point.some((value, axis) => Math.abs(value - mark.pointsNm[0][axis]) > 1e-6)), 'DEGENERATE_MARK', 'A finished shape must span distinct points');
    if (mark.kind === 'ellipse') invariant([0,1,2].filter(axis => axis !== depthAxis).every(axis => Math.abs(mark.pointsNm[1][axis] - mark.pointsNm[0][axis]) > 1e-6), 'DEGENERATE_MARK', 'An ellipse needs width and height within its plane');
  }
  if (mark.color !== undefined) invariant(typeof mark.color === 'string' && /^#[0-9a-f]{6}$/i.test(mark.color), 'MARK_COLOR', 'Annotation color must be a six-digit hex RGB value');
  if (mark.strokeWidth !== undefined) invariant(Number.isFinite(mark.strokeWidth) && mark.strokeWidth >= 1 && mark.strokeWidth <= 12, 'MARK_STROKE', 'Annotation line width must be between 1 and 12');
  return mark;
}
export function validateBinding(binding, ctx) {
  invariant(plain(binding) && Object.keys(binding).length > 0, 'SOURCE_BINDING', 'Annotation needs an explicit source binding');
  if (binding.catalogHash !== undefined) invariant(binding.catalogHash === ctx.catalogHash, 'CATALOG_MISMATCH', 'Annotation catalog differs');
  if (binding.sourceHash !== undefined) invariant(binding.sourceHash === ctx.sourceHash, 'SOURCE_MISMATCH', 'Annotation source identity differs');
  const resolution = binding.resolutionNm ?? binding.resolution_nm;
  if (resolution !== undefined) invariant(Array.isArray(resolution) && resolution.length === 3 && resolution.every(n => Number.isFinite(n) && n > 0), 'RESOLUTION', 'Invalid native resolution');
  const convention = binding.coordinateConvention ?? binding.coordinateSystem ?? binding.pixelOrigin;
  if (convention !== undefined) invariant(['integer-sample', 'integer_sample', COORDINATE_SYSTEM, 'global_nm', 'integer'].includes(convention), 'COORDINATE_CONVENTION', 'Review annotations require explicit integer-sample coordinates, without a half voxel shift');
  for (const key of ['rootId', 'root_id', 'sourceRootId', 'segmentId', 'synapseId', 'supervoxelId']) if (binding[key] !== undefined) string(binding[key], key, 100);
  // release661 root identity is never promoted into a public segmentation mapping.
  if (binding.identityConfirmed === true && (binding.segmentationVersion === 'v1300' || binding.segmentationVersion === 'seg_m1300')) {
    invariant(typeof binding.mappingEvidence === 'string' && binding.mappingEvidence.length > 0, 'IDENTITY_MAPPING', 'Confirmed cross-release identity needs mapping evidence');
  }
}
function validateSegments(segments, ctx) {
  invariant(Array.isArray(segments), 'SEGMENTS', 'Segments must be an array');
  const ids = new Set();
  for (const segment of segments) {
    invariant(plain(segment), 'SEGMENT_BINDING', 'Selected segments must preserve their source binding');
    uint64String(segment.id, 'segment ID');
    invariant(!ids.has(segment.id), 'DUPLICATE_SEGMENT', 'Repeated segment ID'); ids.add(segment.id);
    invariant(segment.source === 'seg_m1300', 'SEGMENT_SOURCE', 'Selected segments require canonical source seg_m1300; release661 root IDs are not interchangeable');
    if (segment.sourceUrl !== undefined) invariant(typeof segment.sourceUrl === 'string' && segment.sourceUrl.replace(/^precomputed:\/\//, '').replace(/\/$/, '') === SEGMENTATION_URL, 'SEGMENT_SOURCE', 'Selected segment URL differs from the public seg_m1300 source');
    if (segment.version !== undefined) invariant(['m1300', 'v1300'].includes(segment.version), 'SEGMENT_VERSION', 'Selected segment version differs from m1300');
    invariant(segment.identityStatus === undefined || segment.identityStatus === 'candidate', 'IDENTITY_MAPPING', 'Version 2 selected segments are navigation candidates; confirmed identity requires a future explicit mapping adapter');
    invariant(segment.identityConfirmed === undefined || segment.identityConfirmed === false, 'IDENTITY_MAPPING', 'Selected public segments do not establish release661 identity');
    if (segment.sourceBinding) validateBinding(segment.sourceBinding, ctx);
    if (segment.visible !== undefined) invariant(typeof segment.visible === 'boolean', 'VISIBILITY', 'Invalid segment visibility');
    if (segment.color !== undefined) invariant(typeof segment.color === 'string' && /^#[0-9a-f]{6}$/i.test(segment.color), 'SEGMENT_COLOR', 'Selected segment color must be a six-digit hex RGB value');
    if (segment.label !== undefined) string(segment.label, 'segment label', 10000);
    if (segment.note !== undefined) string(segment.note, 'segment note');
  }
}
function uint64String(value, label) {
  invariant(typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n, 'IDENTIFIER_STRING', `${label} must be a nonzero uint64 decimal string`);
}
/** Structural navigation receipts only: authoritative contacts/eligibility are never updated. */
function validateSourceContacts(contacts, definition) {
  invariant(Array.isArray(contacts), 'SOURCE_CONTACTS', 'Saved source contacts must be an array');
  const ids = new Set();
  for (const contact of contacts) {
    invariant(plain(contact), 'SOURCE_CONTACTS', 'Invalid saved source contact');
    uint64String(contact.id, 'contact ID'); uint64String(contact.sourceRootId, 'contact source root ID');
    invariant(!ids.has(contact.id), 'SOURCE_CONTACTS', 'Repeated saved source contact'); ids.add(contact.id);
    for (const key of ['preNm', 'postNm', 'centerNm']) validatePoint(contact[key]);
    for (const key of ['preSupervoxelId', 'postSupervoxelId', 'postLevel2Id']) if (contact[key] !== undefined && contact[key] !== null) uint64String(contact[key], key);
    if (contact.recipientId !== undefined) invariant(typeof contact.recipientId === 'string' && (!definition.recipientId || contact.recipientId === definition.recipientId), 'CONTACT_RECIPIENT', 'Saved contact belongs to another recipient');
    if (contact.focusedPosition !== undefined) invariant(['pre', 'post', 'center'].includes(contact.focusedPosition), 'CONTACT_POSITION', 'Unknown source contact position');
    if (contact.eligibility !== undefined) string(contact.eligibility, 'original eligibility', 1000);
    for (const key of ['sourceLine', 'footprintLine']) if (contact[key] !== undefined) invariant(Number.isSafeInteger(contact[key]) && contact[key] > 0, 'CONTACT_POINTER', 'Source contact line pointers must be positive integers');
    if (contact.footprint !== undefined && contact.footprint !== null) {
      const footprint = contact.footprint;
      invariant(plain(footprint) && footprint.sourceRootId === contact.sourceRootId, 'CONTACT_FOOTPRINT', 'Contact and footprint source root differ');
      invariant(Array.isArray(footprint.contactIds) && Array.isArray(footprint.eligibleContactIds), 'CONTACT_FOOTPRINT', 'Source footprint must preserve complete and eligible contact ID lists');
      footprint.contactIds.forEach(id => uint64String(id, 'footprint contact ID'));
      footprint.eligibleContactIds.forEach(id => uint64String(id, 'eligible footprint contact ID'));
      const all = new Set(footprint.contactIds);
      invariant(all.size === footprint.contactIds.length && all.has(contact.id) && footprint.eligibleContactIds.every(id => all.has(id)), 'CONTACT_FOOTPRINT', 'Source footprint contact references are inconsistent');
      if (contact.footprintLine !== undefined && footprint.sourceLine !== undefined) invariant(contact.footprintLine === footprint.sourceLine, 'CONTACT_POINTER', 'Footprint line differs from contact source pointer');
    }
  }
}
function validateView(view, ctx) {
  invariant(plain(view), 'VIEW', 'View must be an object');
  if (view.positionNm) validatePoint(view.positionNm);
  if (view.centerNm) validatePoint(view.centerNm);
  if (view.plane) invariant(['xy', 'xz', 'yz', 'XY', 'XZ', 'YZ'].includes(view.plane), 'PLANE', 'Invalid view plane');
  if (view.sourceBinding) validateBinding(view.sourceBinding, ctx);
}
export function validateTask(input, catalog) {
  const ctx = catalog.taskMap instanceof Map ? catalog : catalogContext(catalog);
  safeJSON(input);
  invariant(plain(input) && ctx.taskMap.has(input.id), 'UNKNOWN_TASK', `Unknown task ${input?.id}`);
  invariant(Number.isSafeInteger(input.revision) && input.revision >= 0, 'REVISION', 'Invalid task revision');
  timestamp(input.updatedAt, 'task update', true);
  invariant(plain(input.decision), 'DECISION', 'Missing review decision');
  invariant(['unreviewed', 'in_progress', 'reviewed', 'uncertain'].includes(input.decision.status), 'DECISION_STATUS', 'Invalid review status; a legacy status requires an explicit migration');
  invariant(plain(input.decision.answers), 'DECISION_ANSWERS', 'Decision answers must be an object');
  const fields = ctx.taskMap.get(input.id).fields;
  if (Array.isArray(fields)) for (const [key, value] of Object.entries(input.decision.answers)) {
    const field = fields.find(item => item.key === key);
    invariant(field, 'DECISION_FIELD', `Unknown decision field: ${key}`);
    if (value !== null) string(value, `decision answer ${key}`);
    if (value !== '' && value !== null && field.options?.length) invariant(field.options.some(option => (typeof option === 'string' ? option : option.value) === value), 'DECISION_ANSWER', `Unknown answer for ${key}`);
  }
  string(input.decision.note, 'decision note');
  invariant(Array.isArray(input.marks) && Array.isArray(input.selections) && input.marks.length <= 100000 && input.selections.length <= 100000, 'ANNOTATIONS', 'Invalid annotation lists');
  const ids = new Set();
  for (const mark of input.marks) {
    string(mark.id, 'mark ID', 200);
    invariant(!ids.has(mark.id), 'DUPLICATE_ID', 'Duplicate mark ID'); ids.add(mark.id);
    validateMarkGeometry(mark);
    string(mark.category, 'category', 200); string(mark.label, 'mark label', 10000); string(mark.note, 'mark note');
    invariant(typeof mark.visible === 'boolean', 'VISIBILITY', 'Invalid mark visibility');
    validateBinding(mark.sourceBinding, ctx);
    timestamp(mark.createdAt, 'mark creation'); timestamp(mark.updatedAt, 'mark update');
  }
  const selectionIds = new Set();
  for (const selection of input.selections) {
    string(selection.id, 'selection ID', 200);
    invariant(!selectionIds.has(selection.id) && !ids.has(selection.id), 'DUPLICATE_ID', 'Duplicate selection ID'); selectionIds.add(selection.id);
    string(selection.label, 'selection label', 10000); string(selection.note, 'selection note');
    invariant(typeof selection.visible === 'boolean', 'VISIBILITY', 'Invalid selection visibility');
    invariant(Array.isArray(selection.markIds) && selection.markIds.every(id => typeof id === 'string' && ids.has(id)), 'MARK_REFERENCE', 'Selection references a missing mark');
    validateSegments(selection.segments, ctx); validateView(selection.view, ctx);
    if (selection.sourceBinding) validateBinding(selection.sourceBinding, ctx);
    if (selection.sourceContacts !== undefined) validateSourceContacts(selection.sourceContacts, ctx.taskMap.get(input.id));
    timestamp(selection.createdAt, 'selection creation'); timestamp(selection.updatedAt, 'selection update');
  }
  validateSegments(input.segments, ctx); validateView(input.view, ctx);
  return clone(input);
}
export function validateState(state, catalog) {
  const ctx = catalogContext(catalog);
  invariant(state.schemaVersion === SCHEMA_VERSION, 'SCHEMA_MIGRATION_REQUIRED', `Schema ${state.schemaVersion} requires an explicit migration`);
  invariant(state.projectId === PROJECT_ID, 'PROJECT_MISMATCH', 'This file belongs to a different review project');
  invariant(state.catalogHash === ctx.catalogHash, 'CATALOG_MISMATCH', 'Catalog hash differs; automatic coordinate or task remapping is prohibited');
  invariant(state.sourceHash === ctx.sourceHash, 'SOURCE_MISMATCH', 'Source identity hash differs');
  invariant(plain(state.tasks), 'TASKS', 'Review package must contain a task map');
  for (const [id, task] of Object.entries(state.tasks)) { invariant(task.id === id, 'TASK_KEY', 'Task map key differs from its ID'); validateTask(task, ctx); }
  return clone(state);
}
export function hasWork(task) { return !!task && (task.revision > 0 || task.decision.status !== 'unreviewed' || task.decision.note !== '' || Object.keys(task.decision.answers).length > 0 || task.marks.length > 0 || task.selections.length > 0 || task.segments.length > 0); }
function content(task) { const value = clone(task); delete value.revision; delete value.updatedAt; return JSON.stringify(value); }
export function previewConflicts(incoming, local) {
  const localMap = new Map((Array.isArray(local) ? local : Object.values(local)).map(t => [t.id, t]));
  return incoming.map(task => {
    const existing = localMap.get(task.id), identical = !!existing && content(existing) === content(task);
    return { taskId: task.id, conflict: !!existing && hasWork(existing) && !identical, identical, localRevision: existing?.revision ?? 0, incomingRevision: task.revision, localUpdatedAt: existing?.updatedAt ?? null, incomingUpdatedAt: task.updatedAt, localIsNewer: !!existing?.updatedAt && Date.parse(existing.updatedAt) > Date.parse(task.updatedAt ?? 0), defaultResolution: 'keep' };
  });
}
export function mergeTask(local, incoming, { policy = 'keep', partial = false } = {}) {
  invariant(!local || local.id === incoming.id, 'TASK_MISMATCH', 'Cannot combine different task IDs');
  invariant(['keep', 'replace', 'merge'].includes(policy), 'RESOLUTION', 'Choose keep, replace or merge');
  if (!local || !hasWork(local)) return clone(incoming);
  if (policy === 'keep') return clone(local);
  if (!partial && policy === 'replace') return clone(incoming);
  const result = clone(local);
  // Partial packages are overlays. Preserve unrelated local work; imported IDs replace
  // only after an explicit replace choice. Merge preserves conflicting local IDs.
  for (const field of ['marks', 'selections', 'segments']) {
    const items = new Map(result[field].map(item => [item.id ?? item.segmentId, item]));
    for (const item of incoming[field]) if (policy === 'replace' || !items.has(item.id ?? item.segmentId)) items.set(item.id ?? item.segmentId, clone(item));
    result[field] = [...items.values()];
  }
  if (policy === 'replace') { result.decision = clone(incoming.decision); result.view = clone(incoming.view); }
  return result;
}
/** Compatibility adapter; successful export never certifies anatomy or expertise. */
export function decisionAdapter(catalog, tasks) {
  const ctx = catalogContext(catalog);
  return { schema_version: 'focused_anatomy_decisions.browser_adapter.2', original_schema: 'focused_anatomy_decisions.1', catalog_sha256: ctx.catalogHash, source_identity_sha256: ctx.sourceHash, source_registry_sha256: catalog.sources?.sourceRegistry?.sha256 ?? null, anatomical_certification: false, original_sources_modified: false, identity_adapter: 'No profile collected; identity and qualifications intentionally null', records: Object.fromEntries(tasks.map(task => [task.id, { task_id: task.id, status: task.decision.status === 'unreviewed' ? 'UNREVIEWED' : ['draft', 'in_progress'].includes(task.decision.status) ? 'DRAFT' : 'HUMAN_RECORDED_UNCERTIFIED', reviewer_name: null, qualifications: null, author_role: 'unconfirmed', answers: clone(task.decision.answers), notes: task.decision.note, annotations_global_nm: clone(task.marks), section_quality_annotations: [], contact_attachments: [] }])) };
}
