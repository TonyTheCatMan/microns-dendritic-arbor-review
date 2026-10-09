import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const app = new URL('../', import.meta.url);
const readJSON = async path => JSON.parse(await readFile(new URL(path, app), 'utf8'));
const catalog = await readJSON('data/catalog.json');
const pointers = await readJSON('data/source-pointers.json');
const sourceReceipt = await readJSON('data/build-receipt.json');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('exact task scope, roots, unique IDs, source binding and reproducible catalog hash', () => {
  assert.equal(catalog.projectId, 'microns-dendritic-arbor-review');
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.tasks.length, 50);
  assert.equal(new Set(catalog.tasks.map(task => task.id)).size, 50);
  const counts = {MC298937: 7, MC264649: 11, MC264920: 13, MC264824: 19};
  const roots = {MC298937: '864691135195576362', MC264649: '864691135408247241', MC264920: '864691136444888195', MC264824: '864691135571546917'};
  for (const recipient of catalog.recipients) {
    assert.equal(recipient.rootRelease661, roots[recipient.id]);
    assert.equal(catalog.tasks.filter(task => task.recipientId === recipient.id).length, counts[recipient.id]);
    for (const task of catalog.tasks.filter(task => task.recipientId === recipient.id)) {
      assert.equal(task.rootRelease661, roots[recipient.id]);
      assert.equal(task.sourceRefs.catalog.sha256, catalog.sourceHash);
      assert.match(task.sourceRefs.catalog.jsonPointer, /^\/tasks\/\d+$/);
    }
  }
  const {catalogHash, ...payload} = catalog;
  assert.equal(sha256(JSON.stringify(sorted(payload))), catalogHash);
  assert.equal(sourceReceipt.catalogHash, catalogHash);
});

test('integer sampling, true prepared resolution and all source origin/cut navigation anchors', () => {
  assert.equal(catalog.coordinateConvention, 'integer-sample');
  assert.deepEqual(catalog.annotationGridNm, [4, 4, 40]);
  assert.deepEqual(catalog.sources.em.finestResolutionNm, [8, 8, 40]);
  assert.equal(catalog.sources.em.encoding, 'raw');
  assert.equal(catalog.volumes.length, 11);
  for (const volume of catalog.volumes) {
    assert.ok([16, 32].includes(volume.resolutionNm[0]));
    assert.equal(volume.resolutionNm[2], 40);
    assert.deepEqual(volume.boundsNm[0], volume.voxelOffset.map((n, axis) => n * volume.resolutionNm[axis]));
    assert.deepEqual(volume.boundsNm[1], volume.voxelOffset.map((n, axis) => (n + volume.shapeXYZ[axis]) * volume.resolutionNm[axis]));
  }
  for (const task of catalog.tasks) {
    assert.equal(task.anchorNm.length, 3);
    assert.ok(task.anchorNm.every(Number.isFinite));
    assert.deepEqual(task.navigationAnchors.find(anchor => anchor.id === 'task-anchor').nm, task.anchorNm);
    for (const originId of task.originIds) {
      const sourceOrigin = catalog.recipients.find(r => r.id === task.recipientId).origins.find(o => o.id === originId);
      assert.ok(sourceOrigin, `${task.id}: source origin ${originId}`);
      assert.deepEqual(task.navigationAnchors.find(anchor => anchor.id === `origin-${originId}`).nm, sourceOrigin.anchorNm);
    }
    const raw = pointers.tasks.find(raw => raw.id === task.id);
    for (const node of raw.sourceNodeNeighborhood) {
      assert.deepEqual(task.navigationAnchors.find(anchor => anchor.id === `node-${node.node}`).nm, node.xyz_nm);
    }
  }
});

test('missing crop tasks and exact damaged-section pointers are retained without substitute anchors', () => {
  const cutExpected = {
    'MC264824.cut869': [636056, 718936, 845560],
    'MC264824.cut2638': [701768, 858120, 829720],
    'MC264824.cut5297': [760944, 789984, 768280],
  };
  assert.deepEqual(catalog.tasks.filter(t => t.coverage.status === 'no-prepared-crop').map(t => t.id).sort(), Object.keys(cutExpected).sort());
  for (const [id, xyz] of Object.entries(cutExpected)) {
    const task = catalog.tasks.find(t => t.id === id);
    assert.deepEqual(task.anchorNm, xyz);
    assert.deepEqual(task.coverage.volumeIds, []);
    assert.ok(task.navigationAnchors.length >= 6);
  }
  const d1 = catalog.tasks.find(t => t.id === 'MC298937.damage_cut4475_z872320');
  const d2 = catalog.tasks.find(t => t.id === 'MC264824.damage_origin2711_z818640');
  assert.equal(d1.anchorNm[2], 21808 * 40);
  assert.equal(d2.anchorNm[2], 20466 * 40);
  assert.equal(d1.sourceRefs.priorObservation.tile, 8);
  assert.equal(d2.sourceRefs.priorObservation.tile, 2);
  assert.equal(d1.category, 'damage');
  assert.equal(d2.category, 'damage');
});

test('all choices are bilingual, review starts blank, no model verdict or identity/profile defaults', async () => {
  for (const task of catalog.tasks) {
    assert.equal(task.defaultStatus, 'unreviewed');
    assert.deepEqual(task.defaultAnswers, {});
    for (const text of [task.title, task.question, ...task.fields.map(f => f.label), ...task.fields.flatMap(f => f.options.map(o => o.label))]) {
      assert.ok(text.ru && /[А-Яа-я]/.test(text.ru));
      assert.ok(text.en);
      assert.doesNotMatch(text.ru + text.en, /[\u2190-\u21ff\u27f0-\u27ff]/);
    }
    assert.doesNotMatch(task.question.en, /Prior model favors|conditional contrast|functional result/i);
    assert.ok(task.fields.every(field => field.options.some(option => option.value === 'unresolved')));
  }
  const blank = await readJSON('data/decisions-blank-v2.json');
  assert.equal(blank.anatomicalCertification, false);
  assert.equal(Object.keys(blank.records).length, 50);
  for (const record of Object.values(blank.records)) {
    assert.equal(record.status, 'unreviewed');
    assert.deepEqual(record.answers, {});
    assert.deepEqual(record.annotations, []);
    assert.equal(record.reviewer_name, null);
    assert.equal(record.qualifications, null);
  }
  const schema = await readJSON('data/decision-schema-v2.json');
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(pointers.sourceSchemaIssue);
  assert.equal(pointers.sourceSchemaIssue.line, 60);
});

test('m1300 identity mapping is explicitly unresolved and never inferred from release661 numbers', () => {
  assert.equal(catalog.sources.segmentation.version, 'm1300');
  for (const recipient of catalog.recipients) {
    assert.equal(recipient.mapping.status, 'unresolved');
    assert.equal(recipient.mapping.segmentId, null);
    assert.ok(recipient.mapping.evidenceRefs.length);
    assert.equal(typeof recipient.rootRelease661, 'string');
    assert.equal(typeof recipient.somaSupervoxelRelease661, 'string');
  }
});

test('all source contacts, exclusions, coordinates, coverage and complete footprint membership survive adaptation', async () => {
  let total = 0, footprintTotal = 0, inside = 0;
  for (const recipient of catalog.recipients) {
    const bytes = await readFile(new URL(recipient.contactsUrl, app));
    assert.equal(sha256(bytes), recipient.contactsHash);
    const data = JSON.parse(bytes);
    assert.equal(data.sourceHash, catalog.sourceHash);
    assert.equal(data.rootRelease661, recipient.rootRelease661);
    assert.equal(data.contacts.length, recipient.contactCount);
    assert.equal(data.footprints.length, recipient.footprintCount);
    const contacts = new Map(data.contacts.map(contact => [contact.id, contact]));
    assert.equal(contacts.size, data.contacts.length);
    const footprintContacts = [];
    for (const footprint of data.footprints) {
      const counts = {};
      for (const id of footprint.contactIds) {
        const contact = contacts.get(id);
        assert.ok(contact, `${recipient.id}: ${id}`);
        assert.equal(contact.sourceRootId, footprint.sourceRootId);
        assert.equal(contact.footprintLine, footprint.sourceLine);
        counts[contact.eligibility] = (counts[contact.eligibility] || 0) + 1;
        footprintContacts.push(id);
      }
      assert.deepEqual(counts, footprint.contactStatusCounts);
      assert.ok(footprint.eligibleContactIds.every(id => footprint.contactIds.includes(id)));
    }
    assert.deepEqual(footprintContacts.sort(), [...contacts.keys()].sort());
    for (const contact of data.contacts) {
      for (const id of [contact.id, contact.sourceRootId, contact.preSupervoxelId, contact.postSupervoxelId, contact.postLevel2Id]) {
        assert.equal(typeof id, 'string');
        assert.match(id, /^\d+$/);
      }
      for (const point of [contact.preNm, contact.postNm, contact.centerNm]) assert.ok(point.length === 3 && point.every(Number.isFinite));
      const calculatedCover = catalog.volumes.filter(v => v.recipientId === recipient.id && contact.postNm.every((n, a) => n >= v.boundsNm[0][a] && n < v.boundsNm[1][a])).map(v => v.id).sort();
      assert.deepEqual([...contact.coveringVolumeIds].sort(), calculatedCover);
      if (contact.coveringVolumeIds.length) inside++;
    }
    total += data.contacts.length;
    footprintTotal += data.footprints.length;
  }
  assert.equal(total, 27099);
  assert.equal(footprintTotal, 22844);
  assert.equal(inside, 1112);
});

test('all immutable source registry hashes and original source decisions schema are preserved as pointers', async () => {
  assert.equal(pointers.files.length, 115);
  for (const source of pointers.files) {
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.ok(source.bytes > 0);
    assert.ok(source.path);
  }
  // This witness also runs when checked out next to the scientific archive. In a
  // standalone Git clone the original files are intentionally not bundled.
  const original = pointers.preparationFiles.find(p => p.path.endsWith('decision_schema.json'));
  let available = true;
  try { await stat(original.path); } catch { available = false; }
  if (available) {
    const bytes = await readFile(original.path);
    assert.equal(sha256(bytes), original.sha256);
    assert.throws(() => JSON.parse(bytes));
  }
});
