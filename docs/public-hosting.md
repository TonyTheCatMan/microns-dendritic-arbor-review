# Public repository and GitHub Pages website

On 2026-10-09, after the difference from the original public repository was explained, the user explicitly authorized: “Oh i see so just make it public like the other one”. This supersedes the earlier private-repository requirement. Make the existing repository public and publish the restored application through its existing GitHub Pages workflow. Preserve the original website, source history and project identity.

- Public repository: https://github.com/TonyTheCatMan/microns-dendritic-arbor-review
- Live public website: https://tonythecatman.github.io/microns-dendritic-arbor-review/
- Deployment workflow: `.github/workflows/pages.yml`, on pushes to `main` and manual dispatch.

**Current publication state:** the automatic-branch and prepared-imagery correction has passed local source, workflow and full native integration checks, including the native zoom regression. This correction has not yet been deployed or measured on the public URL. Local timings in `cold-start-witness.json` must not be reported as public-site timings.

The current prior public deployment is `d342c6b`, with the same application code as interface-restoration commit `a5368cf3b6927a31e9eb52f07a899a03aae437ca`. The original restoration was deployed by [run 37929719755](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37929719755) on 2026-10-09. Authenticated GitHub REST confirmed `private: false` and public workflow-based Pages. Anonymous repository access and all 14 essential website assets returned HTTP 200, and those assets matched that checkout. Six restored-interface checks passed against that deployment, including a manually loaded real mesh and four warm adjacent sections. The historical receipt is `restored-browser-witness.json`; those checks did not exercise default first-open branches or the later sixth-step chunk-boundary stall.

The current static build is about 699.8 MB, including 669,479,702 bytes of intentionally prepared, source-bound native EM and four genuine branch assets. The largest file is 4,295,881 bytes. Imagery is fetched per task and neighboring region, not as one download. All 207 EM files and their decoded source hashes were independently verified locally. Publishing this update requires the existing workflow to finish successfully, anonymous checks of the new manifests and representative binary assets, and a clean public-browser visit with ±32-section navigation. A core-script check alone does not verify the new prepared assets.

Earlier on 2026-10-09 the repository was restored to private in response to the then-current requirement. GitHub rejected Pages configuration for that private repository with **HTTP 422**:

> Your current plan does not support GitHub Pages for this repository.

After propagation, anonymous repository and website requests returned HTTP 404. The private-repository [run 37926640178](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37926640178) passed dependency installation, tests and the static build, then failed at `actions/configure-pages@v5`; deployment was skipped. Those results document the earlier private-hosting limitation, not the status of the newly authorized public deployment. No paid plan or alternative host is required by the user's chosen arrangement.

The workflow installs dependencies, runs Node tests, builds `dist`, then uses GitHub's Pages artifact and deployment actions. Paths are relative to the repository subpath. GitHub supplies the workflow token; no stored deployment secret is needed.

Maintenance commands use `node tools/github-pages.mjs`:

- `--status` reads repository visibility, Pages settings and workflow results.
- `--audit` scans tracked files and reachable history for common credential signatures and local/export artifact paths.
- `--publish-public` runs the audit, requires administrator access to this known repository, makes it public and enables workflow-based Pages. It does not dispatch a workflow; the final push to `main` starts deployment.
- `--dispatch` requires a public repository with existing Pages and manually starts the workflow.
- `--check-public` verifies anonymous repository access (HTTP 200 with `private: false`), HTTP 200 responses for the website and 14 essential assets, and exact equality of those assets with local checkout bytes.

Credentials are read through the installed Git credential helper into memory only.

Reviewer annotations remain browser-local. The static build intentionally includes the bounded, reproducible prepared EM and mesh assets. It excludes review exports, browser profiles, transient browser caches and original scientific volumes. Technical hosting checks do not validate anatomy or release mappings.

Official references: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages REST API](https://docs.github.com/en/rest/pages/pages), and [Pages deployment action](https://github.com/actions/deploy-pages).
