# Source-quality restricted review scope

The additive `data/review-scope.json` binds the existing viewer catalog and focused workflow to the completed `source_quality_feasibility_v1` audit. It does not change either original catalog, any original question ID, saved annotations, or scientific inputs. No images are inspected and no scientific analysis is rerun by its builder.

Run `python tools/build-review-scope.py` to regenerate from the read-only neighboring audit. Run `node --test tests/review-scope-data.test.mjs` for the artifact checks. Tests compare the packaged contact tables, exact IDs, complete source footprints, cut lineages, all question scopes, and canonical hashes. The additional source-file hash check runs when the archive is present and skips in a standalone website checkout.

## Separate recording-policy pools

| Pool | Distinct incoming roots | Target-source memberships | Saved eligible contacts | Preserved raw exclusions |
| --- | ---: | ---: | ---: | ---: |
| `preferred14.clean_extended` (default) | 249 | 370 | 634 | 8 |
| `all_export19.clean_extended` (separate context) | 253 | 374 | 641 | 8 |

The primary pool contains MC298937: 163 sources / 301 contacts; MC264649: 62 / 80; MC264920: 76 / 154; MC264824: 69 / 99. Sources overlap across targets, so target-source memberships are not distinct-root counts. Every included source keeps its complete saved eligible footprint and its original recording policy. The eight excluded raw contacts (six on MC298937 and two on MC264824) remain explicit provenance and remain outside the fixed eligible scope. These are complete saved footprints under the original rule, not complete biological connectivity or a manual inspection quota.

Pool membership comes from `restriction_memberships` in the source and contact ledgers. It is checked against the exact-string source inventory. It is not selected by examples, website bookmarks, outcomes, or a new model calculation. The broader pool has seven additional contacts and four additional distinct roots; those additions are not silently added to the primary pool.

## Independent question scopes and shared evidence

Each pool retains all 50 canonical question IDs. Its initial priorities are:

- 38 `required`: four target identity bridges, 23 occupied origin routes, nine independent relation hypotheses, and two consequential local cuts.
- Seven `qualification`: membrane, organelle, damage, and excluded-origin identity concerns attached to their source routes.
- Two `deferred`: MC264824 cuts2638 and5297, with no direct retained-contact descendants.
- Three `excluded`: original origins MC264649:3639, MC264920:6124, and MC264824:2826, with no included eligible contacts.

These are records and dependencies, not 45 or 50 independent tracing jobs. Continuous route evidence may support several decisions, but the decisions remain independent. Pair and triple relation questions remain separate. The excluded3639 boundary qualification is retained despite zero included contacts; it must not be converted into a mandatory full trace merely because it has a question record. Unexpected connections, identity errors, and missing coverage can make any preserved item relevant. Deferral is never a supported anatomical outcome, and existing annotations must remain attached to their original IDs.

Every question provides Russian and English `inspect`, `reason`, `reuse`, `unresolved`, and `coverageNote` text. Existing bookmarks and candidates remain supplied by the unchanged focused workflow. Identity guidance does not require a complete soma outline. Original-volume containment never establishes continuous native route coverage.

## Exact cuts versus broad navigation context

| Question / child | Primary retained descendants / roots | Broader retained descendants / roots |
| --- | ---: | ---: |
| MC298937 cut4475 / child4661 | 62 / 48 | 65 / 50 |
| MC264824 cut869 / child837 | 1 / 1 | 1 / 1 |
| MC264824 cut2638 | 0 / 0 | 0 / 0 |
| MC264824 cut5297 | 0 / 0 | 0 / 0 |

For cut questions, `contactIds` and `sourceRootIds` are exact cut-ancestor sets, identical to `exactCutContactIds` and `exactCutSourceRootIds`. The separate `domainContextContactIds` fields preserve broad navigation context. In the primary pool cuts2638/5297 have 18/25 domain-context contacts; none is an exact cut descendant. The broader cut5297 context has 27 contacts, also with zero exact descendants. Never display those context counts as contacts affected by the cut.

Child4315 at MC298937 cut4475 has 13 raw predicted-axon contacts and zero retained contacts. They are distinct from child4661's retained lineage and are not included-source preserved exclusions. `cutBranches` retains all saved cut-node and immediate-child rows, immutable flags, raw counts and exact retained sets. The union of child/cut-node retained sets is verified against each question and contact ledger's exact ancestor IDs.

These connections are postsynaptic continuity questions. Resolving cut4475 does not certify 62 synapses or 48 incoming axons. All contact and native source identities remain separately unreviewed. Cut2638/5297 priority should be restored if observations implicate a retained path or the claim expands to terminal completeness. All three MC264824 cuts lack original prepared crop coverage. Five retained contact coordinates lie inside original crops in each pool; this is coordinate containment only.

## Inherited curation and versions

The artifact includes the exact 619-row source inventory for both original policies. Its primary original-source subset has 611 roots: 224 clean, 25 extended, one non, and 361 missing from the archived table. Missing means unknown in that source, not incorrect anatomy or proof of no prior proofreading.

Every included membership has exactly one release661 proofreading row whose assessed root and valid ID equal the original string root. `clean` documents inherited false-merge removal; `extended` additionally documents attempted recovery of missing parts. Neither is new manual certification or proof of a complete axon. The historical model identity remains a predicted identity, separate from native review.

Modern evidence is retained as inventory context only. No later-version label or 3D visualization candidate changes membership. The later identical-reconstruction bridge candidate `864691135561597409` remains outside both frozen legacy-only pools. Target axon curation is not incoming-source curation.

The restricted review does not impose a contact quota or probability sample. Individual contacts remain inspectable when justified. The previous 891 raw concerns remain optional background and cannot estimate representative error frequency. A probability audit would require a separate protocol.

## Provenance contract

The root artifact contains `version`, `scopeHash`, original `catalogHash`, `sourceHash`, `workflowHash`, materialization661, integer-sample convention, `defaultPoolId`, both pools, full blinded inventory, limited policy semantics and provenance. Pool objects carry recording `policy`, restriction, derived counts, per-target summaries, complete membership/contact sets, all question scopes and exact cut rows.

The canonical scope hash is SHA-256 of the root payload without `scopeHash`, using recursively sorted object keys, preserved array order and compact UTF-8 JSON. This matches `JSON.stringify` over recursively sorted JavaScript objects. The stored file has deterministic LF line endings.

CSV-backed records carry a source path, SHA-256, bytes and one-based physical `csvLine` (header at line1). Original question task pointers remain intact. Export bindings can include the policy, input-manifest, inventory and dependency-summary hashes in `provenance`, and the selected pool's exact source/task/dependency IDs. The underlying source receipts remain hashed references, not rewritten sources.

The builder reads the completed ledgers and a limited selection of frozen policy fields. No functional directions, effect sizes, positive/negative target labels, prior-model verdicts, or analysis results enter the data artifact. The feasibility report was read as integration context but is not copied into the artifact or linked by the researcher-facing source manifest. Website contradictions require export for later scientific reconciliation; website decisions do not revise the frozen analysis.
