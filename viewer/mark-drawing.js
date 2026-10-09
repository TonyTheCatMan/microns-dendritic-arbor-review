import {PLANES, projectPoint} from './coordinates.js';

export const escapeSvg = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export const markPoints = mark => mark.pointsNm || mark.points || (mark.pointNm ? [mark.pointNm] : []);
export const markPlane = mark => {const value=typeof mark.plane === 'string' ? mark.plane : mark.plane?.plane ?? {x:'yz',y:'xz',z:'xy'}[mark.plane?.axis];return typeof value === 'string' ? value.toLowerCase() : undefined;};
export const markStyle = mark => ({color:/^#[0-9a-f]{6}$/i.test(mark.color || '') ? mark.color : '#ffd166', strokeWidth:Number.isFinite(mark.strokeWidth) && mark.strokeWidth >= 1 && mark.strokeWidth <= 12 ? mark.strokeWidth : 2});
export function visibleMarks(marks, plan) {
  return marks.filter(mark => mark.visible !== false && (!mark.plane || markPlane(mark) === plan.plane.toLowerCase()))
    .map(mark => ({...mark, projected:markPoints(mark).map(point => projectPoint(plan, point))}));
}
const finiteOnPlane = point => point?.onPlane && Number.isFinite(point.x) && Number.isFinite(point.y);

/** Display offsets center glyphs on image pixels; stored integer sample coordinates never change. */
export function markGeometry(mark, projectedPoints, {x=0, y=0, sx=1, sy=1, offset=.5, pointRadius=5, headLength=12, headWidth=10}={}) {
  const points = projectedPoints || [], kind = mark.kind || mark.type;
  const position = point => [x + (point.x + offset) * sx, y + (point.y + offset) * sy];
  const line = (a,b) => ({tag:'line', attrs:{x1:a[0],y1:a[1],x2:b[0],y2:b[1]}});
  const polyline = vertices => ({tag:'polyline', attrs:{points:vertices.map(point => point.join(',')).join(' ')}, points:vertices});
  if (points.length === 1 && finiteOnPlane(points[0])) {
    const [cx,cy] = position(points[0]); return [{tag:'circle',attrs:{cx,cy,r:pointRadius}}];
  }
  if (['roi','ellipse','arrow'].includes(kind)) {
    if (points.length < 2 || !finiteOnPlane(points[0]) || !finiteOnPlane(points.at(-1))) return [];
    const a = position(points[0]), b = position(points.at(-1));
    if (kind === 'roi') return [{tag:'rect',attrs:{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])}}];
    if (kind === 'ellipse') return [{tag:'ellipse',attrs:{cx:(a[0]+b[0])/2,cy:(a[1]+b[1])/2,rx:Math.abs(b[0]-a[0])/2,ry:Math.abs(b[1]-a[1])/2}}];
    const dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx,dy);
    if (!length) return [];
    const ux=dx/length,uy=dy/length,head=Math.min(headLength,length*.45),halfWidth=Math.min(headWidth/2,head*.7),base=[b[0]-ux*head,b[1]-uy*head];
    return [line(a,b),polyline([[base[0]-uy*halfWidth,base[1]+ux*halfWidth],b,[base[0]+uy*halfWidth,base[1]-ux*halfWidth]])];
  }
  // Break paths at off-plane points rather than joining across unreviewed sections.
  const geometry=[];let run=[];
  const finish=()=>{if(run.length>1)geometry.push(polyline(run));run=[];};
  for(const point of points){if(finiteOnPlane(point))run.push(position(point));else finish();}
  // Closure is explicit and does not connect vertices across different sections.
  if(kind==='trace'&&mark.closed===true&&points.length>=3&&points.every(finiteOnPlane))run.push(position(points[0]));
  finish();
  return geometry;
}
export function markSvg(mark, projectedPoints, options={}) {
  return markGeometry(mark, projectedPoints, options).map(({tag,attrs})=>`<${tag} ${Object.entries(attrs).map(([key,value])=>`${key}="${escapeSvg(value)}"`).join(' ')}/>`).join('');
}
/** Canvas and SVG use identical geometry, with no smoothing of freehand vertices. */
export function drawMark(ctx, mark, projectedPoints, options={}) {
  const geometry=markGeometry(mark,projectedPoints,options),style=markStyle(mark);
  ctx.save();ctx.strokeStyle=style.color;ctx.lineWidth=style.strokeWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  for(const {tag,attrs:a,points} of geometry){
    if(tag==='circle'){ctx.moveTo(a.cx+a.r,a.cy);ctx.arc(a.cx,a.cy,a.r,0,Math.PI*2);}
    else if(tag==='ellipse'){ctx.moveTo(a.cx+a.rx,a.cy);ctx.ellipse(a.cx,a.cy,a.rx,a.ry,0,0,Math.PI*2);}
    else if(tag==='rect')ctx.rect(a.x,a.y,a.width,a.height);
    else if(tag==='line'){ctx.moveTo(a.x1,a.y1);ctx.lineTo(a.x2,a.y2);}
    else if(tag==='polyline'){ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);}
  }
  ctx.stroke();ctx.restore();return geometry;
}
/** Sample only the requested ellipse overlay for 3D annotation transports. */
export function ellipsePointsNm(mark, steps=64) {
  const points=markPoints(mark),axes=PLANES[markPlane(mark)];if(points.length<2||!axes)return [];
  const [u,v]=axes,a=points[0],b=points.at(-1),center=a.map((n,i)=>(n+b[i])/2),ru=Math.abs(b[u]-a[u])/2,rv=Math.abs(b[v]-a[v])/2;
  const ring=Array.from({length:steps},(_,i)=>{const point=[...center],angle=i/steps*Math.PI*2;point[u]+=ru*Math.cos(angle);point[v]+=rv*Math.sin(angle);return point;});
  return [...ring,[...ring[0]]];
}
