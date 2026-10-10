# Focused anatomical workflow: sources and limits

This extension preserves the original catalog, scientific files, assignments and 50 task IDs. The generated `data/focused-workflow.json` supplies a blinded navigation index and independent decision scopes. Rebuild offline from this app directory with `python -X utf8 tools/build-focused-workflow.py`. The builder reads metadata and text only; it makes no image observations, requests no new data, runs no prior scientific helper and modifies no source record.

## Actual task grouping

There are **15 navigation groups and 50 independent questions**. Four soma/stem groups contain 4 identity and 26 origin-route questions. Eleven branch groups contain 9 branch-relation, 4 compartment-cut and 7 boundary/damage questions. The original tasks have distinct decision scopes; none was discarded or declared an exact duplicate. Navigation grouping is by documented origin, cut and route-family identities, never spatial proximity. The source-nominated route families do not establish a common biological junction.

| Target | Soma/stem groups / questions | Branch groups / questions | All questions |
|---|---:|---:|---:|
| MC298937 | 1 / 5 | 1 / 2 | 7 |
| MC264649 | 1 / 7 | 3 / 4 | 11 |
| MC264920 | 1 / 8 | 2 / 5 | 13 |
| MC264824 | 1 / 10 | 5 / 9 | 19 |

Each question has one original-task owner. Other questions reuse an identical route question by its dependency ID, rather than recording another answer to that same route. For example, `MC264824.origin2601_to_soma` is referenced by three relation questions. The 2601/2710 pair, 2601/2711 pair and 2601/2710/2711 triple retain independent decisions. A dependent question remains unresolved until its own evidence is recorded. A route decision never certifies a contact or incoming source axon.

Questions use the existing bilingual catalog text, source alternatives and precise bookmarks. Short prompts identify the issue to resolve; detailed prompts remain available. An additional reviewer-specified alternative permits interpretations outside the prepared scenarios. Original question and evidence pointers remain source-bound. Prior observation text and model preferences are not copied into the researcher workflow.

## Contact selection

All **27,099 contacts and 22,844 recipient-specific source footprints** remain in the existing contact packs. The optional concern queue contains exactly **891 contacts** with documented source flags: 101 `predicted_axon` and 790 `root_or_unreachable`. These are computational compartment/assignment concerns, not confirmed attachment errors. Queue inclusion does not alter eligibility, assigned domains, exclusions or contact coordinates.

The deterministic order is catalog recipient order, original crop coverage first, concern code, then exact numeric synapse ID. No effect, significance, favorable cell label, inferred attachment outcome or nearest-contact example is used. The queue is neither a representative audit sample nor a required manual-review quota. Every other contact remains accessible through search and whole-source footprints. Contact links to anatomical questions provide context only; they cannot propagate a decision to the contact.

The authorized workflow specification supplies primary/broader analysis denominators of 1,170 / 1,182 unique eligible contacts. This UI extension does not recompute those denominators, use them to select contacts or convert them into review quotas. No justified contact sampling protocol, sample size or seed was found in the inspected preparation README/task catalog, inventory source notes or focused decision report. The exported workflow explicitly records the missing protocol and an empty audit set.

## Exact-version curation metadata

The following immutable local inputs were actually inspected and joined, rather than relying on a preserved hash alone:

- `L4/geometry/v661_proofreading_status_public_release_merged.csv.gz`
- its companion `..._header.csv`, which contains one field/type pair per line; the compressed table itself has no header
- `L4/geometry/v661_annotation_receipt.json`, against which both table and header bytes were SHA-256 verified
- the four exact root/nucleus/version-661 metadata JSON files under `prospective_validation_v2/inventory/metadata_json/`
- `prospective_validation_v2/inventory/candidate_inventory.csv` and `SOURCE_NOTES.md`

All four target roots have `extended` dendrite and `extended` axon curation in both their exact-version JSON metadata and the table. Their target-specific native review remains unreviewed. Target axon curation says nothing about the separate incoming source axons.

The complete incoming-source string-root join covers **21,230 unique incoming roots across the four targets**, including all raw contacts. Exactly **531 roots** match one row in the saved v661 proofreading table: 419 have axon status `clean`, 97 `extended`, and 15 `non`. **20,699 roots have no row in this saved table**, which means unknown in this source, not failed quality. Per-target matched-root counts are 309/5,430 (MC298937), 128/5,556 (MC264649), 200/5,260 (MC264920), and 159/6,598 (MC264824); these overlap across recipients and must not be summed as unique roots.

The generated lookup records exact decimal-string roots, table row numbers/IDs, source hashes and release661 binding. This is a limited inherited-curation metadata lookup for all raw incoming roots; it is not an eligible-functional-pool quality audit, complete axon tracing, a native identity bridge, attachment review or a release661-to-m1300 mapping. Every entry retains pending native-quality status, including those with clean/extended inherited curation.

The outstanding audit must freeze the exact incoming source pool and quality policy; reconcile release/version and identity; document missing or contradictory metadata; then review the required native source-axon routes and selected attachments with source-bound evidence. No new cohort, numerical quality threshold, sample quota or anatomy status is inferred by this extension.

## Coverage and provenance

The original package contains 11 cropped arrays, their exact hashes/resolutions/bounds, 202 attributed prior-model tile observations, evidence pointers and render transforms. Original prepared crop coverage is absent for `MC264824.cut869`, `.cut2638`, and `.cut5297`. Current 8 × 8 × 40 nm prepared neighborhoods and live native retrieval can provide imagery beyond those original crops, but their presence does not establish complete route coverage or preserved membrane signal. The workflow separates original crop containment from current fetch availability and retains unknown route bounds. No contour, verified route or missing-section interpolation is invented.

`workflowHash` hashes the complete canonical workflow payload, excluding the hash itself; existing `catalogHash` and `sourceHash` remain unchanged. Source receipts include hashes for the original task catalog, registry, named-contact index, legacy decision schema, evidence/render indexes, inventory and decision report. Functional report contents are deliberately excluded from researcher data. Source task refs retain original JSON pointers; contacts retain exact pre/post/center coordinates, source/target IDs and source/footprint row links.

The immutable legacy `decision_schema.json` is not valid JSON (parser failure at line 60, end of file). Its bytes are retained and referenced without repair. Existing application v2 validation and the new focused-review module govern website records; no malformed legacy schema is executed or used to weaken validation.

Seven focused catalog tests verify reproducible hashing; all original scopes and group counts; canonical route reuse without merged independent decisions; missing coverage and physical bounds; exact flag-only contact selection, 18-digit string IDs and original coordinates/footprints; inherited-versus-native status separation; and bilingual blinded alternatives with no quota. Browser/storage/exchange acceptance is documented separately by the coordinator.
