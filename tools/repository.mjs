// Uses the authenticated Git credential helper in memory. Never writes credentials.
import {spawnSync} from 'node:child_process';
const slug='microns-dendritic-arbor-review';
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},windowsHide:true});
if(credential.status!==0){console.error('No noninteractive GitHub credential available.');process.exit(2);}
const fields=Object.fromEntries(credential.stdout.split('\n').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
if(!fields.password){console.error('GitHub credential unavailable.');process.exit(2);}
async function request(route,method='GET',body){const res=await fetch('https://api.github.com'+route,{method,headers:{Authorization:'Bearer '+fields.password,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const json=await res.json();if(!res.ok&&res.status!==404)throw new Error(`GitHub ${res.status}: ${json.message||'request failed'}`);return {status:res.status,json};}
const {json:user}=await request('/user');
if(!user.login)throw new Error('Authenticated account could not be verified.');
let found=await request(`/repos/${user.login}/${slug}`);
if(process.argv.includes('--create')&&found.status===404)found=await request('/user/repos','POST',{name:slug,private:true,description:'Source-bound browser anatomy review for Interneuron Dendritic Input Organization',has_issues:true,auto_init:false});
console.log(JSON.stringify({account:user.login,repository:found.status===404?null:found.json.html_url,exists:found.status!==404,private:found.json.private,defaultBranch:found.json.default_branch,permissions:found.json.permissions},null,2));
