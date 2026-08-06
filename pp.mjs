import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:8099', { waitUntil: 'load' });
await page.waitForTimeout(2200);
async function shotSec(id,q,name){ const info=await page.evaluate(id=>{const s=document.getElementById(id);return{top:s.offsetTop,h:s.offsetHeight,ih:window.innerHeight};},id); const y=Math.round(info.top+(info.h-info.ih)*q); await page.evaluate(yy=>window.scrollTo(0,yy),y); await page.waitForTimeout(1400); await page.screenshot({path:`/home/claude/${name}.png`}); }
await shotSec('works',0.5,'g_works');
await shotSec('lab',0.5,'g_lab');
await browser.close(); console.log('done');
