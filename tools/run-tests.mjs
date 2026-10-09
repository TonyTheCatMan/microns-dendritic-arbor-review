import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=fs.readdirSync(new URL('../tests/',import.meta.url)).filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
process.exit(result.status??1);
