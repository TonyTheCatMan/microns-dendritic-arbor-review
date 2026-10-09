# Native EM navigation loading fix

The previous viewer discarded its displayed raw plane on every navigation event. Source reads inherited the cancelled view's abort signal, so a rapid move could discard an unfinished shard index or chunk that the next position still needed. Concurrent chunks did not share index requests, decoded hashes were recomputed for cache hits, and reslicing allocated arrays for every pixel.

`viewer/raw-source.js` now shares metadata, index and chunk requests. Cancelling a view releases that view immediately. Already active reads finish into the image cache; queued reads with no remaining consumer are discarded. A source-wide concurrency limit prevents rapid movement from accumulating unlimited network reads. The image cache remains separate from review storage.

Decoded SHA-256 promises use weak keys tied to cached byte allocations. Native row and stride copies replace per-pixel coordinate arrays. The plane reports `cacheHits` and `sharedChunks`. Source resolution remains 8 × 8 × 40 nm, and no interpolation or coordinate convention changed.

Verification on 2026-10-09: seven new deterministic source tests pass, plus the existing fourteen viewer tests. Tests verify every synthetic pixel for XY/XZ/YZ, shortened edge chunks, neighboring sections and overlapping pans; shared cancellation, bounded concurrency, skipped obsolete requests, request retries and zero network bytes on warm navigation are covered.

A same-process comparison of the prior committed reslice code (`d02f38e`) against the changed source used identical preloaded 128 × 128 × 16 chunks and a 512 × 512 plane, twelve measured repetitions after three warmups. Median reslicing time was 23.85 ms before and 0.96 ms after. This isolates source reslicing; it does not include canvas work or internet latency. The complete synthetic cached-source test separately measured 0.92 ms median, sixteen of sixteen cache hits and zero additional network bytes. Timings are diagnostic evidence, not machine-speed test thresholds.

A live-source Node check at `[752960, 646592, 858640]` nm loaded the complete public 512 × 512 XY plane in 10.34 seconds using 3,854,909 range bytes and twenty-five chunks. Three subsequent moves of 8 nm in X and 40 nm in Z took 1.67, 1.80 and 2.04 ms at the source layer, each with twenty-five of twenty-five cache hits and zero additional range bytes. These are real public EM bytes, not the synthetic fixture. Browser rasterization and native Neuroglancer rendering add their own work.

Uncached positions still require public source chunks. A cache hit does not imply that every other location or the native 3D mesh is already available. UI loading visibility and stale-plane protections are implemented separately in `ReviewViewer.js`.
