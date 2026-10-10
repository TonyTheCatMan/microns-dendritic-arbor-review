"""Build a blinded navigation/decision index from immutable local sources.

No image reads, network requests, anatomical decisions or scientific-source writes.
Run from the application directory with Python 3.10+.
"""
from pathlib import Path
import csv
import gzip
import hashlib
import json
from collections import Counter, defaultdict

APP = Path(__file__).resolve().parents[1]
PROJECT = APP.parent
ARCHIVE = PROJECT.parent
PREP = PROJECT / 'focused_validation_v1/anatomy/preparation'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ref(path, **extra):
    path = Path(path)
    return dict(path=path.relative_to(PROJECT).as_posix() if path.is_relative_to(PROJECT)
                else '../' + path.relative_to(ARCHIVE).as_posix(),
                sha256=digest(path), bytes=path.stat().st_size, **extra)


def labels(ru, en):
    return dict(ru=ru, en=en)


def build():
    catalog = read(APP / 'data/catalog.json')
    original = read(PREP / 'task_catalog.json')
    assert digest(PREP / 'task_catalog.json') == catalog['sourceHash']
    task_by_id = {t['id']: t for t in catalog['tasks']}
    originals = {t['task_id']: t for t in original['tasks']}
    assert set(task_by_id) == set(originals) and len(task_by_id) == 50
    source_registry = read(PREP / 'source_registry.json')
    registered = {Path(r['path']).resolve(): r for r in source_registry['files']}
    evidence = read(PREP / 'evidence_index.json')['records']
    renders = read(PREP / 'render_pointer_index.json')['records']
    groups = []
    membership = {}

    def add_group(gid, view, recipient, suffixes, title):
        ids = [recipient + '.' + s for s in suffixes]
        assert ids and all(i in task_by_id and i not in membership for i in ids)
        for tid in ids:
            membership[tid] = gid
        groups.append(dict(id=gid, view=view, recipientId=recipient, title=title,
                           questionIds=ids, taskIds=ids, primaryTaskId=ids[0],
                           groupingBasis='source-nominated-route-family' if view == 'branches' else 'same-target-soma-and-stems',
                           sharedJunctionCertified=False))

    for recipient in catalog['recipients']:
        rid = recipient['id']
        ids = [t['id'].split('.', 1)[1] for t in catalog['tasks']
               if t['recipientId'] == rid and t['sourceTaskType'] in ('identity', 'origin_route')]
        add_group(rid + '.stems', 'stems', rid, ids,
                  labels(rid + ': сома и выходы дендритов', rid + ': soma and dendritic stems'))

    families = [
        ('MC298937', 'cut4475', ['cut4475', 'damage_cut4475_z872320'], 'Узел 4475 и повреждённый участок', 'Junction 4475 and obscured interval'),
        ('MC264649', 'routes3362_4058', ['relation_3362_4058'], 'Связь 3362 / 4058', 'Relationship 3362 / 4058'),
        ('MC264649', 'routes3944_3945', ['boundary_origin3944', 'relation_3944_3945'], 'Оболочка 3944 и связь с 3945', 'Enclosure 3944 and relationship to 3945'),
        ('MC264649', 'excluded3639', ['boundary_excluded3639'], 'Оболочка исключённого 3639', 'Enclosure of excluded 3639'),
        ('MC264920', 'routes5149_5498_6127', ['boundary_origin5149', 'relation_5149_5498', 'relation_5498_6127', 'relation_5149_5498_6127'], 'Маршруты 5149 / 5498 / 6127', 'Routes 5149 / 5498 / 6127'),
        ('MC264920', 'boundary5794', ['boundary_origin5794'], 'Оболочка и продолжение 5794', 'Enclosure and continuation 5794'),
        ('MC264824', 'routes2601_2710_2711', ['damage_origin2711_z818640', 'relation_2601_2710', 'relation_2601_2711', 'relation_2710_2711', 'relation_2601_2710_2711'], 'Маршруты 2601 / 2710 / 2711', 'Routes 2601 / 2710 / 2711'),
        ('MC264824', 'excluded2826_2428', ['excluded2826_vs2428'], 'Исключённый 2826 и ветвь 2428', 'Excluded 2826 and branch 2428'),
        ('MC264824', 'cut869', ['cut869'], 'Компартментный срез 869', 'Compartment cut 869'),
        ('MC264824', 'cut2638', ['cut2638'], 'Компартментный срез 2638', 'Compartment cut 2638'),
        ('MC264824', 'cut5297', ['cut5297'], 'Компартментный срез 5297', 'Compartment cut 5297'),
    ]
    for rid, name, ids, ru, en in families:
        add_group(rid + '.group.' + name, 'branches', rid, ids, labels(rid + ': ' + ru, rid + ': ' + en))
    assert set(membership) == set(task_by_id)

    questions = []
    for task in catalog['tasks']:
        tid, rid = task['id'], task['recipientId']
        old = originals[tid]
        kind = task['sourceTaskType']
        deps = [] if kind == 'identity' else [rid + '.soma_identity']
        if kind not in ('identity', 'origin_route'):
            deps += [rid + '.origin' + str(o) + '_to_soma' for o in task['originIds']]
        # Dependencies reuse the exact original route question; no relation is inferred.
        deps = [i for i in dict.fromkeys(deps) if i in task_by_id and i != tid]
        detail = task['question']
        origins = ' / '.join(str(o) for o in task['originIds'])
        short = {
            'identity': labels('Принадлежит ли окружающая мембрана этой соме release661?', 'Does the enclosing membrane belong to this release661 soma?'),
            'origin_route': labels(f'Где ветвь {origins} входит в сому: отдельно или через общий ствол?', f'Where does branch {origins} enter the soma: independently or through a shared stem?'),
            'branch_relation': labels(f'Есть ли у ветвей {origins} общий родитель до сомы?', f'Do branches {origins} share a parent before the soma?'),
            'compartment_cut': labels('Какие дочерние профили действительно прикреплены и к какому компартменту относятся?', 'Which child profiles are attached, and to which compartment do they belong?'),
        }.get(kind, detail)
        available = []
        for v in catalog['volumes']:
            if v['id'] in old['volume_ids']:
                available.append({k: v[k] for k in ('id', 'sha256', 'resolutionNm', 'boundsNm', 'shapeXYZ', 'voxelOffset')})
        options = [o for field in task['fields'] for o in field['options']]
        q = dict(id=tid, taskId=tid, ownerTaskId=tid, decisionOwnerTaskId=tid,
                 taskIds=[tid], groupId=membership[tid], recipientId=rid,
                 rootRelease661=task['rootRelease661'], materialization=661,
                 view='stems' if kind in ('identity', 'origin_route') else 'branches',
                 kind=kind, title=task['title'], question=short, detail=detail,
                 originalQuestionRef=task['sourceRefs']['catalog'],
                 originIds=[str(o) for o in task['originIds']],
                 candidateBranches=[dict(originId=str(o), status='computational-candidate') for o in task['originIds']],
                 bookmarks=task['navigationAnchors'], anchorNm=task['anchorNm'],
                 alternatives=options + [dict(value='reviewer_alternative', label=labels('Другая интерпретация: опишите', 'Another interpretation: describe'))],
                 dependencyQuestionIds=deps, dependencies=deps, dependentTaskIds=[], dependentQuestionIds=[],
                 coverage=dict(status='prepared-crop' if available else 'outside-original-prepared-crops',
                               volumeIds=old['volume_ids'], availableVolumes=available,
                               routeBoundsVerified=False, routeBoundsNm=None,
                               note=labels('Границы объёмов и закладки заданы. Полный маршрут и сохранность мембраны ещё не проверены; доступность текущего исходного среза определяется при загрузке.', 'Volume bounds and bookmarks are supplied. The complete route and membrane signal remain unreviewed; current native image availability is checked when loading.')),
                 sourceRefs=task['sourceRefs'], defaultStatus='unreviewed',
                 independentContactReview=False, inheritedDecision=False)
        # Prior observation text is deliberately not copied into the blinded UI.
        prior = old.get('prior_observation_pointer')
        q['priorEvidenceRefs'] = []
        if prior:
            for item in evidence:
                pointer = item['observation_pointer']
                if pointer['sha256'] == prior['sha256']:
                    q['priorEvidenceRefs'].append(dict(id=item['evidence_id'], sourceHash=pointer['sha256'],
                        jsonPointer=pointer.get('json_pointer_or_jsonl_line'), attribution='prior-model-observation-hidden'))
        questions.append(q)
    by_question = {q['id']: q for q in questions}
    for q in questions:
        for dep in q['dependencyQuestionIds']:
            by_question[dep]['dependentTaskIds'].append(q['taskId'])
            by_question[dep]['dependentQuestionIds'].append(q['id'])
    for group in groups:
        group['dependencies'] = list(dict.fromkeys(d for qid in group['questionIds']
            for d in by_question[qid]['dependencyQuestionIds'] if d not in group['questionIds']))
        group['bookmarks'] = list({a['id'] + ':' + ','.join(map(str, a['nm'])): a
            for qid in group['questionIds'] for a in by_question[qid]['bookmarks']}.values())

    contacts_by_recipient = {r['id']: read(APP / r['contactsUrl']) for r in catalog['recipients']}
    # Audit exact integer-text root joins against the header-described v661 table.
    proof_dir = ARCHIVE / 'L4/geometry'
    table_path = proof_dir / 'v661_proofreading_status_public_release_merged.csv.gz'
    header_path = proof_dir / 'v661_proofreading_status_public_release_merged_header.csv'
    receipt_path = proof_dir / 'v661_annotation_receipt.json'
    table_receipt = next(r for r in read(receipt_path)['records'] if r['table'] == 'proofreading_status_public_release')
    for item in table_receipt['files']:
        assert digest(proof_dir / item['file']) == item['sha256']
    with header_path.open(encoding='utf-8', newline='') as fh:
        header = [r[0] for r in csv.reader(fh)]
    proof = defaultdict(list)
    with gzip.open(table_path, 'rt', encoding='utf-8', newline='') as fh:
        for line, row in enumerate(csv.DictReader(fh, fieldnames=header), 1):
            assert None not in row and row['pt_root_id'].isdigit()
            proof[row['pt_root_id']].append(dict(row, sourceLine=line))
    incoming = set(c['sourceRootId'] for pack in contacts_by_recipient.values() for c in pack['contacts'])
    source_lookup = {}
    for root in sorted(incoming):
        if root in proof:
            source_lookup[root] = dict(sourceRootId=root, materialization=661, inheritedOnly=True,
                nativeQualityStatus='pending', rows=[dict(sourceLine=row['sourceLine'], rowId=row['id'],
                    validId=row['valid_id'], rootId=row['pt_root_id'], supervoxelId=row['pt_supervoxel_id'],
                    dendriteStatus=row['status_dendrite'], axonStatus=row['status_axon']) for row in proof[root]])
    status_counts = Counter(row['status_axon'] for root in incoming for row in proof.get(root, []))
    inventory_path = PROJECT / 'prospective_validation_v2/inventory/candidate_inventory.csv'
    with inventory_path.open(encoding='utf-8', newline='') as fh:
        inventory = {r['nucleus_id']: r for r in csv.DictReader(fh)}
    inherited_targets = []
    metadata_refs = []
    for recipient in catalog['recipients']:
        rid, root = recipient['nucleusId'], recipient['rootRelease661']
        meta_path = PROJECT / f'prospective_validation_v2/inventory/metadata_json/{root}_{rid}_metadata.json'
        meta = read(meta_path)
        assert str(meta['root_id']) == root and str(meta['soma_id']) == rid and meta['version'] == 661
        assert meta['status_dendrite'] == inventory[rid]['dendrite_status'] == 'extended'
        rows = proof[root]
        assert len(rows) == 1 and rows[0]['status_dendrite'] == meta['status_dendrite'] and rows[0]['status_axon'] == meta['status_axon']
        metadata_refs.append(ref(meta_path))
        inherited_targets.append(dict(recipientId=recipient['id'], rootRelease661=root, materialization=661,
            dendriteStatus=meta['status_dendrite'], axonStatus=meta['status_axon'],
            metadataRef=ref(meta_path), proofreadingTableLine=rows[0]['sourceLine'],
            taskSpecificNativeReview='unreviewed', incomingAxonQualityInferred=False))

    concerns = []
    concern_counts = Counter()
    for recipient in catalog['recipients']:
        rid = recipient['id']
        pack = contacts_by_recipient[rid]
        for c in pack['contacts']:
            if c['eligibility'] not in ('predicted_axon', 'root_or_unreachable'):
                continue
            reason = 'compartment-flag' if c['eligibility'] == 'predicted_axon' else 'unassigned-or-unreachable'
            concern_counts[reason] += 1
            task_ids = [q['id'] for q in questions if q['recipientId'] == rid and str(c['domainId']) in q['originIds']]
            if not task_ids:
                task_ids = [rid + '.soma_identity']
            concerns.append(dict(c, recipientId=rid, targetRootId=recipient['rootRelease661'],
                materialization=661, coordinateConvention='integer-sample', concernCodes=[reason], reasonCodes=[reason],
                taskIds=task_ids, questionIds=task_ids, contextOnlyQuestionLinks=True,
                sourceRefs=pack['sourceRefs'], defaultStatus='unreviewed',
                automaticCertification=False, sourceQualityDependency='incoming-source-quality'))
    # Exact source flag first; covered/uncovered groups aid navigation without excluding either.
    rank = {r['id']: i for i, r in enumerate(catalog['recipients'])}
    concerns.sort(key=lambda c: (rank[c['recipientId']], not bool(c['coveringVolumeIds']), c['concernCodes'][0], int(c['id'])))
    issue_policy = dict(id='source-recorded-concerns-v1', requiredQuota=None, defaultContactStatus='unreviewed',
        inclusion=labels('Только исходные флаги predicted_axon и root_or_unreachable; остальные контакты доступны в поиске.', 'Only source-recorded predicted_axon and root_or_unreachable flags; every other contact remains searchable.'),
        order='catalog-recipient-order; original-crop-coverage-first; concern-code; exact-numeric-contact-id',
        fieldSelection=['eligibility', 'coveringVolumeIds', 'recipientId', 'id'],
        selectionUsesFunctionalResults=False, count=len(concerns), countsByConcern=dict(concern_counts),
        labels={'compartment-flag': labels('Исходный флаг аксонального компартмента; прикрепление не проверено', 'Source axonal-compartment flag; attachment unreviewed'),
                'unassigned-or-unreachable': labels('Исходное назначение корню или недостижимому участку', 'Source assignment to root or unreachable region')})
    refs = {name: ref(PREP / name) for name in ['README.md', 'task_catalog.json', 'source_registry.json',
        'named_contact_index.jsonl', 'decision_schema.json', 'evidence_index.json', 'render_pointer_index.json']}
    refs['candidate_inventory.csv'] = ref(inventory_path)
    refs['SOURCE_NOTES.md'] = ref(PROJECT / 'prospective_validation_v2/inventory/SOURCE_NOTES.md')
    refs['DECISION_REPORT.md'] = dict(ref(PROJECT / 'focused_validation_v1/results/DECISION_REPORT.md'), researcherContentsExcluded=True)
    for q in questions:
        pointer = Path(originals[q['id']]['source_pointer']['path']).resolve()
        assert pointer in registered and digest(pointer) == registered[pointer]['sha256']
    artifact = dict(schemaVersion=1, version=1, projectId=catalog['projectId'], catalogHash=catalog['catalogHash'],
        sourceHash=catalog['sourceHash'], materialization=661, coordinateConvention='integer-sample',
        groups=groups, questions=questions, contactConcerns=concerns, contactPolicy=issue_policy,
        counts=dict(originalTasks=50, navigationGroups=len(groups), stemsGroups=4, branchesGroups=11,
                    stemsQuestions=30, branchesQuestions=20, uniqueDecisionQuestions=50,
                    mergedIndependentDecisions=0, contactConcerns=len(concerns), allContacts=catalog['contactCount'],
                    allFootprints=catalog['footprintCount'], sourceFlagCounts=dict(concern_counts)),
        grouping=labels('Группы объединяют навигацию по указанным исходным маршрутам. У всех 50 вопросов отдельное решение; одна и та же проверка маршрута повторно используется как ссылка. Общая точка ветвления ещё не подтверждена.', 'Groups combine navigation along source-nominated routes. All 50 questions retain independent decisions; an identical route check is reused by reference. Shared junctions remain unconfirmed.'),
        inheritedTargetProofreading=inherited_targets,
        sourceQuality=dict(id='incoming-source-quality', status='pending-native-quality-audit', materialization=661,
            tableRef=ref(table_path), headerRef=ref(header_path), receiptRef=ref(receipt_path),
            lookupMethod='Exact decimal-string incoming sourceRootId to v661 pt_root_id; header-described complete table; no current-release mapping.',
            allIncomingUniqueRoots=len(incoming), matchedUniqueRoots=len(source_lookup), missingTableRoots=len(incoming)-len(source_lookup),
            matchedAxonStatusCounts=dict(sorted(status_counts.items())), bySourceRootId=source_lookup,
            missingDefault=dict(inheritedStatus='not-in-this-table', nativeQualityStatus='pending'),
            note=labels('Статус входящего аксона из release661 — унаследованная курация. Он не подтверждает идентичность, непрерывность ветви или прикрепление конкретного контакта; отсутствие строки означает неизвестность.', 'A release661 incoming-axon status is inherited curation. It does not establish native identity, branch continuity or attachment of an individual contact; no table row means unknown.'),
            requiredAudit=labels('Зафиксировать точный пул входящих корней и политику качества; сопоставить версии и идентичности, проверить пропуски и противоречия метаданных, затем документировать необходимые исходные маршруты аксона и прикрепления. Записывать проверку каждого контакта отдельно.', 'Freeze the exact incoming-root pool and quality policy; reconcile versions and identities, audit missing/conflicting metadata, then document the necessary native axon routes and attachments. Record each contact check separately.')),
        auditProtocol=dict(status='not-specified-in-reviewed-sources', sampleSize=None, seed=None, selectedIds=[],
            note=labels('Обоснованный протокол выборочной проверки контактов в прочитанных материалах не задан. Очередь проблем не является случайной выборкой или нормой проверки.', 'No justified contact sampling protocol is specified in the inspected sources. The concern queue is neither a random audit sample nor a review quota.')),
        denominators=dict(primaryEligibleUniqueContacts=1170, broaderEligibleUniqueContacts=1182,
            provenance='Scope supplied in the authorized CHECK workflow specification; not recomputed or used for queue selection.',
            manualReviewQuota=None, biologicalCertification=False),
        sources=refs, metadataRefs=metadata_refs,
        provenance=dict(originalSourceFilesModified=False, imagesInspected=0, priorObservations=len(evidence),
            renderPointerRecords=len(renders), priorModelVerdictsInResearcherUI=False,
            inheritedCurationCompletesNativeReview=False, contactCertificationFromSharedDecision=False))
    serialized = json.dumps(artifact, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    artifact['workflowHash'] = hashlib.sha256(serialized).hexdigest()
    (APP / 'data/focused-workflow.json').write_bytes((json.dumps(artifact, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print(json.dumps(dict(workflowHash=artifact['workflowHash'], counts=artifact['counts'],
                         sourceQuality={k: artifact['sourceQuality'][k] for k in ['allIncomingUniqueRoots', 'matchedUniqueRoots', 'missingTableRoots', 'matchedAxonStatusCounts']}), ensure_ascii=False))


if __name__ == '__main__':
    build()
