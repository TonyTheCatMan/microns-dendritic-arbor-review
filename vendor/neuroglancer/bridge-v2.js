/* v2 bridge. Native construction/restore sequence follows the working co-innervation bridge.
   Bundled Neuroglancer core is unchanged. All physical positions use integer sampling. */
(() => {
  'use strict';
  const params=new URLSearchParams(location.search),session=params.get('session');if(!session)return;
  const channel=new BroadcastChannel('dendritic-arbor-v2:'+session),peer=crypto.randomUUID();
  const nav=['position','crossSectionOrientation','crossSectionScale','projectionOrientation','projectionScale','projectionDepth','crossSectionDepth'];
  let taskId=params.get('task')||'',epoch=params.get('epoch')||'',revision=0,applying=false,baseline='',timer,pending=null;
  const clone=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const send=(type,data={})=>channel.postMessage({protocol:'dendritic-view-v2',peer,type,taskId,epoch,...data});
  const restore=(key,value)=>{const child=viewer.state.children.get(key);if(child&&!same(child.toJSON(),value)){if(value===undefined)child.reset();else child.restoreState(clone(value));}};
  function layer(spec) {
    let managed=viewer.layerManager.managedLayers.find(l=>l.name===spec.name);
    if(!managed){
      const template=viewer.layerManager.managedLayers.find(l=>l.layer&&l.toJSON().type===spec.type);
      if(!template)throw new Error('Native layer type missing: '+spec.type);
      managed=new template.constructor(spec.name,viewer.layerSpecification);managed.layer=new template.layer.constructor(managed);viewer.layerManager.addManagedLayer(managed);
      managed.layer.restoreState(clone(spec));managed.layer.initializationDone();return;
    }
    managed.visible=spec.visible!==false;
    const native=managed.layer,before=managed.toJSON();
    if(spec.type==='segmentation'&&native?.displayState){
      const d=native.displayState,g=d.segmentationGroupState.value,c=d.segmentationColorGroupState.value;
      if(!same(before.segments||[],spec.segments||[])){g.selectedSegments.clear();g.visibleSegments.clear();g.restoreState({segments:spec.segments||[]});}
      if(!same(before.segmentColors||{},spec.segmentColors||{})){c.segmentStatedColors.clear();c.restoreState({segmentColors:spec.segmentColors||{}});}
    }else if(spec.type==='annotation'&&native?.localAnnotations&&!same(native.localAnnotations.toJSON(),spec.annotations||[]))native.localAnnotations.restoreState(clone(spec.annotations||[]));
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
      else {restore('title',state.title);for(const key of nav)if(key in state)restore(key,state[key]);for(const spec of state.layers||[])layer(spec);viewer.layerManager.layersChanged.dispatch();}
      const url=new URL(location.href);url.searchParams.set('task',taskId);url.searchParams.set('epoch',epoch);history.replaceState(history.state,'',url);
      baseline=JSON.stringify(snapshot());send('applied',{revision});
    }catch(error){send('error',{message:error.message});}
    finally{applying=false;}
  }
  channel.onmessage=event=>{const m=event.data;if(m?.protocol!=='dendritic-view-v2'||m.peer===peer)return;if(m.type==='host')apply(m);};
  function start() {
    if(!window.viewer?.state){setTimeout(start,50);return;}
    baseline=JSON.stringify(snapshot());viewer.state.changed.add(()=>{if(!applying){clearTimeout(timer);timer=setTimeout(flush,110);}});
    window.DendriticBridge={get state(){return snapshot();},get epoch(){return epoch;},get taskId(){return taskId;},get revision(){return revision;},flush};
    if(pending){apply(pending);pending=null;}send('hello');
  }
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();send('save');}},true);
  start();
})();
