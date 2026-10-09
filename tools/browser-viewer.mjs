// Reproducible headless, text-only live-source integration. Uses a clean ephemeral profile.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const report={checkedAt:new Date().toISOString(),browser:'Microsoft Edge, headless, clean ephemeral profile',screenshotsTaken:0};
async function settledNavigation(peers){
  const started=Date.now();let previous,quietSince=0;
  while(Date.now()-started<30000){
    const host=await page.evaluate(()=>({epoch:ReviewApp.viewer.epoch,revision:ReviewApp.viewer.revision,view:ReviewApp.viewer.getView()}));
    const states=await Promise.all(peers.map(peer=>peer.evaluate(()=>({epoch:DendriticBridge.epoch,revision:DendriticBridge.revision,position:viewer.state.toJSON().position,crossSectionScale:viewer.state.toJSON().crossSectionScale}))));
    const key=JSON.stringify([host,states]),acknowledged=states.every(state=>state.epoch===host.epoch&&state.revision===host.revision);
    if(key!==previous||!acknowledged){previous=key;quietSince=Date.now();}
    // Native input is debounced by110ms; two peers may normalize Float32 cameras
    // after receiving the host snapshot. Require their acknowledgments and a
    // quiet interval, rather than treating the prepared EM plane as peer ready.
    if(acknowledged&&Date.now()-quietSince>=750)return {revision:host.revision,quietMs:Date.now()-quietSince,elapsedMs:Date.now()-started,peers:states.length};
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Native peers did not acknowledge and settle navigation before evidence capture');
}
try {
  await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8874/');
  await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete,{timeout:120000});
  report.initial=await page.evaluate(()=>({taskId:ReviewApp.current.id,complete:ReviewApp.viewer.plane.complete,width:ReviewApp.viewer.plane.width,height:ReviewApp.viewer.plane.height,firstUsefulMs:ReviewApp.viewer.plane.firstUsefulMs,elapsedMs:ReviewApp.viewer.plane.elapsedMs,networkBytes:ReviewApp.viewer.source.networkBytes}));
  console.log('Native plane complete',report.initial);
  await page.evaluate(()=>{window.syncTraffic=[];const c=new BroadcastChannel('dendritic-arbor-v2:'+ReviewApp.viewer.session);c.onmessage=({data:m})=>{window.syncTraffic.push({time:performance.now(),peer:m.peer,type:m.type,revision:m.revision,hostRevision:m.hostRevision,position:m.state?.position,scale:m.state?.crossSectionScale});if(window.syncTraffic.length>150)window.syncTraffic.shift();};ReviewApp.viewer.ensureNative();});
  await page.evaluate(()=>location.hash='neuroglancer');
  await page.waitForFunction(()=>document.querySelector('#ngFrame').contentWindow?.DendriticBridge,undefined,{timeout:60000});
  const frame=page.frames().find(f=>f.url().includes('/vendor/neuroglancer/'));
  await frame.waitForFunction(()=>window.DendriticBridge,{timeout:60000});
  report.position=await frame.evaluate(()=>viewer.state.toJSON().position);assert.deepEqual(report.position,[94120,80824,21466]);
  await frame.waitForFunction(()=>{const layer=viewer.layerManager.managedLayers.find(layer=>layer.name==='seg_m1300')?.layer;if(!layer)return false;const value=layer.getValueAt(viewer.position.value,{pickedRenderLayer:null});return typeof value==='bigint'&&value!==0n;},undefined,{timeout:60000});
  report.nativePick=await frame.evaluate(()=>{const l=viewer.layerManager.managedLayers.find(l=>l.name==='seg_m1300').layer;const v=l.getValueAt(viewer.position.value,{pickedRenderLayer:null});return {value:String(v),type:typeof v};});
  assert.equal(report.nativePick.type,'bigint');assert.notEqual(report.nativePick.value,'0');
  console.log('Actual native spatial sample',report.nativePick);
  if(report.nativePick.type==='bigint'&&report.nativePick.value!=='0'){
    await frame.evaluate(id=>viewer.layerManager.managedLayers.find(l=>l.name==='seg_m1300').layer.displayState.segmentationGroupState.value.restoreState({segments:[id]}),report.nativePick.value);
    await page.waitForFunction(id=>ReviewApp.viewer.getSegments().some(s=>s.id===id&&s.identityStatus==='candidate'),report.nativePick.value,{timeout:15000});
    report.nativePick.persistedCandidate=await page.evaluate(async()=>{await ReviewApp.saveAll();return (await ReviewApp.store.load(ReviewApp.current.id)).segments;});
  }
  await page.evaluate(()=>location.hash='neuroglancer');const popupEvent=context.waitForEvent('page');await page.locator('#detach').click();const detached=await popupEvent;
  await detached.waitForFunction(()=>window.DendriticBridge,{timeout:60000});
  report.warmedNextSlice=await page.evaluate(async()=>{const before=ReviewApp.viewer.source.networkBytes,v=ReviewApp.viewer.getView();v.centerNm[2]+=40;await ReviewApp.viewer.setView(v);return {elapsedMs:ReviewApp.viewer.plane.elapsedMs,networkBytes:ReviewApp.viewer.source.networkBytes-before};});
  await detached.waitForFunction(()=>viewer.state.toJSON().position[2]===21467,{timeout:20000});report.hostToDetached=true;
  await detached.evaluate(()=>{const p=[...viewer.position.value];p[0]+=1;viewer.state.children.get('position').restoreState(p);});
  await page.waitForFunction(()=>ReviewApp.viewer.getView().centerNm[0]===752968,{timeout:20000});report.detachedToHost=true;
  await detached.evaluate(()=>viewer.state.children.get('crossSectionScale').restoreState(0.5));
  // Reproduce a host acknowledgment arriving before the native input debounce.
  // The pending detached zoom must not be overwritten by this unchanged snapshot.
  await page.evaluate(()=>ReviewApp.viewer.publish());
  await page.waitForFunction(()=>ReviewApp.viewer.getView().spanNm===2048,{timeout:15000});
  await frame.waitForFunction(()=>viewer.state.toJSON().crossSectionScale===0.5,{timeout:15000});report.nativeZoomRetained=true;report.pendingNativeZoomSurvivesAcknowledgment=true;
  await page.evaluate(()=>{window.nativeSaveCalls=0;const original=ReviewApp.viewer.onSave;ReviewApp.viewer.onSave=()=>{window.nativeSaveCalls++;return original();};});
  await detached.keyboard.press('Control+s');await page.waitForFunction(()=>window.nativeSaveCalls===1,{timeout:10000});report.detachedCtrlS=true;
  report.nativeArrowCharacters=await detached.evaluate(()=>[...new Set(document.body.innerText.match(/[\u2190-\u21ff\u27f0-\u27ff\u2900-\u297f]/g)||[])]);assert.deepEqual(report.nativeArrowCharacters,[]);
  await page.evaluate(async()=>{await ReviewApp.viewer.setView({...ReviewApp.viewer.getView(),plane:'xz',spanNm:1024});});
  await page.waitForFunction(()=>ReviewApp.viewer.plane?.complete&&ReviewApp.viewer.plane.plane==='xz',{timeout:90000});
  report.preExportSynchronization=await settledNavigation([frame,detached]);
  report.export=await page.evaluate(async()=>{
    const out=await ReviewApp.viewer.exportPlane(),native=out.files.find(f=>f.name==='raw-native.png'),image=await createImageBitmap(native.blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,image.width,image.height).data;let mismatch=0;for(let i=0;i<ReviewApp.viewer.plane.pixels.length;i++)if(data[i*4]!==ReviewApp.viewer.plane.pixels[i])mismatch++;return{files:out.files.map(f=>({name:f.name,bytes:f.blob.size})),plane:out.metadata.plane,annotated:out.metadata.annotated,scaleBar:out.metadata.scaleBar,losslessPixelMismatches:mismatch};
  });
  assert.equal(report.export.losslessPixelMismatches,0);assert.deepEqual(report.export.plane.nativePixelSizeNm,[8,40]);assert.deepEqual(report.export.annotated.dimensions,[128,130]);
  try{report.navigationFigure=await page.evaluate(async()=>{const out=await ReviewApp.viewer.exportNavigationFigure();return {files:out.files.map(f=>({name:f.name,bytes:f.blob.size})),dimensions:out.metadata.dimensions,rendering:out.metadata.rendering,sceneReady:out.metadata.sceneReady,readiness:out.metadata.readiness,loadingNotice:out.metadata.loadingNotice};});}
  catch(error){console.log('Capture diagnostics',await frame.evaluate(()=>({ready:viewer.isReady(),layers:viewer.layerManager.managedLayers.map(l=>({name:l.name,ready:l.isReady()})),panels:[...viewer.display.panels].map(p=>({visible:p.visible,ready:p.isReady(),slice:!!p.sliceView})),bridge:{taskId:DendriticBridge.taskId,epoch:DendriticBridge.epoch,revision:DendriticBridge.revision},body:document.body.innerText.slice(-5000)})),await page.evaluate(()=>({epoch:ReviewApp.viewer.epoch,revision:ReviewApp.viewer.revision})));throw error;}
  assert.ok(report.navigationFigure.files[0].bytes>1000);
  await page.evaluate(()=>ReviewApp.viewer.setView({...ReviewApp.viewer.getView(),plane:'yz',spanNm:1024}));
  report.yz=await page.evaluate(()=>({complete:ReviewApp.viewer.plane.complete,axes:ReviewApp.viewer.plane.axes,pixelSizeNm:ReviewApp.viewer.plane.pixelSizeNm,dimensions:[ReviewApp.viewer.plane.width,ReviewApp.viewer.plane.height]}));assert.deepEqual(report.yz.pixelSizeNm,[8,40]);assert.equal(report.yz.complete,true);
  await page.evaluate(()=>ReviewApp.viewer.setLanguage('en'));assert.match(await page.locator('#imageStatus').textContent(),/^Native EM/);report.statusLocaleSwitch=true;await page.evaluate(()=>ReviewApp.viewer.setLanguage('ru'));
  const old=await page.evaluate(()=>({epoch:ReviewApp.viewer.epoch,taskId:ReviewApp.current.id,session:ReviewApp.viewer.session,revision:ReviewApp.viewer.revision}));
  await page.evaluate(()=>ReviewApp.switchTask(ReviewApp.catalog.tasks[1].id));
  await page.evaluate(old=>{const c=new BroadcastChannel('dendritic-arbor-v2:'+old.session);c.postMessage({protocol:'dendritic-view-v2',peer:'stale-peer',type:'native',epoch:old.epoch,taskId:old.taskId,hostRevision:old.revision,state:{position:[1,1,1],layers:[]}});c.close();},old);
  assert.notEqual(await page.evaluate(()=>ReviewApp.viewer.getView().centerNm[0]),8);report.staleTaskRejected=true;
  report.errors=errors;assert.deepEqual(errors,[]);report.passed=true;
  console.log(JSON.stringify(report,null,2));
  await writeFile(new URL('../docs/native-browser-witness.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
}catch(error){const diagnostic={message:error.message,host:await page.evaluate(()=>({view:ReviewApp?.viewer.getView(),revision:ReviewApp?.viewer.revision,traffic:window.syncTraffic})),peers:await Promise.all(context.pages().flatMap(p=>p.frames().filter(f=>f.url().includes('/vendor/neuroglancer/'))).map(f=>f.evaluate(()=>({url:location.href,revision:window.DendriticBridge?.revision,state:window.viewer?.state.toJSON()}))))};await writeFile('.local/native-sync-failure.json',JSON.stringify(diagnostic,null,2));console.log('Native sync failure diagnostics saved to .local/native-sync-failure.json');throw error;}finally{await browser.close();}
