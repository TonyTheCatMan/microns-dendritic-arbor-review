import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const workflow = await read('data/focused-workflow.json');
const catalog = await read('data/catalog.json');
const packs = await Promise.all(catalog.recipients.map(r => read(r.contactsUrl)));
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;

test('focused source binding and hash are reproducible without changing the original catalog', () => {
  assert.equal(workflow.catalogHash, catalog.catalogHash);
  assert.equal(workflow.sourceHash, catalog.sourceHash);
  assert.equal(workflow.materialization, 661);
  assert.equal(workflow.coordinateConvention, 'integer-sample');
  const {workflowHash, ...payload} = workflow;
  assert.equal(createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex'), workflowHash);
  assert.equal(workflow.provenance.originalSourceFilesModified, false);
  assert.equal(workflow.provenance.imagesInspected, 0);
});

test('all 50 original questions keep independent owners within 15 route-navigation groups', () => {
  assert.deepEqual(workflow.questions.map(q => q.id).sort(), catalog.tasks.map(t => t.id).sort());
  assert.equal(workflow.groups.length, 15);
  assert.equal(workflow.groups.filter(g => g.view === 'stems').length, 4);
  assert.equal(workflow.questions.filter(q => q.view === 'stems').length, 30);
  assert.equal(workflow.questions.filter(q => q.view === 'branches').length, 20);
  assert.deepEqual(workflow.groups.flatMap(g => g.questionIds).sort(), workflow.questions.map(q => q.id).sort());
  for (const question of workflow.questions) {
    assert.equal(question.ownerTaskId, question.id);
    assert.deepEqual(question.taskIds, [question.id]);
    assert.equal(question.defaultStatus, 'unreviewed');
    const original = catalog.tasks.find(t => t.id === question.id);
    assert.equal(question.rootRelease661, original.rootRelease661);
    assert.deepEqual(question.anchorNm, original.anchorNm);
    assert.deepEqual(question.bookmarks, original.navigationAnchors);
    assert.ok(workflow.groups.find(g => g.id === question.groupId).questionIds.includes(question.id));
  }
});

test('shared routes are canonical dependencies and never merge distinct pair/triple or contact decisions', () => {
  const lookup = new Map(workflow.questions.map(q => [q.id, q]));
  const pair = lookup.get('MC264824.relation_2601_2710');
  const triple = lookup.get('MC264824.relation_2601_2710_2711');
  assert.equal(pair.groupId, triple.groupId);
  assert.notEqual(pair.ownerTaskId, triple.ownerTaskId);
  assert.ok(pair.dependencyQuestionIds.includes('MC264824.origin2601_to_soma'));
  assert.ok(triple.dependencyQuestionIds.includes('MC264824.origin2601_to_soma'));
  for (const q of workflow.questions) {
    for (const id of q.dependencyQuestionIds) {
      assert.ok(lookup.has(id));
      assert.ok(lookup.get(id).dependentQuestionIds.includes(q.id));
    }
    assert.equal(q.independentContactReview, false);
    assert.equal(q.inheritedDecision, false);
  }
  assert.equal(workflow.provenance.contactCertificationFromSharedDecision, false);
});

test('missing original crop coverage and physical bounds remain explicit without fabricated routes', () => {
  const missing = workflow.questions.filter(q => !q.coverage.volumeIds.length).map(q => q.id).sort();
  assert.deepEqual(missing, ['MC264824.cut2638', 'MC264824.cut5297', 'MC264824.cut869']);
  for (const q of workflow.questions) {
    assert.equal(q.coverage.routeBoundsVerified, false);
    assert.equal(q.coverage.routeBoundsNm, null);
    for (const volume of q.coverage.availableVolumes) {
      const original = catalog.volumes.find(v => v.id === volume.id);
      assert.equal(volume.sha256, original.sha256);
      assert.deepEqual(volume.boundsNm, original.boundsNm);
      assert.deepEqual(volume.resolutionNm, original.resolutionNm);
    }
  }
});

test('contact concern queue exactly covers existing flags and preserves original coordinates and full-footprint links', () => {
  const expected = packs.flatMap(pack => pack.contacts
    .filter(c => ['predicted_axon', 'root_or_unreachable'].includes(c.eligibility))
    .map(c => pack.recipientId + ':' + c.id)).sort();
  assert.equal(expected.length, 891);
  assert.deepEqual(workflow.contactConcerns.map(c => c.recipientId + ':' + c.id).sort(), expected);
  assert.equal(packs.reduce((sum, p) => sum + p.contacts.length, 0), 27099);
  for (const c of workflow.contactConcerns) {
    const pack = packs.find(p => p.recipientId === c.recipientId);
    const original = pack.contacts.find(row => row.id === c.id);
    for (const key of Object.keys(original)) assert.deepEqual(c[key], original[key]);
    assert.equal(c.targetRootId, pack.rootRelease661);
    assert.match(c.sourceRootId, /^\d{18}$/);
    assert.match(c.targetRootId, /^\d{18}$/);
    const footprint = pack.footprints.find(f => f.sourceRootId === c.sourceRootId);
    assert.ok(footprint.contactIds.includes(c.id));
    assert.equal(c.footprintLine, footprint.sourceLine);
    assert.equal(c.defaultStatus, 'unreviewed');
    assert.equal(c.automaticCertification, false);
    assert.equal(c.contextOnlyQuestionLinks, true);
  }
  assert.equal(workflow.contactPolicy.requiredQuota, null);
  assert.equal(workflow.contactPolicy.selectionUsesFunctionalResults, false);
  assert.deepEqual(workflow.contactPolicy.countsByConcern, {'unassigned-or-unreachable': 790, 'compartment-flag': 101});
});

test('exact-version inherited source/target curation cannot certify native review', () => {
  assert.equal(workflow.inheritedTargetProofreading.length, 4);
  for (const target of workflow.inheritedTargetProofreading) {
    assert.equal(target.dendriteStatus, 'extended');
    assert.equal(target.taskSpecificNativeReview, 'unreviewed');
    assert.equal(target.incomingAxonQualityInferred, false);
  }
  const sq = workflow.sourceQuality;
  assert.equal(sq.allIncomingUniqueRoots, 21230);
  assert.equal(Object.keys(sq.bySourceRootId).length, 531);
  assert.equal(sq.missingTableRoots, 20699);
  assert.deepEqual(sq.matchedAxonStatusCounts, {extended: 97, clean: 419, non: 15});
  const sourceRoots = new Set(packs.flatMap(p => p.contacts.map(c => c.sourceRootId)));
  for (const [id, entry] of Object.entries(sq.bySourceRootId)) {
    assert.ok(sourceRoots.has(id));
    assert.equal(entry.sourceRootId, id);
    assert.equal(entry.materialization, 661);
    assert.equal(entry.inheritedOnly, true);
    assert.equal(entry.nativeQualityStatus, 'pending');
    for (const row of entry.rows) assert.equal(row.rootId, id);
  }
  assert.equal(sq.missingDefault.nativeQualityStatus, 'pending');
  assert.equal(workflow.auditProtocol.sampleSize, null);
  assert.deepEqual(workflow.auditProtocol.selectedIds, []);
});

test('researcher questions are bilingual, blinded, and offer explicit alternatives without a review quota', () => {
  for (const q of workflow.questions) {
    for (const label of [q.title, q.question, q.detail, ...q.alternatives.map(a => a.label)]) {
      assert.ok(label.ru && label.en);
      assert.doesNotMatch(label.ru + label.en, /[\u2190-\u21ff]|p-value|p\s*=|positive cell|negative cell|prior model favors|модель предпочитает/i);
    }
    assert.ok(q.alternatives.some(a => a.value === 'reviewer_alternative'));
  }
  assert.equal(workflow.denominators.primaryEligibleUniqueContacts, 1170);
  assert.equal(workflow.denominators.broaderEligibleUniqueContacts, 1182);
  assert.equal(workflow.denominators.manualReviewQuota, null);
  assert.equal(workflow.denominators.biologicalCertification, false);
});
