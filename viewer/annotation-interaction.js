import {projectPoint, pixelToNm} from './coordinates.js';

export const DRAG_TOOLS=new Set(['arrow','roi','ellipse','distance','freehand']);
export const pointsOf=mark=>mark.pointsNm||mark.points||(mark.pointNm?[mark.pointNm]:[]);
const kindOf=mark=>mark.kind||mark.type;
export function annotationPlane(mark){return (typeof mark.plane==='string'?mark.plane:mark.plane?.plane||({x:'yz',y:'xz',z:'xy'}[mark.plane?.axis]))?.toLowerCase();}
export function editableOnPlane(mark,plan){
  const points=pointsOf(mark),plane=annotationPlane(mark);
  return mark.visible!==false&&(!plane||plane===plan.plane)&&points.length>0&&points.every(p=>projectPoint(plan,p).onPlane);
}
export function markScreenPoints(mark,plan,rect){return pointsOf(mark).map(p=>{const q=projectPoint(plan,p);return [rect.x+(q.x+.5)*rect.w/plan.width,rect.y+(q.y+.5)*rect.h/plan.height];});}
export function handleIndices(mark,max=64){const count=pointsOf(mark).length;if(count<=max)return Array.from({length:count},(_,i)=>i);return Array.from({length:max},(_,i)=>Math.round(i*(count-1)/(max-1)));}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function lineDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],squared=dx*dx+dy*dy,t=squared?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/squared)):0;return distance(p,[a[0]+t*dx,a[1]+t*dy]);}
function hitsBody(mark,pts,p,tolerance){
  if(pts.length===1)return distance(p,pts[0])<=tolerance;
  const kind=kindOf(mark),a=pts[0],b=pts.at(-1);
  if(kind==='roi')return p[0]>=Math.min(a[0],b[0])-tolerance&&p[0]<=Math.max(a[0],b[0])+tolerance&&p[1]>=Math.min(a[1],b[1])-tolerance&&p[1]<=Math.max(a[1],b[1])+tolerance;
  if(kind==='ellipse'){const rx=Math.abs(a[0]-b[0])/2,ry=Math.abs(a[1]-b[1])/2,cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2;return ((p[0]-cx)/(rx+tolerance))**2+((p[1]-cy)/(ry+tolerance))**2<=1;}
  return pts.slice(1).some((q,i)=>lineDistance(p,pts[i],q)<=tolerance);
}
/** CSS-pixel hit testing is independent of native XY/XZ/YZ anisotropy. */
export function hitAnnotation(marks,plan,rect,point,{activeId=null,tolerance=9}={}){
  const active=marks.find(m=>m.id===activeId&&editableOnPlane(m,plan));
  if(active){const pts=markScreenPoints(active,plan,rect);for(const index of handleIndices(active))if(distance(point,pts[index])<=tolerance)return {mark:active,index};}
  for(const mark of [...marks].reverse())if(editableOnPlane(mark,plan)&&hitsBody(mark,markScreenPoints(mark,plan,rect),point,tolerance))return {mark,index:null};
  return null;
}
/** Floor to the acquired sample; display half-pixels never enter saved coordinates. */
export function samplePoint(plan,pixel){return pixelToNm(plan,pixel.x,pixel.y);}
export function moveAnnotation(mark,plan,startNm,endNm,index=null){
  const points=pointsOf(mark).map(p=>[...p]),[u,v]=plan.axes;
  if(index!==null){points[index][u]=endNm[u];points[index][v]=endNm[v];return points;}
  const delta=[0,0,0];delta[u]=endNm[u]-startNm[u];delta[v]=endNm[v]-startNm[v];
  return points.map(p=>p.map((n,i)=>n+delta[i]));
}
export function validDraw(kind,points,plan){
  if(points.length<2)return false;const [u,v]=plan.axes,a=points[0],b=points.at(-1);
  if(kind==='roi'||kind==='ellipse')return a[u]!==b[u]&&a[v]!==b[v];
  return points.some(p=>p[u]!==a[u]||p[v]!==a[v]);
}
