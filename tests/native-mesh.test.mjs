import test from 'node:test';
import assert from 'node:assert/strict';
import {extractNativeMesh,installNativeMeshCapture,nativeMeshBounds,transformMeshPoint,trianglesFromIndices} from '../viewer/native-surface-adapter.js';
const source='https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300';
test('mesh physical transform preserves integer origin and anisotropic z',()=>{
  assert.deepEqual(transformMeshPoint([21,62,123],[16,0,0,0,0,16,0,0,0,0,40,0,0,0,0,1]),[336,992,4920]);
});
test('triangle strip conversion preserves winding and removes degenerate joins',()=>{
  assert.deepEqual(trianglesFromIndices(new Uint16Array([0,1,2,3,3,4,5]),0,7,true),[0,1,2,2,1,3,3,4,5]);
});
test('surface adapter exports only actually drawn subchunks with physical provenance',()=>{
  const id='864691136389585015',data={vertexPositions:new Uint16Array([0,0,0,65535,0,0,0,65535,0,0,0,65535]),indices:new Uint16Array([0,1,2,0,2,3]),strips:false,subChunkOffsets:new Uint32Array([0,3,6])},chunk={meshData:data};
  const manifest={chunkShape:[10,20,30],chunkGridSpatialOrigin:[0,0,0],octree:[2,3,4,0,0],vertexOffsets:[1,2,3],clipLowerBound:[20,60,120],clipUpperBound:[30,80,150]};
  const layer={source:{format:{fragmentRelativeVertices:true},parameters:{metadata:{transform:[16,0,0,0,0,16,0,0,0,0,40,0,0,0,0,1]}},chunks:new Map([[id,{manifest}]]),fragmentSource:{chunks:new Map([[id+'/0:0',chunk]])}},meshShaderManager:{drawMultiscaleFragment(){}},draw(){this.meshShaderManager.drawMultiscaleFragment(null,null,chunk,0,1);}};
  const host={Float32Array,viewer:{layerManager:{managedLayers:[{name:'seg_m1300',toJSON:()=>({source:'precomputed://'+source}),layer:{renderLayers:[layer]}}]}}};
  assert.equal(installNativeMeshCapture(host),true);assert.equal(extractNativeMesh(host,id),null);layer.draw({emitColor:true});
  const geometry=extractNativeMesh(host,id,{originNm:[336,992,4920]});
  assert.deepEqual([...geometry.vertices],[0,0,0,160,0,0,0,320,0]);assert.deepEqual([...geometry.triangles],[0,1,2]);
  assert.equal(geometry.triangleCount,1);assert.equal(geometry.provenance.partial,true);assert.equal(geometry.provenance.identityStatus,'candidate');
  assert.deepEqual(nativeMeshBounds(host,id),[[320,960,4800],[480,1280,6000]]);
});
