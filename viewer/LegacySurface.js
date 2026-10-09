// The original site's WebGL renderer and interactions, with a source-bound adapter.
// No old cases, meshes, review storage, or voxel-center offset are imported.
import '../reference-viewer/marker-styles.js';
import '../reference-viewer/surface3d.js';
import {RESOLUTION_NM,PLANES} from './coordinates.js';
import {cutoutFrame,isLegacyOverview} from './cutout-camera.js';
const $=id=>document.getElementById(id);
export class LegacySurface extends window.LocalSurfaceView {
  constructor(host){super();this.host=host;this.rawMeshes=new Map();this.language='ru';}
  text(ru,en){return this.language==='en'?en:ru;}
  setStatus(text,kind=''){super.setStatus(text,kind);const status=$('meshStatus');if(status)status.textContent=text;}
  setTask(task,view){this.initializing=true;const savedCamera=view.surfaceCamera;this.clear();this.canvas.dataset.triangleCount="0";this.rawMeshes?.clear();this.task=task;this.caseId=task.id;this.originNm=task.anchorNm.map((n,i)=>Math.floor((n-8192)/RESOLUTION_NM[i])*RESOLUTION_NM[i]);this.bounds=[16384,16384,16400];this.volume={volume_id:task.id,begin_vox_xyz:this.originNm.map((n,i)=>n/RESOLUTION_NM[i]),shape_xyz:this.bounds.map((n,i)=>n/RESOLUTION_NM[i]),resolution_nm:[...RESOLUTION_NM]};this.makeFrame();this.enable(true);$('surfacePlane').checked=view.showSlices!==false;this.alpha=view.surfaceOpacity??.5;$('surfaceOpacity').value=Math.round(this.alpha*100);$('surfaceOpacityReadout').textContent=Math.round(this.alpha*100)+'%';this.reset();this.savedCamera=savedCamera||null;this.lastPlane=null;this.setStatus(this.text('Загрузка ветвей нейрона…','Loading neuron branches…'));this.initializing=false;}
  reset(front=false){
    if(!this.bounds||!this.host?.view)return;
    this.yaw=front?0:-.65;this.pitch=front?0:.4;this.zoom=1;this.cameraBasis=null;
    if(front){const [u,v]=PLANES[this.host.view.plane],right=[0,0,0],up=[0,0,0];right[u]=1;up[v]=-1;this.cameraBasis={right,up,eye_direction:[right[1]*up[2]-right[2]*up[1],right[2]*up[0]-right[0]*up[2],right[0]*up[1]-right[1]*up[0]]};}
    this.center=this.bounds.map(n=>n/2);this.frameHeight=1;this.radius=Math.hypot(...this.bounds)*3;
    const camera=this.camera(),frame=cutoutFrame(this.host.view,this.originNm,camera.right,camera.up,this.stage.clientWidth/Math.max(1,this.stage.clientHeight));
    this.center=frame.center;this.frameHeight=frame.height;this.navigationChanged('reset');this.schedule();
  }
  showOverview(){super.reset();}
  alignTo2D(){this.reset(true);}
  draw(){this.transparencyPrepared=false;super.draw();}
  drawGeometry(geometry,color,mode=0,primitive=null){
    if(mode===0&&color[3]>0&&color[3]<1&&!this.transparencyPrepared){
      // Blend the nearest surface once. Unordered front/back triangles otherwise
      // accumulate until a nominal 50% mesh becomes opaque over the EM cutout.
      this.transparencyPrepared=true;const gl=this.gl;gl.colorMask(false,false,false,false);gl.depthMask(true);
      for(const mesh of this.meshes)if(this.visibleMesh(mesh)&&(mesh.context?this.contextAlpha:this.alpha)>0)super.drawGeometry(mesh.geometry,[1,1,1,1]);
      gl.colorMask(true,true,true,true);gl.depthMask(false);
    }
    super.drawGeometry(geometry,color,mode,primitive);
  }
  setPlane(plane,canvas){if(!this.volume||!this.gl)return;this.lastPlane={plane,canvas};this.slice={z:plane.center[2]-this.volume.begin_vox_xyz[2],black:0,white:255};const [u,v,d]=plane.axes,corners=[[0,0],[plane.width,0],[plane.width,plane.height],[0,plane.height]].flatMap(([x,y])=>{const p=plane.begin.map((n,i)=>n*RESOLUTION_NM[i]-this.originNm[i]);p[u]+=x*RESOLUTION_NM[u];p[v]+=y*RESOLUTION_NM[v];return p;});const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.planeGeometry.positions);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(corners),gl.DYNAMIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);this.canvas.dataset.planeGlobalNm=String(plane.depthNm);$('surfaceReadout').textContent=`${plane.plane.toUpperCase()} · ${'XYZ'[d]}=${plane.depthNm} nm · ${plane.pixelSizeNm.join(' × ')} nm`;this.schedule();}
  setMesh(segment,data){
    if(!data.vertices?.length||!data.triangles?.length)return false;
    const prior=this.rawMeshes.get(segment.id);if(prior?.signature===data.signature)return false;
    this.rawMeshes.set(segment.id,{...data,segment});this.rebuildMeshes();return true;
  }
  rebuildMeshes(){
    this.updating=true;
    if(!this.rawMeshes.size){for(const m of this.meshes)this.deleteGeometry(m.geometry);this.meshes=[];this.objectsUI.replaceChildren();this.modelReady=false;this.canvas.dataset.triangleCount='0';this.updating=false;this.setStatus(this.text('Структуры не выбраны. Добавьте структуру из текущего среза.','No structures selected. Add a structure from the current section.'));this.schedule();return;}
    const lo=[...this.task.anchorNm],hi=[...lo];for(const m of this.rawMeshes.values())for(let i=0;i<m.vertices.length;i++){lo[i%3]=Math.min(lo[i%3],m.vertices[i]);hi[i%3]=Math.max(hi[i%3],m.vertices[i]);}
    const oldOrigin=this.originNm,oldCamera=this.modelReady?this.getNavigationState():null;let restoringCamera=!!this.savedCamera;
    this.originNm=lo.map((n,i)=>Math.floor((n-RESOLUTION_NM[i])/RESOLUTION_NM[i])*RESOLUTION_NM[i]);this.bounds=hi.map((n,i)=>Math.max(RESOLUTION_NM[i],Math.ceil((n-this.originNm[i]+RESOLUTION_NM[i])/RESOLUTION_NM[i])*RESOLUTION_NM[i]));
    this.volume.begin_vox_xyz=this.originNm.map((n,i)=>n/RESOLUTION_NM[i]);this.volume.shape_xyz=this.bounds.map((n,i)=>n/RESOLUTION_NM[i]);
    for(const m of this.meshes)this.deleteGeometry(m.geometry);this.meshes=[];this.objectsUI.replaceChildren();this.deleteGeometry(this.boxGeometry);this.deleteGeometry(this.axisGeometry);this.makeFrame();
    for(const [id,m]of this.rawMeshes){const vertices=new Float32Array(m.vertices.length);for(let i=0;i<vertices.length;i++)vertices[i]=m.vertices[i]-this.originNm[i%3];const color=m.segment.color||'#66d9b4',bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];for(let i=0;i<vertices.length;i++){bounds[0][i%3]=Math.min(bounds[0][i%3],vertices[i]);bounds[1][i%3]=Math.max(bounds[1][i%3],vertices[i]);}const mesh={id,segment_id:id,label:this.text('Кандидат v1300','v1300 candidate'),color:[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255),cssColor:color,visible:m.segment.visible!==false,clipped:[],vertices,triangles:m.triangles,bounds,geometry:this.geometry(vertices,m.triangles),faces:m.triangles.length/3};this.meshes.push(mesh);this.objectControl(mesh);}
    this.modelReady=true;this.canvas.dataset.triangleCount=String(this.meshes.reduce((n,m)=>n+m.faces,0));
    if(isLegacyOverview(this.savedCamera,this.bounds,this.originNm)){this.savedCamera=null;restoringCamera=false;}
    if(this.savedCamera){const c=this.savedCamera;this.applyNavigationState({...c,center_nm:c.center_nm.map((n,i)=>n+(c.originNm?.[i]||0)-this.originNm[i])});this.savedCamera=null;}
    else if(oldCamera)this.applyNavigationState({...oldCamera,center_nm:oldCamera.center_nm.map((n,i)=>n+oldOrigin[i]-this.originNm[i])});else this.reset();
    if(this.lastPlane)this.setPlane(this.lastPlane.plane,this.lastPlane.canvas);
    this.setStatus(this.text(`Реальная сетка v1300 · ${this.canvas.dataset.triangleCount} треугольников · доступные фрагменты · идентичность не подтверждена`,`Real v1300 mesh · ${this.canvas.dataset.triangleCount} triangles · available fragments · identity unconfirmed`));this.updating=false;
    // Loading geometry is not a camera edit. Preserve the exact saved view,
    // including its native Float32 quaternion, until the reviewer moves it.
    if(!restoringCamera&&!oldCamera){this.navigationSignature="";this.navigationChanged("mesh-ready");}this.schedule();
  }
  updateSegments(segments){let changed=false;const ids=new Set(segments.map(s=>s.id));for(const id of this.rawMeshes.keys())if(!ids.has(id)){this.rawMeshes.delete(id);changed=true;}for(const s of segments){const m=this.rawMeshes.get(s.id);if(m){m.segment=s;const mesh=this.meshes.find(m=>m.id===s.id);if(mesh){mesh.visible=s.visible!==false;mesh.cssColor=s.color;mesh.color=[1,3,5].map(i=>parseInt(s.color.slice(i,i+2),16)/255);if(mesh.control)mesh.control.querySelector('input').checked=mesh.visible;}}}if(changed)this.rebuildMeshes();this.schedule();}
  setMarks(marks){this.reviewMarks=marks.filter(m=>m.visible!==false);this.annotations=[];this.schedule();}
  drawLabels(ctx,camera){
    ctx.save();ctx.scale(this.ratio,this.ratio);ctx.font='12px system-ui';ctx.lineWidth=2;
    for(const mark of this.reviewMarks||[]){let points=mark.pointsNm;if(mark.kind==='roi'&&points.length===2){const a=points[0],b=points[1],[u,v]={xy:[0,1],xz:[0,2],yz:[1,2]}[mark.plane];const c=[...a],d=[...a];c[u]=b[u];d[v]=b[v];points=[a,c,b,d,a];}const pts=points.map(p=>this.project(p.map((n,i)=>n-this.originNm[i]),camera));ctx.strokeStyle=ctx.fillStyle=mark.color||'#ffd166';ctx.beginPath();if(pts.length===1){ctx.arc(...pts[0],5,0,Math.PI*2);}else{ctx.moveTo(...pts[0]);for(const p of pts.slice(1))ctx.lineTo(...p);}ctx.stroke();if(pts[0]&&mark.label)ctx.fillText(mark.label,pts[0][0]+8,pts[0][1]-8);}
    const b=this.scaleBar(camera),x=18,y=this.stage.clientHeight-22;ctx.fillStyle='#101c29dd';ctx.fillRect(8,y-24,Math.max(b.pixels+25,135),42);ctx.strokeStyle=ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+b.pixels,y);ctx.stroke();ctx.fillText(`${b.nm>=1000?b.nm/1000+' µm':b.nm+' nm'} · ${this.text('плоскость экрана','screen plane')}`,x,y-9);ctx.restore();
  }
  pickAt(clientX,clientY){
    // Reuse the original exact ray/triangle picker, replacing its TIFF-only
    // half-voxel XY occluder with the actual integer-sampled plane rectangle.
    const slice=this.slice;let hit;try{this.slice=null;hit=super.pickAt(clientX,clientY);}finally{this.slice=slice;}
    if(!hit||!this.lastPlane||!$('surfacePlane').checked)return hit;
    const {plane}=this.lastPlane,c=this.camera(),r=this.stage.getBoundingClientRect(),x=(clientX-r.left)/r.width,y=(clientY-r.top)/r.height,width=c.height*this.stage.clientWidth/this.stage.clientHeight;
    const direction=this.center.map((n,i)=>n-c.eye[i]),norm=Math.hypot(...direction);for(let i=0;i<3;i++)direction[i]/=norm;
    const origin=c.eye.map((n,i)=>n+c.right[i]*(x-.5)*width+c.up[i]*(.5-y)*c.height+this.originNm[i]),[u,v,d]=plane.axes;
    if(Math.abs(direction[d])<1e-12)return hit;const t=(plane.depthNm-origin[d])/direction[d],distance=hit.point_nm.reduce((n,p,i)=>n+(p-origin[i])*direction[i],0),point=origin.map((n,i)=>n+t*direction[i]);
    return t>0&&t<=distance+.001&&[u,v].every(i=>point[i]>=plane.begin[i]*RESOLUTION_NM[i]&&point[i]<plane.end[i]*RESOLUTION_NM[i])?null:hit;
  }
  annotationClick(event){const hit=this.pickAt(event.clientX,event.clientY);if(!hit)return;this.selectedObjectId=hit.object_id;const segment=this.host.getSegments().find(s=>s.id===hit.segment_id);if(this.host.interactionMode==='point')this.host.onPoint({pointNm:hit.point_nm,plane:this.host.view.plane,sourceBinding:{source:'seg_m1300',sourceUrl:segment?.sourceUrl||'',segmentId:hit.segment_id,selectionMethod:'mesh-surface-point',coordinateConvention:'global_nm',identityConfirmed:false,representation:'multiresolution-navigation-mesh'}});else if(segment)window.dispatchEvent(new CustomEvent('dendritic:edit-segment',{detail:segment}));this.schedule();}
  async exportPNG(){try{if(!this.modelReady)throw new Error(this.text('Сначала загрузите 3D-структуру.','Load a 3D structure first.'));this.draw();const c=document.createElement('canvas');c.width=this.canvas.width;c.height=this.canvas.height+52;const ctx=c.getContext('2d');ctx.drawImage(this.canvas,0,0);ctx.drawImage(this.labels,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,this.canvas.height,c.width,52);ctx.fillStyle='#17313d';ctx.font='13px system-ui';ctx.fillText(this.text('Сегментация v1300 · доступные фрагменты · навигация, не исходный ЭМ','v1300 segmentation · available fragments · navigation, not native EM'),10,this.canvas.height+21);ctx.fillText(this.caseId+' · '+this.text('Идентичность не подтверждена','Identity unconfirmed'),10,this.canvas.height+42);const blob=await new Promise(r=>c.toBlob(r)),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=this.caseId+'-3d-navigation.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){this.setStatus(e.message,'error');}}
}
