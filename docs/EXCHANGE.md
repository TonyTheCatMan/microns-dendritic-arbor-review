# Portable review exchange, version 2

The application saves review overlays locally in IndexedDB and exports portable ZIP or annotation JSON. The project namespace is `microns-dendritic-arbor-review-v2`. The image cache is separate. Evicting imagery does not remove review decisions, marks or saved selections. Browser storage remains local to one origin and browser profile; portable exports are the transferable backup.

## Files and provenance

ZIP exports use standard ZIP32 with stored, lossless file entries, UTF-8 names and CRC32. They can be opened with normal archive software. `manifest.json` records each included data file's SHA-256, byte length and links to tasks, marks or selections. These hashes detect corruption; they are not a digital signature or anatomical certification.

- `review.json` holds schema version 2, project ID, exact application catalog hash, source identity hash and a task map. Source/version compatibility is checked before an import can be applied.
- `sources.json` includes source pointers, source metadata, coordinate contracts and the exported task definitions. `sourceHash` is the original preparation catalog hash in the current application catalog. The separate source registry hash remains in `sources.sourceRegistry.sha256`.
- `decisions-adapter.json` is an explicitly versioned browser adapter. It retains null identity and qualification fields. It never invents expertise or certifies anatomy; it is not falsely presented as conforming to the original expert-only template.
- `evidence/` contains the requested raw and annotated regional images, vector overlays and metadata. Included PNG/TIFF/NPY bytes are never rescaled or recompressed by the exchange module. Calibrated display exports and raw pixel arrays remain distinct artifacts.
- `README.txt` describes the package in the selected interface language. Original reviewer notes are never translated.

Only the regions explicitly included as evidence are self-contained. The archive does not promise complete cell coverage, image volumes or certification of selected segmentation identities. An annotation-only package requires access to the original imaging source to revisit anatomy.

## Scope and exact reconstruction

Current-task export preserves that task's full state. Complete-project export includes every catalog task, with untouched tasks explicitly unreviewed. Selected-item export includes chosen marks and saved selections, every mark referenced by a chosen selection, the selection's object IDs/visibility/colors, and associated view/source metadata. Unselected annotation IDs are omitted. Selection packages are partial overlays and must not delete unrelated local work.

The state preserves large root, segment and synapse identifiers as strings. Coordinates are global nanometres with integer sampling: `nm = (local + offset) * resolution`. The legacy TIFF viewer's half-voxel convention must never be inferred. XY, XZ and YZ annotations stay on their explicit depth; a route cannot silently bridge sections or close itself. An unfinished one-vertex trace/ROI/distance is retained only with `draft: true`.

Selected segments use the canonical `source: "seg_m1300"` and nonzero uint64 decimal string IDs. If supplied, `sourceUrl` must match the public `https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300` source; its optional `precomputed://` prefix and terminal slash are accepted without rewriting. The optional version is `m1300` or `v1300`. Version 2 permits only candidate identity, not an imported claim that a public segment is a confirmed release661 root. Invalid sources, versions, colors and identifiers are rejected before rendering instead of silently being normalized. Earlier development fixtures with arbitrary segment source strings require an explicit adapter and are not accepted as production v2 files.

Optional `selection.sourceContacts` preserves copied navigation receipts with separate pre/post/center coordinates and complete source footprint IDs. Validation checks string identities, finite coordinate triples, task recipient agreement and internal footprint consistency. This does not compare copied contact coordinates or eligibility with authoritative source-file bytes; the frozen pointers/hashes remain the source of truth. Imported receipts are navigation annotations and never replace original contacts, eligibility or scientific judgments.

Import parsing is read-only. The application previews compatibility and conflicts before saving. The default conflict decision keeps local work, including when the incoming task is older. A full replacement is explicit. For partial selected-item imports, replacement changes matching IDs and preserves unrelated IDs; merge keeps conflicting local IDs and adds new IDs. Task decisions and view snapshots remain attached to their original task. No numeric IDs, coordinates, release identities or source hashes are silently remapped.

## APIs

`openStore(catalog)` returns `load(taskId)`, `save(task, options)`, `all()`, `flush()`, `onStatus(callback)`, `unsaved()`, `retry()` and `close()`. Save clones its input immediately and serializes writes. It increases revisions atomically, verifies the revision last observed by this store and rejects concurrent edits from another window. An import uses `save(merged, {expectedRevision: local.revision})`, because the imported revision is not the local database revision. A save is reported as saved only after the transaction completes. Quota, blocked-database, version and conflict errors remain visible; the unsaved draft remains available for recovery/export.

`createExport(catalog, tasks, {scope, selectedIds, taskId, evidenceFiles, language})` returns `{blob, manifest}`. Each evidence entry is `{path, blob, taskId, selectionId?, markId?, metadata?}`. Mark evidence must use `markId`; saved-view evidence uses `selectionId`. These relationships must be preserved when retaining imported files locally. `createAnnotationExport` returns the equivalent annotation JSON as `{blob, manifest}`.

`parseImport(file, catalog)` returns `{tasks, state, manifest, files, scope, partial, compatibility, conflicts}`. `files` is a map of verified ZIP entry names to bytes. The caller applies explicit task conflict choices and keeps evidence consistent with accepted task choices. It must not overwrite local evidence for a task whose import was kept local.

`previewConflicts(incomingTasks, localTasks)` returns task-level revision/content conflicts. `mergeTask(local, incoming, {policy, partial})` is pure and returns a task; it does not save or resolve conflicts by timestamp.

## Version changes and bounds

Unknown schemas, catalog hashes or source identities are rejected with explicit migration-required or mismatch errors. A future migration must ship a reviewed migration adapter that names both old and new schema/catalog/source versions, preserves the original package, produces a new package, and records the transformed fields. The importer never guesses a coordinate, release or catalog migration. There is no automatic import of the abandoned first application or the co-innervation project's storage.

ZIP32 cannot represent a single file or archive of 4 GiB or more. For responsive and bounded import, this implementation limits a package to 1 GiB unpacked, 10,000 files and JSON files to less than 100 MiB; larger evidence should be split into regional packages. Standard stored ZIP is supported everywhere. Deflated ZIP requires browser `DecompressionStream('deflate-raw')`; application-created ZIPs do not require that API. Malformed paths, duplicate names, unknown task IDs, missing linked evidence, unsafe numeric IDs, incompatible bindings and checksum failures are rejected.

## Verification

`node --test tests/storage.test.mjs` verifies exact all/selected/current round trips, note and large-ID preservation, lossless evidence bytes, source/version mismatch rejection, conflict decisions, ZIP corruption handling, serialized saves and recoverable errors. `node tools/browser-storage.mjs` runs isolated real Chromium IndexedDB tests against the local development server for persistence/reload, task-switch snapshots, cross-window conflicts, transactional quota-style failure/retry, and clean-profile ZIP import. These are software tests; they perform no anatomical adjudication and do not place test decisions in the user's default project database.
