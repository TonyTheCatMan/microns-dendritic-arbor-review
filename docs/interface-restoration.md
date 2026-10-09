# Original interface restoration

The 2026-10-09 correction replaces the redesigned three-column dashboard with the original review site's interface baseline. The read-only reference is `MICrONS_inhibitory_coinnervation_PUBLICATION_PREP/RUSSIAN WEBSITE FILES RESEARCH HANDOFF`.

The following stylesheets were copied without modification into `reference-ui/`, in the original cascade order. SHA-256 equality was verified against the source files:

| Copied file | SHA-256 |
| --- | --- |
| viewer.css | bee795a4ab28abebbc83c40bc12697fc1f7112235e930af39fca94e9e8142e83 |
| surface3d.css | e286d742c2e5e279bbffa7026687da13b2e9fe8a5b30c8e5986cda83b7339fee |
| site.css | 3200877ba9ac322d6bb834894de218e1014ccd6f7645689f7f2ed74dad480980 |
| annotations.css | 49e7fd8d791191e9c23f7f70ca878877b160c08507acbbb75d0d71cdf359cfc0 |

`index.html` follows the original structure and class names: dark MICrONS masthead, white navigation with emphasized Neuroglancer tab, workspace title, search-scope disclosure, save/export bar, case/position sidebar inside the bordered workspace, section/display/annotation controls above paired raw-EM and surface panels, prominent fit/reset strips, then annotation/evidence list beside task properties. The Neuroglancer workspace and Sources are separate pages, as in the reference.

The biological content is specific to four cells and 50 dendritic anatomy tasks. Old co-innervation cases, reviewer fields, synapse-specific verdicts and storage are not imported. `app.css` contains only adapters for existing task/evidence modules, native EM canvas sizing, dialogs, and the new bilingual controls. Every functional ID from the previous v2 `index.html` is retained exactly once. Static validation found no duplicate IDs or authored arrow characters.

## Integration contract

Existing data, persistence and exchange IDs are retained. Added controls to bind are `taskSelect`, `sliceSlider`, `zoomSelect`, `blackInput`, `whiteInput`, `rawButton`, `windowButton`, `fitButton`, `show3D`, and `syncNeuroglancerMain`. Added page containers are `page-viewer`, `page-neuroglancer`, `page-sources`, with the existing `ngFrame` in the separate native page. New non-dictionary labels use `data-ru` and `data-en` attributes.

The original surface viewer receives its expected IDs: `surfaceCanvas`, `surfaceLabels`, `surfaceStage`, `surfaceStatus`, `surfaceObjects`, `surfaceReadout`, `surfaceRetry`, `surfaceReset`, `surfaceXY`, `surfacePlane`, `surfaceBox`, `surfaceOpacity`, `surfaceOpacityReadout`, and `surfaceExport`. `meshStatus` is a separate always-visible loading/provenance message. The native frame may use the `.background-native` offscreen page class when serving as a live segmentation provider.

The original stylesheets retain their attribution context through this provenance document. The reference folder was read only and its deployment was not touched. No anatomy judgments are supplied by these UI changes.

## Verification boundaries

The copy hashes, old ID preservation and absence of duplicate IDs were checked during restoration. Browser behavior, layout comparison, native viewer surfaces, persisted data round trips and deployed behavior must be verified by the coordinator after viewer integration; static markup validation alone does not establish those outcomes.

## Completed integration

The original surface3d.js and marker-styles.js are copied into reference-viewer. The LegacySurface adapter supplies actual decoded public mesh triangles, restores per-task cameras and replaces TIFF-only XY/+0.5 slice placement and occlusion with the exact integer-sampled plane. The original display-window formula and camera quaternion/physical-scale conversion are retained. All listed controls are bound. The original image delivery was adapted to bounded native source chunks because its prepared volumes belong to unrelated cases; no old-case volumes or review storage were copied.

Separate single-image workers inspected original and restored pages: both have the same dark masthead, separate tabs, narrow case sidebar, paired equally wide views, original surface-control arrangement and lower evidence/properties. A final fresh worker verified fully framed branching mesh geometry after loading, with no apparent flat-plane-only scene. Cached moves, actual mesh display, camera reload, brightness, navigation, import/export, detached sync and lossless native pixels were verified in live browser tests. The user subsequently authorized a public repository and GitHub Pages; deployment succeeded, and anonymous requests verified the current application and 14 essential assets. See public-hosting.md for deployment evidence.
