import {EM_URL, SEG_URL, RESOLUTION_NM, PLANES, nmToNg, normalizeSegments} from './coordinates.js';
import {markPoints, markPlane, ellipsePointsNm} from './mark-drawing.js';
export const EM_LAYER='EM · MICrONS';
export const SEG_LAYER='seg_m1300';
export const MARK_LAYER='review-marks';
export function assertNativeSources(state) {
  for(const [name,url] of [[EM_LAYER,EM_URL],[SEG_LAYER,SEG_URL]]) {
    const layer=state.layers?.find(l=>l.name===name),source=layer?.source;
    const entries=Array.isArray(source)?source:[source];
    const urls=entries.map(entry=>typeof entry==='string'?entry:entry?.url);
    if(urls.length!==1||urls[0]?.replace(/^precomputed:\/\//,'').replace(/\/$/,'')!==url)throw new Error('Native source changed: '+name);
  }
  if(state.dimensions)for(const [i,axis] of ['x','y','z'].entries()){
    const dimension=state.dimensions[axis],units={m:1e9,nm:1,um:1000,'µm':1000},nm=dimension?.[0]*units[dimension?.[1]];
    if(!Number.isFinite(nm)||Math.abs(nm-RESOLUTION_NM[i])>1e-5)throw new Error('Native coordinate scale changed: '+axis);
  }
}
export const ORIENTATIONS={xy:[0,0,0,1],xz:[Math.SQRT1_2,0,0,Math.SQRT1_2],yz:[0.5,0.5,0.5,0.5]};
export function orthogonalPlane(orientation) {
  if(orientation===undefined)return 'xy';if(!Array.isArray(orientation)||orientation.length!==4)return null;
  return Object.entries(ORIENTATIONS).find(([,q])=>q.every((n,i)=>Math.abs(n-orientation[i])<1e-5)||q.every((n,i)=>Math.abs(n+orientation[i])<1e-5))?.[0]||null;
}
export function makeNgState(task,view,segments=[],marks=[],language='ru') {
  const dimensions=Object.fromEntries(['x','y','z'].map((a,i)=>[a,[RESOLUTION_NM[i]*1e-9,'m']]));
  const selected=normalizeSegments(segments).filter(s=>s.visible),annotations=[];
  for(const mark of marks.filter(m=>m.visible!==false)) {
    const points=markPoints(mark),kind=mark.kind||mark.type;
    const description=[mark.label,mark.note].filter(Boolean).join('\n');
    const line=(id,a,b)=>annotations.push({id,type:'line',pointA:nmToNg(a),pointB:nmToNg(b),description});
    if(points.length===1)annotations.push({id:mark.id,type:'point',point:nmToNg(points[0]),description});
    else if(kind==='roi'&&points.length>=2) annotations.push({id:mark.id,type:'axis_aligned_bounding_box',pointA:nmToNg(points[0]),pointB:nmToNg(points.at(-1)),description});
    else if(kind==='ellipse') {const ring=ellipsePointsNm(mark);for(let i=1;i<ring.length;i++)line(mark.id+'-ellipse-'+i,ring[i-1],ring[i]);}
    else if(kind==='arrow'&&points.length>=2){
      const a=points[0],b=points.at(-1),axes=PLANES[markPlane(mark)];line(mark.id+'-shaft',a,b);
      if(axes){const [u,v]=axes,dx=b[u]-a[u],dy=b[v]-a[v],length=Math.hypot(dx,dy);
        if(length){const head=Math.min(256,length*.3),half=head*.45,ux=dx/length,uy=dy/length;
          for(const sign of [-1,1]){const corner=[...b];corner[u]-=ux*head+sign*uy*half;corner[v]-=uy*head-sign*ux*half;line(mark.id+'-head-'+(sign<0?'a':'b'),b,corner);}
        }
      }
    }
    else {
      for(let i=1;i<points.length;i++)line(mark.id+'-'+i,points[i-1],points[i]);
      if(kind==='trace'&&mark.closed===true&&points.length>=3)line(mark.id+'-close',points.at(-1),points[0]);
    }
  }
  const orientation=ORIENTATIONS[view.plane];
  return {title:task.id||task.taskId||'Dendritic review',dimensions,position:nmToNg(view.centerNm),
    crossSectionScale:Math.max(0.25,view.spanNm/4096),crossSectionOrientation:orientation,
    projectionScale:1500,projectionOrientation:[0,0,0,1],...view.ngState,
    layers:[{name:EM_LAYER,type:'image',source:'precomputed://'+EM_URL,shaderControls:{normalized:{range:[0,255]}}},
      {name:SEG_LAYER,type:'segmentation',source:'precomputed://'+SEG_URL,segments:selected.map(s=>s.id),segmentColors:Object.fromEntries(selected.map(s=>[s.id,s.color])),selectedAlpha:0.28,notSelectedAlpha:0,objectAlpha:0.8},
      {name:MARK_LAYER,type:'annotation',source:{url:'local://annotations',transform:{outputDimensions:dimensions}},annotationColor:'#ffd166',annotations}],
    showSlices:view.showSlices!==false,showAxisLines:false,showScaleBar:true,selectedLayer:{visible:false},layout:{type:'xy-3d',orthographicProjection:true}};
}
export function mergeNativeSegments(current,state) {
  const layer=state.layers?.find(l=>l.name===SEG_LAYER);if(!layer)return current;
  const ids=(layer.segments||[]).map(String).filter(id=>/^[1-9]\d*$/.test(id));const visible=new Set(ids),map=new Map(current.map(s=>[s.id,{...s,visible:visible.has(s.id)}]));
  for(const id of ids){const old=map.get(id);map.set(id,{...old,id,source:'seg_m1300',color:layer.segmentColors?.[id]||old?.color||'#66d9b4',visible:true,label:old?.label||id,note:old?.note||'',identityStatus:old?.identityStatus||'candidate'});}
  return [...map.values()];
}
