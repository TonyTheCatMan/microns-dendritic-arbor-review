# Current correction verification — 2026-10-09

This records software and source-binding checks. All 50 anatomy decisions remain unreviewed. The automatic-branch and prepared-imagery correction has passed local source, workflow and full native integration checks, and is now deployed with verified public assets and a passing clean public-browser run.

## Image markup follow-up

The current markup update passes 85 Node tests, 15 actual-pointer annotation workflows, four focused editing/import regressions, all 16 established review/exchange workflows and six durable-cache workflows. Checks cover all seven mark geometries, exact native samples, per-mark notes and styles, body/handle dragging, undo/save consistency, legacy plane formats, edited-section evidence, 50-task and selected exports, fresh-profile ZIP/JSON import, and visible annotation pixels in decoded PNGs. A fresh single-image worker found the toolbar, arrow handles, mark list and note inspector clear, with no overlap; the ambiguous cancel/undo labels were subsequently clarified. Public verification is pending. See [ANNOTATIONS.md](ANNOTATIONS.md).

## Cutout camera and durable cache follow-up

The latest local checks pass: six durable-cache workflows with all source endpoints blocked and HTTP caching disabled, 11 camera/rendering checks, and the 16 existing review/exchange workflows. The cache checks include a full browser restart and independently verify actual native pixels and complete mesh bytes. GPU reads confirm 50% blending without multiple transparent faces accumulating opacity. The close-up remains limited by source-mesh detail; use native EM for fine anatomy. See [cutout-and-cache.md](cutout-and-cache.md). Code `76cba0729ecdc915120a52bdaf651b459b2bd879` deployed successfully in [run 37939970809](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37939970809); all 31 public asset checks match. The [live cache witness](live-cache-revisit-witness.json) passes all six workflows with zero source requests/bytes on reload, task revisits, new pages and browser restart.

## What the earlier checks missed

The previous four-step warm test stayed within an already downloaded 16-section chunk. A clean public-site comparison measured 17.04 seconds for the new site's initial plane versus 4.29 seconds for the original site's prepared volume. Step six crossed a native chunk boundary and stalled for 13.65 seconds. A separate hidden-Neuroglancer control measured 252 versus 55 source requests and first-plane completion at 16.606 versus 7.463 seconds with that hidden instance enabled versus disabled. These individual runs explain the defect; they are not latency guarantees.

## Current source and browser evidence

**85 Node tests pass.** Coverage includes catalog/exchange invariants, exact large string IDs, source identity, integer coordinates, XY/XZ/YZ anisotropy, source sharding, shared cancellation and bounded caching, native mesh transforms, stale-plane protection, and prepared-data integrity. New prepared-source tests show the first plane before held background packs, verify every pixel through 80 sections across four chunk boundaries with no additional requests after warming, reject corrupted assets and changed public metadata, and preserve source binding after cache clearing.

`node tools/verify-prepared-em.mjs` independently verified:

- All 207 compressed EM assets and 4,275 decoded native chunks, including their hashes, coordinates, sizes and original shard receipts.
- All 36 starter planes against their native chunks, with **zero pixel mismatches**.
- All 50 task anchors and at least 32 sections in either direction within their prepared 80-section neighborhoods.
- The source metadata SHA-256 `95413c657ff900c114757b149b327fb410d465197093d8bcfb0fc97a8133e140`, matching the catalog.

The local browser receipt `cold-start-witness.json` verifies seven workflows: clean entry with actual branches and an exact native plane without a hidden native iframe; 64 serial steps through +32 and −32 offsets; new-task source binding; rapid task switches; reselecting the current task while a change is pending; saved notes/large IDs after reload; and cache clearing without losing review work. It records the first complete plane **439 ms after navigation**, branches at about 419 ms, and section steps at **14.7–25.9 ms**, with zero live-source bytes and independently matching native pixel hashes.

Those are **localhost results** and remain separate from the [public browser witness](live-cold-start-witness.json), which passed the same seven workflows on the deployed website. The clean public visit displayed its complete plane at **3,468.4 ms** and automatic branches at **3,445.7 ms**. The source-plane operation took 682.2 ms, transferring a 151,694-byte starter. This compares with the earlier public observations of 17.04 seconds for this site and 4.29 seconds for the original; these are individual measured runs rather than a controlled repeated benchmark.

The 64 public section moves all matched independently reconstructed native pixels and required no BossDB/GCS requests or hidden Neuroglancer instance. Median latency was about 17.5 ms; the maximum was 749.7 ms on the first move while a pack completed. The sixth move took 184.7 ms, and the remaining prepared moves took 15.2–24.3 ms; the negative-direction maximum was 23.9 ms. The first anchor's 80 sections cover offsets −42 through +37, including the full ±32 test. Network latency can still affect background packs and unprepared regions.

`starter-mesh-witness.json` records five browser checks: automatic first-open branches, all four recipients, rapid switching, saved camera/selection restoration and persistent explicit removal. `starter-recovery-witness.json` adds metadata-failure retry and live-source fallback checks. The four prepared meshes retain source, physical transforms, source fragment identity and binary hashes; their default candidate status is documented in `default-branches.md`.

The established browser suites cover 16 review/exchange workflows, six IndexedDB cases and four extended import/coverage cases. They use real browser storage and temporary profiles, including failed imagery with notes retained, task/current/all exports, exact contact footprints, import conflicts and image-cache eviction. All 16 workflows passed on rerun, including exact imported camera restoration. The full native-view suite also passed, covering spatial picks, embedded/detached synchronization, all physical planes, source-bound captures and lossless PNG exports. The native zoom race is fixed and covered by a deterministic regression.

## Preserved data and interpretation

The 50 tasks still bind to four recipients: seven MC298937, eleven MC264649, thirteen MC264920 and nineteen MC264824 tasks. All 27,099 source contacts and 22,844 complete footprints retain pre/post/center coordinates, eligibility and exclusions. All 115 original registry hashes were checked without modifying sources. The versioned schema adapter preserves the original malformed schema and leaves compatibility identity/qualification fields null.

Pixels remain native uint8 at 8 × 8 × 40 nm with integer sampling and no half-voxel offset. Native XZ/YZ exports preserve 8 × 40 nm sampling and physical aspect; the established lossless PNG check reports zero pixel differences. Prepared-data and live-source fallback paths retain the same export provenance contract. A stale or incomplete plane cannot be exported as complete evidence.

The original scientific preparation's eleven crops and missing distal-cut crops remain described as such. The new website assets add bounded navigation regions around all task anchors, including those cuts; they do not establish complete routes or attachment. Four soma-sampled v1300 meshes remain unconfirmed candidates, not release661 identity mappings or reviewed arbor partitions. Their multiresolution fragments are navigation geometry with limited coverage.

Review annotations remain browser-local. Public hosting publishes the app and prepared source assets, not reviewer work. Export/import is the transfer and backup mechanism; there is no multi-user cloud synchronization. Browser profiles, screenshots and test exports remain outside the delivered source/build.

## Size and deployment state

Prepared EM assets total **669,479,702 bytes**. Starter planes range from 137,365 to 167,084 compressed bytes, with 151,694 bytes for the first task. The complete static build is about **699.8 MB**; its largest asset is **4,295,881 bytes**. The browser fetches requested task regions and bounded neighbors, not the entire package. Full Neuroglancer starts on demand; wider or uncovered regions still require public-source access.

The earlier first-load code commit `9d995624a48171dfc596794d71ab99a4bc2523de` was successfully deployed by [run 37935498264](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37935498264). Anonymous requests for all 29 checked assets returned HTTP 200 and exactly matched local bytes. The [live browser witness](live-cold-start-witness.json) passed all seven checks with no reported failures. This deployment supersedes `d342c6b`; prior deployment checks remain in Git history. The current `restored-browser-witness.json` covers automatic branches and basic caching. See `public-hosting.md` and `CHECKPOINT.md` for deployment details.
