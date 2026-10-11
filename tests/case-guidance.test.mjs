import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {caseGuidance} from '../core/case-guidance.js';
import {taskReviewContent} from '../core/review-task-content.js';
import {navigationQuestions} from '../core/review-navigation.js';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const source={...read('data/catalog.json'),focusedWorkflow:read('data/focused-workflow.json'),reviewScope:read('data/review-scope.json')};
const fixture=poolId=>({...structuredClone(source),activeReviewPoolId:poolId??'preferred14.clean_extended'});
const allText=(value,language)=>[value.instruction,...value.steps].map(item=>item[language]).join(' ');

test('all 45 required and five optional questions have short bilingual anatomical guidance without mutating source records',()=>{
  for(const poolId of ['preferred14.clean_extended','all_export19.clean_extended']){
    const catalog=fixture(poolId),before=structuredClone(catalog);
    assert.equal(navigationQuestions(catalog,[]).length,45);
    assert.equal(navigationQuestions(catalog,[],{includeOptional:true}).length,50);
    for(const question of catalog.focusedWorkflow.questions){
      const result=caseGuidance(catalog,question.id);
      assert.deepEqual(Object.keys(result),['instruction','steps']);
      assert.ok(result.steps.length>=2&&result.steps.length<=3,question.id);
      for(const item of [result.instruction,...result.steps]){
        assert.deepEqual(Object.keys(item),['ru','en']);
        for(const language of ['ru','en']){
          assert.equal(typeof item[language],'string');assert.ok(item[language].length>35&&item[language].length<430,question.id);
          assert.doesNotMatch(item[language],/[\u2190-\u21ff\u27f0-\u27ff]/);
        }
        assert.match(item.ru,/[А-Яа-яЁё]/);assert.doesNotMatch(item.en,/[А-Яа-яЁё]/);
      }
      assert.doesNotMatch(result.instruction.ru,/^\d/);assert.doesNotMatch(result.instruction.en,/^\d/);
    }
    assert.deepEqual(catalog,before);
  }
});

test('identity and origin instructions request source identity and real membrane continuity, with honest coverage',()=>{
  const catalog=fixture();
  for(const question of catalog.focusedWorkflow.questions.filter(q=>q.kind==='identity')){
    const result=caseGuidance(catalog,question.id);
    assert.match(result.instruction.en,/release661.*Record/);
    assert.match(allText(result,'en'),/root and soma supervoxel.*outer plasma membrane/);
    assert.match(allText(result,'en'),/Proximity.*insufficient/);
    assert.match(allText(result,'en'),/membrane regions and features used to establish identity/);
    assert.match(allText(result,'en'),/marks and outlines where they help/);
  }
  for(const question of catalog.focusedWorkflow.questions.filter(q=>q.kind==='origin_route')){
    const result=caseGuidance(catalog,question.id);
    for(const origin of question.originIds)assert.ok(result.instruction.ru.includes(origin)&&result.instruction.en.includes(origin));
    assert.match(result.instruction.en,/verified soma.*separately or through a shared stem/);
    assert.match(allText(result,'en'),/same outer plasma membrane.*serial sections/);
    assert.match(allText(result,'en'),/Reuse the saved trace/);
    assert.match(allText(result,'en'),/missing evidence|evidence is insufficient/);
  }
});

test('all nine relationships retain the exact origin set, reuse evidence and keep pair and triple answers independent',()=>{
  const catalog=fixture(),relations=catalog.focusedWorkflow.questions.filter(q=>q.kind==='branch_relation');
  assert.equal(relations.length,9);
  for(const question of relations){
    const result=caseGuidance(catalog,question.id);
    for(const origin of question.originIds)assert.ok(result.instruction.ru.includes(origin)&&result.instruction.en.includes(origin));
    assert.match(result.instruction.en,/share a parent stem before the soma or enter it separately/);
    assert.match(allText(result,'en'),/saved routes.*same verified soma/);
    assert.match(allText(result,'en'),/pair answer does not establish the triple relationship/);
    assert.match(allText(result,'en'),/subset may share a parent/);
  }
});

test('retained-cut guidance binds exact child attachment and compartment, with siblings confined to optional context',()=>{
  for(const poolId of ['preferred14.clean_extended','all_export19.clean_extended'])for(const [id,cut,child,parent,sibling]of [
    ['MC298937.cut4475','4475','4661','4476','4315'],
    ['MC264824.cut869','869','837','898','870']
  ]){
    const catalog=fixture(poolId),result=caseGuidance(catalog,id),content=taskReviewContent(catalog,id);
    assert.deepEqual(content.retainedChildIds,[child]);
    assert.ok(content.primaryFieldIds.includes(`child_${child}_attachment`));assert.ok(content.primaryFieldIds.includes(`child_${child}_compartment`));
    assert.ok(content.optionalFieldIds.includes(`child_${sibling}_attachment`));assert.ok(content.optionalFieldIds.includes(`child_${sibling}_compartment`));
    for(const language of ['ru','en']){
      assert.ok(result.instruction[language].includes(cut)&&result.instruction[language].includes(child));
      assert.ok(!result.instruction[language].includes(sibling));
      assert.ok(result.steps[0][language].includes(parent));
      assert.ok(result.steps[1][language].includes(sibling));
    }
    assert.match(result.instruction.en,/attachment and compartment separately/);
    assert.match(result.steps[1].en,/optional context with separate answers/);
    assert.match(allText(result,'en'),/evidence is insufficient.*uncertainty/);
  }
});

test('deferred cuts remain optional with no fabricated retained children',()=>{
  for(const id of ['MC264824.cut2638','MC264824.cut5297']){
    const result=caseGuidance(fixture(),id);
    assert.match(result.instruction.en,/^Optional inspection:/);
    assert.match(allText(result,'en'),/no retained contacts in this node's child paths/);
    assert.match(allText(result,'en'),/does not change the original exclusions/);
  }
});

test('the three optional excluded-origin checks preserve exclusions and cannot imply pool membership changes',()=>{
  for(const id of ['MC264649.origin3639_to_soma','MC264920.origin6124_to_soma','MC264824.origin2826_to_soma']){
    const result=caseGuidance(fixture(),id);
    assert.match(allText(result,'en'),/Preserve the original exclusion of the origin/);
    assert.match(allText(result,'en'),/does not change pool membership/);
    assert.match(allText(result,'ru'),/исходное исключение начала/);
  }
});

test('each of the seven local qualifications retains its specific ambiguity and damage cannot bridge a gap',()=>{
  const catalog=fixture(),checks={
    'MC298937.damage_cut4475_z872320':[/4475.*872320/,/first and last visible/,/Do not bridge.*biological split/],
    'MC264649.boundary_origin3944':[/internal oval rim/,/upper narrowing/,/neighboring cell/],
    'MC264649.boundary_excluded3639':[/dark internal structure/,/upper-right profile/,/exclusion of 3639 remains/],
    'MC264920.boundary_origin5149':[/internal organelle or a separate process/,/outer plasma membrane separately/,/Retain both alternatives/],
    'MC264920.boundary_origin5794':[/internal longitudinal dark structure/,/narrowing or widening/,/upper and lateral crop exits/],
    'MC264824.damage_origin2711_z818640':[/2711.*818640/,/alternative continuations/,/Do not bridge.*interpolation/],
    'MC264824.excluded2826_vs2428':[/two candidate profiles/,/2826 and 2428/,/preserving each identity/,/18 raw predicted-axon contacts remain excluded/]
  };
  assert.equal(catalog.focusedWorkflow.questions.filter(q=>q.kind==='targeted_boundary_or_damage').length,Object.keys(checks).length);
  for(const [id,patterns]of Object.entries(checks))for(const pattern of patterns)assert.match(allText(caseGuidance(catalog,id),'en'),pattern);
});

test('returned guidance is isolated from caller edits and accepts the existing indexed-catalog wrapper',()=>{
  const catalog=fixture();
  for(const {id}of catalog.focusedWorkflow.questions){
    const before=caseGuidance(catalog,id),mutated=caseGuidance(catalog,id);
    mutated.instruction.en='changed';for(const step of mutated.steps)step.ru='изменено';
    assert.deepEqual(caseGuidance(catalog,id),before);
    assert.deepEqual(caseGuidance({catalog,taskMap:new Map()},id),before);
  }
  assert.throws(()=>caseGuidance(catalog,'unknown'),/Unknown canonical review question/);
});
