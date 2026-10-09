import {SEG_URL,normalizeSegments} from './coordinates.js';
import {preparedAssetCache,MESH_MANIFEST_SHA256} from './asset-cache.js';

const root=new URL('../data/starter-meshes/',import.meta.url),meshes=new Map();
let manifestPromise;
export async function starterMeshManifest(){
  if(!manifestPromise)manifestPromise=preparedAssetCache.load(new URL('manifest.json',root),MESH_MANIFEST_SHA256).then(async({bytes})=>{
    const manifest=JSON.parse(new TextDecoder().decode(bytes));
    if(manifest.schemaVersion!==1||manifest.source!=='seg_m1300'||manifest.sourceUrl!==SEG_URL)throw new Error('Unexpected starter mesh source.');
    for(const [id,entry]of Object.entries(manifest.recipients||{})){
      if(id!==entry.recipientId||entry.segment?.sourceUrl!==SEG_URL||entry.provenance?.sourceUrl!==SEG_URL||entry.provenance?.segmentId!==entry.segment?.id||entry.segment?.identityStatus!=='candidate'||entry.segment?.sourceBinding?.identityConfirmed!==false||!Array.isArray(entry.somaNm)||JSON.stringify(entry.somaNm)!==JSON.stringify(entry.segment.sourceBinding.positionNm))throw new Error('Invalid starter mesh identity binding.');
      normalizeSegments([entry.segment]);
    }
    return manifest;
  }).catch(error=>{manifestPromise=null;throw error;});
  return manifestPromise;
}
export function decodeStarterMesh(buffer,entry){
  if(buffer.byteLength!==entry.bytes||buffer.byteLength<8)throw new Error('Starter mesh size mismatch.');
  const header=new DataView(buffer),vertexCount=header.getUint32(0,true),triangleCount=header.getUint32(4,true);
  if(vertexCount!==entry.vertexCount||triangleCount!==entry.triangleCount||8+vertexCount*12+triangleCount*12!==buffer.byteLength)throw new Error('Invalid starter mesh geometry layout.');
  const vertices=new Float32Array(buffer,8,vertexCount*3),triangles=new Uint32Array(buffer,8+vertexCount*12,triangleCount*3);
  if(!vertices.every(Number.isFinite)||!triangles.every(n=>n<vertexCount))throw new Error('Invalid starter mesh geometry.');
  return {vertices,triangles,vertexCount,triangleCount,boundsNm:entry.boundsNm,originNm:[0,0,0],provenance:{...entry.provenance,starterAssetSha256:entry.sha256},signature:'starter:'+entry.sha256};
}
export async function loadStarterMesh(entry){
  if(!meshes.has(entry.sha256))meshes.set(entry.sha256,(async()=>{
    if(!/^[A-Za-z0-9_-]+\.bin$/.test(entry.file))throw new Error('Invalid starter mesh path.');
    const {bytes}=await preparedAssetCache.load(new URL(entry.file,root),entry.sha256),buffer=bytes.buffer;
    return decodeStarterMesh(buffer,entry);
  })().catch(error=>{meshes.delete(entry.sha256);throw error;}));
  return meshes.get(entry.sha256);
}
