// Fetches genuine public v1300 meshes through the bundled source renderer.
// Each recipient is sampled at its documented soma anchor; this does not verify
// the release661-to-v1300 identity or adjudicate any anatomy review question.
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=new URL('../data/starter-meshes/',import.meta.url),catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url)));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1800,height:1300}});
const manifest={schemaVersion:1,source:'seg_m1300',sourceUrl:catalog.sources.segmentation.url,sourceHash:catalog.sourceHash,generatedAt:new Date().toISOString(),coordinateConvention:'global_nm',description:'Real native multiresolution mesh subchunks, spatially sampled at the documented recipient soma anchor. Navigation geometry only; cross-version identity remains unconfirmed.',recipients:{}};
try{
 await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8876/');
 await page.waitForFunction(()=>window.ReviewApp?.viewer,undefined,{timeout:120000});
 for(const recipient of catalog.recipients){
  const entry=await page.evaluate(async({recipient})=>{
   const app=ReviewApp;await app.switchTask(recipient.id+'.soma_identity');
   // Explicitly sample the documented anchor, independent of any saved review state.
   await app.viewer.setView({centerNm:recipient.somaNm,spanNm:4096});
   app.viewer.updateSegments([]);
   const segment=await app.viewer.pickCenter(),win=app.viewer.frame.contentWindow;
   const adapter=await import('./viewer/native-surface-adapter.js');
   adapter.installNativeMeshCapture(win);win.viewer.display.draw();
   const mesh=adapter.extractNativeMesh(win,segment.id);
   if(!mesh?.triangleCount||!mesh.provenance.readyForView)throw new Error('Mesh not ready for '+recipient.id);
   return {segment,vertices:Array.from(mesh.vertices),triangles:Array.from(mesh.triangles),boundsNm:mesh.boundsNm,provenance:mesh.provenance,manifestBoundsNm:adapter.nativeMeshBounds(win,segment.id)};
  },{recipient});
  assert.deepEqual(entry.segment.sourceBinding.positionNm,recipient.somaNm);
  assert.equal(entry.segment.identityStatus,'candidate');
  assert.ok(entry.vertices.every(Number.isFinite));
  assert.ok(entry.triangles.every(n=>Number.isInteger(n)&&n>=0&&n<entry.vertices.length/3));
  const bytes=Buffer.alloc(8+entry.vertices.length*4+entry.triangles.length*4);
  bytes.writeUInt32LE(entry.vertices.length/3,0);bytes.writeUInt32LE(entry.triangles.length/3,4);
  entry.vertices.forEach((n,i)=>bytes.writeFloatLE(n,8+i*4));
  entry.triangles.forEach((n,i)=>bytes.writeUInt32LE(n,8+entry.vertices.length*4+i*4));
  const filename=recipient.id+'.bin';await writeFile(new URL(filename,out),bytes);
  manifest.recipients[recipient.id]={recipientId:recipient.id,somaNm:recipient.somaNm,segment:entry.segment,file:filename,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),vertexCount:entry.vertices.length/3,triangleCount:entry.triangles.length/3,boundsNm:entry.boundsNm,manifestBoundsNm:entry.manifestBoundsNm,provenance:entry.provenance};
  await writeFile(new URL('manifest.json',out),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({recipient:recipient.id,segment:entry.segment.id,triangles:entry.triangles.length/3,bytes:bytes.length}));
 }
}finally{await browser.close();}
