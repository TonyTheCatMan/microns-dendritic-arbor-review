# Cutout framing and durable browser assets

The 2026-10-09 follow-up centers the initial 3D camera on the actual integer-sampled EM cutout. For the first task its physical viewing height is 7,106.96 nm, compared with the previous whole-neuron default of 700,408.29 nm. Selected objects default to 50%. Reset returns to the current cutout; Match 2D follows XY, XZ or YZ; Whole neuron provides the previous full overview.

Saved custom cameras and explicit opacity settings retain priority. Only a saved camera exactly matching the old automatic overview, including its basis, is migrated. New camera saves carry a version marker. A nearest-surface depth pass prevents overlapping front/back triangles from making 50% opacity look solid. It changes rendering only, not mesh vertices, EM pixels, provenance or review data. Meshes remain the existing multiresolution navigation surfaces: coarse facets can dominate a close-up, and fine anatomy is inspected in native EM.

Previously only decoded native chunks were durable. Prepared starter images, compressed packs, mesh binaries and both manifests used ordinary fetch and could be requested again after a reload. Those assets now use SHA-256-keyed Cache Storage, with exact manifest hashes pinned to the shipped source version. Corrupt copies are rejected; a source-version change cannot reuse older bytes. Already cached native chunks skip pack downloads and decompression. The cache holds up to 256 MiB/512 compressed assets in addition to the existing 64 MiB memory/256-chunk persistent source cache. Browser eviction, explicit clearing or reaching the bound can require another download; unavailable storage falls back to the network without blocking viewing.

Clear image cache stops background warming and clears both disposable image stores. Generation guards prevent old pending loads from refilling a cleared cache. Review annotations and imported evidence remain in their separate storage.

Validation:

- 73 Node tests pass, including exact manifest pins, changed source versions, corrupt cached bytes, bounded eviction, quota failure, storage denial and in-flight clearing.
- `cache-revisit-witness.json` passes six workflows with HTTP cache disabled and all image/mesh endpoints actively blocked after first loading. Reload, task revisits, adjacent sections, a new page and full browser restart issue zero source requests/bytes. Actual pixels are reconstructed independently from native packs, and the complete displayed mesh is re-hashed against its source manifest.
- Two warmed cells retain 16 assets (about 44 MB) and 250 native chunks. These are observed test counts, not a required global cache size.
- `cutout-camera-browser-witness.json` passes 11 checks for default framing/opacity, Reset, every orthogonal plane, legacy migration, basis-only camera edits, saved overview and custom opacity. GPU bytes show 99.68% of changed interior pixels within two channel levels of the expected 50% blend, with no WebGL error.
- Existing 16 review/exchange workflows, five starter-mesh checks, six familiar-view checks and both starter failure/retry/fallback checks pass. Saved notes, marks, exact IDs and camera import/export survive.

Local cache proof is recorded separately from public performance measurements. Public deployment verification for this follow-up is pending. Future prepared-data regeneration must update the corresponding manifest pin in `viewer/asset-cache.js`; the unit suite rejects stale pins.
