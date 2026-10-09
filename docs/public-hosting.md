# Public repository and GitHub Pages website

On 2026-10-09, after the difference from the original public repository was explained, the user explicitly authorized: “Oh i see so just make it public like the other one”. This supersedes the earlier private-repository requirement. Make the existing repository public and publish the restored application through its existing GitHub Pages workflow. Preserve the original website, source history and project identity.

- Public repository: https://github.com/TonyTheCatMan/microns-dendritic-arbor-review
- Live public website: https://tonythecatman.github.io/microns-dendritic-arbor-review/
- Deployment workflow: `.github/workflows/pages.yml`, on pushes to `main` and manual dispatch.

**Current publication state: image markup and notes deployed and publicly verified.** Code `8f760201be3795b3afa9308dfe721dffa69a7738` deployed through [run 37947487194](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37947487194). All 37 anonymously checked assets match checkout bytes. All 15 [live annotation workflows](live-annotation-browser-witness.json) pass, including marked-image download and exact fresh-profile ZIP/JSON restoration. The task-decision form is removed from the visible workflow; prior saved data remains compatible.

Earlier camera/cache publication evidence: Code `76cba0729ecdc915120a52bdaf651b459b2bd879` deployed in [run 37939970809](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37939970809), with all 31 anonymous public assets matching checkout bytes. The [live cache witness](live-cache-revisit-witness.json) passes all six checks, including zero source downloads on refresh, task revisits, new page and browser restart with HTTP cache disabled.

Earlier first-load deployment evidence: Code commit `9d995624a48171dfc596794d71ab99a4bc2523de` was successfully published by [run 37935498264](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37935498264). All 29 anonymous asset checks returned HTTP 200 and matched local bytes. The [public browser witness](live-cold-start-witness.json) passed all seven checks, covering first-open branches/imagery, ±32-section navigation, new tasks, rapid changes, cancellation, saved work and cache clearing.

The clean public visit displayed the complete first plane in 3,468.4 ms and automatic branches in 3,445.7 ms. Across 64 section moves, median latency was about 17.5 ms and the maximum was 749.7 ms while a background pack completed. No live BossDB/GCS requests or hidden Neuroglancer instance were needed. These measured public results are separate from localhost timings in `cold-start-witness.json`; neither is a latency guarantee.

This replaces prior public commit `d342c6b`, which had the same application code as interface-restoration commit `a5368cf3b6927a31e9eb52f07a899a03aae437ca`. Its older manual-mesh/four-warm-step checks remain in Git history. The current `restored-browser-witness.json` covers automatic branches and basic caching; comprehensive public first-open and boundary-crossing evidence is in `live-cold-start-witness.json`.

The current static build is about 699.8 MB, including 669,479,702 bytes of intentionally prepared, source-bound native EM and four genuine branch assets. The largest file is 4,295,881 bytes. Imagery is fetched per task and neighboring region, not as one download. All 207 EM files and their decoded source hashes were independently verified locally; public checks additionally verified the deployed manifests and representative binary assets. Future deployment verification should include those assets and a clean browser visit, not only core scripts.

Earlier on 2026-10-09 the repository was restored to private in response to the then-current requirement. GitHub rejected Pages configuration for that private repository with **HTTP 422**:

> Your current plan does not support GitHub Pages for this repository.

After propagation, anonymous repository and website requests returned HTTP 404. The private-repository [run 37926640178](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37926640178) passed dependency installation, tests and the static build, then failed at `actions/configure-pages@v5`; deployment was skipped. Those results document the earlier private-hosting limitation, not the status of the newly authorized public deployment. No paid plan or alternative host is required by the user's chosen arrangement.

The workflow installs dependencies, runs Node tests, builds `dist`, then uses GitHub's Pages artifact and deployment actions. Paths are relative to the repository subpath. GitHub supplies the workflow token; no stored deployment secret is needed.

Maintenance commands use `node tools/github-pages.mjs`:

- `--status` reads repository visibility, Pages settings and workflow results.
- `--audit` scans tracked files and reachable history for common credential signatures and local/export artifact paths.
- `--publish-public` runs the audit, requires administrator access to this known repository, makes it public and enables workflow-based Pages. It does not dispatch a workflow; the final push to `main` starts deployment.
- `--dispatch` requires a public repository with existing Pages and manually starts the workflow.
- `--check-public` verifies anonymous repository access (HTTP 200 with `private: false`), HTTP 200 responses for the website and 29 checked assets, and exact equality with local checkout bytes. The set includes prepared manifests, the first starter plane and its five neighboring packs, and all four branch assets.

Credentials are read through the installed Git credential helper into memory only.

Reviewer annotations remain browser-local. The static build intentionally includes the bounded, reproducible prepared EM and mesh assets. It excludes review exports, browser profiles, transient browser caches and original scientific volumes. Technical hosting checks do not validate anatomy or release mappings.

Official references: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages REST API](https://docs.github.com/en/rest/pages/pages), and [Pages deployment action](https://github.com/actions/deploy-pages).
