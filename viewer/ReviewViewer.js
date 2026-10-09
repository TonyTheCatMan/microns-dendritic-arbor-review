import {RESOLUTION_NM,PLANES,EM_URL,normalizeView,normalizeSegments,ngToNm,pixelToNm} from './coordinates.js';
import {RawSource,ChunkCache,sha256} from './raw-source.js';
import {makeNgState,mergeNativeSegments,orthogonalPlane,assertNativeSources} from './neuroglancer-state.js';
import {visibleMarks,scaleBar,exportFigure,canvasBlob} from './figure.js';

const clone=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
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
  getView(){return clone(this.view);}
  getSegments(){return clone(this.segments);}
  getSourceBinding(){return {source:EM_URL,scale:this.source.scale?.key||'8_8_40',resolutionNm:[...RESOLUTION_NM],infoSha256:this.source.infoHash,convention:'integer-sampling-no-half-voxel'};}
  async setTask(task,view,segments=[]) {
    this.task=task;this.epoch=crypto.randomUUID();this.view=normalizeView(view||{},task.anchorNm);this.segments=normalizeSegments(segments);this.overlays=[];this.plane=null;
    this.onViewChange(this.getView());this.publish(true);return this.load();
  }
  async setView(view) {
    const ngState={...(view.ngState||this.view.ngState||{})};
    if(view.plane&&view.plane!==this.view.plane)delete ngState.crossSectionOrientation;
    if(view.spanNm!==undefined&&view.spanNm!==this.view.spanNm)delete ngState.crossSectionScale;
    this.view=normalizeView({...this.view,...view,ngState,nativeOblique:view.plane&&view.plane!==this.view.plane?false:!!this.view.nativeOblique},this.task?.anchorNm);this.onViewChange(this.getView());this.publish();return this.load();
  }
  updateSegments(segments) {this.segments=normalizeSegments(segments);this.publish();return this.getSegments();}
  setOverlays(marks=[]) {this.overlays=clone(marks);this.draw();this.publish();}
  async retry(){return this.load();}
  async clearCache(){await this.source.cache.clear();this.source.indexes.clear();this.say(this.text('Кэш изображений очищен. Сохранённые заметки не изменены.','Image cache cleared. Saved notes are unchanged.'),'ready');}
  async load() {
    if(!this.task)return;this.controller?.abort();this.controller=new AbortController();const {signal}=this.controller,sequence=++this.sequence;
    this.plane=null;this.lastLoadError=null;this.draw();this.say(this.text('Загрузка исходного ЭМ · 8 × 8 × 40 нм…','Loading native EM · 8 × 8 × 40 nm…'));
    try {
      const plane=await this.source.plane(this.view,{signal,onProgress:p=>{if(sequence!==this.sequence)return;this.plane=p;this.makeRaster(p);this.draw();this.say(this.text(`ЭМ: ${p.loaded} / ${p.total} блоков · ${(p.elapsedMs/1000).toFixed(1)} с`,`EM: ${p.loaded} / ${p.total} chunks · ${(p.elapsedMs/1000).toFixed(1)} s`));}});
      if(sequence!==this.sequence)return;this.plane=plane;this.makeRaster(plane);this.draw();
      if(!plane.complete)this.say(this.text(`Неполное покрытие: ${plane.failures.length} блоков не загружено. Повторите загрузку.`,`Incomplete coverage: ${plane.failures.length} chunks failed. Retry imagery.`)+' '+plane.failures[0]?.error,'error');
      else this.say(this.text(`Исходный ЭМ · ${plane.width} × ${plane.height} пикселей · ${(plane.elapsedMs/1000).toFixed(1)} с`,`Native EM · ${plane.width} × ${plane.height} pixels · ${(plane.elapsedMs/1000).toFixed(1)} s`),'ready');
      return plane;
    }catch(error){if(sequence!==this.sequence||signal.aborted)return;this.lastLoadError=error.message;this.say(this.text('Ошибка ЭМ: ','EM error: ')+error.message,'error');this.draw();return null;}
  }
  makeRaster(plane) {
    this.partialCanvas.width=this.rawCanvas.width=plane.width;this.partialCanvas.height=this.rawCanvas.height=plane.height;
    const image=new ImageData(plane.width,plane.height),raw=new ImageData(plane.width,plane.height);
    for(let i=0;i<plane.pixels.length;i++){const p=plane.pixels[i],masked=plane.coverage[i]?p:(((i%plane.width>>3)+(Math.floor(i/plane.width)>>3))%2?58:37);for(let c=0;c<3;c++){image.data[i*4+c]=masked;raw.data[i*4+c]=p;}image.data[i*4+3]=raw.data[i*4+3]=255;}
    this.partialCanvas.getContext('2d').putImageData(image,0,0);this.rawCanvas.getContext('2d').putImageData(raw,0,0);
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
  }
  canvasPoint(event){const rect=this.canvas.getBoundingClientRect(),r=this.drawRect;if(!r||!this.plane)return null;const x=(event.clientX-rect.left-r.x)/r.w*this.plane.width,y=(event.clientY-rect.top-r.y)/r.h*this.plane.height;if(x<0||y<0||x>=this.plane.width||y>=this.plane.height)return null;return {x,y};}
  installControls() {
    this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY,center:[...this.view.centerNm],moved:false};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{if(!this.drag||this.interactionMode!=='navigate')return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.moved=Math.hypot(dx,dy)>3;this.dragPreview=[dx,dy];this.draw();});
    this.canvas.addEventListener('pointerup',e=>{
      const drag=this.drag;this.drag=null;if(!drag)return;const point=this.canvasPoint(e),r=this.drawRect;this.dragPreview=null;
      if(this.interactionMode==='navigate'&&drag.moved&&r&&this.plane){const p=this.plane,next=[...drag.center];next[p.axes[0]]-=(e.clientX-drag.x)/r.w*p.physicalSizeNm[0];next[p.axes[1]]-=(e.clientY-drag.y)/r.h*p.physicalSizeNm[1];this.setView({centerNm:next});}
      else if(this.interactionMode!=='navigate'&&point){const i=Math.floor(point.y)*this.plane.width+Math.floor(point.x);if(!this.plane.coverage[i]){this.say(this.text('Эта часть среза ещё не загружена.','This part of the plane has not loaded yet.'),'error');return;}this.onPoint({pointNm:pixelToNm(this.plane,point.x,point.y),plane:this.view.plane,sourceBinding:this.getSourceBinding(),taskId:this.task.id||this.task.taskId});}
      this.draw();
    });
    this.canvas.addEventListener('pointercancel',()=>{this.drag=null;this.dragPreview=null;this.draw();});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){const centerNm=[...this.view.centerNm],axis=PLANES[this.view.plane][2];centerNm[axis]+=Math.sign(e.deltaY)*RESOLUTION_NM[axis];this.setView({centerNm});}else this.setView({spanNm:this.view.spanNm*(e.deltaY>0?1.25:0.8)});},{passive:false});
  }
  state(){return makeNgState(this.task||{},this.view,this.segments,this.overlays,this.language);}
  publish(ensure=false){if(!this.task)return;const message={protocol:'dendritic-view-v2',peer:this.peer,type:'host',taskId:this.task.id||this.task.taskId,epoch:this.epoch,revision:++this.revision,state:this.state()};this.latest=message;
    if(ensure&&this.frame&&!this.frame.hasAttribute('src'))this.frame.src=this.nativeUrl();this.channel.postMessage(message);}
  nativeUrl(){const url=new URL('../vendor/neuroglancer/',import.meta.url);url.searchParams.set('session',this.session);url.searchParams.set('task',this.task.id||this.task.taskId);url.searchParams.set('epoch',this.epoch);url.hash='!'+encodeURIComponent(JSON.stringify(this.state()));return url.href;}
  receive(m){
    if(m?.protocol!=='dendritic-view-v2'||m.peer===this.peer)return;if(m.type==='hello'){this.publish();return;}
    if(m.epoch!==this.epoch||m.taskId!==(this.task?.id||this.task?.taskId))return;
    if(m.type==='save'){this.onSave();window.dispatchEvent(new CustomEvent('dendritic:save'));return;}
    if(m.type==='error'){this.say('Neuroglancer: '+m.message,'error');return;}
    if(m.type!=='native'||m.hostRevision!==this.revision)return;
    const state=m.state;try{assertNativeSources(state);}catch(error){this.say(this.text('Источник или шкала Neuroglancer изменены. Откройте задачу заново. ','Neuroglancer source or coordinate scale changed. Reopen the task. ')+error.message,'error');return;}
    const segments=mergeNativeSegments(this.segments,state);if(!same(segments,this.segments)){this.segments=segments;this.onSegmentsChange(this.getSegments());}
    const ngState=Object.fromEntries(['projectionOrientation','projectionScale','projectionDepth','crossSectionDepth','crossSectionOrientation','crossSectionScale'].filter(k=>state[k]!==undefined).map(k=>[k,state[k]]));
    const previous=this.view,centerNm=Array.isArray(state.position)?ngToNm(state.position):previous.centerNm,plane=orthogonalPlane(state.crossSectionOrientation),spanNm=Number.isFinite(state.crossSectionScale)&&state.crossSectionScale>0?state.crossSectionScale*4096:previous.spanNm;
    this.view=normalizeView({...previous,centerNm,spanNm,plane:plane||previous.plane,nativeOblique:!plane,ngState});
    const changed=!same(centerNm,previous.centerNm)||this.view.spanNm!==previous.spanNm||this.view.plane!==previous.plane;this.onViewChange(this.getView());
    // Return an authoritative snapshot to both the embedded and detached peers.
    this.publish();if(changed)this.load();else if(!plane)this.say(this.text('Косой вид в Neuroglancer; исходный 2D-срез остаётся ортогональным.','Oblique Neuroglancer view; native 2D evidence remains orthogonal.'),'ready');
  }
  detach(){if(!this.task)return null;this.publish();return window.open(this.nativeUrl(),'dendritic-'+this.session);}
  async exportPlane(){const sequence=this.sequence;const result=await exportFigure({task:this.task,view:this.view,plane:this.plane,rawCanvas:this.rawCanvas,marks:this.overlays,segments:this.segments,language:this.language});if(sequence!==this.sequence)throw new Error(this.text('Срез изменился во время экспорта. Повторите сохранение.','The plane changed during export. Retry saving.'));return result;}
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
