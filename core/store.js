import { PROJECT_ID, SCHEMA_VERSION, ReviewError, catalogContext, clone, createTask, invariant, validateTask } from './model.js';

const DB_NAME = 'microns-dendritic-arbor-review-v2';
function req(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transaction(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); } catch { tx = db.transaction(stores, mode); }
    let result, error;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(error ?? tx.error ?? new ReviewError('STORAGE_ABORT', 'Local save was interrupted'));
    tx.onerror = () => { error ??= tx.error; };
    Promise.resolve().then(() => action(tx)).then(value => { result = value; }, failure => { error = failure; try { tx.abort(); } catch { reject(failure); } });
  });
}
async function indexedBackend(indexedDB, name) {
  invariant(indexedDB, 'STORAGE_UNAVAILABLE', 'IndexedDB is unavailable. Export work before closing this page.');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1); let failed = false;
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('tasks', { keyPath: 'id' }); db.createObjectStore('meta'); };
    request.onblocked = () => { failed = true; reject(new ReviewError('STORAGE_BLOCKED', 'Local database is blocked by another window. Close that window, then retry.')); };
    request.onerror = () => { failed = true; reject(request.error); };
    request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
  });
  return {
    db,
    metadata: () => transaction(db, ['meta'], 'readonly', tx => req(tx.objectStore('meta').get('identity'))),
    setMetadata: value => transaction(db, ['meta'], 'readwrite', tx => req(tx.objectStore('meta').put(value, 'identity'))),
    read: id => transaction(db, ['tasks'], 'readonly', tx => req(tx.objectStore('tasks').get(id))),
    all: () => transaction(db, ['tasks'], 'readonly', tx => req(tx.objectStore('tasks').getAll())),
    write: (input, expected) => transaction(db, ['tasks'], 'readwrite', async tx => {
      const store = tx.objectStore('tasks'), previous = await req(store.get(input.id));
      invariant((previous?.revision ?? 0) === expected, 'SAVE_CONFLICT', 'This task changed in another window. Export the unsaved draft and reload before resolving the conflict.');
      const previousTime = Date.parse(previous?.updatedAt ?? '') || 0;
      const saved = { ...clone(input), revision: (previous?.revision ?? 0) + 1, updatedAt: new Date(Math.max(Date.now(), previousTime + 1)).toISOString() };
      await req(store.put(saved)); return saved;
    }),
    close: () => db.close(),
  };
}

/** Open an annotation-only DB. Image caches must use an unrelated DB/cache name. */
export async function openStore(catalog, { indexedDB = globalThis.indexedDB, dbName = DB_NAME, backend } = {}) {
  const ctx = catalogContext(catalog), storage = backend ?? await indexedBackend(indexedDB, dbName);
  const identity = { projectId: PROJECT_ID, schemaVersion: SCHEMA_VERSION, catalogHash: ctx.catalogHash, sourceHash: ctx.sourceHash };
  try {
    const previous = await storage.metadata();
    if (previous) for (const key of Object.keys(identity)) invariant(previous[key] === identity[key], 'STORAGE_IDENTITY', `Existing local storage has incompatible ${key}; export it using its original application version`);
    else await storage.setMetadata(identity);
  } catch (error) { storage.close(); throw error; }
  let tail = Promise.resolve(), pending = 0, status = { state: 'saved', pending: 0, error: null }, closed = false;
  const listeners = new Set(), revisions = new Map(), dirty = new Map(), failures = new Map();
  const publish = detail => {
    status = { state: failures.size ? 'error' : pending ? 'saving' : 'saved', pending, error: failures.values().next().value ?? null, ...detail };
    for (const listener of listeners) { try { listener(status); } catch { /* A status renderer cannot cancel a save. */ } }
  };
  const store = {
    async load(taskId) {
      invariant(ctx.taskMap.has(taskId), 'UNKNOWN_TASK', `Unknown task ${taskId}`);
      await tail;
      if (dirty.has(taskId)) return clone(dirty.get(taskId));
      const result = await storage.read(taskId) ?? createTask(taskId);
      const validated = validateTask(result, ctx); revisions.set(taskId, validated.revision); return validated;
    },
    save(task, { expectedRevision } = {}) {
      invariant(!closed, 'STORAGE_CLOSED', 'Local storage is closed');
      const snapshot = validateTask(task, ctx);
      dirty.set(task.id, snapshot); pending++; publish({ taskId: task.id });
      const operation = tail.then(async () => {
        const expected = expectedRevision ?? revisions.get(snapshot.id) ?? snapshot.revision;
        const saved = await storage.write(snapshot, expected);
        revisions.set(saved.id, saved.revision); failures.delete(saved.id);
        if (dirty.get(saved.id) === snapshot) dirty.delete(saved.id);
        return clone(saved);
      });
      // Keep the queue alive after failures while exposing the rejection to callers.
      tail = operation.then(saved => { pending--; publish({ taskId: saved.id, revision: saved.revision }); }, error => { pending--; failures.set(snapshot.id, error); publish({ taskId: snapshot.id }); });
      return operation;
    },
    async all() {
      await tail;
      const result = new Map((await storage.all()).map(task => [task.id, validateTask(task, ctx)]));
      for (const [id, task] of dirty) result.set(id, clone(task));
      return [...result.values()];
    },
    async flush() { await tail; if (failures.size) throw failures.values().next().value; return { saved: true }; },
    onStatus(callback) { listeners.add(callback); callback(status); return () => listeners.delete(callback); },
    status: () => ({ ...status }),
    unsaved: () => [...dirty.values()].map(clone),
    async retry() { const drafts = [...dirty.values()].map(clone); for (const draft of drafts) await store.save(draft); return store.flush(); },
    async close() { await store.flush(); closed = true; storage.close(); },
  };
  if (storage.db) storage.db.onversionchange = () => { closed = true; storage.close(); failures.set('database', new ReviewError('STORAGE_VERSION_CHANGED', 'Another window changed the local database. Export your work and reload.')); publish({}); };
  return store;
}
