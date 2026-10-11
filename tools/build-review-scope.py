"""Build a blinded, additive website review scope from the completed read-only audit.

No images, scientific computations, source changes or contact sampling are performed.
Run from any directory. Only data/review-scope.json is written.
"""
import csv
import hashlib
import json
from collections import Counter
from functools import lru_cache
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
PROJECT = APP.parent
AUDIT = PROJECT / "source_quality_feasibility_v1"
OUTPUT = APP / "data/review-scope.json"


@lru_cache(maxsize=None)
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def ref(path, line=None):
    result = {"path": path.relative_to(PROJECT).as_posix(), "sha256": sha(path), "bytes": path.stat().st_size}
    if line is not None:
        result["csvLine"] = line
    return result


def rows(name):
    path = AUDIT / name
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [dict(row, _ref=ref(path, i)) for i, row in enumerate(csv.DictReader(handle), 2)]


def arr(row, key):
    return json.loads(row[key]) if row.get(key) else []


def ids(values):
    return sorted(set(str(value) for value in values), key=lambda value: (len(value), value))


def tr(ru, en):
    return {"ru": ru, "en": en}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build():
    catalog = read_json(APP / "data/catalog.json")
    workflow = read_json(APP / "data/focused-workflow.json")
    summary = read_json(AUDIT / "review/dependency_summary.json")
    quality = read_json(AUDIT / "design/quality_policy.json")
    inventory_rows = rows("sources/source_inventory.csv")
    source_rows = rows("review/source_review_ledger.csv")
    contact_rows = rows("review/contact_dependency_ledger.csv")
    question_rows = rows("review/question_dependency_ledger.csv")
    cut_rows = rows("review/cut_branch_dependency_ledger.csv")
    inventory = {row["source_root_id"]: row for row in inventory_rows}
    questions = {row["id"]: row for row in workflow["questions"]}
    assert len(inventory) == len(inventory_rows) == 619
    assert set(questions) == {row["id"] for row in catalog["tasks"]}
    assert len(questions) == 50
    assert sha(APP / "data/focused-workflow.json") == summary["source_receipts"]["researcher_review_website_v2/data/focused-workflow.json"]["sha256"]
    assert sha(AUDIT / "design/quality_policy.json") == summary["source_receipts"]["source_quality_feasibility_v1/design/quality_policy.json"]["sha256"]

    # A source belongs to a pool only through the ledger's recorded membership.
    # The inventory join validates that membership; it does not create new members.
    pools = []
    for policy in quality["scope"]["policies"]:
        source_subset = [row for row in source_rows if row["policy"] == policy and "clean_extended" in arr(row, "restriction_memberships")]
        contact_subset = [row for row in contact_rows if row["policy"] == policy and "clean_extended" in arr(row, "restriction_memberships")]
        question_subset = [row for row in question_rows if row["policy"] == policy and row["restriction"] == "clean_extended"]
        cut_subset = [row for row in cut_rows if row["policy"] == policy and row["restriction"] == "clean_extended"]
        contact_index = {row["synapse_id"]: row for row in contact_subset}
        assert len(contact_index) == len(contact_subset)
        assert len(question_subset) == 50
        assert set(row["question_id"] for row in question_subset) == set(questions)
        contact_sources = lambda values: ids(contact_index[value]["source_root_id"] for value in values)
        sources = []
        for row in source_subset:
            inv = inventory[row["source_root_id"]]
            assert inv["status_axon"] in quality["pools"]["clean_extended"]
            assert inv["proof_rows"] == "1" and inv["valid_id_matches_root"] == "True"
            assert inv["valid_id"] == inv["pt_root_id"] == row["source_root_id"]
            assert inv["model_EI"] == "E" and inv["explicit_inhibitory_evidence"] == "False"
            eligible = ids(arr(row, "eligible_contact_ids"))
            excluded = ids(arr(row, "preserved_excluded_contact_ids"))
            assert set(eligible).isdisjoint(excluded)
            assert set(eligible + excluded) == set(arr(row, "all_incoming_contact_ids"))
            assert set(eligible) == {contact["synapse_id"] for contact in contact_subset if contact["source_root_id"] == row["source_root_id"] and contact["target_nucleus_id"] == row["target_nucleus_id"]}
            sources.append({
                "sourceRootId": row["source_root_id"], "recipientId": "MC" + row["target_nucleus_id"],
                "eligibleContactIds": eligible, "excludedContactIds": excluded,
                "allIncomingContactIds": ids(arr(row, "all_incoming_contact_ids")),
                "originalDomainIds": [str(value) for value in arr(row, "original_domain_ids")],
                "statusAxon": row["status_axon"], "curationEvidence": "inherited-release661",
                "nativeSourceIdentityStatus": "unreviewed", "nativeContactsStatus": "unreviewed",
                "provenance": {"materialization": 661, "inventory": inv["_ref"], "sourceLedger": row["_ref"],
                    "assessedRootId": inv["pt_root_id"], "validId": inv["valid_id"], "proofRows": int(inv["proof_rows"]),
                    "nucleusId": inv["unique_v661_nucleus_id"], "nucleusSupervoxelId": inv["v661_nucleus_supervoxel_id"],
                    "modernAnnotationUsed": False, "archivedTableSha256": quality["archived_table_sha256"]}
            })
        contacts = [{
            "id": row["synapse_id"], "recipientId": "MC" + row["target_nucleus_id"], "sourceRootId": row["source_root_id"],
            "originRouteQuestionId": row["original_route_question_id"], "identityQuestionId": row["target_identity_question_id"],
            "relationQuestionIds": arr(row, "branch_relation_question_ids"),
            "domainContextQuestionIds": arr(row, "domain_context_question_ids"),
            "exactCutQuestionIds": arr(row, "exact_graph_ancestor_cut_question_ids"),
            "originalDomainId": row["original_domain_id"], "statusAxon": row["status_axon"],
            "postSupervoxelId": row["post_supervoxel_id"], "preSupervoxelId": row["pre_supervoxel_id"],
            "skeletonIndex": row["skeleton_index"], "originalPreparedVolumeIds": arr(row, "post_coordinate_covering_original_volume_ids"),
            "nativeAttachmentStatus": "unreviewed", "sourceRefs": [row["_ref"]]
        } for row in contact_subset]
        cut_branches = []
        for row in cut_subset:
            cids = ids(arr(row, "included_eligible_contact_ids"))
            roots = contact_sources(cids)
            assert len(cids) == int(row["included_eligible_contacts"])
            assert len(roots) == int(row["included_eligible_sources"])
            cut_branches.append({
                "questionId": row["question_id"], "recipientId": "MC" + row["target_nucleus_id"],
                "cutNode": row["cut_node"], "branchNode": row["branch_node"],
                "branchScope": "cut-node" if row["branch_node"] == row["cut_node"] else "immediate-child-descendants",
                "contactIds": cids, "sourceRootIds": roots, "excludedContactIds": ids(arr(row, "preserved_excluded_contact_ids")),
                "rawTargetContactCount": int(row["all_raw_target_contacts_in_branch"]),
                "rawTargetStatusCounts": json.loads(row["all_raw_target_status_counts"]),
                "sourceFlags": {"retained": row["source_node_retained_flag"] == "True", "dendritic": row["source_node_dendritic_flag"] == "True", "axonOrAmbiguous": row["source_node_axon_or_ambiguous_flag"] == "True"},
                "nativeContinuityStatus": "unreviewed", "sourceRefs": [row["_ref"]]
            })
        scoped_questions = []
        for row in question_subset:
            question = questions[row["question_id"]]
            kind = row["kind"]
            context_ids = ids(arr(row, "scope_eligible_contact_ids"))
            exact_ids = ids(arr(row, "exact_graph_descendant_eligible_ids")) if kind == "compartment_cut" else []
            cids = exact_ids if kind == "compartment_cut" else context_ids
            roots = contact_sources(cids)
            excluded = ids(arr(row, "scope_preserved_excluded_contact_ids"))
            assert len(context_ids) == int(row["scope_eligible_contact_count"])
            assert len(contact_sources(context_ids)) == int(row["scope_source_count"])
            priority = "required"
            if kind == "compartment_cut" and not exact_ids:
                priority = "deferred"
            elif kind == "origin_route" and not context_ids:
                priority = "excluded"
            elif kind == "targeted_boundary_or_damage":
                priority = "qualification"
            n, ns = len(cids), len(roots)
            inspect = question["detail"]
            if kind == "identity":
                inspect = tr("Свяжите корень release661 и супервоксель сомы с окружающей мембраной клетки на исходных ЭМ-срезах. Отметьте проверяемые точки и маршрут; полный контур сомы не обязателен.", "Bind the release661 root and soma supervoxel to the enclosing cell membrane in native EM. Mark auditable points and the route; a complete soma outline is not required.")
                reason = tr(f"От этой связи идентичности зависят сохранённые назначения {n} контактов от {ns} источников этой клетки.", f"This identity bridge underlies the saved assignments of {n} contacts from {ns} sources on this target.")
            elif kind == "compartment_cut":
                branches = [b for b in cut_branches if b["questionId"] == question["id"] and b["contactIds"]]
                child_names = ", ".join(b["branchNode"] for b in branches)
                if exact_ids:
                    inspect = tr(f"Проверьте фактическую непрерывность мембраны и компартмент у узла {row['cut_node']} и дочерней ветви {child_names}. Другие дочерние ветви и исходные исключения сохраняются отдельно.", f"Inspect actual membrane continuity and compartment at node {row['cut_node']} and child {child_names}. Keep other children and original exclusions separate.")
                    reason = tr(f"Точная сохранённая цепочка предков проходит через этот узел для {n} контактов от {ns} источников. Это общий постсинаптический участок, а не подтверждение этих синапсов.", f"The exact saved ancestor chain crosses this node for {n} contacts from {ns} sources. This is a shared postsynaptic connection, not certification of those synapses.")
                else:
                    reason = tr(f"Условно отложено: прямых потомков среди сохранённых контактов нет. {len(context_ids)} контактов в широком контексте домена не являются потомками разреза. Верните приоритет, если наблюдения затронут сохранённый путь или потребуется полнота терминалей.", f"Conditionally deferred: no retained contact is a direct descendant. The {len(context_ids)} contacts in broad domain context are not cut descendants. Restore priority if observations implicate a retained path or terminal completeness becomes part of the claim.")
            elif priority == "excluded":
                reason = tr("Исключённое исходное начало не содержит допустимых контактов выбранной группы. Вопрос идентичности и компартмента сохраняется; отдельная полная трасса сейчас не обязательна. Наблюдение, затрагивающее сохранённый путь, возвращает вопрос в работу.", "This excluded original origin has no eligible contacts in the selected pool. Preserve its identity and compartment question; an additional full trace is not automatically required. An observation affecting a retained path restores its relevance.")
            elif kind == "branch_relation":
                reason = tr(f"От отношения этих начал зависит группировка {n} сохранённых контактов от {ns} источников. Это отдельный вопрос; решение о паре не устанавливает отношение тройки.", f"The relationship between these origins affects the grouping of {n} retained contacts from {ns} sources. This is an independent question; a pair decision does not establish a triple relationship.")
            elif kind == "origin_route":
                reason = tr(f"На этом исходном маршруте находятся {n} сохранённых контактов от {ns} источников. Непрерывный путь к соме поддерживает их назначение при условии сохранности остальных участков.", f"This original route carries {n} retained contacts from {ns} sources. A continuous route to the soma supports their assignments conditional on the remaining paths.")
            else:
                reason = tr(f"Сохраните эту проверку границы или повреждения вместе с связанными маршрутами. Контекст включает {n} сохранённых контактов от {ns} источников; это не точное число потомков локального соединения.", f"Keep this boundary or damage qualification attached to its related routes. Its context includes {n} retained contacts from {ns} sources; this is not an exact local-connection descendant count.")
            reuse = tr("Используйте уже сохранённые метки и непрерывные трассы общих маршрутов, если они показывают именно нужную мембрану и участок. Ссылайтесь на них в каждом отдельном вопросе; оценки не переносятся автоматически.", "Reuse saved marks and continuous traces of shared routes when they show the required membrane and interval. Cite them in each independent question; decisions never propagate automatically.")
            unresolved = tr("До проверки остаются неустановленными непрерывность нативной мембраны и альтернативные соединения. Отдельно остаются идентичность входящего аксона и правильность каждого контакта. Запишите неожиданные связи, ошибки или нехватку покрытия; данные анализа изменяются только после отдельного согласования.", "Native membrane continuity and alternative connections remain unresolved until inspected. Incoming-axon identity and each contact remain separate questions. Record unexpected relationships, errors or missing coverage; analysis data change only after separate reconciliation.")
            if priority == "deferred":
                unresolved = tr("Вопрос остаётся нерешённым, а не подтверждённым. Новые наблюдения могут потребовать проверки этого соединения. Существующие заметки и метки сохраняются.", "This question remains unresolved, not supported. New observations can make this connection relevant. Existing notes and marks are preserved.")
            prepared = arr(row, "original_prepared_volume_ids")
            scoped = {
                "id": question["id"], "recipientId": question["recipientId"], "kind": kind, "priority": priority,
                "contactIds": cids, "sourceRootIds": roots, "domainContextContactIds": context_ids,
                "domainContextSourceRootIds": contact_sources(context_ids), "excludedContactIds": excluded,
                "contactScope": "exact-cut-ancestry" if kind == "compartment_cut" else "target-identity" if kind == "identity" else "annotated-origin-context",
                "originIds": arr(row, "origin_ids"), "dependencyQuestionIds": arr(row, "dependency_question_ids"),
                "dependentQuestionIds": arr(row, "dependent_question_ids"),
                "reason": reason, "inspect": inspect, "reuse": reuse, "unresolved": unresolved,
                "originalPreparedVolumeIds": prepared, "originalPreparedCoverage": "local-crops-only" if prepared else "missing",
                "coverageNote": tr("Исходные локальные объёмы не подтверждают непрерывное покрытие маршрута. Проверьте доступность нужных срезов и сохранность мембраны.", "Original local crops do not establish continuous route coverage. Check the required sections and membrane visibility.") if prepared else tr("Для этого вопроса нет исходного подготовленного объёма. Загрузка локальных срезов не подтверждает непрерывность всего маршрута; отметьте недостающее покрытие.", "This question has no original prepared crop. Loading local sections does not establish a continuous route; record missing coverage."),
                "defaultStatus": "unreviewed", "sourceRefs": [row["_ref"], json.loads(row["source_task_pointer"])]
            }
            if kind == "compartment_cut":
                scoped.update(exactCutContactIds=exact_ids, exactCutSourceRootIds=roots, exactCutExcludedContactIds=ids(arr(row, "exact_graph_descendant_excluded_ids")), cutNode=row["cut_node"])
                assert set(exact_ids) == {c["id"] for c in contacts if scoped["id"] in c["exactCutQuestionIds"]}
                assert set(exact_ids) == set(value for branch in cut_branches if branch["questionId"] == scoped["id"] for value in branch["contactIds"])
                assert len(exact_ids) == int(row["exact_graph_descendant_eligible_count"])
                assert len(roots) == int(row["exact_graph_descendant_eligible_source_count"])
            scoped_questions.append(scoped)
        excluded_union = ids(value for row in sources for value in row["excludedContactIds"])
        recipient_rows = []
        for recipient in catalog["recipients"]:
            sub_sources = [row for row in sources if row["recipientId"] == recipient["id"]]
            sub_contacts = [row for row in contacts if row["recipientId"] == recipient["id"]]
            recipient_rows.append({"id": recipient["id"], "sourceCount": len(sub_sources), "contactCount": len(sub_contacts),
                "excludedContactIds": ids(value for row in sub_sources for value in row["excludedContactIds"]),
                "sourceRootIds": ids(row["sourceRootId"] for row in sub_sources), "contactIds": ids(row["id"] for row in sub_contacts),
                "statusAxonCounts": dict(sorted(Counter(row["statusAxon"] for row in sub_sources).items()))})
        counts = {"distinctSources": len({row["sourceRootId"] for row in sources}), "memberships": len(sources),
            "contacts": len(contacts), "preservedExclusions": len(excluded_union),
            "identityDependencies": sum(row["kind"] == "identity" for row in scoped_questions),
            "occupiedOriginRoutes": len({row["originRouteQuestionId"] for row in contacts}),
            "relationQuestions": sum(row["kind"] == "branch_relation" for row in scoped_questions),
            "consequentialCuts": sum(row["kind"] == "compartment_cut" and row["priority"] == "required" for row in scoped_questions),
            "questionPriorities": dict(sorted(Counter(row["priority"] for row in scoped_questions).items())),
            "originalCropContainedContacts": sum(bool(row["originalPreparedVolumeIds"]) for row in contacts)}
        expected = next(row for row in summary["union_counts"] if row["policy"] == policy and row["restriction"] == "clean_extended")
        assert counts["distinctSources"] == expected["unique_source_roots"]
        assert counts["memberships"] == expected["target_source_memberships"]
        assert counts["contacts"] == expected["unique_eligible_contacts"]
        assert counts["preservedExclusions"] == expected["preserved_excluded_contacts"]
        assert counts["occupiedOriginRoutes"] == expected["occupied_origin_route_count"]
        assert counts["originalCropContainedContacts"] == expected["original_crop_contained_post_coordinates"]
        pools.append({"id": policy + ".clean_extended", "policy": policy, "restriction": "clean_extended",
            "title": tr("Основная группа: preferred14, clean + extended", "Primary pool: preferred14, clean + extended") if policy == "preferred14" else tr("Отдельный контекст: all_export19, clean + extended", "Separate context: all_export19, clean + extended"),
            "counts": counts, "recipients": recipient_rows, "sources": sources, "contacts": contacts,
            "questions": scoped_questions, "cutBranches": cut_branches, "excludedContactIds": excluded_union,
            "sourceRefs": [ref(AUDIT / "design/quality_policy.json"), ref(AUDIT / "review/dependency_summary.json")]})

    artifact = {
        "version": 1, "catalogHash": catalog["catalogHash"], "sourceHash": catalog["sourceHash"],
        "workflowHash": workflow["workflowHash"], "materialization": 661, "coordinateConvention": "integer-sample",
        "defaultPoolId": "preferred14.clean_extended", "pools": pools,
        "sourceInventory": [{"sourceRootId": row["source_root_id"], "statusAxon": row["status_axon"],
            "materialization": 661, "exactInventoryFields": {key: value for key, value in row.items() if key != "_ref"},
            "sourceRefs": [row["_ref"]]} for row in inventory_rows],
        "policy": {
            "recordingPolicies": quality["scope"]["policies"], "restriction": "clean_extended", "inheritedAxonStatuses": quality["pools"]["clean_extended"],
            "qualification": {key: quality["qualification"][key] for key in ["release", "table", "join", "status_column", "require_original_model_EI", "exclude_explicit_inhibitory_evidence", "unknowns", "modern_evidence"]},
            "cleanMeaning": tr("Наследуемое свидетельство удаления ошибочных слияний; полнота аксона не подтверждена.", "Inherited documentation of false-merge removal; axon completeness is not established."),
            "extendedMeaning": tr("Дополнительно документирована попытка добавить недостающие части; полнота аксона не гарантирована.", "Additionally documents an attempt to recover missing parts; complete axons are not guaranteed."),
            "observedFootprints": tr("Сохраняются все допустимые контакты включённых источников по исходному правилу. Это полные сохранённые наборы, а не полная биологическая связность.", "Retains every saved eligible contact of each included source under the original rule. These are complete saved footprints, not complete biological connectivity."),
            "unknownMeaning": tr("Отсутствующая строка старой таблицы означает неизвестное состояние в этом источнике. Более поздняя метка без документированной связи идентичности не переносится.", "A missing row means unknown status in that source. A later label is not transferred without a documented identity bridge."),
            "auditProtocol": tr("Для оценки частоты ошибок вероятностный план выборки не задан. Целевая проверка сомнительных контактов не является репрезентативной выборкой.", "No probability sampling protocol for error frequency is defined. Targeted checks of concerning contacts are not a representative sample."),
            "nativeCertificationFromMetadata": False, "contactCertificationFromRouteDecision": False,
            "scientificReconciliationRequiredForContradictions": True, "requiredManualContactCount": None,
            "rawFlagsAreAuditSample": False, "scopeChangeNeverEditsFrozenAnalysis": True
        },
        "provenance": {
            "originalSourceFilesModified": False, "imagesInspected": 0, "scientificAnalysisRun": False,
            "scopeBasis": "completed-source-quality-audit-and-exact-dependency-ledgers",
            "policyHash": sha(AUDIT / "design/quality_policy.json"), "manifestHash": sha(AUDIT / "sources/input_hashes.json"),
            "sourceInventoryHash": sha(AUDIT / "sources/source_inventory.csv"), "dependencySummaryHash": sha(AUDIT / "review/dependency_summary.json"),
            "archivedProofreadingTableSha256": quality["archived_table_sha256"],
            "sources": [ref(AUDIT / name) for name in ["design/quality_policy.json", "design/policy_freeze_receipt.json", "sources/input_hashes.json", "sources/audit_receipt.json", "sources/source_inventory.csv", "review/contact_dependency_ledger.csv", "review/source_review_ledger.csv", "review/question_dependency_ledger.csv", "review/cut_branch_dependency_ledger.csv", "review/dependency_summary.json", "review/MINIMUM_EXPERT_WORK.md"]],
            "upstreamSourceReceipts": summary["source_receipts"],
            "mapFootprintChecks": summary["map_footprint_checks"],
            "excludedReportContent": "Functional results and prior model verdicts are not included in this artifact."
        }
    }
    artifact["scopeHash"] = hashlib.sha256(canonical(artifact).encode("utf-8")).hexdigest()
    OUTPUT.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"scopeHash": artifact["scopeHash"], "bytes": OUTPUT.stat().st_size, "pools": [{"id": p["id"], **p["counts"]} for p in pools]}, ensure_ascii=False))


if __name__ == "__main__":
    build()
