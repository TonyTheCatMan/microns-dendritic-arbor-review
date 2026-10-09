// Copies the real subchunks selected by the unchanged Neuroglancer renderer.
// Quantized vertices use the source mesh transform; no registration offset is added.
const SEGMENT_SOURCE='https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300';
const captures=new WeakMap();
const values=a=>Array.from(a||[]);
export function nativeMeshLayer(host) {
  const managed=host?.viewer?.layerManager?.managedLayers?.find(l=>l.name==='seg_m1300');
  const source=managed?.toJSON().source,entry=Array.isArray(source)?source[0]:source;
  const url=typeof entry==='string'?entry:entry?.url;
  if((Array.isArray(source)&&source.length!==1)||url?.replace(/^precomputed:\/\//,'').replace(/\/$/,'')!==SEGMENT_SOURCE)throw new Error('Unexpected native segmentation source.');
  return managed.layer.renderLayers.find(l=>l.source?.fragmentSource);
}
export function installNativeMeshCapture(host) {
  const layer=nativeMeshLayer(host);if(!layer)return false;
  if(captures.has(layer))return true;
  const capture={last:[],active:null,drawCount:0};captures.set(layer,capture);
  const draw=layer.draw,fragment=layer.meshShaderManager.drawMultiscaleFragment;
  layer.draw=function(context,...args){
    const color=!!context.emitColor;if(color)capture.active=[];
    try{return draw.call(this,context,...args);}
    finally{if(color){capture.last=capture.active;capture.active=null;capture.drawCount++;}}
  };
  layer.meshShaderManager.drawMultiscaleFragment=function(gl,shader,chunk,start,end){
    if(capture.active)capture.active.push({chunk,start,end});
    return fragment.call(this,gl,shader,chunk,start,end);
  };
  return true;
}
export function transformMeshPoint(point,matrix) {
  if(matrix.length!==16)throw new Error('Unsupported mesh transform.');
  return [0,1,2].map(row=>matrix[row]*point[0]+matrix[4+row]*point[1]+matrix[8+row]*point[2]+matrix[12+row]);
}
export function nativeMeshBounds(host,id) {
  const layer=nativeMeshLayer(host),manifest=layer?.source.chunks.get(String(id))?.manifest;
  if(!manifest)return null;
  const transform=values(layer.source.parameters.metadata.transform),low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(let corner=0;corner<8;corner++){
    const p=transformMeshPoint([0,1,2].map(i=>(corner>>i&1)?manifest.clipUpperBound[i]:manifest.clipLowerBound[i]),transform);
    for(let i=0;i<3;i++){low[i]=Math.min(low[i],p[i]);high[i]=Math.max(high[i],p[i]);}
  }
  return [low,high];
}
export function nativeMeshReady(host) {
  const layer=nativeMeshLayer(host);
  for(const panel of host?.viewer?.display?.panels||[]){
    if(panel.sliceView||!panel.projectionParameters||!panel.visibleLayerTracker?.visibleLayers?.has(layer))continue;
    return !!layer.isReady({projectionParameters:panel.projectionParameters.value},panel.visibleLayerTracker.visibleLayers.get(layer));
  }
  return false;
}
export function trianglesFromIndices(indices,start,end,strips) {
  const out=[];
  if(strips){for(let i=start+2;i<end;i++){const a=indices[i-2],b=indices[i-1],c=indices[i];if(a===b||a===c||b===c)continue;out.push(...((i-start)&1?[b,a,c]:[a,b,c]));}}
  else{for(let i=start;i+2<end;i+=3)out.push(indices[i],indices[i+1],indices[i+2]);}
  return out;
}
export function extractNativeMesh(host,id,{originNm=[0,0,0]}={}) {
  if(typeof id!=='string'||!/^[1-9]\d*$/.test(id))throw new Error('A nonzero segment ID string is required.');
  if(!installNativeMeshCapture(host))return null;
  const layer=nativeMeshLayer(host),capture=captures.get(layer),manifest=layer.source.chunks.get(String(id))?.manifest;
  if(!manifest||!capture.last.length)return null;
  const keyByChunk=new Map([...layer.source.fragmentSource.chunks].map(([key,chunk])=>[chunk,key]));
  const positions=[],faces=[],fragments=[],seen=new Set(),low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  const transform=values(layer.source.parameters.metadata.transform);
  for(const part of capture.last){
    const key=keyByChunk.get(part.chunk),match=key?.match(/^(\d+)\/(\d+):(\d+)$/);if(!match||match[1]!==String(id))continue;
    const token=key+':'+part.start+':'+part.end;if(seen.has(token))continue;seen.add(token);
    const data=part.chunk.meshData,lod=Number(match[2]),node=Number(match[3]),scale=2**lod;
    const start=data.subChunkOffsets[part.start],end=data.subChunkOffsets[part.end];
    const selected=trianglesFromIndices(data.indices,start,end,data.strips);if(!selected.length)continue;
    const offset=[0,1,2].map(i=>manifest.chunkGridSpatialOrigin[i]+manifest.octree[5*node+i]*manifest.chunkShape[i]*scale+manifest.vertexOffsets[3*lod+i]);
    const shape=values(manifest.chunkShape).map(n=>n*scale),localMap=new Map(),raw=data.vertexPositions;
    function vertex(index){
      if(localMap.has(index))return localMap.get(index);
      let p;
      if(raw.BYTES_PER_ELEMENT===2)p=[0,1,2].map(i=>raw[index*3+i]/65535);
      else if(raw.BYTES_PER_ELEMENT===4&&raw instanceof host.Float32Array)p=[0,1,2].map(i=>raw[index*3+i]);
      else throw new Error('Unsupported native mesh vertex encoding.');
      if(layer.source.format.fragmentRelativeVertices)p=p.map((n,i)=>offset[i]+n*shape[i]);
      const global=transformMeshPoint(p,transform),result=positions.length/3;
      for(let i=0;i<3;i++){low[i]=Math.min(low[i],global[i]);high[i]=Math.max(high[i],global[i]);positions.push(global[i]-originNm[i]);}
      localMap.set(index,result);return result;
    }
    for(const index of selected)faces.push(vertex(index));
    fragments.push({key,lod,indexStart:start,indexEnd:end,triangleCount:selected.length/3});
  }
  if(!faces.length)return null;
  return {vertices:new Float32Array(positions),triangles:new Uint32Array(faces),vertexCount:positions.length/3,triangleCount:faces.length/3,boundsNm:[low,high],originNm:[...originNm],provenance:{source:'seg_m1300',sourceUrl:SEGMENT_SOURCE,segmentId:String(id),identityStatus:'candidate',representation:'native-selected-multiresolution-mesh-subchunks',partial:true,readyForView:nativeMeshReady(host),fragments,drawCount:capture.drawCount,transformNm:transform}};
}
