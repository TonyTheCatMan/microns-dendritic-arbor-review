import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'));
const src=decodeURIComponent(root),dest=path.join(src,'dist');
fs.mkdirSync(dest,{recursive:true});
for(const name of ['index.html','app.js','app.css','i18n.js','favicon.svg','core','viewer','vendor','data','docs'])fs.cpSync(path.join(src,name),path.join(dest,name),{recursive:true});
fs.writeFileSync(path.join(dest,'.nojekyll'),'');
let bytes=0,files=0,max=0;function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else{const s=fs.statSync(p).size;bytes+=s;files++;max=Math.max(max,s);}}}walk(dest);
console.log(JSON.stringify({staticDirectory:'dist',files,bytes,largestFileBytes:max}));
