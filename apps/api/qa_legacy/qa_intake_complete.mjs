import { chromium } from 'playwright';
import fs from 'fs';

const email=`qa.agent1.complete.${Date.now()}@example.com`;
const password='QAtest!23456';
const out='/tmp/qa-agent1-complete'; fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await (await browser.newContext()).newPage();
const bad=[];const fails=[];const reqs=[];const cons=[];
page.on('response', async r=>{ if(r.status()>=400){let b='';try{b=(await r.text()).slice(0,220)}catch{} bad.push({url:r.url(),status:r.status(),method:r.request().method(),body:b}); }});
page.on('requestfailed', r=>fails.push({url:r.url(),method:r.method(),failure:r.failure()?.errorText||'unknown'}));
page.on('request', r=>{ if(/intake|profile|onboard|agent|conversation|auth/i.test(r.url())) reqs.push({url:r.url(),method:r.method()}); });
page.on('console', m=>cons.push({type:m.type(),text:m.text()}));

await page.goto('http://localhost:3000/register',{waitUntil:'networkidle'});
await page.waitForTimeout(1000);
await page.locator('input[placeholder*="llame" i]').first().type('QA Agent',{delay:15});
await page.locator('input[type="email"]').first().type(email,{delay:15});
await page.locator('input[type="password"]').first().type(password,{delay:15});
await page.locator('button',{hasText:'Continuar'}).click();
await page.waitForTimeout(1800);

for(let step=1;step<=5;step++){
  const chips=page.locator('button.intake-chip');
  const cc=await chips.count();
  if(cc>0){ await chips.nth(0).click().catch(()=>{}); if(cc>2) await chips.nth(2).click().catch(()=>{}); }

  const fields=page.locator('input[type="text"],input[type="number"],textarea');
  const fc=await fields.count();
  for(let i=0;i<fc;i++){
    const f=fields.nth(i);
    const t=await f.getAttribute('type');
    const v=await f.inputValue().catch(()=> '');
    if(!v) await f.fill(t==='number'? String(1200000+i*100000): `QA ${i+1}`).catch(()=>{});
  }

  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.waitForTimeout(200);
  const submit=page.locator('button.intake-submit-btn').first();
  if(await submit.count()){
    await submit.click().catch(()=>{});
    break;
  }
  const next=page.locator('button.intake-next-btn').first();
  if(await next.count()) await next.click().catch(()=>{});
  await page.waitForTimeout(1000);
}

await page.waitForTimeout(3500);
const finalUrl=page.url();
const body=(await page.locator('body').innerText()).slice(0,1200);
await page.screenshot({path:`${out}/final.png`,fullPage:true});
console.log(JSON.stringify({email,finalUrl,bad,fails,cons:reqs.slice(-12),bodyPreview:body},null,2));
await browser.close();
