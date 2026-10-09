# Public repository and GitHub Pages website

On 2026-10-09, after the difference from the original public repository was explained, the user explicitly authorized: “Oh i see so just make it public like the other one”. This supersedes the earlier private-repository requirement. Make the existing repository public and publish the restored application through its existing GitHub Pages workflow. Preserve the original website, source history and project identity.

- Public repository: https://github.com/TonyTheCatMan/microns-dendritic-arbor-review
- Live public website: https://tonythecatman.github.io/microns-dendritic-arbor-review/
- Deployment workflow: `.github/workflows/pages.yml`, on pushes to `main` and manual dispatch.

Authenticated GitHub REST confirmed `private: false` for the repository and `public: true`, `build_type: workflow` and the expected URL for Pages. [Deployment run 37929719755](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37929719755) successfully built and deployed restored application commit `a5368cf3b6927a31e9eb52f07a899a03aae437ca` on 2026-10-09. Anonymous repository access returned HTTP 200 with `private: false`; all 14 essential website assets returned HTTP 200 and matched the local checkout byte for byte. The deployed catalog contains 50 tasks. The public website is live. All six restored-interface browser checks also passed against the live public URL: real mesh loading (candidate `864691136389585015`, 77,559 triangles), four adjacent sections with zero new source bytes (8.4–12.5 ms), camera save/reload, brightness, navigation and bilingual controls. No page errors were observed. The receipt is `docs/restored-browser-witness.json`; broader technical checks are documented in `VERIFICATION.md`.

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

Reviewer annotations remain browser-local. The static application build excludes review exports, browser profiles, image caches and original raw volumes. Technical hosting checks do not validate anatomy or release mappings.

Official references: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages REST API](https://docs.github.com/en/rest/pages/pages), and [Pages deployment action](https://github.com/actions/deploy-pages).
