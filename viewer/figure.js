import {projectPoint} from './coordinates.js';
import {sha256} from './raw-source.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const markPoints=m=>m.pointsNm||m.points||(m.pointNm?[m.pointNm]:[]);
export function visibleMarks(marks,plan) {
  return marks.filter(m=>m.visible!==false&&(!m.plane||m.plane===plan.plane)).map(m=>({...m,projected:markPoints(m).map(p=>projectPoint(plan,p))}));
}
export function scaleBar(plan) {
  const target=plan.physicalSizeNm[0]/4,power=10**Math.floor(Math.log10(target));
  const nm=[1,2,5,10].map(n=>n*power).filter(n=>n<=target).at(-1)||power;
  return {nm,label:nm>=1000?`${nm/1000} µm`:`${nm} nm`};
}
function crc32(bytes) {
  let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;
}
/** PNG pHYs preserves the native anisotropic pixel size without resampling intensity data. */
export async function calibratedPng(blob,pixelSizeNm) {
  const original=new Uint8Array(await blob.arrayBuffer()),chunk=new Uint8Array(21),d=new DataView(chunk.buffer);
  d.setUint32(0,9);chunk.set(new TextEncoder().encode('pHYs'),4);d.setUint32(8,Math.round(1e9/pixelSizeNm[0]));d.setUint32(12,Math.round(1e9/pixelSizeNm[1]));chunk[16]=1;d.setUint32(17,crc32(chunk.subarray(4,17)));
  const output=new Uint8Array(original.length+21);output.set(original.subarray(0,33));output.set(chunk,33);output.set(original.subarray(33),54);return new Blob([output],{type:'image/png'});
}
export const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image encoding failed')),'image/png'));
export function overlaySvg(plan,marks,language='ru') {
  const unit=Math.min(...plan.pixelSizeNm),w=plan.physicalSizeNm[0]/unit,h=plan.physicalSizeNm[1]/unit;
  const sx=plan.pixelSizeNm[0]/unit,sy=plan.pixelSizeNm[1]/unit,rows=[];
  for(const mark of visibleMarks(marks,plan)) {
    const points=mark.projected,kind=mark.type||mark.kind,color=/^#[0-9a-f]{6}$/i.test(mark.color||'')?mark.color:'#ffcc55';
    const point=p=>[(p.x+0.5)*sx,(p.y+0.5)*sy];let shape='';
    if(points.length===1&&points[0].onPlane){const [x,y]=point(points[0]);shape=`<circle cx="${x}" cy="${y}" r="5"/>`;}
    else if(kind==='roi'&&points.length>=2&&points[0].onPlane&&points.at(-1).onPlane){const [a,b]=[point(points[0]),point(points.at(-1))];shape=`<rect x="${Math.min(a[0],b[0])}" y="${Math.min(a[1],b[1])}" width="${Math.abs(a[0]-b[0])}" height="${Math.abs(a[1]-b[1])}"/>`;}
    else for(let i=1;i<points.length;i++)if(points[i-1].onPlane&&points[i].onPlane){const [a,b]=[point(points[i-1]),point(points[i])];shape+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;}
    if(shape){const p=points.find(p=>p.onPlane),[x,y]=point(p);rows.push(`<g id="${esc(mark.id)}" stroke="${color}" stroke-width="2" fill="none"><title>${esc([mark.label,mark.note].filter(Boolean).join(': '))}</title>${shape}</g><text x="${x+8}" y="${y-8}" font-size="12" fill="${color}" stroke="#111" stroke-width="2" paint-order="stroke">${esc(mark.label||'')}</text>`);}
  }
  const bar=scaleBar(plan),bx=20,by=h-23;
  rows.push(`<rect x="8" y="${h-53}" width="${Math.max(bar.nm/unit+30,180)}" height="46" fill="#000" fill-opacity="0.75"/><path d="M${bx} ${by}h${bar.nm/unit}" stroke="#fff" stroke-width="4"/><text x="${bx}" y="${by-10}" font-family="sans-serif" font-size="13" fill="#fff">${bar.label}</text>`);
  const axis=['X','Y','Z'][plan.axes[2]],caption=`${plan.plane.toUpperCase()} · ${axis}=${plan.depthNm} nm · ${plan.pixelSizeNm.join(' × ')} nm/${language==='ru'?'пиксель':'pixel'}`;
  rows.push(`<rect width="${w}" height="25" fill="#000" fill-opacity="0.75"/><text x="10" y="17" font-family="sans-serif" font-size="12" fill="#fff">${esc(caption)}</text>`);
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rows.join('')}</svg>`,width:w,height:h,outputPixelSizeNm:unit};
}
export async function exportFigure({task,view,plane,rawCanvas,marks,segments,language='ru'}) {
  if(!plane?.complete)throw new Error(language==='ru'?'Полный срез ещё не загружен. Повторите загрузку.':'The complete plane has not loaded. Retry imagery first.');
  // Freeze pixels and record values before asynchronous PNG/SVG encoding. A later
  // navigation must not combine the former metadata with newly rendered pixels.
  const snapshot=document.createElement('canvas');snapshot.width=rawCanvas.width;snapshot.height=rawCanvas.height;snapshot.getContext('2d').drawImage(rawCanvas,0,0);
  marks=structuredClone(marks);segments=structuredClone(segments);view=structuredClone(view);
  const raw=await calibratedPng(await canvasBlob(snapshot),plane.pixelSizeNm),vector=overlaySvg(plane,marks,language),svg=new Blob([vector.svg],{type:'image/svg+xml'});
  const annotated=document.createElement('canvas');annotated.width=vector.width;annotated.height=vector.height;const ctx=annotated.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(snapshot,0,0,annotated.width,annotated.height);
  const svgUrl=URL.createObjectURL(svg);try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Overlay SVG could not render'));image.src=svgUrl;});ctx.drawImage(image,0,0);}finally{URL.revokeObjectURL(svgUrl);}
  const composite=await calibratedPng(await canvasBlob(annotated),[vector.outputPixelSizeNm,vector.outputPixelSizeNm]);
  const metadata={schemaVersion:'dendritic-evidence-plane.2',taskId:task.id||task.taskId,createdAt:new Date().toISOString(),sourceBinding:plane.sourceBinding,
    view:structuredClone(view),plane:{plane:plane.plane,axes:plane.axes,beginVoxel:plane.begin,endVoxelExclusive:plane.end,firstSampleNm:plane.begin.map((n,i)=>n*plane.resolutionNm[i]),depthNm:plane.depthNm,nativeDimensions:[plane.width,plane.height],nativePixelSizeNm:plane.pixelSizeNm,physicalSizeNm:plane.physicalSizeNm,coordinateConvention:plane.convention},
    raw:{file:'raw-native.png',sha256:await sha256(await raw.arrayBuffer()),resampled:false,pngPhysicalPixelMetadata:true},
    annotated:{file:'annotated-physical.png',sha256:await sha256(await composite.arrayBuffer()),dimensions:[vector.width,vector.height],pixelSizeNm:vector.outputPixelSizeNm,resampling:'nearest-neighbour physical-aspect correction only; no added anatomical resolution'},
    overlay:{file:'overlay.svg',sha256:await sha256(await svg.arrayBuffer())},scaleBar:scaleBar(plane),chunks:plane.receipts,marks:structuredClone(marks),segments:structuredClone(segments),
    interpretation:language==='ru'?'Технический экспорт. Анатомическое решение не подтверждено автоматически.':'Technical export. Anatomy is not automatically certified.'};
  return {metadata,files:[{name:'raw-native.png',blob:raw},{name:'overlay.svg',blob:svg},{name:'annotated-physical.png',blob:composite},{name:'figure-metadata.json',blob:new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'})}]};
}
