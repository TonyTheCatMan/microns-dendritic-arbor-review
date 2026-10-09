import {planePlan,RESOLUTION_NM} from './coordinates.js';

// Frame the actual integer-sampled rectangle, independent of the neuron's extent.
export function cutoutFrame(view,originNm,right,up,aspect=1){
  const plane=planePlan(view,{resolution:RESOLUTION_NM}),[u,v]=plane.axes;
  const centerNm=plane.begin.map((n,i)=>n*RESOLUTION_NM[i]);
  centerNm[u]+=plane.physicalSizeNm[0]/2;centerNm[v]+=plane.physicalSizeNm[1]/2;
  const projected=axis=>Math.abs(axis[u])*plane.physicalSizeNm[0]+Math.abs(axis[v])*plane.physicalSizeNm[1];
  return {center:centerNm.map((n,i)=>n-originNm[i]),height:Math.max(projected(up),projected(right)/Math.max(.01,aspect))*1.5};
}

// The old automatic whole-cell view was persisted as if it were a user edit.
// Upgrade only that exact default; a moved, rotated or zoomed camera stays intact.
export function isLegacyOverview(camera,bounds,originNm){
  if(!camera||camera.presetVersion||!Array.isArray(camera.center_nm)||!Array.isArray(camera.originNm))return false;
  const close=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-5;
  const expected={right:[Math.cos(.65),0,-Math.sin(.65)],up:[Math.sin(.65)*Math.sin(.4),-Math.cos(.4),Math.cos(.65)*Math.sin(.4)],eye_direction:[-Math.sin(.65)*Math.cos(.4),-Math.sin(.4),-Math.cos(.65)*Math.cos(.4)]};
  if(Object.keys(expected).some(key=>camera[key])&&!Object.entries(expected).every(([key,vector])=>camera[key]?.length===3&&camera[key].every((n,i)=>close(n,vector[i]))))return false;
  const diagonal=Math.hypot(...bounds);
  return close(camera.yaw,-.65)&&close(camera.pitch,.4)&&close(camera.zoom,1)&&
    close(camera.frame_height_nm,diagonal*1.12)&&close(camera.radius_nm,diagonal*3)&&
    camera.center_nm.every((n,i)=>close(n+camera.originNm[i]-originNm[i],bounds[i]/2));
}
