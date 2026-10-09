/* v2 bridge. Native construction/restore sequence follows the working co-innervation bridge.
   Bundled Neuroglancer core is unchanged. All physical positions use integer sampling. */
(() => {
  'use strict';
  const params=new URLSearchParams(location.search),session=params.get('session');if(!session)return;
  const channel=new BroadcastChannel('dendritic-arbor-v2:'+session),peer=crypto.randomUUID();
  const nav=['position','crossSectionOrientation','crossSectionScale','projectionOrientation','projectionScale','projectionDepth','crossSectionDepth'];
  let taskId=params.get('task')||'',epoch=params.get('epoch')||'',revision=0,applying=false,baseline='',timer,pending=null;
  const clone=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const SEG_URL='https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300';
  const meshAdapter=()=>import('../../viewer/native-surface-adapter.js');
  const send=(type,data={})=>channel.postMessage({protocol:'dendritic-view-v2',peer,type,taskId,epoch,...data});
  const restore=(key,value)=>{const child=viewer.state.children.get(key);if(child&&!same(child.toJSON(),value)){if(value===undefined)child.reset();else child.restoreState(clone(value));}};
  function layer(spec) {
    let managed=viewer.layerManager.managedLayers.find(l=>l.name===spec.name);
    if(!managed){
      const template=viewer.layerManager.managedLayers.find(l=>l.layer&&l.toJSON().type===spec.type);
      if(!template)throw new Error('Native layer type missing: '+spec.type);
      managed=new template.constructor(spec.name,viewer.layerSpecification);managed.layer=new template.layer.constructor(managed);viewer.layerManager.addManagedLayer(managed);
      managed.layer.restoreState(clone(spec));managed.layer.initializationDone();return true;
    }
    let changed=managed.visible!==(spec.visible!==false);if(changed)managed.visible=spec.visible!==false;
    const native=managed.layer,before=managed.toJSON();
    if(spec.type==='segmentation'&&native?.displayState){
      const d=native.displayState,g=d.segmentationGroupState.value,c=d.segmentationColorGroupState.value;
      if(!same(before.segments||[],spec.segments||[])){g.selectedSegments.clear();g.visibleSegments.clear();g.restoreState({segments:spec.segments||[]});changed=true;}
      if(!same(before.segmentColors||{},spec.segmentColors||{})){c.segmentStatedColors.clear();c.restoreState({segmentColors:spec.segmentColors||{}});changed=true;}
    }else if(spec.type==='annotation'&&native?.localAnnotations&&!same(native.localAnnotations.toJSON(),spec.annotations||[])){native.localAnnotations.restoreState(clone(spec.annotations||[]));changed=true;}
    return changed;
  }
  function snapshot() {const state=viewer.state.toJSON();return {position:state.position,dimensions:state.dimensions,...Object.fromEntries(nav.map(k=>[k,state[k]])),layers:state.layers};}
  function flush() {
    timer=null;if(applying||!epoch)return;
    const state=snapshot(),text=JSON.stringify(state);if(text===baseline)return;baseline=text;send('native',{state,hostRevision:revision});
  }
  function apply(message) {
    if(!window.viewer?.state){pending=message;return;}
    if(message.epoch===epoch&&message.revision<revision)return;
    applying=true;clearTimeout(timer);
    try {
      const changed=epoch!==message.epoch;epoch=message.epoch;taskId=message.taskId;revision=message.revision;
      const state=message.state;
      if(changed)viewer.state.restoreState(clone(state));
      else {restore('title',state.title);for(const key of [...nav,'showSlices','showAxisLines','showScaleBar','layout'])if(key in state)restore(key,state[key]);let changedLayers=false;for(const spec of state.layers||[])changedLayers=layer(spec)||changedLayers;if(changedLayers)viewer.layerManager.layersChanged.dispatch();}
      const url=new URL(location.href);url.searchParams.set('task',taskId);url.searchParams.set('epoch',epoch);history.replaceState(history.state,'',url);
      baseline=JSON.stringify(snapshot());send('applied',{revision});
    }catch(error){send('error',{message:error.message});}
    finally{applying=false;}
  }
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const current=m=>m.epoch===epoch&&m.taskId===taskId;
  async function pickCenter(m){
    const position=Array.from(viewer.position.value),start=performance.now();
    try{
      const adapter=await meshAdapter();
      while(performance.now()-start<25000){
        if(!current(m)||!same(Array.from(viewer.position.value),position))throw new Error('Position changed during segment sampling.');
        adapter.nativeMeshLayer(window); // Verifies the exact public source before sampling.
        const l=viewer.layerManager.managedLayers.find(l=>l.name==='seg_m1300').layer;
        const value=l.getValueAt(new Float32Array(position),{pickedRenderLayer:null});
        if(typeof value==='bigint'){
          if(value===0n)throw new Error('The center is background in seg_m1300. Choose a point inside a structure.');
          const slice=l.renderLayers.find(r=>r.multiscaleSource),loaded=Array.from(slice?.highestResolutionLoadedVoxelSize||[]).map(n=>n*1e9);
          send('pick-result',{requestId:m.requestId,ok:true,segmentId:String(value),source:'seg_m1300',sourceUrl:SEG_URL,positionVoxel:position,positionNm:position.map((n,i)=>n*[8,8,40][i]),coordinateResolutionNm:[8,8,40],loadedVoxelSizeNm:loaded,identityStatus:'candidate'});return;
        }
        await pause(100);
      }
      throw new Error('Segmentation at the center has not loaded. Retry when the native slice is visible.');
    }catch(error){send('pick-result',{requestId:m.requestId,ok:false,errorCode:current(m)?'sample-unavailable':'stale-task',error:error.message});}
  }
  async function frameSegment(m){
    const started=performance.now();let framed=false,bounds,projectionScale;
    try{
      if(typeof m.segmentId!=='string'||!/^[1-9]\d*$/.test(m.segmentId))throw new Error('A nonzero segment ID string is required.');
      const adapter=await meshAdapter();
      while(performance.now()-started<45000){
        if(!current(m))throw new Error('Task changed during mesh loading.');
        const layer=adapter.nativeMeshLayer(window);
        if(layer){
          adapter.installNativeMeshCapture(window);bounds=adapter.nativeMeshBounds(window,m.segmentId);
          if(bounds&&!framed){
            const p=Array.from(viewer.position.value).map((n,i)=>n*[8,8,40][i]);
            const radius=Math.hypot(...p.map((n,i)=>Math.max(Math.abs(bounds[0][i]-n),Math.abs(bounds[1][i]-n))));
            projectionScale=Math.max(1500,radius*2.2/8);restore('projectionScale',projectionScale);restore('projectionOrientation',[0.2,0.3,0,Math.sqrt(0.87)]);framed=true;flush();
          }
          if(framed){
            viewer.display.draw();const geometry=adapter.nativeMeshReady(window)?adapter.extractNativeMesh(window,m.segmentId):null;
            if(geometry&&geometry.provenance.readyForView){send('mesh-result',{requestId:m.requestId,ok:true,segmentId:m.segmentId,source:'seg_m1300',sourceUrl:SEG_URL,boundsNm:bounds,projectionScale,triangleCount:geometry.triangleCount,fragmentCount:geometry.provenance.fragments.length,partial:true,readyForView:true,identityStatus:'candidate'});return;}
          }
        }
        await pause(150);
      }
      throw new Error('The selected segment mesh has not loaded. Retry with the native 3D panel visible.');
    }catch(error){send('mesh-result',{requestId:m.requestId,ok:false,errorCode:current(m)?'mesh-unavailable':'stale-task',error:error.message});}
  }
  channel.onmessage=event=>{const m=event.data;if(m?.protocol!=='dendritic-view-v2'||m.peer===peer)return;if(m.type==='host')apply(m);else if(current(m)&&m.type==='pick-center')void pickCenter(m);else if(current(m)&&m.type==='frame-segment')void frameSegment(m);};
  function start() {
    if(!window.viewer?.state){setTimeout(start,50);return;}
    baseline=JSON.stringify(snapshot());viewer.state.changed.add(()=>{if(!applying){clearTimeout(timer);timer=setTimeout(flush,110);}});
    window.DendriticBridge={get state(){return snapshot();},get epoch(){return epoch;},get taskId(){return taskId;},get revision(){return revision;},flush};
    if(pending){apply(pending);pending=null;}send('hello');
  }
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();send('save');}},true);
  start();
})();
