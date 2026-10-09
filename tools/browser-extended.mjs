import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050}}),page=await context.newPage(),checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
try{
 await page.route('https://bossdb-open-data.s3.amazonaws.com/**',r=>r.abort());
 await page.goto('http://127.0.0.1:8874');await page.waitForFunction(()=>window.ReviewApp);
 const ids=await page.evaluate(()=>ReviewApp.catalog.tasks.map(t=>t.id));
 for(const id of ids){await page.evaluate(id=>ReviewApp.switchTask(id),id);assert.equal(await page.evaluate(()=>ReviewApp.current.id),id);assert.equal(await page.locator('#decisionStatus').inputValue(),'unreviewed');assert.equal(new URL(page.url()).searchParams.get('task'),id);}
 pass('all 50 direct task bindings, blank decisions and navigation remain usable with imagery unavailable');
 await page.evaluate(()=>ReviewApp.switchTask('MC298937.soma_identity'));
 await page.locator('#importFile').setInputFiles('.local/selected-evidence.zip');await page.locator('#applyImport').waitFor();await page.locator('#applyImport').click();await page.locator('#exchangeDialog').waitFor({state:'hidden'});await page.reload();await page.waitForFunction(()=>window.ReviewApp);
 assert.equal(await page.locator('[data-item]').count(),1);await page.locator('#importedPanels').click();assert.equal(await page.locator('#exchangeContent img').count(),1);await page.waitForFunction(()=>[...document.querySelectorAll('#exchangeContent img')].every(i=>i.complete&&i.naturalWidth>0));await page.locator('#closeExchange').click();pass('selected mark and self-contained annotated panel import and reload without imagery network');
 await page.locator('[data-item] input[type=checkbox]').check();await page.locator('#selectedExport').click();const dl=page.waitForEvent('download');await page.locator('#downloadExport').click();await(await dl).saveAs('.local/reexport-selected.zip');await page.locator('#closeExchange').click();pass('imported regional evidence can be exported again');
 const bytes=await fs.readFile('.local/reexport-selected.zip');const check=await page.evaluate(async data=>{const {parseImport}=await import('./core/exchange.js');const p=await parseImport(new Blob([new Uint8Array(data)]),ReviewApp.catalog);return{evidence:p.manifest.evidence.length,marks:p.tasks[0].marks.length};},[...bytes]);assert.equal(check.evidence,4);assert.equal(check.marks,1);pass('re-export preserves all four mark-linked native evidence files');
 await fs.writeFile('docs/browser-extended-results.json',JSON.stringify({testedAt:new Date().toISOString(),checks,anatomicalReview:false},null,2));
}finally{await browser.close();}
