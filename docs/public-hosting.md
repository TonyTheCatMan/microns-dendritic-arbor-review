# Public GitHub Pages

The user explicitly requested the existing repository become public and immediately runnable through GitHub Pages on 2026-10-09.

- Repository: https://github.com/TonyTheCatMan/microns-dendritic-arbor-review
- Public site: https://tonythecatman.github.io/microns-dendritic-arbor-review/
- Deployment workflow: `.github/workflows/pages.yml`, on pushes to `main` and manual dispatch.

The workflow installs dependencies, runs Node tests, builds `dist`, then uses GitHub's Pages artifact and deployment actions. All app, catalog, module and native viewer paths are relative to the repository subpath. GitHub supplies the workflow token; no stored deployment secret is needed.

`node tools/github-pages.mjs --audit` scans tracked files and all reachable historical blobs for common secret signatures and forbidden local/export artifact paths. `--publish` repeats that focused audit, makes this exact existing repository public, and enables Pages with the workflow build type. It does not create another repository. Git administration credentials are read through the installed Git credential helper into memory only.

`--status` reports deployment status. `--dispatch` starts the checked-in workflow. `--check-public` verifies unauthenticated repository access, the site entry point, JS/CSS, the fifty-task catalog, viewer modules and native JS/WASM assets.

Reviewer annotations remain browser-local; GitHub Pages receives only the static application, public-source catalog and technical documentation. Review exports, browser profiles, local cache and original raw volumes are excluded from the repository and site build. Public availability does not validate anatomy or release mappings.

Official references: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages REST API](https://docs.github.com/en/rest/pages/pages), and [Pages deployment action](https://github.com/actions/deploy-pages).
