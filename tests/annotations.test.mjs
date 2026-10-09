import test from 'node:test';
import assert from 'node:assert/strict';
import {createTask, validateTask, validateMarkGeometry} from '../core/model.js';
import {createExport, createAnnotationExport, parseImport} from '../core/exchange.js';
import {planePlan, RESOLUTION_NM, ngToNm} from '../viewer/coordinates.js';
import {markGeometry, drawMark, visibleMarks, ellipsePointsNm} from '../viewer/mark-drawing.js';
import {overlaySvg} from '../viewer/figure.js';
import {makeNgState, MARK_LAYER} from '../viewer/neuroglancer-state.js';

const catalog={catalogHash:'a'.repeat(64),sourceHash:'b'.repeat(64),tasks:[{id:'review-task'}]};
const timestamp='2026-10-09T15:00:00.000Z';
const binding={catalogHash:catalog.catalogHash,sourceHash:catalog.sourceHash,coordinateConvention:'integer-sample',resolutionNm:[8,8,40],rootId:'864691135195576362'};
function mark(kind,extra={}){return {id:kind,kind,label:`${kind} membrane`,note:'Проверить продолжение\nKeep this exact note.',category:'uncertain_continuation',visible:true,pointsNm:[[752960,646592,858640],[753120,646752,858640]],plane:'xy',color:'#12aBef',strokeWidth:3,sourceBinding:structuredClone(binding),createdAt:timestamp,updatedAt:timestamp,...extra};}
function taskWithMarks(){const task=createTask('review-task',{centerNm:[752960,646592,858640],plane:'xy',spanNm:4096});task.marks=[mark('arrow'),mark('ellipse'),mark('freehand',{pointsNm:[[752960,646592,858640],[753040,646720,858640],[753120,646752,858640]],futureStyle:{opacity:.8}})];task.decision={status:'uncertain',answers:{legacyQuestion:'legacyAnswer'},note:'Older task decision kept'};return task;}

test('new annotation geometry and styles round-trip through ZIP and selected JSON without dropping legacy work',async()=>{
  const task=taskWithMarks();assert.deepEqual(validateTask(task,catalog),task);
  const {blob}=await createExport(catalog,[task],{scope:'current'}),imported=await parseImport(blob,catalog);
  assert.deepEqual(imported.tasks,[task]);
  const selected=await parseImport(createAnnotationExport(catalog,[task],{scope:'selected',selectedIds:['freehand']}).blob,catalog);
  assert.deepEqual(selected.tasks[0].marks,[task.marks[2]]);assert.deepEqual(selected.tasks[0].decision,task.decision);
  assert.equal(selected.tasks[0].marks[0].sourceBinding.rootId,'864691135195576362');
});

test('unfinished shape drafts remain recoverable, but completed malformed shapes and invalid edits are rejected',()=>{
  for(const kind of ['arrow','ellipse','freehand']){
    const draft=mark(kind,{draft:true,pointsNm:[[752960,646592,858640]]});assert.doesNotThrow(()=>validateMarkGeometry(draft));
    draft.draft=false;assert.throws(()=>validateMarkGeometry(draft),{code:'POINTS'});
    const flat=mark(kind,{pointsNm:[[752960,646592,858640],[752960,646592,858640]]});assert.throws(()=>validateMarkGeometry(flat),{code:'DEGENERATE_MARK'});
  }
  const cases=[
    [mark('arrow',{pointsNm:[[0,0,0],[8,8,0],[16,8,0]]}),'POINTS'],
    [mark('ellipse',{pointsNm:[[0,0,0],[8,0,0]]}),'DEGENERATE_MARK'],
    [mark('freehand',{closed:true}),'CLOSED_TRACE'],
    [mark('arrow',{pointsNm:[[0,0,0],[8,8,40]]}),'NONCOPLANAR_MARK'],
    [mark('ellipse',{pointsNm:[[0,0,0],[NaN,8,0]]}),'COORDINATE'],
    [mark('arrow',{color:'red;fill:url(unsafe)'}),'MARK_COLOR'],
    [mark('freehand',{strokeWidth:0}),'MARK_STROKE'],
    [mark('arrow',{strokeWidth:13}),'MARK_STROKE'],
  ];
  for(const [value,code] of cases)assert.throws(()=>validateMarkGeometry(value),{code});
  const legacy=mark('trace');delete legacy.color;delete legacy.strokeWidth;assert.doesNotThrow(()=>validateMarkGeometry(legacy));
});

test('shared 2D geometry points arrowheads at the endpoint and respects anisotropic ellipse dimensions',()=>{
  const projected=[{x:1,y:2,onPlane:true},{x:11,y:6,onPlane:true}];
  const arrow=markGeometry(mark('arrow'),projected,{x:20,y:30,sx:2,sy:5});
  assert.equal(arrow.length,2);assert.deepEqual(arrow[0].attrs,{x1:23,y1:42.5,x2:43,y2:62.5});assert.deepEqual(arrow[1].points[1],[43,62.5]);
  const [left,tip,right]=arrow[1].points,shaft=[20,20];
  assert.ok((left[0]-tip[0])*shaft[0]+(left[1]-tip[1])*shaft[1]<0);assert.ok((right[0]-tip[0])*shaft[0]+(right[1]-tip[1])*shaft[1]<0);
  assert.deepEqual(markGeometry(mark('ellipse'),projected,{sx:1,sy:5})[0],{tag:'ellipse',attrs:{cx:6.5,cy:22.5,rx:5,ry:10}});
  assert.deepEqual(projected,[{x:1,y:2,onPlane:true},{x:11,y:6,onPlane:true}]);
});

test('freehand paths stay open and split at off-plane vertices; Canvas uses the same SVG geometry',()=>{
  const projected=[{x:0,y:0,onPlane:true},{x:2,y:1,onPlane:true},{x:3,y:3,onPlane:false},{x:4,y:4,onPlane:true},{x:5,y:3,onPlane:true}],value=mark('freehand');
  const geometry=markGeometry(value,projected,{offset:0});assert.equal(geometry.length,2);assert.deepEqual(geometry[0].points,[[0,0],[2,1]]);assert.deepEqual(geometry[1].points,[[4,4],[5,3]]);
  const calls=[],ctx=new Proxy({}, {get:(target,key)=>target[key]??((...args)=>calls.push([key,...args])),set:(target,key,value)=>(target[key]=value,true)});
  assert.deepEqual(drawMark(ctx,value,projected,{offset:0}),geometry);assert.equal(calls.filter(call=>call[0]==='moveTo').length,2);assert.equal(calls.filter(call=>call[0]==='lineTo').length,2);assert.equal(calls.some(call=>call[0]==='closePath'),false);assert.equal(ctx.strokeStyle,value.color);assert.equal(ctx.lineWidth,3);
});

test('evidence SVG includes arrowhead, ellipse, exact note/title escaping and styles on the correct section',()=>{
  const plan=planePlan({plane:'xz',centerNm:[800,800,800],spanNm:800},{resolution:RESOLUTION_NM});
  const marks=[mark('arrow',{plane:{axis:'y'},pointsNm:[[640,800,640],[960,800,960]],label:'<arrow>',note:'A & B'}),mark('ellipse',{plane:'XZ',pointsNm:[[640,800,640],[960,800,960]]}),mark('freehand',{plane:'xz',pointsNm:[[640,800,640],[800,800,800],[960,800,960]]}),mark('ellipse',{id:'off-section',plane:'xz',pointsNm:[[640,808,640],[960,808,960]]})];
  assert.equal(visibleMarks(marks,plan).length,4);
  const {svg,width,height}=overlaySvg(plan,marks);assert.equal(width,100);assert.equal(height,100);
  assert.match(svg,/data-kind="arrow"/);assert.match(svg,/<line /);assert.match(svg,/<polyline /);assert.match(svg,/<ellipse cx="50.5" cy="52.5" rx="20" ry="20"/);assert.match(svg,/stroke="#12aBef" stroke-width="3"/);assert.match(svg,/&lt;arrow&gt;: A &amp; B/);assert.doesNotMatch(svg,/id="off-section"/);
});

test('native navigation emits arrows and ellipses in their actual plane and preserves freehand open vertices',()=>{
  const task={id:'review-task'},view={centerNm:[800,800,800],plane:'xz',spanNm:800};
  const marks=[mark('arrow',{plane:'xz',pointsNm:[[640,800,640],[960,800,960]]}),mark('ellipse',{plane:'xz',pointsNm:[[640,800,640],[960,800,960]]}),mark('freehand',{plane:'xz',pointsNm:[[640,800,640],[800,800,920],[960,800,960]]})];
  const before=structuredClone(marks),annotations=makeNgState(task,view,[],marks).layers.find(layer=>layer.name===MARK_LAYER).annotations;
  const arrows=annotations.filter(item=>item.id.startsWith('arrow-'));assert.equal(arrows.length,3);assert.deepEqual(ngToNm(arrows[0].pointA),marks[0].pointsNm[0]);assert.deepEqual(ngToNm(arrows[0].pointB),marks[0].pointsNm[1]);
  const ellipse=annotations.filter(item=>item.id.startsWith('ellipse-'));assert.equal(ellipse.length,64);assert.ok(ellipse.every(item=>item.pointA[1]===100&&item.pointB[1]===100));assert.deepEqual(ellipse[0].pointA,ellipse.at(-1).pointB);
  const freehand=annotations.filter(item=>item.id.startsWith('freehand-'));assert.equal(freehand.length,2);assert.deepEqual(ngToNm(freehand.at(-1).pointB),marks[2].pointsNm.at(-1));assert.equal(annotations.length,new Set(annotations.map(item=>item.id)).size);assert.equal(annotations[0].description,`${marks[0].label}\n${marks[0].note}`);assert.deepEqual(marks,before);
  const ring=ellipsePointsNm(marks[1]);assert.equal(ring.length,65);assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.every(point=>point[1]===800));
});
