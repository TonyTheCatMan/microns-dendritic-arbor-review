# Technical verification — 2026-10-09

This is software and source-binding verification. No human anatomical review was performed and no default task is marked reviewed.

## Verified scope

- All 50 task IDs bind correctly to the four exact recipient roots and source questions: 7 MC298937, 11 MC264649, 13 MC264920 and 19 MC264824 tasks.
- All 27,099 original contacts and their separate pre/post/center coordinates survive adaptation, with complete 22,844 source footprints and eligibility/exclusions intact.
- The 115 original registry SHA-256 values were recomputed and matched. Original sources were not changed.
- The three MC264824 distal cuts retain explicit missing prepared-crop coverage and exact source anchors. All initial native query fields lie within the advertised public EM bounds; this is not a claim that every anatomical route has been acquired or reviewed.
- The original decision schema is malformed JSON. The documented v2 adapter supplies the browser schema while retaining the original file/hash and null identity/qualification compatibility fields.

## Tests

**38 Node tests pass.** `npm test` covers catalog invariants, exact string IDs, source and schema incompatibilities, known coordinate transforms including the half-voxel regression, sharding offsets and uint64 arithmetic, XY/XZ/YZ anisotropy, cache eviction/cancellation, open coplanar traces, decision option validation, ZIP CRC/hash integrity, selected/current/all exchange and source-contact navigation receipt validation.

With `npm start` running:

- `node tools/browser-test.mjs`: 16 UI workflow checks in a temporary Edge profile. Real native imagery, point/note capture, Ctrl+S, autosave/reload, saved views, version-bound candidate segment, section-safe trace drafts, undo/redo, seven-contact footprint retrieval from an exact synapse, task switching, bilingual controls, selected regional evidence ZIP, whole-project ZIP, clean-profile import/reload, keep-local conflicts, cache eviction and failed imagery with notes retained. No uncaught page errors. Receipt: `browser-workflow-results.json`.
- `node tools/browser-storage.mjs`: 6 real IndexedDB checks, including serialized snapshots, exact reload, cross-window conflicts, injected quota-style transaction failure with recovery/export, and a clean-profile 50-task round trip.
- `node tools/browser-extended.mjs`: 4 checks for all 50 direct task routes under image-network failure, selected native evidence import/reload, offline panel preview and exact four-file re-export. It uses the temporary ZIP produced by the UI test. Receipt: `browser-extended-results.json`.
- `node tools/browser-viewer.mjs`: native integration witness: real v1300 spatial pick, saved candidate selection, embedded/detached synchronization both directions, Ctrl+S, stale-task rejection, XY/XZ/YZ rendering, calibrated evidence and native navigation capture. Receipt: `native-browser-witness.json`.

The native raw-source witness is retained in `native-source-witness.json`. In a clean browser run the initial 512 × 512 XY field transferred approximately 3.86 MB in 25 chunk requests plus shard indexes. First useful pixels appeared around 5 seconds; complete plane loading took about 13 seconds on the tested connection. A warmed next section took 135 ms with no additional transferred bytes in the native integration test. Subsequent sections reuse downloaded 3D chunks. Exact measurements are in the receipts and are not a latency guarantee.

For the tested XZ export, PNG decoding reproduced native intensity values with **zero pixel mismatches**. Native sampling remained 8 × 40 nm in that plane. The annotated panel uses nearest-neighbour aspect correction, not invented resolution. Metadata records physical size, plane/depth, scale bar, source, chunk hashes and output hashes.

A fresh worker inspected exactly one default UI screenshot and returned text only. It found real image data, readable primary controls and no major layout breakage. Small secondary labels, annotation dropdown width and task scrolling affordance were improved. The coordinator did not view an image.

## Material limitations

- The four release661-to-v1300 identities remain unresolved. A tested public soma spatial pick is documented only as a candidate; it does not certify the recipient identity or any arbor partition.
- Original prepared volumes cover only part of the anatomy. Public EM additions depend on source availability; missing chunks are explicit and incomplete native planes cannot export as complete evidence.
- A Neuroglancer navigation capture can show a partially loaded multiscale scene. Such a figure has a visible partial-loading banner and readiness metadata. It supplements raw EM and is never represented as a native-resolution or complete anatomical reconstruction.
- Browser storage is local. Export/import is the transfer and backup mechanism; this release has no multi-user cloud synchronization. Private hosting is owner-accessible; collaborators need an authorized copy and exchanged files.
- WebGL2 and modern Chromium/Edge are tested. Arbitrary browsers, complete whole-cell anatomical coverage and expert anatomy conclusions are not certified.
- The native evidence pane is bounded to an 8.192 µm field per request to keep browser memory and requests manageable. It can pan through the public volume; Neuroglancer provides the wider multiscale overview.

The static hosting package is about 21 MB, with its largest file about 4.3 MB. It contains source-derived task/contact metadata and the viewer bundle, not bulk raw EM volumes or reviewer exports. GitHub/Sites deployment identities and the verified commit are recorded in the project checkpoint.
