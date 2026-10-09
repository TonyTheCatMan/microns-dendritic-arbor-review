# MICrONS Dendritic Arbor Review

A browser-based anatomy review workspace for the Interneuron Dendritic Input Organization study: **50 tasks, four cells, all human decisions initially unreviewed**. Russian is the default; English is selectable. No Python, desktop installer or reviewer profile is needed.

## Open

- Public repository: https://github.com/TonyTheCatMan/microns-dendritic-arbor-review
- Live website: https://tonythecatman.github.io/microns-dendritic-arbor-review/. The automatic-branch and prepared-imagery correction is **deployed and publicly verified** at code commit `9d995624a48171dfc596794d71ab99a4bc2523de`, via [run 37935498264](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37935498264). All 29 checked assets returned HTTP 200 and matched the checkout. See `docs/public-hosting.md`. The older GPT-hosted preview is not the final host.
- Local preview: run `npm start`, then open http://127.0.0.1:8874. Node.js is needed only for this development server; a deployed static copy runs entirely in the browser.
- Build a static hosting directory: `npm run build`. Serve `dist/` through HTTPS or localhost. Keep the bundled `vendor/neuroglancer/` directory intact. No server-side application or database is required.
- Direct task links use `?task=MC264649.boundary_origin3944`.

Current implementation, tests and deployment status are recorded in `CHECKPOINT.md` and `docs/VERIFICATION.md`. Reviewer annotations remain browser-local; review exports can be imported into another copy of this application.

## Review

Choose a task. The native EM plane opens at its source coordinate anchor, and the right pane automatically displays genuine branches from a public segmentation candidate sampled at the recipient soma. The source-anchor dropdown includes available soma, origin, cut and child anchors. Use XY/XZ/YZ, section buttons, Shift with the mouse wheel for sections, plain wheel or plus/minus for zoom, and drag for panning.

The section rectangle is a spatial reference within the branch view. Drag rotates; Shift-drag pans; the wheel zooms. Saved selections and cameras take priority, and an explicitly removed default candidate stays removed. **Show structure in 3D** samples the current section center when another structure is needed. Open the separate Neuroglancer tab for the full native viewer; it starts on demand instead of competing with initial imagery downloads. You can double-click a segmentation structure there to select an existing v1300 object. The original surface renderer, layout, style sheets and control arrangement are retained.

Selections retain the public source/version, exact string ID, visibility, color and individual note. A spatial selection remains an **unconfirmed identity candidate**, never an automatic release661 mapping or arbor partition. The four prepared branch assets contain real source mesh fragments, not invented geometry; their coverage and level of detail are limited. See `docs/default-branches.md`.

All 50 tasks have an exact native starter plane and 80 nearby sections served from the website. The 36 distinct anchors reuse 171 bounded chunk packs, covering at least 32 sections in either direction at the initial field. Initial planes are 137–167 KB compressed; neighboring packs load in the background. Larger moves, wider fields and uncovered regions continue to use the public source. Native pixels, integer alignment, source metadata and chunk SHA-256 receipts are preserved. See `docs/loading-fix.md`.

Create points, open traces, rectangular regions and distances. Each item has its own name, note, visibility and stable ID. Edit vertices numerically; delete, undo and redo are available. Traces never close automatically or interpolate between sections. An unfinished mark autosaves explicitly as a draft.

Save a named selection to retain a view, chosen structures, checked marks and any explicitly focused source-contact record. Exact contact or source-root search loads the complete source footprint, retaining pre/post/center coordinates and exclusions.

Autosave and Ctrl+S write review state into IndexedDB. The visible indicator reports save failures. Annotation storage is separate from the bounded image cache. Browser storage is local, so retain ZIP or JSON backups outside the browser.

## Exchange and figures

Export the current task, checked evidence items, or all 50 tasks. Compact JSON contains annotations and decisions. ZIP carries source-bound review JSON, provenance, compatibility adapter, per-file SHA-256 checksums and optional evidence files. Self-contained regional export includes native PNG intensities, a calibrated physically proportioned annotated PNG, vector overlay and metadata with plane, physical sampling, raw source identity and chunk hashes. It captures the current view, saved views and marked planes within the chosen scope. It does not embed the entire public volume.

Import first validates schema, catalog, source identities, checksums, task fields, string IDs and coordinate constraints. A preview presents every affected task; conflicts keep local work by default. Replacement requires choosing it explicitly. Selected-item imports retain unrelated work. Imported evidence bytes survive image-cache clearing and reload.

Technical validation and export never certify membrane identity, anatomy or the study hypothesis. No functional results or inherited model verdicts are shown in the default review.

## Sources and limits

- Public EM: `https://bossdb-open-data.s3.amazonaws.com/iarpa_microns/minnie/minnie65/em`. Finest advertised level verified 2026-10-09: raw uint8 **8 × 8 × 40 nm**. Sharded gzip transport is decoded losslessly, with bounded byte-range requests.
- Public segmentation: `https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300`.
- The 4/4/40 nm annotation grid is not 4 nm EM. Earlier preparation crops at 16/32 nm XY remain identified at their actual sampling.
- Coordinates use integer sampling: `nm = (local + voxel_offset) * resolution`; no imported TIFF half-voxel offset.
- Release661 to v1300 identities remain unresolved unless independently documented; numeric root equality is never assumed.
- The original scientific preparation has 11 cropped volumes. Only 1,112 of 27,099 source post coordinates lie inside those original crops; MC264824 cuts 869, 2638 and 5297 have no original prepared crop. This website additionally packages bounded native EM around every task anchor, including those cuts. That navigation coverage does not establish attachment or complete anatomical-route coverage.
- Full footprints: 27,099 contacts in 22,844 source footprints. All 115 original registry hashes were checked without changing originals.
- Review state is not collaboratively synchronized between different computers. Transfer it using export/import. Detached Neuroglancer windows synchronize within the same open review session.
- WebGL2 and modern Chromium/Edge are the tested browser requirements. Source access depends on public network availability. Unavailable chunks are marked explicitly; incomplete planes cannot be exported as complete evidence.

## Development and verification

`npm install` installs the browser-test dependency. `npm test` runs 61 catalog, exchange, source-coordinate and viewer tests. With the local server running, the browser workflow, storage, starter-mesh and viewer integration tools exercise real browser behavior. Test profiles are temporary; demo marks and reviewer files are not part of the delivered default project.

`node tools/prepare-em.mjs` reproducibly acquires the bounded public EM assets. `node tools/verify-prepared-em.mjs` independently verifies every compressed asset and native chunk, all starter pixels and the ±32-section coverage contract. Prepared EM assets total 669,479,702 bytes; the complete static site is about 699.8 MB, with no individual asset larger than 4.30 MB. Only requested crops are downloaded, not the whole site.

The [public browser witness](docs/live-cold-start-witness.json) passed all seven checks. A clean public visit displayed the complete first plane in 3.47 seconds and automatic branches in 3.45 seconds. Across 64 section moves, median latency was about 17.5 ms; the slowest was 750 ms while a background pack completed. No live EM/segmentation requests or hidden Neuroglancer instance were needed. These are measured runs on the tested connection, not latency guarantees.

See `docs/SOURCE_ADAPTER.md`, `docs/EXCHANGE.md` and `docs/VIEWER.md`. The original malformed decision schema is preserved; the versioned adapter leaves reviewer identity and qualifications null.

This application is in `researcher_review_website_v2`. The working co-innervation website supplied the directly copied interface styles, original WebGL surface renderer, intensity-window code, camera synchronization formulas and retained Neuroglancer build. `viewer/LegacySurface.js` adapts real public meshes and integer-sampled planes to that renderer; old cases and storage were not transplanted. Abandoned applications and original scientific sources were not modified. Third-party notices are retained in `vendor/neuroglancer/NOTICE.txt`; the exact copied bundle files are documented in its vendor manifest.
