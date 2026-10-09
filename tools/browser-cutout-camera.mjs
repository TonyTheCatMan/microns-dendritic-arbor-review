import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const origin=process.env.REVIEW_URL||'http://127.0.0.1:8874/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1800,height:1300}}),page=await context.newPage(),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const check=(label,data={})=>{checks.push({label,passed:true,...data});console.log('PASS '+label);};
const ready=async()=>{await page.waitForFunction(()=>window.ReviewApp?.viewer.plane?.complete&&ReviewApp.viewer.surface.modelReady,undefined,{timeout:90000});await page.evaluate(()=>ReviewApp.viewer.defaultStructuresPromise);};
const save=()=>page.evaluate(()=>ReviewApp.saveAll());
const camera=()=>page.evaluate(()=>{const v=ReviewApp.viewer,s=v.surface,p=v.plane,c=s.getNavigationState();return {...c,globalCenterNm:c.center_nm.map((n,i)=>n+s.originNm[i]),cutoutCenterNm:p.begin.map((n,i)=>i===p.axes[2]?p.depthNm:(n+p.end[i])/2*[8,8,40][i]),opacity:s.alpha,presetVersion:v.view.surfaceCamera?.presetVersion};});
const near=(a,b,label)=>{assert.equal(a.length,b.length);a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-6,label+' '+i+': '+n+' vs '+b[i]));};
const sameCamera=(actual,expected)=>{near(actual.globalCenterNm,expected.globalCenterNm,'camera center');near(actual.right,expected.right,'camera right');near(actual.up,expected.up,'camera up');assert.ok(Math.abs(actual.physical_height_nm-expected.physical_height_nm)<1e-6);};
try{
  await page.goto(origin);await ready();let c=await camera();near(c.globalCenterNm,c.cutoutCenterNm,'initial cutout');assert.equal(c.opacity,.5);assert.ok(c.physical_height_nm<10000);check('fresh 3D view centers on the cutout at 50% opacity',{heightNm:c.physical_height_nm});
  const transparency=await page.evaluate(()=>{
    const s=ReviewApp.viewer.surface,gl=s.gl,width=s.canvas.width,height=s.canvas.height,original=s.alpha,frames=[];
    try{for(const alpha of [0,.5,1]){s.alpha=alpha;s.draw();const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);frames.push(pixels);}}
    finally{s.alpha=original;s.draw();}
    const [empty,half,solid]=frames,changed=new Uint8Array(width*height);let interior=0,withinTwo=0,maxError=0,totalError=0;
    for(let p=0;p<changed.length;p++)changed[p]=Math.max(...[0,1,2].map(c=>Math.abs(solid[p*4+c]-empty[p*4+c])))>=30?1:0;
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const p=y*width+x;if(![p,p-1,p+1,p-width,p+width].every(i=>changed[i]))continue;interior++;
      const error=Math.max(...[0,1,2].map(c=>Math.abs(half[p*4+c]-(solid[p*4+c]+empty[p*4+c])/2)));
      if(error<=2)withinTwo++;maxError=Math.max(maxError,error);totalError+=error;
    }
    return {interiorPixels:interior,midpointWithinTwoFraction:withinTwo/interior,meanChannelError:totalError/interior,maxChannelError:maxError,glError:gl.getError()};
  });assert.ok(transparency.interiorPixels>500);assert.equal(transparency.glError,0);assert.ok(transparency.midpointWithinTwoFraction>.98,JSON.stringify(transparency));check('50% opacity blends nearest neuron surfaces halfway against their background',transparency);
  await page.evaluate(async()=>{const v=ReviewApp.viewer,centerNm=v.view.centerNm.map((n,i)=>n+[16,8,40][i]);await v.setView({centerNm});});await ready();await page.locator('#surfaceReset').click();c=await camera();near(c.globalCenterNm,c.cutoutCenterNm,'changed cutout');check('Reset centers on the current sampled cutout after navigation');
  await page.locator('#surfaceXY').click();c=await camera();near(c.globalCenterNm,c.cutoutCenterNm,'match 2D cutout');assert.ok(c.physical_height_nm<10000);check('Match 2D remains close to the current cutout');
  for(const plane of ['xz','yz']){
    await page.evaluate(plane=>ReviewApp.viewer.setView({plane,spanNm:1024}),plane);await ready();await page.locator('#surfaceXY').click();c=await camera();near(c.globalCenterNm,c.cutoutCenterNm,plane+' cutout');
    near(c.right,plane==='xz'?[1,0,0]:[0,1,0],plane+' horizontal axis');near(c.up,[0,0,-1],plane+' vertical axis');assert.ok(c.physical_height_nm<4000);check('Match 2D uses the sampled '+plane.toUpperCase()+' cutout and orientation');
  }
  await page.evaluate(()=>ReviewApp.viewer.setView({plane:'xy',spanNm:4096}));await ready();
  await page.locator('#surfaceOverview').click();const overview=await camera();assert.ok(overview.physical_height_nm>10000);assert.equal(overview.presetVersion,1);await save();await page.reload();await ready();sameCamera(await camera(),overview);check('explicit Whole neuron overview survives reload');
  await page.locator('#surfaceOpacity').evaluate(element=>{element.value='37';element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});await save();await page.reload();await ready();assert.equal((await camera()).opacity,.37);assert.equal(await page.locator('#surfaceOpacity').inputValue(),'37');check('reviewer opacity choice survives reload');
  await page.evaluate(async()=>{const v=ReviewApp.viewer;v.surface.showOverview();const old={...v.surface.getNavigationState(),originNm:[...v.surface.originNm]};delete old.presetVersion;v.view.surfaceCamera=old;v.onViewChange(v.getView());await ReviewApp.saveAll();});await page.reload();await ready();c=await camera();near(c.globalCenterNm,c.cutoutCenterNm,'migrated default');assert.ok(c.physical_height_nm<10000);assert.equal(c.presetVersion,1);check('exact legacy automatic overview upgrades to the cutout view');
  await page.evaluate(async()=>{
    const v=ReviewApp.viewer,s=v.surface;s.showOverview();const old=s.getNavigationState(),angle=.3,rotate=p=>[p[0]*Math.cos(angle)-p[1]*Math.sin(angle),p[0]*Math.sin(angle)+p[1]*Math.cos(angle),p[2]];
    s.applyNavigationState({...old,right:rotate(old.right),up:rotate(old.up),eye_direction:rotate(old.eye_direction)});
    v.view.surfaceCamera={...s.getNavigationState(),originNm:[...s.originNm]};v.onViewChange(v.getView());await ReviewApp.saveAll();
  });const custom=await camera();assert.equal(custom.yaw,-.65);assert.equal(custom.pitch,.4);await page.reload();await ready();sameCamera(await camera(),custom);check('legacy basis rotation is preserved even when yaw and pitch retain old defaults');
  assert.deepEqual(errors,[]);check('no uncaught browser errors');
}catch(error){console.error(error);process.exitCode=1;errors.push(error.message);}
finally{await browser.close();await fs.writeFile('docs/cutout-camera-browser-witness.json',JSON.stringify({checkedAt:new Date().toISOString(),url:origin,screenshotsTaken:0,checks,errors},null,2));}
