# MICrONS Dendritic Arbor Review

A browser-based anatomy review workspace for the Interneuron Dendritic Input Organization study: **50 tasks, four cells, all human decisions initially unreviewed**. Russian is the default; English is selectable. No Python, desktop installer or reviewer profile is needed.

## Open

- Private repository: https://github.com/TonyTheCatMan/microns-dendritic-arbor-review
- Local preview: run `npm start`, then open http://127.0.0.1:8874. Node.js is needed only for this development server; a deployed static copy runs entirely in the browser.
- Build a static hosting directory: `npm run build`. Serve `dist/` through HTTPS or localhost. Keep the bundled `vendor/neuroglancer/` directory intact. No server-side application or database is required.
- Direct task links use `?task=MC264649.boundary_origin3944`.

The hosted preview and final verification receipt are recorded in `CHECKPOINT.md` and `docs/VERIFICATION.md` when deployment is complete. Private hosting requires the owner's authorized access; exports can be imported into another copy of this same application.

## Review

Choose a task. Native EM and Neuroglancer open at the source coordinate anchor. The source-anchor dropdown includes available soma, origin, cut and child anchors. Use XY/XZ/YZ, section buttons, Shift with the mouse wheel for sections, plain wheel or plus/minus for zoom, and drag for panning.

Double-click a segmentation structure in Neuroglancer to select the existing v1300 object. Selections retain the public source/version, exact string ID, visibility, color and individual note. A spatial selection remains an **unconfirmed identity candidate**, never an automatic release661 mapping or arbor partition. The 3D pane has no selected mesh until a structure is selected.

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
- The preparation has 11 cropped volumes. Only 1,112 of 27,099 source post coordinates lie inside those crops. MC264824 cuts 869, 2638 and 5297 have no prepared crop. Direct public EM can add navigable coverage, subject to availability; coverage is not attachment evidence.
- Full footprints: 27,099 contacts in 22,844 source footprints. All 115 original registry hashes were checked without changing originals.
- Review state is not collaboratively synchronized between different computers. Transfer it using export/import. Detached Neuroglancer windows synchronize within the same open review session.
- WebGL2 and modern Chromium/Edge are the tested browser requirements. Source access depends on public network availability. Unavailable chunks are marked explicitly; incomplete planes cannot be exported as complete evidence.

## Development and verification

`npm install` installs the browser-test dependency. `npm test` runs catalog, exchange, source-coordinate and viewer tests. With the local server running, `node tools/browser-test.mjs`, `node tools/browser-storage.mjs` and the viewer integration test exercise real browser workflows. Test profiles are temporary; demo marks and reviewer files are not part of the delivered default project.

See `docs/SOURCE_ADAPTER.md`, `docs/EXCHANGE.md` and `docs/VIEWER.md`. The original malformed decision schema is preserved; the versioned adapter leaves reviewer identity and qualifications null.

This application is new work in `researcher_review_website_v2`. The working co-innervation website supplied the retained Neuroglancer build and workflow reference. Abandoned applications and original scientific sources were not modified. Third-party notices are retained in `vendor/neuroglancer/NOTICE.txt`; the exact copied bundle files are documented in its vendor manifest.
