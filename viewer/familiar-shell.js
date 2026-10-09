import {LegacySurface} from './LegacySurface.js';
import {installNativeMeshCapture,extractNativeMesh,nativeMeshReady} from './native-surface-adapter.js';
import {cameraQuaternion,nativeCamera} from './surface-sync.js';
import {starterMeshManifest,loadStarterMesh} from './starter-meshes.js';
const $=id=>document.getElementById(id);
let host,api,language='ru',busy=false;
const text=(ru,en)=>language==='en'?en:ru;
export function renderShell(catalog,current,lang){language=lang;for(const n of document.querySelectorAll('[data-ru][data-en]'))n.textContent=n.dataset[lang];if(!catalog)return;const select=$('taskSelect');if(select){const filter=$('cellFilter').value;select.replaceChildren(...catalog.tasks.filter(t=>!filter||t.recipientId===filter).map(t=>new Option(`${t.id} · ${typeof t.title==='string'?t.title:t.title[lang]}`,t.id)));select.value=current?.id||'';}if(host?.surface){host.surface.language=lang;for(const m of host.surface.meshes){const label=m.control?.querySelector('span:last-child');if(label)label.textContent=m.id+' · '+text('Кандидат v1300','v1300 candidate');}host.surface.schedule();}}
export function renderShellView(view){if($('blackInput')){const [b,w]=view.displayWindow||[0,255];$('blackInput').value=b;$('whiteInput').value=w;}const slider=$('sliceSlider');if(slider){const axis={xy:2,xz:1,yz:0}[view.plane],step=[8,8,40][axis],value=Math.round(view.centerNm[axis]/step);if(value<Number(slider.min)||value>Number(slider.max)||slider.dataset.axis!==String(axis)){slider.min=value-32;slider.max=value+32;slider.dataset.axis=axis;}slider.value=value;}}
function route(){const page=['viewer','neuroglancer','sources'].includes(location.hash.slice(1))?location.hash.slice(1):'viewer';for(const id of ['viewer','neuroglancer','sources']){const element=$('page-'+id);if(!element)continue;if(id==='neuroglancer'){element.hidden=false;element.classList.toggle('background-native',page!==id);element.inert=page!==id;element.setAttribute('aria-hidden',String(page!==id));}else element.hidden=page!==id;}for(const link of document.querySelectorAll('.main-nav a')){if(link.hash==='#'+page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}if(page==='neuroglancer'&&host?.task)host.ensureNative();host?.draw();host?.surface?.resize();}
export async function installFamiliarShell(viewer,callbacks){host=viewer;api=callbacks;host.surface=new LegacySurface(host);window.addEventListener('hashchange',route);route();
  const live=(epoch,id)=>host.epoch===epoch&&host.task?.id===id;
  let selectedLoad;
  host.loadSelectedStructures=()=>{
    const epoch=host.epoch,taskId=host.task?.id,selection=host.getSegments(),key=JSON.stringify([epoch,selection.map(s=>s.id)]);
    if(selectedLoad?.key===key)return selectedLoad.promise;
    const promise=(async()=>{
      if(!selection.length)return;
      // Saved IDs can still use the live source if a prepared asset is unavailable.
      const manifest=await starterMeshManifest().catch(()=>null);if(!live(epoch,taskId))return;
      const entries=Object.values(manifest?.recipients||{}),unknown=[];
      await Promise.all(selection.map(async segment=>{
        const entry=entries.find(e=>e.segment.id===segment.id);
        if(!entry){unknown.push(segment);return;}
        try{const data=await loadStarterMesh(entry);const current=host.getSegments().find(s=>s.id===segment.id);if(live(epoch,taskId)&&current)host.surface.setMesh(current,data);}
        catch{unknown.push(segment);}
      }));
      const remaining=unknown.filter(segment=>host.getSegments().some(s=>s.id===segment.id));
      if(!remaining.length||!live(epoch,taskId))return;
      host.surface.setStatus(text('Загрузка дополнительно выбранных 3D-структур…','Loading additional selected 3D structures…'));
      host.ensureNative();const started=performance.now();
      while(host.frame?.contentWindow?.DendriticBridge?.epoch!==epoch){if(!live(epoch,taskId))return;if(performance.now()-started>25000)throw new Error(text('Дополнительные структуры ещё загружаются. Повторите загрузку.','Additional structures are still loading. Retry loading.'));await new Promise(r=>setTimeout(r,100));}
      // A saved camera is authoritative; frame only a newly added uncached mesh.
      if(!host.surface.modelReady&&!host.surface.savedCamera){host.meshFraming=epoch;try{for(const segment of remaining){if(!live(epoch,taskId))return;await host.requestNative('frame-segment',{segmentId:segment.id});}}finally{if(host.meshFraming===epoch)host.meshFraming=false;}}
    })().catch(error=>{if(live(epoch,taskId))host.surface.setStatus(error.message,'error');});
    selectedLoad={key,promise};return promise;
  };
  host.loadDefaultStructures=async()=>{
    const epoch=host.epoch,taskId=host.task?.id,original=JSON.stringify(host.getSegments());
    try{
      const manifest=await starterMeshManifest();if(!live(epoch,taskId))return;
      if(api.sourceHash&&manifest.sourceHash!==api.sourceHash)throw new Error('Starter meshes do not match the source catalog.');
      if(!host.getSegments().length&&host.view.defaultStructuresInitialized!==true&&JSON.stringify(host.getSegments())===original){
        const entry=manifest.recipients[host.task.recipientId];if(!entry)throw new Error('No source-bound starter mesh for this recipient.');
        const segment=structuredClone(entry.segment);segment.sourceBinding={...segment.sourceBinding,selectionMethod:'prepared-soma-spatial-pick',starterAssetSha256:entry.sha256,recipientId:entry.recipientId};
        // The old empty-plane camera did not frame neuron geometry.
        host.surface.savedCamera=null;delete host.view.surfaceCamera;
        host.view.defaultStructuresInitialized=true;
        host.updateSegments([segment]);host.onSegmentsChange(host.getSegments(),{taskId,initialization:true});
        host.onViewChange(host.getView(),{taskId,initialization:true});
      }else if(host.getSegments().length&&host.view.defaultStructuresInitialized!==true){
        host.view.defaultStructuresInitialized=true;host.onViewChange(host.getView(),{taskId,initialization:true});
      }
      await host.loadSelectedStructures();
      if(live(epoch,taskId)&&!host.getSegments().length)host.surface.setStatus(text('Все структуры скрыты или удалены. Выберите структуру в текущем срезе.','All structures are hidden or removed. Select a structure at the current section.'));
    }catch(error){if(live(epoch,taskId))host.surface.setStatus(error.message,'error');}
  };
  if($('taskSelect'))$('taskSelect').onchange=()=>api.switchTask($('taskSelect').value);
  if($('sliceSlider'))$('sliceSlider').oninput=()=>{const v=host.getView(),axis={xy:2,xz:1,yz:0}[v.plane];v.centerNm[axis]=Number($('sliceSlider').value)*[8,8,40][axis];host.setView(v);};
  const displayWindow=()=>host.setDisplayWindow($('blackInput').value,$('whiteInput').value);
  $('blackInput').onchange=$('whiteInput').onchange=displayWindow;
  const windowPreset=(b,w)=>{$('blackInput').value=b;$('whiteInput').value=w;displayWindow();};
  $('rawButton').onclick=()=>windowPreset(0,255);$('windowButton').onclick=()=>windowPreset(110,160);
  $('fitButton').onclick=()=>host.setView({centerNm:host.task.anchorNm,spanNm:4096});
  $('zoomSelect').onchange=()=>host.setView({spanNm:4096/Number($('zoomSelect').value)});
  $('syncNeuroglancerMain').onchange=()=>{host.syncEnabled=$('syncNeuroglancerMain').checked;if(host.syncEnabled)host.publish(true);};
  $('show3D').onclick=async()=>{if(busy)return;busy=true;$('syncNeuroglancerMain').checked=true;$('show3D').disabled=true;$('meshStatus').textContent=text('Выбор сегмента и загрузка реальной 3D-сетки…','Selecting segment and loading its real 3D mesh…');try{const segment=await host.pickCenter();$('meshStatus').textContent=text(`Кандидат ${segment.id}. Идентичность не подтверждена.`,`Candidate ${segment.id}. Identity unconfirmed.`);}catch(e){$('meshStatus').textContent=e.message;}finally{busy=false;$('show3D').disabled=false;}};
  $('surfaceRetry').onclick=()=>{selectedLoad=null;void host.loadDefaultStructures();};
  $('surfaceOpacity').addEventListener('change',()=>{host.view.surfaceOpacity=host.surface.alpha;host.onViewChange(host.getView());});
  $('surfacePlane').addEventListener('change',()=>{host.view.showSlices=$('surfacePlane').checked;host.onViewChange(host.getView());host.publish();});
  window.addEventListener('surface:view',()=>{if(host.surface.task?.id!==host.task?.id||host.surface.initializing||host.surface.updating)return;const c=host.surface.getNavigationState();if(c){host.view.surfaceCamera={...c,originNm:[...host.surface.originNm]};if(host.surface.modelReady&&!host.surface.updating){const q=cameraQuaternion(c);if(q)host.view.ngState={...host.view.ngState,projectionOrientation:q,projectionScale:c.physical_height_nm/8};host.publish();}host.onViewChange(host.getView());}});
  window.addEventListener('dendritic:native-camera',()=>{if(host.syncEnabled===false||!host.surface.modelReady)return;requestAnimationFrame(()=>{try{const win=host.frame.contentWindow;win.viewer.display.draw();const c=nativeCamera(win,host.surface.originNm);if(c){host.surface.applyNavigationState(c);host.surface.schedule();host.view.surfaceCamera={...host.surface.getNavigationState(),originNm:[...host.surface.originNm]};host.onViewChange(host.getView());}}catch{}});});
  window.addEventListener('surface:visibility',()=>{const visible=new Map(host.surface.meshes.map(m=>[m.id,m.visible]));const segments=host.getSegments().map(s=>({...s,visible:visible.has(s.id)?visible.get(s.id):s.visible}));host.updateSegments(segments);host.onSegmentsChange(segments);});
  window.addEventListener('dendritic:edit-segment',e=>api.editSegment(e.detail));
  const sync=()=>{try{const win=host.frame?.contentWindow;if(!win?.viewer||!host.task||win.DendriticBridge?.epoch!==host.epoch)return;installNativeMeshCapture(win);const selected=host.getSegments();if(!selected.length||host.meshFraming)return;win.viewer.display.resizeCallback();win.viewer.display.draw();if(!nativeMeshReady(win))return;for(const s of selected){if(host.surface.rawMeshes.get(s.id)?.provenance?.starterAssetSha256)continue;const data=extractNativeMesh(win,s.id,{originNm:[0,0,0]});if(data){data.signature=JSON.stringify([data.provenance.fragments,data.provenance.transformNm]);host.surface.setMesh(s,data);}}}catch(e){if($('meshStatus'))$('meshStatus').textContent=e.message;}};
  host.surfaceTimer=setInterval(sync,900);
}
