import test from 'node:test';
import assert from 'node:assert/strict';
import {ReviewViewer,planeKey} from '../viewer/ReviewViewer.js';
import {normalizeView} from '../viewer/coordinates.js';
test('Changing anatomical question reuses a complete identical native plane and invalidates stale requests',async()=>{
 const view=normalizeView({centerNm:[752960,646592,858640],spanNm:4096}),plane={complete:true},viewer=Object.create(ReviewViewer.prototype);let downloads=0,aborts=0,rasters=0;
 Object.assign(viewer,{view,plane,loadedKey:planeKey(view),sequence:8,overlays:[],controller:{abort(){aborts++;}},cancelInteraction(){},onViewChange(){},publish(){},makeRaster(p){assert.equal(p,plane);rasters++;},draw(){},setLanguage(){},source:{async plane(){downloads++;return {complete:true,elapsedMs:0};}},say(){}});
 const result=await viewer.setTask({id:'new-question',anchorNm:view.centerNm},view,[]);
 assert.equal(result,plane);assert.equal(viewer.plane,plane);assert.equal(downloads,0);assert.equal(aborts,1);assert.equal(viewer.sequence,9);assert.equal(rasters,1);assert.equal(viewer.task.id,'new-question');
});
test('An incomplete plane or different section cannot be reused for a new question',async()=>{
 for(const samePosition of [true,false]){
  const view=normalizeView({centerNm:[752960,646592,858640]}),viewer=Object.create(ReviewViewer.prototype);let loads=0;
  Object.assign(viewer,{view,plane:{complete:!samePosition},loadedKey:planeKey(view),sequence:0,cancelInteraction(){},onViewChange(){},publish(){},async load(){loads++;assert.equal(this.plane,null);return 'fresh';}});
  const next={...view,centerNm:[...view.centerNm]};if(!samePosition)next.centerNm[2]+=40;
  assert.equal(await viewer.setTask({id:'next',anchorNm:next.centerNm},next,[]),'fresh');assert.equal(loads,1);
 }
});
