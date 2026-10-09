// Camera formulas retained from the reference neuroglancer/sync.js.
// Physical positions here use the dendritic integer grid, without TIFF +0.5.
const valid3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
export function cameraQuaternion(camera){
 const {right,up,eye_direction:eye}=camera;if(![right,up,eye].every(valid3))return null;
 const norm=v=>{const n=Math.hypot(...v);return n>0?v.map(x=>x/n):null;},r=norm(right),u=norm(up),e=norm(eye);if(!r||!u||!e)return null;
 const m=[r[0],-u[0],-e[0],r[1],-u[1],-e[1],r[2],-u[2],-e[2]],trace=m[0]+m[4]+m[8];let q,s;
 if(trace>0){s=Math.sqrt(trace+1)*2;q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,s/4];}
 else if(m[0]>m[4]&&m[0]>m[8]){s=Math.sqrt(1+m[0]-m[4]-m[8])*2;q=[s/4,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s];}
 else if(m[4]>m[8]){s=Math.sqrt(1+m[4]-m[0]-m[8])*2;q=[(m[1]+m[3])/s,s/4,(m[5]+m[7])/s,(m[2]-m[6])/s];}
 else{s=Math.sqrt(1+m[8]-m[0]-m[4])*2;q=[(m[2]+m[6])/s,(m[5]+m[7])/s,s/4,(m[3]-m[1])/s];}
 const n=Math.hypot(...q);return q.map(x=>x/n);
}
export function nativeCamera(host,originNm){
 const viewer=host?.viewer,panel=[...(viewer?.display?.panels||[])].find(p=>p.visible&&!p.sliceView),p=panel?.projectionParameters?.value;if(!p)return null;
 const res=[8,8,40],m=p.invViewMatrix,indices=p.displayDimensionRenderInfo?.displayDimensionIndices||[0,1,2];
 const column=index=>{const v=[0,0,0];for(let i=0;i<3;i++)v[indices[i]]=m[index*4+i]*res[indices[i]];return v;},normalize=v=>{const n=Math.hypot(...v);return n?v.map(x=>x/n):v;},up=column(1);
 const camera={right:normalize(column(0)),up:normalize(up),eye_direction:normalize(column(2)),physical_height_nm:2*Math.hypot(...up)/Math.abs(p.projectionMat[5]),center_nm:Array.from(viewer.position.value,(n,i)=>n*res[i]-originNm[i])};
 return [camera.right,camera.up,camera.eye_direction,camera.center_nm].every(valid3)&&camera.physical_height_nm>0?camera:null;
}
