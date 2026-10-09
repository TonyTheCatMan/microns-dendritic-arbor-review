# Source adapter v2

The new application catalog is a deterministic, read-only adaptation of `focused_validation_v1/anatomy/preparation/task_catalog.json`. It contains the exact 50 tasks: MC298937 (7), MC264649 (11), MC264920 (13), MC264824 (19). All decisions and answers start unreviewed and empty. No scientific result, anatomy decision, eligibility, contact coordinate or source identity is recomputed or changed.

## Files and bindings

`data/catalog.json` is the compact UI catalog. It includes bilingual task questions, source-specific alternatives, separate cut-child compartment/attachment fields, all soma/origin/cut-neighborhood navigation anchors, 11 volume transforms, source hashes and source pointers. Origins excluded by source geometry remain present. Source labels describe geometry, not certified anatomy. The category-specific fields retain all source alternatives; `unresolved` is a selectable decision, not a populated default.

`data/contacts/MC*.json` lazily loads one recipient. `contacts` retains every original synapse ID, source root, separate pre/post/center nm coordinates, pre/post supervoxels, post level-2 ID, original and eligible domain, original eligibility, source JSONL line, footprint JSONL line, and post-coordinate crop coverage. `footprints` retains every source root and its complete contact-ID membership, eligible-contact subset and original eligibility counts. Full source footprints include contacts outside all prepared crops. The builder checks each record against the hashed original contact and footprint rows. The four files total about 15.1 MB (decimal); no raw image array is bundled in these files.

`data/source-pointers.json` separately retains all 115 immutable source-registry hashes, original absolute pointers, unmodified task question strings, source node flags, and approximate historical navigation landmarks. It is not loaded into the default reviewer UI. Original observation files remain accessible by exact hash/path/tile pointers; their prior model judgments are not reviewer decisions. In particular, the leading prior-model preference in `MC264649.boundary_origin3944` is removed from the reviewer question while the original wording remains in this source record. Specific damage coordinates and tile pointers are retained in the default catalog.

`sourceHash` is the SHA256 of the original preparation task catalog bytes. `catalogHash` is the SHA256 of compact, sorted-key, UTF-8 JSON of the adapted catalog excluding its own `catalogHash` field. Integer-valued coordinates are normalized to JSON integers for agreement between Python and JavaScript. Per-recipient `contactsHash` binds the actual exported contact JSON bytes. `data/build-receipt.json` records source checks and generated output hashes. Contact IDs, neuron roots and supervoxel IDs are strings throughout.

## Coordinates, versions and limits

All navigation follows `nm = (local_voxel + voxel_offset) * resolution`. There is no implicit half voxel. The annotation grid of 4/4/40 nm is not the imaging resolution. Prepared arrays retain their actual 16/16/40 or 32/32/40 nm resolutions and half-open bounding boxes. The public EM metadata was independently fetched by the viewer implementation on 2026-10-09: finest advertised `8_8_40`, raw uint8, chunk size 128/128/16. The metadata hash and a real native chunk witness are referenced from `docs/native-source-witness.json`.

No validated release661 to public m1300 segmentation identity bridge is present in the supplied source anchors. All four recipient mappings therefore explicitly have `status: unresolved` and `segmentId: null`. A spatially picked m1300 object is a candidate with its own source version. It must never be populated from a numerically equal release661 root or presented as verified recipient identity. Source skeleton neighborhoods are navigation, not membrane surfaces.

The three tasks `MC264824.cut869`, `MC264824.cut2638` and `MC264824.cut5297` have no existing prepared crop. Their original nm anchors and all cut-neighborhood nodes are nevertheless available for public-source navigation; no soma substitute is introduced. Damaged-section tasks retain z = 872320 nm (global z = 21808, MC298937 tile 8) and z = 818640 nm (global z = 20466, MC264824 tile 2). The approximate prior MC298937 damage line is kept only in the separate source record, not presented as an expert trace.

Only 1,112 of all 27,099 source post coordinates geometrically fall inside the prepared crops; this says nothing about membrane visibility, attachment or expert anatomical validation. The catalog retains all 22,844 complete source footprints. No functional outcomes, prior model verdicts or selected biological partitions are supplied as defaults.

## Decision schema adaptation

The original `decision_schema.json` is invalid JSON: it lacks a closing brace for its `task_record` definition (parse failure at line 60, column 1). Its original bytes and SHA256 are preserved and not repaired in place. The source blank template is valid JSON and its 50 source bindings match the original catalog hash; all its decisions are unreviewed.

`data/decision-schema-v2.json` and `data/decisions-blank-v2.json` document the separate v2 decision adapter. These are the decision-only compatibility format; the application's portable project/export format additionally binds annotations, selections, views, evidence and conflict metadata. No name, qualifications, role, account or profile entry is requested. Obsolete `reviewer_name` and `qualifications` compatibility values remain null. `reviewed` means the user marked a task reviewed; it does not imply qualified expert review or anatomical certification. All exports keep `anatomicalCertification: false` and `originalSourcesModified: false`.

Future adapter changes must change the adapted catalog hash and retain an explicit source/catalog migration path. Legacy `EXPERT_RECORDED_UNCERTIFIED` or arbitrary anatomy text must never silently become a certified decision. A migration must retain original notes, map exact task IDs, revalidate source bindings and expose conflicts.

## Rebuild and tests

Developer rebuild from this application directory: `python tools/build-catalog.py`. It uses only the Python standard library, verifies the four original contact, footprint and anchor files, and reads originals without changing them. `python tools/build-catalog.py --verify-raw` additionally rehashes every registry source, including raw arrays (about 2.39 GB read, no copying). This developer step is not needed by users of the static website.

`node --test tests/catalog.test.mjs` checks exact task bindings, deterministic catalog hashing, native/prepared transforms, every origin/cut anchor, explicit no-crop cases, damage positions, bilingual blank review fields, unresolved version identity, every contact-to-footprint membership, preservation of large IDs, and independent geometric containment for all 27,099 post coordinates. These are technical source-preservation tests and do not make anatomical judgments.
