import {RESOLUTION_NM,PLANES,EM_URL,normalizeView,normalizeSegments,ngToNm,pixelToNm,planePlan} from './coordinates.js';
import {RawSource,ChunkCache,sha256} from './raw-source.js';
import {makeNgState,mergeNativeSegments,orthogonalPlane,assertNativeSources} from './neuroglancer-state.js';
import {visibleMarks,scaleBar,exportFigure,canvasBlob} from './figure.js';
import {displayedGray} from '../reference-viewer/image-display.js';

const clone=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const planeKey=view=>{const p=planePlan(view,{resolution:RESOLUTION_NM});return JSON.stringify([p.plane,p.begin,p.end]);};
export class ReviewViewer {
  constructor({canvas,frame,status=()=>{},onViewChange=()=>{},onPoint=()=>{},onSegmentsChange=()=>{},onSave=()=>{}}) {
    this.canvas=canvas;this.frame=frame;this.status=status;this.onViewChange=onViewChange;this.onPoint=onPoint;this.onSegmentsChange=onSegmentsChange;this.onSave=onSave;
    this.language='ru';this.interactionMode='navigate';this.task=null;this.view=normalizeView();this.segments=[];this.overlays=[];this.plane=null;this.sequence=0;
    this.rawCanvas=document.createElement('canvas');this.rawCanvas.width=1;this.rawCanvas.height=1;this.partialCanvas=document.createElement('canvas');
    this.source=new RawSource({cache:new ChunkCache({onWarning:message=>this.say(message,'warning')})});
    const sessionKey='dendritic-arbor-view-session:'+new URL('../',import.meta.url).pathname;
    try{this.session=sessionStorage.getItem(sessionKey)||crypto.randomUUID();sessionStorage.setItem(sessionKey,this.session);}catch{this.session=crypto.randomUUID();}
    this.peer=crypto.randomUUID();this.revision=0;this.channel=new BroadcastChannel('dendritic-arbor-v2:'+this.session);
    this.channel.onmessage=event=>this.receive(event.data);this.installControls();this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(canvas);
  }
  say(text,state='loading') {if(typeof this.status==='function')this.status(text,state);else if(this.status)this.status.textContent=text;}
  text(ru,en){return this.language==='ru'?ru:en;}
  setLanguage(language) {
    this.language=language==='en'?'en':'ru';this.draw();const p=this.plane;
    if(p?.complete)this.say(this.text(`Исходный ЭМ · ${p.width} × ${p.height} пикселей · ${(p.elapsedMs/1000).toFixed(1)} с`,`Native EM · ${p.width} × ${p.height} pixels · ${(p.elapsedMs/1000).toFixed(1)} s`),'ready');
    else if(p?.failures?.length)this.say(this.text(`Неполное покрытие: ${p.failures.length} блоков не загружено. Повторите загрузку.`,`Incomplete coverage: ${p.failures.length} chunks failed. Retry imagery.`),'error');
    else if(this.lastLoadError)this.say(this.text('Ошибка ЭМ: ','EM error: ')+this.lastLoadError,'error');
    else if(p)this.say(this.text(`ЭМ: ${p.loaded} / ${p.total} блоков`,`EM: ${p.loaded} / ${p.total} chunks`));
    else if(this.task)this.say(this.text('Загрузка исходного ЭМ · 8 × 8 × 40 нм…','Loading native EM · 8 × 8 × 40 nm…'));
  }
  setTool(mode){this.interactionMode=mode;this.canvas.style.cursor=mode==='navigate'?'grab':'crosshair';}
  setDisplayWindow(black,white){black=Math.max(0,Math.min(254,Number(black)));white=Math.max(black+1,Math.min(255,Number(white)));if(!Number.isFinite(black)||!Number.isFinite(white))return;this.view.displayWindow=[black,white];if(this.plane){this.makeRaster(this.plane);this.draw();}this.onViewChange(this.getView());}
  getView(){return clone(this.view);}
  getSegments(){return clone(this.segments);}
  getSourceBinding(){return {source:EM_URL,scale:this.source.scale?.key||'8_8_40',resolutionNm:[...RESOLUTION_NM],infoSha256:this.source.infoHash,convention:'integer-sampling-no-half-voxel'};}
  async setTask(task,view,segments=[]) {
    this.task=task;this.epoch=crypto.randomUUID();this.view=normalizeView(view||{},task.anchorNm);this.segments=normalizeSegments(segments);this.overlays=[];this.plane=null;this.loadedKey=null;this.loadingKey=null;
    this.surface?.setTask(task,this.view);this.onViewChange(this.getView());this.publish(true);return this.load();
  }
  async setView(view) {
    const ngState={...(view.ngState||this.view.ngState||{})};
    if(view.plane&&view.plane!==this.view.plane)delete ngState.crossSectionOrientation;
    if(view.spanNm!==undefined&&view.spanNm!==this.view.spanNm)delete ngState.crossSectionScale;
    this.view=normalizeView({...this.view,...view,ngState,nativeOblique:view.plane&&view.plane!==this.view.plane?false:!!this.view.nativeOblique},this.task?.anchorNm);this.onViewChange(this.getView());this.publish();return this.load();
  }
  updateSegments(segments) {this.segments=normalizeSegments(segments);this.surface?.updateSegments(this.segments);this.publish();return this.getSegments();}
  setOverlays(marks=[]) {this.overlays=clone(marks);this.surface?.setMarks(marks);this.draw();this.publish();}
  async retry(){return this.load();}
  async clearCache(){await this.source.cache.clear();this.source.indexes.clear();this.say(this.text('Кэш изображений очищен. Сохранённые заметки не изменены.','Image cache cleared. Saved notes are unchanged.'),'ready');}
  async load() {
    if(!this.task)return;const key=planeKey(this.view);
    if(this.loadedKey===key&&this.plane?.complete)return this.plane;
    if(this.loadingKey===key&&this.loadPromise)return this.loadPromise;
    this.controller?.abort();this.controller=new AbortController();const {signal}=this.controller,sequence=++this.sequence;
    this.loadingKey=key;this.lastLoadError=null;this.draw();
    clearTimeout(this.loadingNotice);this.loadingNotice=setTimeout(()=>{if(sequence===this.sequence)this.say(this.text('Загрузка новых блоков ЭМ…','Loading new EM chunks…'));},150);
    const work=async()=>{
    try {
      let renderedAt=0;
      const plane=await this.source.plane(this.view,{signal,onProgress:p=>{if(sequence!==this.sequence||p.loaded<p.total&&performance.now()-renderedAt<60)return;renderedAt=performance.now();this.plane=p;this.loadedKey=key;this.makeRaster(p);this.draw();if(p.elapsedMs>150)this.say(this.text(`ЭМ: ${p.loaded} / ${p.total} блоков · ${(p.elapsedMs/1000).toFixed(1)} с`,`EM: ${p.loaded} / ${p.total} chunks · ${(p.elapsedMs/1000).toFixed(1)} s`));}});
      if(sequence!==this.sequence)return;clearTimeout(this.loadingNotice);this.plane=plane;this.loadedKey=key;this.loadingKey=null;this.makeRaster(plane);this.draw();
      if(!plane.complete)this.say(this.text(`Неполное покрытие: ${plane.failures.length} блоков не загружено. Повторите загрузку.`,`Incomplete coverage: ${plane.failures.length} chunks failed. Retry imagery.`)+' '+plane.failures[0]?.error,'error');
      else this.say(this.text(`Исходный ЭМ · ${plane.width} × ${plane.height} пикселей · ${(plane.elapsedMs/1000).toFixed(1)} с`,`Native EM · ${plane.width} × ${plane.height} pixels · ${(plane.elapsedMs/1000).toFixed(1)} s`),'ready');
      return plane;
    }catch(error){if(sequence!==this.sequence||signal.aborted)return;clearTimeout(this.loadingNotice);this.loadingKey=null;this.lastLoadError=error.message;this.say(this.text('Ошибка ЭМ: ','EM error: ')+error.message,'error');this.draw();return null;}
    };this.loadPromise=work();return this.loadPromise;
  }
  makeRaster(plane) {
    this.partialCanvas.width=this.rawCanvas.width=plane.width;this.partialCanvas.height=this.rawCanvas.height=plane.height;
    const image=new ImageData(plane.width,plane.height),raw=new ImageData(plane.width,plane.height);
    const [black,white]=this.view.displayWindow||[0,255];
    for(let i=0;i<plane.pixels.length;i++){const p=plane.pixels[i],masked=plane.coverage[i]?displayedGray(p,black,white):(((i%plane.width>>3)+(Math.floor(i/plane.width)>>3))%2?58:37);for(let c=0;c<3;c++){image.data[i*4+c]=masked;raw.data[i*4+c]=p;}image.data[i*4+3]=raw.data[i*4+3]=255;}
    this.partialCanvas.getContext('2d').putImageData(image,0,0);this.rawCanvas.getContext('2d').putImageData(raw,0,0);
    this.surface?.setPlane(plane,this.partialCanvas);
  }
  draw() {
    const canvas=this.canvas,rect=canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),ratio=window.devicePixelRatio||1;
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
    const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#101b25';ctx.fillRect(0,0,w,h);this.drawRect=null;
    if(!this.plane){ctx.fillStyle='#b7c5d1';ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText(this.text('Загрузка ЭМ…','Loading EM…'),w/2,h/2);return;}
    const p=this.plane,scale=Math.min(w/p.physicalSizeNm[0],h/p.physicalSizeNm[1]),dw=p.physicalSizeNm[0]*scale,dh=p.physicalSizeNm[1]*scale,x=(w-dw)/2+(this.dragPreview?.[0]||0),y=(h-dh)/2+(this.dragPreview?.[1]||0);
    this.drawRect={x,y,w:dw,h:dh};ctx.imageSmoothingEnabled=false;ctx.drawImage(this.partialCanvas,x,y,dw,dh);
    const sx=dw/p.width,sy=dh/p.height;ctx.lineWidth=2;ctx.textAlign='left';ctx.font='12px system-ui';
    for(const mark of visibleMarks(this.overlays,p)){
      const pts=mark.projected,kind=mark.type||mark.kind;ctx.strokeStyle=ctx.fillStyle=mark.color||'#ffd166';const pos=t=>[x+(t.x+.5)*sx,y+(t.y+.5)*sy];ctx.beginPath();
      if(pts.length===1&&pts[0].onPlane){const a=pos(pts[0]);ctx.arc(a[0],a[1],5,0,Math.PI*2);}
      else if(kind==='roi'&&pts.length>=2&&pts[0].onPlane&&pts.at(-1).onPlane){const a=pos(pts[0]),b=pos(pts.at(-1));ctx.rect(a[0],a[1],b[0]-a[0],b[1]-a[1]);}
      else for(let i=1;i<pts.length;i++)if(pts[i-1].onPlane&&pts[i].onPlane){ctx.moveTo(...pos(pts[i-1]));ctx.lineTo(...pos(pts[i]));}
      ctx.stroke();const first=pts.find(t=>t.onPlane);if(first&&mark.label){const a=pos(first);ctx.fillText(mark.label,a[0]+8,a[1]-8);}
      if(mark.editing)for(const point of pts.filter(q=>q.onPlane)){const a=pos(point);ctx.fillRect(a[0]-3,a[1]-3,6,6);}
    }
    const bar=scaleBar(p),length=bar.nm*scale;ctx.fillStyle='#000b';ctx.fillRect(x+8,y+dh-49,length+30,40);ctx.strokeStyle=ctx.fillStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+20,y+dh-18);ctx.lineTo(x+20+length,y+dh-18);ctx.stroke();ctx.fillText(bar.label,x+20,y+dh-28);
    ctx.fillStyle='#000b';ctx.fillRect(x,y,dw,26);ctx.fillStyle='#fff';ctx.fillText(`${p.plane.toUpperCase()} · ${['X','Y','Z'][p.axes[2]]}=${p.depthNm} nm · ${p.pixelSizeNm.join(' × ')} nm`,x+10,y+17);
    if(this.loadedKey!==planeKey(this.view)){ctx.fillStyle='#523b12ed';ctx.fillRect(x,y+26,dw,30);ctx.fillStyle='#fff';ctx.fillText(this.text('Предыдущий вид · новый загружается','Previous view · new position loading'),x+10,y+46);}
  }
  canvasPoint(event){const rect=this.canvas.getBoundingClientRect(),r=this.drawRect;if(!r||!this.plane)return null;const x=(event.clientX-rect.left-r.x)/r.w*this.plane.width,y=(event.clientY-rect.top-r.y)/r.h*this.plane.height;if(x<0||y<0||x>=this.plane.width||y>=this.plane.height)return null;return {x,y};}
  installControls() {
    this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY,center:[...this.view.centerNm],moved:false};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{if(!this.drag||this.interactionMode!=='navigate')return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.moved=Math.hypot(dx,dy)>3;this.dragPreview=[dx,dy];this.draw();});
    this.canvas.addEventListener('pointerup',e=>{
      const drag=this.drag;this.drag=null;if(!drag)return;const point=this.canvasPoint(e),r=this.drawRect;this.dragPreview=null;
      if(this.interactionMode==='navigate'&&drag.moved&&r&&this.plane){const p=this.plane,next=[...drag.center];next[p.axes[0]]-=(e.clientX-drag.x)/r.w*p.physicalSizeNm[0];next[p.axes[1]]-=(e.clientY-drag.y)/r.h*p.physicalSizeNm[1];this.setView({centerNm:next});}
      else if(this.interactionMode!=='navigate'&&point){const i=Math.floor(point.y)*this.plane.width+Math.floor(point.x);if(this.loadedKey!==planeKey(this.view)||!this.plane.coverage[i]){this.say(this.text('Эта часть нового среза ещё не загружена.','This part of the new plane has not loaded yet.'),'error');return;}this.onPoint({pointNm:pixelToNm(this.plane,point.x,point.y),plane:this.view.plane,sourceBinding:this.getSourceBinding(),taskId:this.task.id||this.task.taskId});}
      this.draw();
    });
    this.canvas.addEventListener('pointercancel',()=>{this.drag=null;this.dragPreview=null;this.draw();});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){const centerNm=[...this.view.centerNm],axis=PLANES[this.view.plane][2];centerNm[axis]+=Math.sign(e.deltaY)*RESOLUTION_NM[axis];this.setView({centerNm});}else this.setView({spanNm:this.view.spanNm*(e.deltaY>0?1.25:0.8)});},{passive:false});
  }
  state(){return makeNgState(this.task||{},this.view,this.segments,this.overlays,this.language);}
  publish(ensure=false){if(!this.task||this.syncEnabled===false&&!ensure)return;const message={protocol:'dendritic-view-v2',peer:this.peer,type:'host',taskId:this.task.id||this.task.taskId,epoch:this.epoch,revision:++this.revision,state:this.state()};this.latest=message;
    if(ensure&&this.frame&&!this.frame.hasAttribute('src'))this.frame.src=this.nativeUrl();this.channel.postMessage(message);}
  nativeUrl(){const url=new URL('../vendor/neuroglancer/',import.meta.url);url.searchParams.set('session',this.session);url.searchParams.set('task',this.task.id||this.task.taskId);url.searchParams.set('epoch',this.epoch);url.hash='!'+encodeURIComponent(JSON.stringify(this.state()));return url.href;}
  requestNative(type,extra={}){const requestId=crypto.randomUUID();this.requests||=new Map();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.requests.delete(requestId);reject(new Error(this.text('Neuroglancer ещё загружает сегментацию. Повторите выбор.','Neuroglancer is still loading segmentation. Retry the selection.')));},type==='frame-segment'?50000:30000);this.requests.set(requestId,{resolve,reject,timer,epoch:this.epoch});this.channel.postMessage({protocol:'dendritic-view-v2',peer:this.peer,type,requestId,epoch:this.epoch,taskId:this.task.id||this.task.taskId,...extra});});}
  async pickCenter(){
    const epoch=this.epoch;this.syncEnabled=true;this.publish(true);const start=performance.now();while(this.frame?.contentWindow?.DendriticBridge?.epoch!==epoch){if(performance.now()-start>20000)throw new Error(this.text('Neuroglancer ещё загружается. Повторите выбор.','Neuroglancer is still loading. Retry selection.'));await new Promise(r=>setTimeout(r,100));}const pick=await this.requestNative('pick-center');if(epoch!==this.epoch)throw new Error(this.text('Задача изменилась. Повторите выбор.','The task changed. Retry selection.'));
    const existing=this.segments.find(s=>s.id===pick.segmentId),segment={...existing,id:pick.segmentId,source:'seg_m1300',sourceUrl:pick.sourceUrl,identityStatus:'candidate',visible:true,color:existing?.color||'#66d9b4',sourceBinding:{...existing?.sourceBinding,coordinateConvention:'integer-sample',selectionMethod:'native-spatial-pick',positionNm:pick.positionNm,positionVoxel:pick.positionVoxel,coordinateResolutionNm:[...RESOLUTION_NM],loadedVoxelSizeNm:pick.loadedVoxelSizeNm||[],identityConfirmed:false}};
    this.segments=normalizeSegments([...this.segments.filter(s=>s.id!==segment.id),segment]);this.onSegmentsChange(this.getSegments());this.surface?.updateSegments(this.segments);this.publish();
    this.meshFraming=true;try{await this.requestNative('frame-segment',{segmentId:segment.id});}finally{this.meshFraming=false;}return segment;
  }
  receive(m){
    if(m?.protocol!=='dendritic-view-v2'||m.peer===this.peer)return;if(m.type==='hello'){this.publish();return;}
    if(m.epoch!==this.epoch||m.taskId!==(this.task?.id||this.task?.taskId))return;
    if(m.type==='pick-result'||m.type==='mesh-result'){const r=this.requests?.get(m.requestId);if(!r||r.epoch!==this.epoch)return;clearTimeout(r.timer);this.requests.delete(m.requestId);if(m.ok===false)r.reject(new Error(m.error||'Selection unavailable'));else r.resolve(m);return;}
    if(m.type==='save'){this.onSave();window.dispatchEvent(new CustomEvent('dendritic:save'));return;}
    if(m.type==='error'){this.say('Neuroglancer: '+m.message,'error');return;}
    if(m.type!=='native'||m.hostRevision!==this.revision||this.syncEnabled===false)return;
    const state=m.state;try{assertNativeSources(state);}catch(error){this.say(this.text('Источник или шкала Neuroglancer изменены. Откройте задачу заново. ','Neuroglancer source or coordinate scale changed. Reopen the task. ')+error.message,'error');return;}
    const segments=mergeNativeSegments(this.segments,state);if(!same(segments,this.segments)){this.segments=segments;this.surface?.updateSegments(segments);this.onSegmentsChange(this.getSegments());}
    const ngState=Object.fromEntries(['projectionOrientation','projectionScale','projectionDepth','crossSectionDepth','crossSectionOrientation','crossSectionScale'].filter(k=>state[k]!==undefined).map(k=>[k,state[k]]));
    const previous=this.view,centerNm=Array.isArray(state.position)?ngToNm(state.position):previous.centerNm,plane=orthogonalPlane(state.crossSectionOrientation),spanNm=Number.isFinite(state.crossSectionScale)&&state.crossSectionScale>0?state.crossSectionScale*4096:previous.spanNm;
    this.view=normalizeView({...previous,centerNm,spanNm,plane:plane||previous.plane,nativeOblique:!plane,ngState});
    const changed=!same(centerNm,previous.centerNm)||this.view.spanNm!==previous.spanNm||this.view.plane!==previous.plane;this.onViewChange(this.getView());
    // Return an authoritative snapshot to both the embedded and detached peers.
    this.publish();if(!same(previous.ngState?.projectionOrientation,ngState.projectionOrientation)||previous.ngState?.projectionScale!==ngState.projectionScale)window.dispatchEvent(new CustomEvent('dendritic:native-camera'));if(changed)this.load();else if(!plane)this.say(this.text('Косой вид в Neuroglancer; исходный 2D-срез остаётся ортогональным.','Oblique Neuroglancer view; native 2D evidence remains orthogonal.'),'ready');
  }
  detach(){if(!this.task)return null;this.publish();return window.open(this.nativeUrl(),'dendritic-'+this.session);}
  async exportPlane(){if(this.loadedKey!==planeKey(this.view))throw new Error(this.text('Новый срез ещё загружается. Дождитесь загрузки.','The new plane is still loading. Wait for it to finish.'));const sequence=this.sequence;const result=await exportFigure({task:this.task,view:this.view,plane:this.plane,rawCanvas:this.rawCanvas,marks:this.overlays,segments:this.segments,language:this.language});if(sequence!==this.sequence)throw new Error(this.text('Срез изменился во время экспорта. Повторите сохранение.','The plane changed during export. Retry saving.'));return result;}
  async exportNavigationFigure(){
    if(!this.task||!this.frame?.contentWindow)throw new Error(this.text('Neuroglancer ещё не открыт.','Neuroglancer is not open yet.'));
    const taskId=this.task.id||this.task.taskId,epoch=this.epoch,revision=this.revision,started=performance.now();let ready=false,native,synchronized=false;
    const unchanged=()=>{if(this.epoch!==epoch||this.revision!==revision)throw new Error(this.text('Вид изменился во время экспорта. Повторите сохранение.','The view changed during export. Retry saving.'));};
    while(true){
      unchanged();const host=this.frame.contentWindow;native=host.viewer;
      if(native?.display?.canvas?.offsetWidth&&native.display.canvas.offsetHeight&&host.DendriticBridge?.epoch===epoch&&host.DendriticBridge.revision>=revision){
        synchronized=true;
        native.display.resizeCallback();native.display.draw();
        if(native.isReady()){if(ready)break;ready=true;}else ready=false;
      }
      if(performance.now()-started>15000){if(synchronized)break;throw new Error(this.text('Neuroglancer ещё не синхронизирован. Дождитесь загрузки и повторите экспорт.','Neuroglancer is not synchronized yet. Wait and retry exporting.'));}
      await new Promise(resolve=>setTimeout(resolve,80));
    }
    unchanged();assertNativeSources(native.state.toJSON());native.display.draw();const source=native.display.canvas,copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;const ctx=copy.getContext('2d');ctx.drawImage(source,0,0);
    const sceneReady=native.isReady(),readiness={sceneReady,layers:native.layerManager.managedLayers.map(l=>({name:l.name,ready:!!l.isReady()})),panels:[...native.display.panels].filter(p=>p.visible).map(p=>({kind:p.sliceView?'section':'3d',ready:!!p.isReady()}))};
    if(!sceneReady){ctx.fillStyle='#361b0eee';ctx.fillRect(0,copy.height-36,copy.width,36);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(this.text('Навигационный вид · сцена загружена частично · не исходный ЭМ','Navigation figure · scene partially loaded · not native EM evidence'),10,copy.height-13);}
    const blob=await canvasBlob(copy);unchanged();
    const metadata={schemaVersion:'dendritic-navigation-figure.2',taskId,createdAt:new Date().toISOString(),file:'navigation-neuroglancer.png',sha256:await sha256(await blob.arrayBuffer()),dimensions:[copy.width,copy.height],
      rendering:'Neuroglancer native canvas navigation figure; adaptive multiscale images and meshes, not a native-resolution EM evidence panel',
      sceneReady,readiness,loadingNotice:sceneReady?null:'Scene was partially loaded at capture. The image is visibly labeled; missing rendering is not evidence of missing anatomy.',
      language:this.language,view:this.getView(),nativeState:clone(native.state.toJSON()),segments:this.getSegments(),marks:clone(this.overlays),sourceBinding:this.getSourceBinding(),
      identityCaution:'Spatial picks in seg_m1300 do not certify release661 identity or dendritic arbor partitions; meshes do not add EM resolution.'};
    return {metadata,files:[{name:'navigation-neuroglancer.png',blob},{name:'navigation-metadata.json',blob:new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'})}]};
  }
  destroy(){this.controller?.abort();this.channel.close();this.resizeObserver.disconnect();}
}
