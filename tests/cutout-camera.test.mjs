import test from 'node:test';
import assert from 'node:assert/strict';
import {cutoutFrame,isLegacyOverview} from '../viewer/cutout-camera.js';
import {planePlan,RESOLUTION_NM} from '../viewer/coordinates.js';

test('cutout camera fits integer rectangles in every plane and pane aspect',()=>{
  const right=[Math.cos(.65),0,-Math.sin(.65)],up=[-.23,-.92,-.31];
  for(const orientation of ['xy','xz','yz'])for(const aspect of [.4,1,2]){
    const view={plane:orientation,centerNm:[752963,646595,858641],spanNm:4096},origin=[720000,600000,810000];
    const p=planePlan(view,{resolution:RESOLUTION_NM}),[u,v]=p.axes,f=cutoutFrame(view,origin,right,up,aspect);
    for(const x of [p.begin[u],p.end[u]])for(const y of [p.begin[v],p.end[v]]){
      const point=p.begin.map((n,i)=>n*RESOLUTION_NM[i]);point[u]=x*RESOLUTION_NM[u];point[v]=y*RESOLUTION_NM[v];
      const delta=point.map((n,i)=>n-origin[i]-f.center[i]);
      assert.ok(Math.abs(delta.reduce((s,n,i)=>s+n*up[i],0))<=f.height/3+1e-6);
      assert.ok(Math.abs(delta.reduce((s,n,i)=>s+n*right[i],0))<=f.height*aspect/3+1e-6);
    }
    assert.equal(f.center[p.axes[2]]+origin[p.axes[2]],p.depthNm);
  }
});

test('only the precise old automatic overview is migrated',()=>{
  const bounds=[150000,500000,120000],origin=[620000,210000,730000],diagonal=Math.hypot(...bounds);
  const camera={yaw:-.65,pitch:.4,zoom:1,center_nm:bounds.map(n=>n/2),originNm:origin,frame_height_nm:diagonal*1.12,radius_nm:diagonal*3};
  assert.equal(isLegacyOverview(camera,bounds,origin),true);
  for(const change of [{yaw:-.64},{zoom:.99},{center_nm:camera.center_nm.map(n=>n+1)},{presetVersion:1}])assert.equal(isLegacyOverview({...camera,...change},bounds,origin),false);
  assert.equal(isLegacyOverview({...camera,right:[1,0,0],up:[0,-1,0],eye_direction:[0,0,-1]},bounds,origin),false);
  assert.equal(isLegacyOverview(null,bounds,origin),false);
});
