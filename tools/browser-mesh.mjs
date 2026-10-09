// Real-source, text-only witness: voxel pick, sharded mesh fetch and actual draw subchunks.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/seg_m1300/mesh/'))requests.push({url:r.url(),status:r.status()});});
try{
  await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8874/');
  await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete,undefined,{timeout:120000});
  const frame=page.frames().find(f=>f.url().includes('/vendor/neuroglancer/'));await frame.waitForFunction(()=>window.DendriticBridge,undefined,{timeout:60000});
  const before=await frame.evaluate(()=>({segments:viewer.state.toJSON().layers.find(l=>l.name==='seg_m1300').segments||[],position:Array.from(viewer.position.value)}));assert.deepEqual(before.segments,[]);
  const picked=await page.evaluate(()=>ReviewApp.viewer.pickCenter());assert.equal(picked.id,'864691136389585015');assert.equal(picked.identityStatus,'candidate');
  const geometry=await frame.evaluate(async()=>{
    const adapter=await import('../../viewer/native-surface-adapter.js');adapter.installNativeMeshCapture(window);viewer.display.draw();
    const value=adapter.extractNativeMesh(window,'864691136389585015');
    return value&&{vertexCount:value.vertexCount,triangleCount:value.triangleCount,boundsNm:value.boundsNm,provenance:value.provenance,manifestBoundsNm:adapter.nativeMeshBounds(window,'864691136389585015'),position:Array.from(viewer.position.value),projectionScale:viewer.state.toJSON().projectionScale,finiteVertices:value.vertices.every(Number.isFinite),validTriangleIndices:value.triangles.every(n=>n<value.vertexCount)};
  });
  assert.ok(geometry?.triangleCount>0,'Real mesh triangles must be drawn');assert.deepEqual(geometry.position,before.position,'Mesh framing must not move the EM center');
  assert.equal(geometry.provenance.readyForView,true);assert.equal(geometry.finiteVertices,true);assert.equal(geometry.validTriangleIndices,true);
  assert.ok(geometry.boundsNm.every((p,j)=>p.every((n,i)=>j?n<=geometry.manifestBoundsNm[1][i]+1:n>=geometry.manifestBoundsNm[0][i]-1)),'Physical vertices must remain within the public mesh manifest bounds');
  assert.ok(requests.some(r=>r.url.endsWith('.shard')&&r.status===206),'Real public sharded mesh must be fetched');assert.deepEqual(errors,[]);
  const report={checkedAt:new Date().toISOString(),screenshotsTaken:0,before,picked,geometry,meshRequests:requests,errors,passed:true};
  await writeFile(new URL('../docs/native-mesh-witness.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,id:picked.id,identityStatus:picked.identityStatus,vertices:geometry.vertexCount,triangles:geometry.triangleCount,fragments:geometry.provenance.fragments.length,projectionScale:geometry.projectionScale,meshResponses:requests.length,errors}));
}finally{await browser.close();}
