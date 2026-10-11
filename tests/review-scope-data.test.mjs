import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const scope = await read('data/review-scope.json');
const catalog = await read('data/catalog.json');
const workflow = await read('data/focused-workflow.json');
const packs = await Promise.all(catalog.recipients.map(r => read(r.contactsUrl)));
const [primary, broader] = scope.pools;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const sorted = values => [...new Set(values)].sort();
const poolQuestion = (pool, id) => pool.questions.find(q => q.id === id);
const rootIds = (pool, contactIds) => sorted(contactIds.map(id => pool.contacts.find(c => c.id === id).sourceRootId));

test('review scope is additive, canonically hashed and bound to untouched catalog, workflow and release', () => {
  assert.equal(scope.version, 1);
  assert.equal(scope.materialization, 661);
  assert.equal(scope.coordinateConvention, 'integer-sample');
  assert.equal(scope.catalogHash, catalog.catalogHash);
  assert.equal(scope.sourceHash, catalog.sourceHash);
  assert.equal(scope.workflowHash, workflow.workflowHash);
  const {scopeHash, ...payload} = scope;
  assert.equal(createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex'), scopeHash);
  assert.equal(scope.provenance.originalSourceFilesModified, false);
  assert.equal(scope.provenance.scientificAnalysisRun, false);
  assert.equal(scope.provenance.imagesInspected, 0);
  for (const key of ['policyHash', 'manifestHash', 'sourceInventoryHash', 'dependencySummaryHash']) assert.match(scope.provenance[key], /^[a-f0-9]{64}$/);
});

test('primary and broader policy populations stay separate and retain their complete source footprints', () => {
  assert.equal(scope.defaultPoolId, 'preferred14.clean_extended');
  assert.deepEqual(scope.pools.map(p => [p.id, p.counts.distinctSources, p.counts.memberships, p.counts.contacts, p.counts.preservedExclusions]), [
    ['preferred14.clean_extended', 249, 370, 634, 8], ['all_export19.clean_extended', 253, 374, 641, 8]
  ]);
  assert.deepEqual(primary.recipients.map(r => [r.id, r.sourceCount, r.contactCount]), [
    ['MC298937', 163, 301], ['MC264649', 62, 80], ['MC264920', 76, 154], ['MC264824', 69, 99]
  ]);
  const extra = broader.contacts.filter(c => !primary.contacts.some(p => p.id === c.id));
  assert.equal(extra.length, 7);
  assert.equal(new Set(broader.sources.filter(s => !primary.sources.some(p => p.sourceRootId === s.sourceRootId)).map(s => s.sourceRootId)).size, 4);
  for (const pool of scope.pools) {
    assert.equal(new Set(pool.contacts.map(c => c.id)).size, pool.counts.contacts);
    assert.equal(new Set(pool.sources.map(s => s.sourceRootId)).size, pool.counts.distinctSources);
    assert.equal(new Set(pool.sources.map(s => `${s.recipientId}:${s.sourceRootId}`)).size, pool.counts.memberships);
    for (const source of pool.sources) {
      const pack = packs.find(p => p.recipientId === source.recipientId);
      const footprint = pack.footprints.find(f => f.sourceRootId === source.sourceRootId);
      assert.deepEqual(sorted(source.eligibleContactIds), sorted(footprint.eligibleContactIds));
      assert.deepEqual(sorted(source.allIncomingContactIds), sorted(footprint.contactIds));
      assert.deepEqual(sorted([...source.eligibleContactIds, ...source.excludedContactIds]), sorted(footprint.contactIds));
      assert.deepEqual(sorted(source.eligibleContactIds), sorted(pool.contacts.filter(c => c.sourceRootId === source.sourceRootId && c.recipientId === source.recipientId).map(c => c.id)));
      assert.ok(!source.eligibleContactIds.some(id => source.excludedContactIds.includes(id)));
      assert.equal(source.nativeSourceIdentityStatus, 'unreviewed');
      assert.equal(source.nativeContactsStatus, 'unreviewed');
    }
  }
});

test('all 50 independent question scopes remain; priorities follow anatomy without certifying deferred or excluded questions', () => {
  for (const pool of scope.pools) {
    assert.deepEqual(pool.questions.map(q => q.id).sort(), catalog.tasks.map(q => q.id).sort());
    assert.deepEqual(pool.counts.questionPriorities, {deferred: 2, excluded: 3, qualification: 7, required: 38});
    assert.equal(pool.questions.filter(q => q.kind === 'identity' && q.priority === 'required').length, 4);
    assert.equal(pool.questions.filter(q => q.kind === 'origin_route' && q.priority === 'required').length, 23);
    assert.equal(pool.questions.filter(q => q.kind === 'branch_relation' && q.priority === 'required').length, 9);
    assert.deepEqual(pool.questions.filter(q => q.priority === 'excluded').map(q => q.id).sort(), [
      'MC264649.origin3639_to_soma', 'MC264824.origin2826_to_soma', 'MC264920.origin6124_to_soma'
    ]);
    for (const question of pool.questions) {
      assert.equal(question.defaultStatus, 'unreviewed');
      assert.deepEqual(question.dependencyQuestionIds, workflow.questions.find(q => q.id === question.id).dependencyQuestionIds);
      for (const field of ['inspect', 'reason', 'reuse', 'unresolved', 'coverageNote']) {
        assert.ok(question[field].ru.length > 15);
        assert.ok(question[field].en.length > 15);
        assert.doesNotMatch(question[field].ru + question[field].en, /[\u2190-\u21ff]/u);
      }
    }
    // Independent pair/triple scopes cite the same origin decisions, not one another as certification.
    const pair = poolQuestion(pool, 'MC264824.relation_2601_2710');
    const triple = poolQuestion(pool, 'MC264824.relation_2601_2710_2711');
    assert.notEqual(pair.id, triple.id);
    assert.ok(pair.dependencyQuestionIds.includes('MC264824.origin2601_to_soma'));
    assert.ok(triple.dependencyQuestionIds.includes('MC264824.origin2601_to_soma'));
    assert.ok(!triple.dependencyQuestionIds.includes(pair.id));
  }
});

test('consequential cut counts use exact ancestor chains and separate child4315 exclusions from retained child4661', () => {
  for (const [pool, cut4475Count, cut4475Roots] of [[primary, 62, 48], [broader, 65, 50]]) {
    const cut = poolQuestion(pool, 'MC298937.cut4475');
    const child4661 = pool.cutBranches.find(b => b.questionId === cut.id && b.branchNode === '4661');
    const child4315 = pool.cutBranches.find(b => b.questionId === cut.id && b.branchNode === '4315');
    assert.equal(cut.contactIds.length, cut4475Count);
    assert.equal(cut.sourceRootIds.length, cut4475Roots);
    assert.deepEqual(cut.contactIds, cut.exactCutContactIds);
    assert.deepEqual(cut.contactIds, child4661.contactIds);
    assert.deepEqual(sorted(cut.sourceRootIds), rootIds(pool, cut.contactIds));
    assert.equal(child4315.contactIds.length, 0);
    assert.equal(child4315.rawTargetContactCount, 13);
    assert.equal(child4315.rawTargetStatusCounts.predicted_axon, 13);
    assert.equal(child4315.excludedContactIds.length, 0);
    assert.ok(cut.domainContextContactIds.length > cut.contactIds.length);
    const cut869 = poolQuestion(pool, 'MC264824.cut869');
    const child837 = pool.cutBranches.find(b => b.questionId === cut869.id && b.branchNode === '837');
    assert.equal(cut869.contactIds.length, 1);
    assert.equal(cut869.sourceRootIds.length, 1);
    assert.deepEqual(cut869.contactIds, child837.contactIds);
    for (const question of pool.questions.filter(q => q.kind === 'compartment_cut')) {
      assert.equal(question.contactScope, 'exact-cut-ancestry');
      assert.deepEqual(sorted(question.contactIds), sorted(pool.contacts.filter(c => c.exactCutQuestionIds.includes(question.id)).map(c => c.id)));
      const descendantIds = pool.cutBranches.filter(b => b.questionId === question.id).flatMap(b => b.contactIds);
      assert.equal(new Set(descendantIds).size, descendantIds.length);
      assert.deepEqual(sorted(question.contactIds), sorted(descendantIds));
    }
  }
});

test('zero-descendant cuts remain unresolved and conditional even when broad domain context is occupied', () => {
  for (const pool of scope.pools) {
    for (const [id, contextCount] of [['MC264824.cut2638', 18], ['MC264824.cut5297', pool === primary ? 25 : 27]]) {
      const q = poolQuestion(pool, id);
      assert.equal(q.priority, 'deferred');
      assert.equal(q.contactIds.length, 0);
      assert.equal(q.exactCutSourceRootIds.length, 0);
      assert.equal(q.domainContextContactIds.length, contextCount);
      assert.match(q.reason.en, /Restore priority if observations implicate a retained path or terminal completeness/);
      assert.equal(q.originalPreparedCoverage, 'missing');
      assert.equal(q.defaultStatus, 'unreviewed');
    }
    assert.equal(poolQuestion(pool, 'MC264824.cut869').originalPreparedCoverage, 'missing');
    assert.equal(pool.counts.originalCropContainedContacts, 5);
    assert.ok(poolQuestion(pool, 'MC264649.boundary_excluded3639'));
    assert.equal(poolQuestion(pool, 'MC264824.excluded2826_vs2428').priority, 'qualification');
  }
});

test('every retained contact preserves original IDs, supervoxels, separate route links and unreviewed attachment', () => {
  for (const pool of scope.pools) {
    for (const contact of pool.contacts) {
      const raw = packs.find(p => p.recipientId === contact.recipientId).contacts.find(c => c.id === contact.id);
      assert.equal(typeof contact.sourceRootId, 'string');
      assert.match(contact.sourceRootId, /^\d{18}$/);
      assert.equal(contact.sourceRootId, raw.sourceRootId);
      assert.equal(contact.preSupervoxelId, raw.preSupervoxelId);
      assert.equal(contact.postSupervoxelId, raw.postSupervoxelId);
      assert.equal(contact.originalDomainId, String(raw.eligibleDomainId));
      assert.equal(contact.nativeAttachmentStatus, 'unreviewed');
      for (const id of [contact.identityQuestionId, contact.originRouteQuestionId, ...contact.relationQuestionIds, ...contact.domainContextQuestionIds, ...contact.exactCutQuestionIds]) assert.ok(poolQuestion(pool, id));
      assert.ok(poolQuestion(pool, contact.originRouteQuestionId).contactIds.includes(contact.id));
      for (const id of contact.exactCutQuestionIds) assert.ok(poolQuestion(pool, id).exactCutContactIds.includes(contact.id));
    }
  }
});

test('source curation comes from exact release661 inventory and missing metadata stays unknown', () => {
  assert.equal(scope.sourceInventory.length, 619);
  const inventory = new Map(scope.sourceInventory.map(row => [row.sourceRootId, row]));
  const primaryInventory = scope.sourceInventory.filter(row => JSON.parse(row.exactInventoryFields.preferred14_targets).length);
  assert.equal(primaryInventory.length, 611);
  assert.equal(primaryInventory.filter(row => row.statusAxon === 'clean').length, 224);
  assert.equal(primaryInventory.filter(row => row.statusAxon === 'extended').length, 25);
  assert.equal(primaryInventory.filter(row => row.statusAxon === 'missing_table_row').length, 361);
  for (const pool of scope.pools) {
    for (const source of pool.sources) {
      const item = inventory.get(source.sourceRootId);
      assert.ok(['clean', 'extended'].includes(item.statusAxon));
      assert.equal(source.statusAxon, item.statusAxon);
      assert.equal(source.provenance.assessedRootId, source.sourceRootId);
      assert.equal(source.provenance.validId, source.sourceRootId);
      assert.equal(source.provenance.proofRows, 1);
      assert.equal(source.provenance.materialization, 661);
      assert.equal(source.provenance.modernAnnotationUsed, false);
      assert.ok(source.provenance.inventory.csvLine >= 2);
    }
    assert.ok(!pool.sources.some(s => s.sourceRootId === '864691135561597409'), 'later bridge candidate must not enter frozen legacy-only pool');
  }
  assert.equal(scope.policy.nativeCertificationFromMetadata, false);
  assert.equal(scope.policy.contactCertificationFromRouteDecision, false);
  assert.equal(scope.policy.requiredManualContactCount, null);
  assert.equal(scope.policy.rawFlagsAreAuditSample, false);
  assert.equal(scope.policy.scopeChangeNeverEditsFrozenAnalysis, true);
});

test('review-facing content excludes study outcomes, model verdicts and arrow characters', () => {
  const text = JSON.stringify({questions: scope.pools.flatMap(p => p.questions), policy: scope.policy, titles: scope.pools.map(p => p.title)});
  assert.doesNotMatch(text, /fluorescence|effect size|p.value|positive.target|negative.target|previous.model.verdict|prior.model.preference|флуоресценц|размер.эффекта|положительн.*эффект|отрицательн.*эффект/i);
  assert.doesNotMatch(text, /[\u2190-\u21ff]/u);
  assert.ok(!scope.provenance.sources.some(source => source.path.includes('FEASIBILITY_REPORT')));
});

test('ledger pointers and manifest hashes match read-only source files when available', async t => {
  try {
    await readFile(new URL('../../' + scope.provenance.sources[0].path, import.meta.url));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Optional source archive is not present in this standalone website checkout.');
    return;
  }
  for (const source of scope.provenance.sources) {
    const bytes = await readFile(new URL('../../' + source.path, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path);
    assert.equal(bytes.byteLength, source.bytes);
  }
  for (const pool of scope.pools) {
    for (const row of [...pool.questions, ...pool.contacts, ...pool.cutBranches]) {
      assert.ok(row.sourceRefs[0].csvLine >= 2);
      assert.match(row.sourceRefs[0].sha256, /^[a-f0-9]{64}$/);
    }
  }
});
