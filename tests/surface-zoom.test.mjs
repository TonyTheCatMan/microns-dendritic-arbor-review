import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createTask} from '../core/model.js';
import {setQuestionDecision} from '../core/focused-review.js';
import {createAnnotationExport,createExport,parseImport} from '../core/exchange.js';

const renderer=fs.readFileSync(new URL('../reference-viewer/surface3d.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(frameHeight=500000){
  const elements=new Map(),events=[],element=id=>{
    if(!elements.has(id))elements.set(id,{checked:false,value:'',textContent:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
    return elements.get(id);
  };
  const window={addEventListener(){},dispatchEvent:event=>events.push(event)},document={getElementById:element};
  vm.runInNewContext(renderer,{window,document,CustomEvent:class {constructor(type,options){this.type=type;Object.assign(this,options);}},structuredClone});
  const surface=Object.create(window.LocalSurfaceView.prototype),stage=element('surfaceStage');
  Object.assign(stage,{clientWidth:800,clientHeight:600});
  Object.assign(surface,{stage,volume:{volume_id:'task'},caseId:'task',gl:{},modelReady:true,bounds:[500000,300000,100000],center:[1234,5678,9012],frameHeight,radius:1800000,yaw:-.65,pitch:.4,zoom:1,cameraBasis:null,navigationSignature:'',schedule(){},alpha:.5,meshes:[],annotations:[],annotationsVisible:true,contextShown:new Set(),contextVisible:false,contextMode:'slice',contextAlpha:.25,contextLimit:5,segmentationAlpha:.25,segmentationVisible:false,targetsVisible:false,slice:{z:32,black:0,white:255},token:0,loadContextEntry:async()=>{},setContextVisible:async()=>{},setContextLimit(){},refreshSelectedObject(){},updateSliceTextures(){},draw(){},visibilityChanged(){}});
  surface.bind();
  const send=(name,details={})=>stage.listeners[name]({preventDefault(){},stopPropagation(){},...details});
  return {surface,events,send};
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const sameCamera=(actual,expected)=>{
  for(const key of ['yaw','pitch','zoom','frame_height_nm','radius_nm','physical_height_nm'])near(actual[key],expected[key]);
  for(const key of ['center_nm','right','up','eye_direction','direction'])actual[key].forEach((n,i)=>near(n,expected[key][i]));
  assert.equal(actual.projection,expected.projection);
};

test('whole-neuron wheel and keyboard zoom pass the old size-dependent stop and reach the same physical close-up',()=>{
  for(const frameHeight of [50000,500000,2000000])for(const input of ['wheel','keyboard']){
    const {surface,send}=harness(frameHeight),center=[...surface.center];surface.zoom=.08;
    for(let i=0;i<120;i++)input==='wheel'?send('wheel',{deltaY:-150}):send('keydown',{key:'+'});
    near(surface.camera().height,256);
    assert.ok(surface.zoom<.08);assert.deepEqual(surface.center,center);assert.equal(surface.frameHeight,frameHeight);assert.equal(surface.yaw,-.65);assert.equal(surface.pitch,.4);
  }
});

test('cutout close-up remains available and both input paths retain the full zoom-out limit',()=>{
  for(const frameHeight of [1000,6144,500000])for(const input of ['wheel','keyboard']){
    const {surface,send}=harness(frameHeight);
    for(let i=0;i<120;i++)input==='wheel'?send('wheel',{deltaY:-150}):send('keydown',{key:'='});
    near(surface.camera().height,Math.min(frameHeight*.08,256));
    for(let i=0;i<160;i++)input==='wheel'?send('wheel',{deltaY:150}):send('keydown',{key:'-'});
    assert.equal(surface.zoom,18);near(surface.camera().height,frameHeight*18);
  }
});

test('an existing closer saved camera does not jump outward on an inward zoom gesture',()=>{
  for(const input of ['wheel','keyboard']){
    const {surface,send}=harness();surface.applyNavigationState({zoom:.0001});
    const saved=plain(surface.getNavigationState());
    input==='wheel'?send('wheel',{deltaY:-150}):send('keydown',{key:'+'});
    assert.deepEqual(plain(surface.getNavigationState()),saved);
    input==='wheel'?send('wheel',{deltaY:150}):send('keydown',{key:'-'});
    assert.ok(surface.camera().height>saved.physical_height_nm);assert.ok(surface.camera().height<256);
  }
});

test('physical camera sync and saved camera restore preserve close-up ratios without changing frame or center',()=>{
  const {surface}=harness(),center=[4321,8765,2109];
  surface.applyNavigationState({center_nm:center,physical_height_nm:256});
  near(surface.zoom,256/500000);assert.equal(surface.frameHeight,500000);assert.deepEqual(plain(surface.center),center);
  const saved=plain(surface.getNavigationState());
  for(const includePhysical of [true,false]){
    const copy={...saved};if(!includePhysical)delete copy.physical_height_nm;
    const target=harness(6144).surface;target.applyNavigationState(copy);
    sameCamera(target.getNavigationState(),saved);
  }
  surface.applyNavigationState({physical_height_nm:18000000});near(surface.camera().height,18000000);
  for(const zoom of [0,-.0001,NaN,Infinity,18.01])assert.throws(()=>surface.applyNavigationState({zoom}));
});

test('3D evidence view restores zoom below the former .08 limit and retains camera basis',async()=>{
  const {surface}=harness();surface.applyNavigationState({zoom:256/500000,right:[1,0,0],up:[0,-1,0],eye_direction:[0,0,-1]});
  const evidence=plain(surface.getViewState()),camera=plain(surface.getNavigationState()),target=harness(6144).surface;
  await target.restoreEvidence(evidence);sameCamera(target.getNavigationState(),camera);
  for(const zoom of [0,-1,18.01])await assert.rejects(()=>target.restoreEvidence({...evidence,camera:{...evidence.camera,zoom}}));
});

test('JSON and ZIP task and review-answer transfers preserve sub-.08 camera scale and source coordinates',async()=>{
  const {surface}=harness();surface.applyNavigationState({zoom:256/500000});
  const catalog={catalogHash:'a'.repeat(64),sourceHash:'b'.repeat(64),tasks:[{id:'task',recipientId:'MC1'}],recipients:[{id:'MC1'}],focusedWorkflow:{workflowHash:'c'.repeat(64),groups:[{id:'stems',questionIds:['task']}],questions:[{id:'task',groupId:'stems',ownerTaskId:'task',taskIds:['task'],dependencyQuestionIds:[]}]}};
  const camera={...plain(surface.getNavigationState()),originNm:[752000,646000,858000],presetVersion:1},task=createTask('task',{centerNm:[752960,646592,858640],plane:'xy',spanNm:4096,surfaceCamera:camera});
  setQuestionDecision(task,catalog,'task',{outcome:'unreviewed',note:'Close-up navigation only'});
  for(const kind of ['json','zip']){
    const exported=kind==='json'?createAnnotationExport(catalog,[task],{scope:'current',taskId:task.id}):await createExport(catalog,[task],{scope:'current',taskId:task.id});
    const imported=await parseImport(exported.blob,catalog),restored=imported.tasks[0];
    assert.deepEqual(restored.view.surfaceCamera,camera);assert.deepEqual(restored.review.decisions[0].view.surfaceCamera,camera);assert.deepEqual(restored.view.centerNm,task.view.centerNm);
    const target=harness(6144).surface;target.applyNavigationState(restored.view.surfaceCamera);near(target.camera().height,256);
  }
});
