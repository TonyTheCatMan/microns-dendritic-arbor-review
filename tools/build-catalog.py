"""Build the static review catalog from immutable focused anatomy preparation sources.

This is a source adapter, not a scientific analysis. No source file is modified.
Run with Python 3.10+ (standard library only); researchers do not need Python.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re

APP = Path(__file__).resolve().parents[1]
STUDY = APP.parent
PREP = STUDY / "focused_validation_v1/anatomy/preparation"
OUT = APP / "data"
PROJECT = "microns-dendritic-arbor-review"
EM = "https://bossdb-open-data.s3.amazonaws.com/iarpa_microns/minnie/minnie65/em"
SEG = "https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300"


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(name, value, pretty=False):
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                                 separators=None if pretty else (",", ":")) + "\n", encoding="utf-8")


def bilingual(ru, en):
    return {"ru": ru, "en": en}


def normalize_numbers(value):
    """Integer-valued source coordinates serialize identically in Python and JS."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [normalize_numbers(x) for x in value]
    if isinstance(value, dict):
        return {k: normalize_numbers(v) for k, v in value.items()}
    return value


def relative(path):
    # Original absolute pointer is separately retained in source-pointers.json.
    p = Path(path)
    try:
        return p.relative_to(STUDY).as_posix()
    except ValueError:
        return p.as_posix()


def pointer(p):
    return {**p, "path": relative(p["path"])}


ALT_RU = {
    "matching native identity": "Совпадающая идентичность клетки",
    "different native identity": "Другая клетка",
    "registration mismatch": "Несовпадение регистрации",
    "unresolved": "Не установлено",
    "separate soma entry": "Отдельный вход в сому",
    "shared pre-soma stem": "Общий ствол перед сомой",
    "internal organelle boundary": "Граница внутренней органеллы",
    "apposed neighboring cell": "Прилегающая соседняя клетка",
    "profile switch": "Смена прослеживаемого профиля",
    "within-domain split": "Разделение внутри исходного домена",
    "false identity": "Ошибочная идентичность",
    "crop exit or missing evidence": "Выход за границу объёма или отсутствие данных",
    "dendritic child": "Дендритная дочерняя ветвь",
    "axon or ambiguous child": "Аксональная или неоднозначная дочерняя ветвь",
    "different cell": "Другая клетка",
    "organelle": "Органелла",
    "shared pre-soma parent": "Общая родительская ветвь перед сомой",
    "separate soma entries": "Отдельные входы в сому",
    "subset shares parent": "Общая родительская ветвь у части отростков",
    "additional mergers or splits": "Дополнительные слияния или разделения",
    "plasma membrane": "Плазматическая мембрана",
    "internal organelle rim": "Ободок внутренней органеллы",
    "apposed neighboring membrane": "Прилегающая соседняя мембрана",
    "section artifact": "Артефакт среза",
    "missing evidence": "Недостаточно данных",
    "supported_to_candidate": "Прикрепление к кандидату подтверждается данными",
    "contradicted": "Прикрепление противоречит данным",
    "outside_available_coverage": "За пределами доступного покрытия",
    "obscured": "Область скрыта или повреждена",
}

SPECIFIC_RU = {
    "boundary_origin3944": "Проследите внешнюю плазматическую мембрану более широкого светлого компартмента отдельно от небольшого внутреннего овального ободка. Проверьте верхнее сужение и альтернативу прилегающего соседнего профиля. Документируйте замыкание мембраны и маршрут к соме.",
    "boundary_excluded3639": "Определите обе внешние стороны косого продольного компартмента независимо от вытянутой тёмной внутренней структуры. Оцените прилегающий верхний правый профиль; сохраните исходное исключение 3639.",
    "boundary_origin5149": "Проследите охватывающую внешнюю плазматическую мембрану отдельно от небольшого замкнутого внутреннего профиля с ободком. Сохраните альтернативы внутренней органеллы и отдельного отростка до документирования окружающей мембраны с сохранением идентичности.",
    "boundary_origin5794": "Отличите внутреннюю продольную тёмную структуру от разделяющей плазматической мембраны до интерпретации кажущегося сужения или расширения. Отметьте выходы за верхнюю и боковую границы объёма и альтернативные продолжения.",
    "excluded2826_vs2428": "Проследите мембраны кандидатов исключённого 2826 и допустимого 2428 отдельно. Отличите внутренние овальные органеллы от нейритов; проверьте родительскую ветвь со стороны сомы только по непрерывному маршруту с сохранением идентичности. Исключение 2826 и 18 исходных предсказанных аксональных контактов сохраняется.",
    "damage_cut4475_z872320": "На участке cut4475, плитка 8, ранее отмечено диагональное нарушение сигнала при z = 872320 нм. Отметьте границу повреждённых данных и первую и последнюю видимую мембрану кандидата по обе стороны. Не соединяйте разрыв и не трактуйте его как биологическое разделение.",
    "damage_origin2711_z818640": "На участке north2711_serial, плитка 2, ранее отмечены диагональный артефакт и слабый контраст при z = 818640 нм (на 120 нм ниже z = 818760). Определите точный скрытый интервал и альтернативные продолжения мембраны без интерполяции соединения ветвей.",
}
SPECIFIC_TITLE = {
    "boundary_origin3944": ("3944: внешняя мембрана и внутренний овал", "3944: outer membrane and internal oval"),
    "boundary_excluded3639": ("3639: внешние границы и внутренняя структура", "3639: outer boundaries and internal feature"),
    "boundary_origin5149": ("5149: внешняя мембрана и внутреннее кольцо", "5149: outer membrane and internal ring"),
    "boundary_origin5794": ("5794: продольная структура и выходы из объёма", "5794: longitudinal feature and crop exits"),
    "excluded2826_vs2428": ("2826 и 2428: мембраны и родительские ветви", "2826 and 2428: membranes and parentage"),
    "damage_cut4475_z872320": ("4475: повреждение при z = 872320 нм", "4475: damage at z = 872320 nm"),
    "damage_origin2711_z818640": ("2711: повреждение при z = 818640 нм", "2711: damage at z = 818640 nm"),
}


def task_text(t):
    suffix = t["task_id"].split(".")[1]
    kind = t["kind"]
    if kind == "identity":
        title = bilingual("Идентичность сомы", "Soma identity")
        ru = "Свяжите корень release661 и супервоксель сомы с конкретной окружающей мембраной клетки в исходной ЭМ. Документируйте проверяемую связь идентичности, периметр сомы и маршруты; близости к исходной точке сомы недостаточно."
    elif kind == "origin_route":
        origin = t["origin_ids"][0]
        title = bilingual(f"Начало {origin}: непрерывность до сомы", f"Origin {origin}: continuity to soma")
        ru = f"Определите окружающую плазматическую мембрану у исходного начала {origin}, проследите её по последовательным срезам до проверенной поверхности сомы и установите общий ствол перед сомой или отдельный вход. Сохраните исходный признак допустимости; синтетическое ребро графа к корню не является прослеженным маршрутом."
    elif kind == "compartment_cut":
        cut = suffix.removeprefix("cut")
        title = bilingual(f"Узел {cut}: прикрепление дочерних ветвей", f"Cut {cut}: child attachment")
        ru = f"У сохранённого узла разреза {cut} обозначьте отдельные кандидаты мембран родительской и дочерних ветвей и проверьте их фактическое локальное прикрепление. Сохраните все противоречивые исходные признаки и исключённые контакты."
    elif kind == "branch_relation":
        ids = ", ".join(map(str, t["origin_ids"]))
        title = bilingual(f"{ids}: общая ветвь или отдельные входы", f"{ids}: shared parent or separate entries")
        ru = "Независимо проследите каждое указанное начало до одной проверенной сомы. Отметьте общую точку ветвления, окружённую мембраной, или данные за отдельные входы в сому. Исходные координаты только задают проверяемое отношение. Сохраните противоречащие данные и пробелы в покрытии."
    else:
        title = bilingual(*SPECIFIC_TITLE[suffix])
        ru = SPECIFIC_RU[suffix]
    en = t["question"]
    en = en.replace(" Prior model favors an internal organelle but does not certify enclosure or soma route.", " Document membrane enclosure and the route to the soma.")
    return title, bilingual(ru, en)


def choice_field(key, ru, en, alternatives):
    return {"key": key, "label": bilingual(ru, en), "options": [
        {"value": a, "label": bilingual(ALT_RU[a], a.replace("_", " "))} for a in alternatives]}


def fields(t):
    names = {
        "identity": ("native_identity", "Идентичность клетки", "Native identity"),
        "origin_route": ("branch_relation", "Непрерывность и вход в сому", "Continuity and soma entry"),
        "branch_relation": ("branch_relation", "Отношение ветвей", "Branch relation"),
        "targeted_boundary_or_damage": ("boundary_classification", "Классификация границы или повреждения", "Boundary or damage classification"),
        "compartment_cut": ("compartment", "Локальный компартмент", "Local compartment"),
    }
    result = [choice_field(*names[t["kind"]], t["alternatives_retained"])]
    if t["kind"] == "compartment_cut":
        cut = int(t["task_id"].split(".cut")[1])
        for n in t["source_node_neighborhood"]:
            if n["parent"] == cut:
                node = n["node"]
                result.append(choice_field(f"child_{node}_compartment", f"Дочерняя ветвь {node}: компартмент", f"Child {node}: compartment", t["alternatives_retained"]))
                result.append(choice_field(f"child_{node}_attachment", f"Дочерняя ветвь {node}: прикрепление", f"Child {node}: attachment", ["supported_to_candidate", "contradicted", "outside_available_coverage", "obscured", "unresolved"]))
    return result


def run(verify_raw=False):
    OUT.mkdir(exist_ok=True)
    source = read(PREP / "task_catalog.json")
    blank = read(PREP / "expert_decisions_BLANK.json")
    registry = read(PREP / "source_registry.json")
    source_hash = digest(PREP / "task_catalog.json")
    assert blank["catalog_sha256"] == source_hash
    assert len(source["tasks"]) == 50
    assert all(t["expert_decision"]["status"] == "UNREVIEWED" for t in source["tasks"])
    assert set(blank["records"]) == {t["task_id"] for t in source["tasks"]}
    schema_text = (PREP / "decision_schema.json").read_text(encoding="utf-8")
    try:
        json.loads(schema_text)
        schema_issue = None
    except json.JSONDecodeError as e:
        schema_issue = {"error": e.msg, "line": e.lineno, "column": e.colno,
                        "repair": "Derived v2 schema replaces malformed original; original remains immutable."}
    checked = {}

    def verify(p):
        path = p["path"]
        if path not in checked:
            actual = digest(path)
            assert actual == p["sha256"], f"Source hash mismatch: {path}"
            checked[path] = actual

    for r in source["recipients"]:
        for key in ["contacts.jsonl", "source_footprints.jsonl", "native_review_anchors.json"]:
            verify(r["source_files"][key])
    if verify_raw:
        for entry in registry["files"]:
            verify(entry)

    named = defaultdict(list)
    for line in (PREP / "named_contact_index.jsonl").read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        named[row["nucleus_id"]].append(row)
    assert sum(map(len, named.values())) == 27099
    volume_by_id = {v["volume_id"]: v for v in source["volumes"]}
    recipients = []
    for r in source["recipients"]:
        rid = "MC" + r["nucleus_id"]
        contacts_pointer = r["source_files"]["contacts.jsonl"]
        footprint_pointer = r["source_files"]["source_footprints.jsonl"]
        original_contacts = [json.loads(x) for x in Path(contacts_pointer["path"]).read_text(encoding="utf-8").splitlines()]
        original_footprints = [json.loads(x) for x in Path(footprint_pointer["path"]).read_text(encoding="utf-8").splitlines()]
        contacts = []
        for index in named[r["nucleus_id"]]:
            row = original_contacts[index["contact_source_jsonl_line_1based"] - 1]
            footprint = original_footprints[index["footprint_source_jsonl_line_1based"] - 1]
            assert row["synapse_id"] == index["synapse_id"]
            assert row["source_root_id"] == index["source_root_id"] == footprint["source_root_id"]
            assert row["synapse_id"] in footprint["contact_ids"]
            for component in ["pre", "post", "center"]:
                assert row[f"{component}_xyz_nm"] == index[f"{component}_xyz_nm"]
            assert row["eligibility_status"] == index["eligibility_status_preserved"]
            contacts.append({"id": row["synapse_id"], "sourceRootId": row["source_root_id"],
                "preNm": row["pre_xyz_nm"], "postNm": row["post_xyz_nm"], "centerNm": row["center_xyz_nm"],
                "preSupervoxelId": row["pre_supervoxel_id"], "postSupervoxelId": row["post_supervoxel_id"],
                "postLevel2Id": row["post_level2_id"], "domainId": row["original_domain_id"],
                "eligibleDomainId": row["eligible_graph_domain_id"], "eligibility": row["eligibility_status"],
                "sourceLine": index["contact_source_jsonl_line_1based"], "footprintLine": index["footprint_source_jsonl_line_1based"],
                "coveringVolumeIds": index["post_coordinate_covering_volume_ids"]})
        footprints = [{"sourceRootId": row["source_root_id"], "sourceLine": i + 1,
            "contactIds": row["contact_ids"], "eligibleContactIds": row["eligible_contact_ids"],
            "contactStatusCounts": row["contact_status_counts"]} for i, row in enumerate(original_footprints)]
        assert len(contacts) == r["all_raw_contact_count"]
        assert len(footprints) == r["all_source_footprint_count"]
        assert Counter(x["id"] for x in contacts) == Counter(i for f in footprints for i in f["contactIds"])
        datafile = f"contacts/{rid}.json"
        write(datafile, {"schemaVersion": 2, "projectId": PROJECT, "sourceHash": source_hash,
            "recipientId": rid, "rootRelease661": r["root_id"], "coordinateConvention": "integer-sample",
            "sourceRefs": {"contacts": pointer(contacts_pointer), "footprints": pointer(footprint_pointer),
                           "namedIndex": {"path": "focused_validation_v1/anatomy/preparation/named_contact_index.jsonl", "sha256": digest(PREP / "named_contact_index.jsonl")}},
            "contacts": contacts, "footprints": footprints})
        coverage = next(c for c in source["contact_crop_coverage"] if c["nucleus_id"] == r["nucleus_id"])
        recipients.append({"id": rid, "nucleusId": r["nucleus_id"], "rootRelease661": r["root_id"],
            "somaNm": r["soma_xyz_nm"], "somaSupervoxelRelease661": r["soma_supervoxel_id"],
            "taskCount": sum(t["nucleus_id"] == r["nucleus_id"] for t in source["tasks"]),
            "origins": [{"id": str(o["original_domain_id"]), "anchorNm": o["xyz_nm"],
                         "sourceEligible": o["ordinary_domain_geometry_eligible"]} for o in r["origins"]],
            "mapping": {"status": "unresolved", "sourceVersion": "release661", "targetVersion": "m1300",
                        "segmentId": None, "evidenceRefs": [pointer(r["source_files"]["native_review_anchors.json"])],
                        "note": bilingual("Подтверждённое соответствие release661 и m1300 отсутствует. Пространственный выбор остаётся кандидатом.", "No verified release661 to m1300 mapping is supplied. Spatial picks remain candidates.")},
            "contactsUrl": "data/" + datafile, "contactCount": len(contacts), "footprintCount": len(footprints),
            "contactsHash": digest(OUT / datafile), "coverage": coverage})
    tasks = []
    for index, t in enumerate(source["tasks"]):
        r = next(r for r in source["recipients"] if r["nucleus_id"] == t["nucleus_id"])
        title, question = task_text(t)
        category = t["kind"]
        if category == "targeted_boundary_or_damage":
            category = "damage" if ".damage_" in t["task_id"] else "boundary"
        anchors = [{"id": "task-anchor", "kind": "task", "label": title, "nm": t["anchor_xyz_nm"]}]
        anchors.append({"id": "soma", "kind": "soma", "label": bilingual("Исходная точка сомы", "Source soma point"), "nm": r["soma_xyz_nm"]})
        for origin in r["origins"]:
            if origin["original_domain_id"] in t["origin_ids"]:
                oid = str(origin["original_domain_id"])
                anchors.append({"id": f"origin-{oid}", "kind": "origin", "label": bilingual(f"Начало {oid}", f"Origin {oid}"), "nm": origin["xyz_nm"]})
        for node in t.get("source_node_neighborhood", []):
            nid = str(node["node"])
            anchors.append({"id": f"node-{nid}", "kind": "cut-neighborhood", "label": bilingual(f"Узел {nid}", f"Node {nid}"), "nm": node["xyz_nm"], "sourceParentId": str(node["parent"])})
        refs = {"catalog": {"path": "focused_validation_v1/anatomy/preparation/task_catalog.json", "sha256": source_hash, "jsonPointer": f"/tasks/{index}"},
                "geometry": pointer(t["source_pointer"]), "synthesis": pointer(t["synthesis_pointer"])}
        if "prior_observation_pointer" in t:
            refs["priorObservation"] = {**pointer(t["prior_observation_pointer"]), "tile": t["prior_evidence_tile"], "purpose": "Historical uncertainty location only; not a reviewer decision."}
        crop_ids = t["volume_ids"]
        tasks.append({"id": t["task_id"], "recipientId": "MC" + t["nucleus_id"], "rootRelease661": t["root_id"],
            "title": title, "question": question, "category": category, "sourceTaskType": t["kind"],
            "anchorNm": t["anchor_xyz_nm"], "originIds": list(map(str, t["origin_ids"])), "navigationAnchors": anchors,
            "coordinateConvention": "integer-sample", "coverage": {"status": "prepared-crop" if crop_ids else "no-prepared-crop",
                "volumeIds": crop_ids, "availableCellVolumeIds": t["available_cell_volume_ids"],
                "resolutionNm": [volume_by_id[x]["resolution_nm"] for x in crop_ids],
                "note": bilingual("Подготовленные объёмы ограничены; наличие в объёме не подтверждает непрерывность мембраны.", "Prepared volumes are limited; geometric coverage does not establish membrane continuity.") if crop_ids else bilingual("Исходный подготовленный объём отсутствует. Перейдите к точной координате и загрузите ЭМ из публичного источника.", "No prepared crop exists. Navigate to the exact coordinate and load EM from the public source.")},
            "sourceRefs": refs, "fields": fields(t), "defaultStatus": "unreviewed", "defaultAnswers": {},
            "namedContactIds": [x["synapse_id"] for x in t.get("named_nearest_post_contact_navigation", [])]})
    volumes = [{"id": v["volume_id"], "recipientId": "MC" + v["nucleus_id"], "sha256": v["sha256"],
        "sourcePath": relative(v["array_path"]), "resolutionNm": v["resolution_nm"], "voxelOffset": v["voxel_offset"],
        "shapeXYZ": v["shape_xyz"], "boundsNm": v["bounds_nm_half_open"], "dtype": v["dtype"],
        "coordinateConvention": "integer-sample", "sourceUrl": v["source_url"],
        "sourceRefs": {"receipt": pointer(v["receipt_pointer"]), "manifest": pointer(v["manifest_pointer"])},
        "objectVersions": v["object_versions"]} for v in source["volumes"]]
    catalog = {"schemaVersion": 2, "projectId": PROJECT, "sourceHash": source_hash,
        "coordinateConvention": "integer-sample", "annotationGridNm": [4, 4, 40],
        "sources": {"em": {"id": "minnie65-em", "url": EM, "version": "public-precomputed", "finestResolutionNm": [8, 8, 40],
                           "encoding": "raw", "coordinateConvention": "integer-sample", "scaleKey": "8_8_40",
                           "metadataSha256": "95413c657ff900c114757b149b327fb410d465197093d8bcfb0fc97a8133e140",
                           "metadataVerifiedDate": "2026-10-09", "chunkSize": [128, 128, 16],
                           "voxelOffset": [13824, 13824, 14816], "size": [212992, 180224, 13088],
                           "metadataWitness": "docs/native-source-witness.json"},
                    "segmentation": {"id": "minnie65-seg-m1300", "url": SEG, "version": "m1300", "identityMapping": "unresolved"},
                    "preparation": {"path": "focused_validation_v1/anatomy/preparation/task_catalog.json", "sha256": source_hash},
                    "sourceRegistry": {"path": "focused_validation_v1/anatomy/preparation/source_registry.json", "sha256": digest(PREP / "source_registry.json")}},
        "recipients": recipients, "tasks": tasks, "volumes": volumes,
        "contactCount": 27099, "footprintCount": 22844, "postsInsidePreparedCrops": 1112,
        "anatomicalCertification": False}
    catalog = normalize_numbers(catalog)
    # Catalog hash covers sorted-key compact UTF-8 JSON before this field is inserted.
    catalog["catalogHash"] = hashlib.sha256(json.dumps(catalog, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    write("catalog.json", catalog, True)
    write("source-pointers.json", {"schemaVersion": 2, "sourceHash": source_hash,
        "displayPolicy": "Not loaded into default review UI. Historical pointers and source questions are not reviewer judgments.",
        "files": registry["files"], "sourceSchemaIssue": schema_issue,
        "preparationFiles": [{"path": str(PREP / name), "sha256": digest(PREP / name)} for name in ["README.md", "task_catalog.json", "decision_schema.json", "expert_decisions_BLANK.json", "source_registry.json", "named_contact_index.jsonl"]],
        "tasks": [{"id": t["task_id"], "originalQuestion": t["question"], "sourceNodeNeighborhood": t.get("source_node_neighborhood", []),
                   "provisionalNavigationLandmarks": t.get("provisional_navigation_landmarks", []),
                   "sourceRefs": {k: v for k, v in t.items() if k.endswith("pointer")},
                   "priorEvidenceTile": t.get("prior_evidence_tile")} for t in source["tasks"]]}, True)
    # Identity fields from the obsolete template remain null only in this explicit compatibility export.
    adapted_blank = {"schemaVersion": 2, "projectId": PROJECT, "catalogHash": catalog["catalogHash"],
        "sourceHash": source_hash, "anatomicalCertification": False, "originalSourcesModified": False,
        "records": {t["id"]: {"taskId": t["id"], "status": "unreviewed", "answers": {}, "notes": "", "annotations": [],
             "reviewer_name": None, "qualifications": None} for t in tasks}}
    write("decisions-blank-v2.json", adapted_blank, True)
    write("decision-schema-v2.json", {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "microns-dendritic-arbor-decisions.v2",
        "title": "Anonymous unreviewed anatomy decision adapter", "type": "object",
        "required": ["schemaVersion", "projectId", "catalogHash", "sourceHash", "records", "anatomicalCertification", "originalSourcesModified"],
        "properties": {"schemaVersion": {"const": 2}, "projectId": {"const": PROJECT}, "catalogHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
            "sourceHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"}, "anatomicalCertification": {"const": False}, "originalSourcesModified": {"const": False},
            "records": {"type": "object", "additionalProperties": {"type": "object", "required": ["taskId", "status", "answers", "notes", "annotations"],
                 "properties": {"taskId": {"enum": [t["id"] for t in tasks]}, "status": {"enum": ["unreviewed", "draft", "reviewed"]},
                    "answers": {"type": "object", "additionalProperties": {"type": ["string", "null"]}}, "notes": {"type": "string"},
                    "annotations": {"type": "array"}, "reviewer_name": {"type": "null"}, "qualifications": {"type": "null"}}}}}}, True)
    receipt = {"adapterVersion": 2, "catalogHash": catalog["catalogHash"], "sourceHash": source_hash,
        "sourceSchemaIssue": schema_issue, "verifiedInputCount": len(checked), "verifiedInputs": [{"path": relative(k), "sha256": v} for k, v in checked.items()],
        "registryEntryCount": len(registry["files"]), "allRegistryHashesRecomputed": verify_raw,
        "taskCounts": dict(Counter(t["recipientId"] for t in tasks)), "contacts": 27099, "footprints": 22844,
        "fullFootprintMembershipVerified": True, "separateCoordinatesVerified": True,
        "releaseMapping": "unresolved: no validated bridge in supplied source anchors",
        "sourceFilesModified": False, "imagesInspected": 0,
        "outputs": [{"path": p.relative_to(OUT).as_posix(), "bytes": p.stat().st_size, "sha256": digest(p)} for p in sorted(OUT.rglob("*.json")) if p.name != "build-receipt.json"]}
    write("build-receipt.json", receipt, True)
    print(json.dumps({k: receipt[k] for k in ["catalogHash", "verifiedInputCount", "taskCounts", "contacts", "footprints", "sourceSchemaIssue"]}, ensure_ascii=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-raw", action="store_true", help="Rehash every source-registry entry, including raw arrays; never copy them.")
    run(parser.parse_args().verify_raw)
