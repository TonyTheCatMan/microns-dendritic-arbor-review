import test from 'node:test';
import assert from 'node:assert/strict';
import {planePlan,pixelToNm,RESOLUTION_NM} from '../viewer/coordinates.js';
import {editableOnPlane,hitAnnotation,moveAnnotation,markScreenPoints,handleIndices,samplePoint,validDraw} from '../viewer/annotation-interaction.js';
import {ReviewViewer,planeKey} from '../viewer/ReviewViewer.js';

const plan=(plane='xy')=>({...planePlan({plane,centerNm:[800,800,800],spanNm:800},{resolution:RESOLUTION_NM}),complete:true});
const mark=(kind,points,id='m')=>({id,kind,plane:'xy',visible:true,pointsNm:points});
test('all drawing planes preserve integer acquired samples, anisotropy and immutable depth during edits',()=>{
  for(const axis of ['xy','xz','yz']){
    const p=plan(axis),a=samplePoint(p,{x:10.99,y:3.8}),b=samplePoint(p,{x:12.1,y:7.99});
    assert.deepEqual(a,pixelToNm(p,10,3));const m={...mark('arrow',[a,b]),plane:axis};
    assert.equal(editableOnPlane(m,p),true);const shifted=moveAnnotation(m,p,a,pixelToNm(p,14,5));
    assert.deepEqual(shifted[0],pixelToNm(p,14,5));assert.deepEqual(shifted[1],pixelToNm(p,16,9));
    assert.equal(shifted[1][p.axes[2]],p.depthNm);
    const resized=moveAnnotation(m,p,a,pixelToNm(p,6,2),1);assert.deepEqual(resized,[a,pixelToNm(p,6,2)]);
    assert.deepEqual(m.pointsNm,[a,b],'original saved coordinates are immutable while previewing');
  }
});
test('selection finds topmost bodies and selected handles but rejects hidden and other-section marks',()=>{
  const p=plan(),rect={x:0,y:0,w:400,h:400},a=pixelToNm(p,20,20),b=pixelToNm(p,40,40);
  const box=mark('roi',[a,b],'box'),ellipse=mark('ellipse',[a,b],'ellipse');
  assert.equal(hitAnnotation([box,ellipse],p,rect,[122,122]).mark.id,'ellipse');
  assert.equal(hitAnnotation([box,ellipse],p,rect,[82,82],{activeId:'box'}).index,0);
  assert.equal(hitAnnotation([{...box,visible:false}],p,rect,[122,122]),null);
  assert.equal(hitAnnotation([{...box,pointsNm:box.pointsNm.map(a=>a.map((n,i)=>n+(i===2?40:0)))}],p,rect,[122,122]),null);
  assert.equal(hitAnnotation([{...box,plane:'xz'}],p,rect,[122,122]),null);
  assert.deepEqual(markScreenPoints(box,p,rect),[[82,82],[162,162]]);
});
test('freehand handle count is bounded and degenerate shapes are not committed',()=>{
  const dense=mark('freehand',Array.from({length:10000},(_,i)=>[i*8,800,800]));
  const indices=handleIndices(dense);assert.equal(indices.length,64);assert.equal(indices[0],0);assert.equal(indices.at(-1),9999);
  const p=plan(),a=pixelToNm(p,2,2),b=pixelToNm(p,2,5),c=pixelToNm(p,5,5);
  assert.equal(validDraw('roi',[a,b],p),false);assert.equal(validDraw('ellipse',[a,b],p),false);
  assert.equal(validDraw('arrow',[a,b],p),true);assert.equal(validDraw('freehand',[a,b,c,a],p),true);assert.equal(validDraw('distance',[a,a],p),false);
});

function harness(mode='arrow'){
  const handlers={},events=[],p=plan(),view={plane:'xy',centerNm:[800,800,800],spanNm:800},capture=new Set();
  const host={canvas:{style:{},getBoundingClientRect:()=>({left:0,top:0}),addEventListener:(name,fn)=>handlers[name]=fn,setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)},task:{id:'task-a'},epoch:'a',view,plane:p,loadedKey:planeKey(view),drawRect:{x:0,y:0,w:100,h:100},interactionMode:mode,overlays:[],draw(){},say(){},text:(_,en)=>en,getSourceBinding:()=>({source:'native-em'}),onPoint:e=>events.push(['point',e]),onMark:e=>events.push(['mark',e]),onMarkSelect:id=>events.push(['select',id]),onMarkEdit:e=>events.push(['edit',e]),setView:e=>events.push(['view',e])};
  for(const name of ['canvasPoint','cancelInteraction','canEditPlane','markEvent'])host[name]=ReviewViewer.prototype[name];
  const original=globalThis.document;globalThis.document={addEventListener(){}};
  try{ReviewViewer.prototype.installControls.call(host);}finally{globalThis.document=original;}
  const send=(name,x,y,extra={})=>handlers[name]({clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){},...extra});
  return {host,events,send};
}
test('drag callback commits exact source-bound points once; pan and click gestures remain distinct',()=>{
  const {host,events,send}=harness();send('pointerdown',10.9,20.3);send('pointermove',50.7,61.8);send('pointerup',50.7,61.8);
  assert.equal(events.length,1);assert.equal(events[0][0],'mark');assert.deepEqual(events[0][1].pointsNm,[pixelToNm(host.plane,10,20),pixelToNm(host.plane,50,61)]);assert.equal(events[0][1].taskId,'task-a');assert.equal(events[0][1].kind,'arrow');
  send('pointerdown',10,10,{shiftKey:true});send('pointermove',30,10);send('pointerup',30,10);assert.equal(events.at(-1)[0],'view');
  host.interactionMode='point';send('pointerdown',25.8,31.6);send('pointerup',25.8,31.6);assert.deepEqual(events.at(-1)[1].pointNm,pixelToNm(host.plane,25,31));
});
test('section/task changes and incomplete imagery cannot create or edit stale annotations',()=>{
  const {host,events,send}=harness();host.plane.complete=false;send('pointerdown',10,10);send('pointerup',30,30);assert.equal(events.length,0);
  host.plane.complete=true;send('pointerdown',10,10);send('pointermove',30,30);host.epoch='new-task';send('pointerup',30,30);assert.equal(events.length,0);
  send('pointerdown',10,10);send('pointermove',30,30);host.loadedKey='different-section';send('pointerup',30,30);assert.equal(events.length,0);
});
test('selected handles resize the existing mark without replacing its ID',()=>{
  const {host,events,send}=harness('select');host.overlays=[mark('arrow',[pixelToNm(host.plane,20,20),pixelToNm(host.plane,50,50)])];host.activeMarkId='m';
  send('pointerdown',50.5,50.5);send('pointermove',60.7,70.8);send('pointerup',60.7,70.8);
  assert.deepEqual(events[0],['select','m']);assert.equal(events[1][0],'edit');assert.equal(events[1][1].id,'m');assert.deepEqual(events[1][1].pointsNm,[pixelToNm(host.plane,20,20),pixelToNm(host.plane,60,70)]);
});
