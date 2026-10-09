# Private repository with a public GitHub Pages website

The user's clarified requirement is to keep the existing repository **private** and serve its application through a **public GitHub Pages website**. Never make the repository public, create a public mirror, change hosting, or purchase a plan as a workaround.

- Private repository: https://github.com/TonyTheCatMan/microns-dendritic-arbor-review
- Requested public website: https://tonythecatman.github.io/microns-dendritic-arbor-review/
- Deployment workflow: `.github/workflows/pages.yml`, on pushes to `main` and manual dispatch.

On 2026-10-09 the repository was restored to private immediately after clarification. Authenticated GitHub REST verified `private: true` and `visibility: private`; anonymous repository requests returned HTTP 404. Files and history were preserved.

GitHub then removed Pages availability during the visibility transition. An authenticated attempt to retain/re-enable Pages with `build_type: workflow` on this private repository returned **HTTP 422** with the exact message:

> Your current plan does not support GitHub Pages for this repository.

Authenticated Pages reads returned HTTP 404. The available credential did not expose the account's plan name, so no particular plan is inferred. The initial website briefly remained HTTP 200 from the previous deployment while the transition propagated; that response does not establish continuing private-repository Pages eligibility. Public website hosting is blocked by the reported GitHub account restriction. The repository stays private.

After propagation the public website also returned HTTP 404. A fresh workflow from the private repository ([run 37926640178](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37926640178)) passed dependency installation, tests and the static build, then failed at `actions/configure-pages@v5`; deployment was skipped. This independently confirms that the remaining failure is Pages setup, not an application build failure.

The workflow installs dependencies, runs Node tests, builds `dist`, then uses GitHub's Pages artifact and deployment actions. Paths are relative to the repository subpath. GitHub supplies the workflow token; no stored deployment secret is needed. It can deploy if private-repository Pages becomes available; no account change has been made.

`node tools/github-pages.mjs --status` reads repository visibility, Pages settings and workflow results. `--dispatch` requires a private repository with existing Pages availability before triggering the workflow. `--check-public` expects anonymous source-repository access to return 404 while verifying public website assets. `--audit` scans tracked files and reachable history for common credential signatures and local/export artifact paths. The helper has no command that changes repository visibility; its former publication command is rejected. Credentials are read through the installed Git credential helper into memory only.

Reviewer annotations remain browser-local. The static application build excludes review exports, browser profiles, image caches and original raw volumes. Technical hosting checks do not validate anatomy or release mappings.

Official references: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages REST API](https://docs.github.com/en/rest/pages/pages), and [Pages deployment action](https://github.com/actions/deploy-pages).
