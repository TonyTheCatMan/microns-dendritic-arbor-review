// Explicit maintenance commands for this existing repository. Credentials stay
// in the Git credential helper and this process's memory; never files or logs.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
const repository='TonyTheCatMan/microns-dendritic-arbor-review';
const publicUrl='https://tonythecatman.github.io/microns-dendritic-arbor-review/';
const args=new Set(process.argv.slice(2));
const supported=new Set(['--audit','--status','--dispatch','--check-public','--publish-public']);
for(const arg of args)if(!supported.has(arg))throw new Error('Unsupported command. Use --publish-public only with explicit authorization to publish this repository.');
function git(argv,{input,encoding='utf8'}={}){
  const result=spawnSync('git',argv,{input,encoding,maxBuffer:100*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
  if(result.status!==0)throw new Error('Git command failed: '+argv[0]);return result.stdout;
}
function audit(){
  const binaryAsset=path=>/\.(?:bin(?:\.gz)?|wasm|png|jpe?g|woff2?)$/i.test(path);
  const commits=git(['rev-list','--all']).trim().split('\n').filter(Boolean),objects=new Map(),paths=new Set(),findings=[];
  for(const commit of commits)for(const line of git(['ls-tree','-r','-z',commit]).split('\0').filter(Boolean)){
    const match=line.match(/^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/);if(!match)continue;
    objects.set(match[1],match[2]);paths.add(match[2]);
  }
  const patterns=[[/\bgh[pousr]_[a-zA-Z0-9]{20,}\b/,'GitHub token'],[/\bgithub_pat_[a-zA-Z0-9_]{30,}\b/,'GitHub token'],[/\bAKIA[A-Z0-9]{16}\b/,'AWS access key'],[/\bxox[baprs]-[a-zA-Z0-9-]{20,}\b/,'Slack token'],[/\bsk-(?:proj-)?[a-zA-Z0-9_-]{30,}\b/,'API secret'],[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,'private key'],[/[?&]X-Amz-(?:Credential|Signature)=[a-zA-Z0-9%/]{20,}/i,'signed source URL']];
  const inspect=(text,path)=>{for(const [pattern,kind] of patterns)if(pattern.test(text))findings.push({path,kind});};
  // Native image and mesh assets have source/hash validation, not UTF-8 text.
  // Keep credential scans bounded as the public prepared-data inventory grows.
  const objectList=[...objects.keys()].filter(id=>!binaryAsset(objects.get(id)));
  for(let offset=0;offset<objectList.length;offset+=16){
  const group=objectList.slice(offset,offset+16),batch=git(['cat-file','--batch'],{input:group.join('\n')+'\n',encoding:null});let cursor=0;
  for(const object of group){
    const end=batch.indexOf(10,cursor),header=batch.subarray(cursor,end).toString(),length=Number(header.split(' ')[2]);
    if(!Number.isInteger(length))throw new Error('Invalid Git object audit response');
    inspect(batch.subarray(end+1,end+1+length).toString('utf8'),objects.get(object));cursor=end+1+length+1;
  }
  }
  const tracked=git(['ls-files','-z']).split('\0').filter(Boolean);
  for(const path of tracked){paths.add(path);if(existsSync(path)&&!binaryAsset(path))inspect(readFileSync(path,'utf8'),path);}
  for(const path of paths)if(/(^|\/)(?:\.env(?:\.|$)|\.local\/|review-exports\/|node_modules\/)|\.(?:p12|pfx|pem|key|zip)$/i.test(path))findings.push({path,kind:'private or generated artifact path'});
  const blank=JSON.parse(readFileSync('data/decisions-blank-v2.json','utf8'));
  const rows=blank.tasks||blank.decisions||[];
  if(JSON.stringify(rows).includes('"reviewed"'))findings.push({path:'data/decisions-blank-v2.json',kind:'reviewed decision in blank template'});
  const report={commits:commits.length,uniqueHistoricalBlobs:objects.size,trackedFiles:tracked.length,findings:[...new Map(findings.map(f=>[f.path+':'+f.kind,f])).values()]};
  console.log(JSON.stringify({audit:report},null,2));if(report.findings.length)throw new Error('Publication content audit needs resolution');return report;
}
async function checkPublic(){
  const repositoryResponse=await fetch('https://api.github.com/repos/'+repository,{headers:{Accept:'application/vnd.github+json'}});
  if(repositoryResponse.status!==200)throw new Error('Expected public repository to be available anonymously; HTTP '+repositoryResponse.status);
  const repositoryMetadata=await repositoryResponse.json();
  if(repositoryMetadata.private!==false||repositoryMetadata.full_name!==repository)throw new Error('Unexpected public repository metadata');
  const paths=['','app.js','app.css','data/catalog.json','viewer/ReviewViewer.js','viewer/LegacySurface.js','viewer/familiar-shell.js','viewer/native-surface-adapter.js','reference-ui/viewer.css','reference-viewer/surface3d.js','vendor/neuroglancer/bridge-v2.js','vendor/neuroglancer/index.html','vendor/neuroglancer/main.e9945dcc2df22b9e.js','vendor/neuroglancer/09f21dcf7b4f13e8.wasm'],results=[];
  paths.push('viewer/asset-cache.js','viewer/cutout-camera.js','viewer/raw-source.js','viewer/prepared-source.js','viewer/starter-meshes.js','data/prepared-em/manifest.json','data/starter-meshes/manifest.json');
  const prepared=JSON.parse(readFileSync('data/prepared-em/manifest.json','utf8')),starter=prepared.volumes.flatMap(v=>v.planes).find(p=>p.taskIds.includes('MC298937.soma_identity'));
  paths.push('data/prepared-em/'+starter.file,...starter.warmVolumeIds.map(id=>'data/prepared-em/'+prepared.volumes.find(v=>v.id===id).file));
  const meshes=JSON.parse(readFileSync('data/starter-meshes/manifest.json','utf8'));
  paths.push(...Object.values(meshes.recipients).map(entry=>'data/starter-meshes/'+entry.file));
  for(const path of paths){
    const response=await fetch(new URL(path,publicUrl)),body=new Uint8Array(await response.arrayBuffer());
    results.push({path:path||'index.html',status:response.status,bytes:body.length});
    if(!response.ok||!body.length)throw new Error('Public asset unavailable: '+(path||'index.html'));
    if(!readFileSync(path||'index.html').equals(Buffer.from(body)))throw new Error('Public asset differs from the current checkout: '+(path||'index.html'));
    if(path===''){const html=new TextDecoder().decode(body);if(!html.includes('emCanvas')||!html.includes('app.js'))throw new Error('Unexpected public entry page');}
    if(path==='data/catalog.json'){const catalog=JSON.parse(new TextDecoder().decode(body));if(catalog.tasks.length!==50)throw new Error('Unexpected public catalog');}
  }
  console.log(JSON.stringify({repository:'https://github.com/'+repository,anonymousRepositoryHttpStatus:repositoryResponse.status,publicUrl,unauthenticatedAssets:results},null,2));
}

if(args.has('--audit')||args.has('--publish-public'))audit();
if(args.has('--check-public'))await checkPublic();
if(args.has('--status')||args.has('--dispatch')||args.has('--publish-public')){
  const origin=git(['remote','get-url','origin']).trim().replace(/\.git$/,'');
  if(origin!=='https://github.com/'+repository)throw new Error('Unexpected origin; refusing repository administration');
  const credential=git(['credential','fill'],{input:'protocol=https\nhost=github.com\n\n'});
  const fields=Object.fromEntries(credential.split('\n').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1).trim()]));
  if(!fields.password)throw new Error('Noninteractive GitHub credential unavailable');
  async function request(route,method='GET',body){
    const response=await fetch('https://api.github.com'+route,{method,headers:{Authorization:'Bearer '+fields.password,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const text=await response.text(),json=text?JSON.parse(text):null;
    if(!response.ok&&response.status!==404)throw new Error(`GitHub ${response.status}: ${json?.message||'request failed'}`);
    return {status:response.status,json};
  }
  const route='/repos/'+repository;let repo=await request(route);
  if(repo.status===404||!repo.json.permissions?.admin)throw new Error('Existing repository administrator access required');
  if(repo.json.full_name!==repository||repo.json.id!==1411697205)throw new Error('Unexpected repository identity');
  if(args.has('--publish-public')){
    // The user explicitly authorized public source and Pages hosting on 2026-10-09.
    if(repo.json.private)repo=await request(route,'PATCH',{private:false});
    if(repo.json.private!==false)throw new Error('Public visibility was not confirmed');
    const currentPages=await request(route+'/pages');
    const enabled=currentPages.status===404
      ?await request(route+'/pages','POST',{build_type:'workflow'})
      :currentPages.json.build_type!=='workflow'
        ?await request(route+'/pages','PUT',{build_type:'workflow'})
        :currentPages;
    if(enabled.status===404)throw new Error('Pages enablement failed');
  }
  if(args.has('--dispatch')){
    if(repo.json.private!==false)throw new Error('Public deployment requires the explicitly authorized public repository.');
    const currentPages=await request(route+'/pages');
    if(currentPages.status===404)throw new Error('GitHub Pages is unavailable. Enable the authorized public deployment first.');
    await request(route+'/actions/workflows/pages.yml/dispatches','POST',{ref:'main'});
  }
  const [pages,runs]=await Promise.all([request(route+'/pages'),request(route+'/actions/workflows/pages.yml/runs?per_page=3')]);
  console.log(JSON.stringify({repository:repo.json.html_url,private:repo.json.private,pages:pages.status===404?{httpStatus:404,message:pages.json.message}:{url:pages.json.html_url,status:pages.json.status,buildType:pages.json.build_type,public:pages.json.public},runs:(runs.json?.workflow_runs||[]).map(run=>({id:run.id,sha:run.head_sha,status:run.status,conclusion:run.conclusion,url:run.html_url}))},null,2));
}
if(!args.size)console.log('Use --audit, --status, --dispatch, or --check-public. --publish-public makes this repository public and enables Pages; explicit user authorization is required.');
