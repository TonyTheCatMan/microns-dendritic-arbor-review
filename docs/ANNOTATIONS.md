# Image markup for dendritic review

The verdict form has been removed from the review workspace. Mark properties, exact-section navigation and notes now occupy that area. Prior saved decision status, answers and notes are retained in the same browser data and portable files; adding marks never changes scientific review status. General task notes use the existing note field.

## Draw and describe

- Arrow: drag from the tail to the feature.
- Point: click once.
- Trace: click along a visible route, then Enter or Finish trace to leave it open. To connect the tail to the start, click the first point (highlighted after three distinct vertices) or Close trace. A selected saved trace can be closed or reopened in its properties. Continue reopens the route and adds vertices under the same mark ID.
- Freehand: hold and draw a membrane boundary or other visible feature.
- Box or ellipse: drag opposite corners around a region.
- Distance: drag two endpoints; the physical distance is shown in micrometers.

Completed marks save immediately without opening a window or scrolling away from the image. Keep drawing with the same tool, or add an optional label, note, meaning, color and line width in the selected-mark inspector. Select finds an existing mark; drag its body to move it or its white handles to reshape it. Click its list entry to edit its note in the inspector. The full editor opens only through Edit or E; numeric vertex editing and a closed-trace checkbox are available there. The list can show every mark or just the current section; Go to returns to its stored section. Show marks hides overlays temporarily. Undo and redo apply to geometry and annotation edits. Pan is available as its own tool or temporarily with Shift/middle dragging. Keyboard shortcuts: H pan, V select, A arrow, P point, T trace, F freehand, B box, O ellipse, D distance, E edit selected note, Delete selected mark. Typing in fields does not trigger drawing shortcuts.

Task guidance follows the actual catalog: four identity tasks, 26 origin routes, nine branch relations, four compartment cuts, five boundary tasks and two damage tasks. It suggests soma membrane/identity evidence, separate named branch routes, possible attachment points, parent/child labels, plasma versus organelle/neighboring boundaries, and explicit damaged regions. It does not fill answers or infer continuity across missing sections.

## Save, download and upload

Work autosaves locally; Ctrl+S flushes it. Download annotations produces editable ZIP or compact JSON for the current task, selected items or all 50 tasks. Upload annotations validates the catalog/source binding and previews replace/merge/keep choices; existing work is kept by default when a conflict exists. Old packages remain accepted; use the updated website to open newly introduced mark types.

Download marked 2D image provides a PNG. For a portable evidence package, enable source imagery in ZIP export: native PNG, annotated PNG, SVG and metadata retain the original pixels, mark geometry, labels, notes and source receipts. SVG titles and JSON metadata contain complete mark notes. Image files alone are figures; editable mark transfer uses ZIP or JSON. Browser image-cache clearing does not delete annotation state.

## Coordinates and checks

Mark vertices bind to the actual XY/XZ/YZ section and acquired integer sample grid. Arrowheads and ellipse outlines are display geometry; no native image pixels are modified. Traces stay open unless explicitly closed. Closure is stored as `closed: true`, requires at least three distinct coplanar vertices, and adds the last-to-first edge without appending a duplicate start vertex. Canvas, SVG, 3D and Neuroglancer honor the same closure, and ZIP/JSON preserve it. Freehand routes remain open, and off-section marks are not connected through unreviewed planes. Unfinished traces remain explicit drafts. Stale or incomplete imagery cannot receive a new edit. When numeric editing moves a mark to another section, selected evidence is generated from that actual section.

Connected-trace checks: 90 Node tests and 12 focused browser workflows pass, including automatic saving without popups, open/closed trace controls, a delayed-Continue race and exact ZIP/JSON transfer. See `trace-browser-witness.json`. The 15 annotation workflows, four integrity regressions and 16 established workflows also pass on this update.

Earlier markup release evidence: 85 Node tests; 15 actual-pointer annotation browser checks; four focused regressions; 16 existing workflow checks; six durable-cache checks. `annotation-browser-witness.json` verifies exact data after fresh-profile ZIP and JSON uploads. `browser-annotation-regressions.json` covers trace Undo plus Ctrl+S/reload, legacy object/uppercase planes, and edited-depth export with visibly colored annotation pixels in the decoded PNG. Code `8f760201be3795b3afa9308dfe721dffa69a7738` is live through [run 37947487194](https://github.com/TonyTheCatMan/microns-dendritic-arbor-review/actions/runs/37947487194). All 37 public assets match the checkout; all 15 [public annotation workflows](live-annotation-browser-witness.json) pass, including exact fresh-profile ZIP and JSON imports. The full native integration suite also passes with lossless XZ PNG output and no page errors.
