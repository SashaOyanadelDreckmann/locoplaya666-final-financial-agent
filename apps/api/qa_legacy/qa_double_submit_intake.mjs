import { chromium } from 'playwright';

const email=`qa.agent1.double.${Date.now()}@example.com`;
const password='QAtest!23456';
const browser=await chromium.launch({headless:true});
const page=await (await browser.newContext()).newPage();
const submitEvents=[];
page.on('request', r=>{ if(r.url().includes('/intake/submit')) submitEvents.push({t:'req',url:r.url(),method:r.method(),ts:Date.now()}); });
page.on('response', r=>{ if(r.url().includes('/intake/submit')) submitEvents.push({t:'res',url:r.url(),status:r.status(),ts:Date.now()}); });

await page.goto('http://localhost:3000/register',{waitUntil:'networkidle'});
await page.waitForTimeout(800);
await page.locator('input[placeholder*="llame" i]').first().type('QA Agent',{delay:10});
await page.locator('input[type="email"]').first().type(email,{delay:10});
await page.locator('input[type="password"]').first().type(password,{delay:10});
await page.locator('button',{hasText:'Continuar'}).click();
await page.waitForTimeout(1300);

for(let s=0;s<6;s++){
  const chips=page.locator('button.intake-chip');
  if(await chips.count()) { await chips.nth(0).click().catch(()=>{}); if((await chips.count())>1) await chips.nth(1).click().catch(()=>{}); }
  const fields=page.locator('input[type="text"],input[type="number"],textarea');
  for(let i=0;i<await fields.count();i++){ const f=fields.nth(i); const t=await f.getAttribute('type'); const v=await f.inputValue().catch(()=> ''); if(!v) await f.fill(t==='number'?'900000':'QA').catch(()=>{}); }
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.waitForTimeout(150);
  if(await page.locator('button.intake-submit-btn').count()) break;
  if(await page.locator('button.intake-next-btn').count()) await page.locator('button.intake-next-btn').click().catch(()=>{});
  await page.waitForTimeout(900);
}

const submitBtn=page.locator('button.intake-submit-btn').first();
await submitBtn.click().catch(()=>{});
await page.waitForTimeout(5500);
if(await submitBtn.count()){
  // If button reappears before redirect, click again.
  await submitBtn.click().catch(()=>{});
}
await page.waitForTimeout(8000);
console.log(JSON.stringify({email,finalUrl:page.url(),submitEvents},null,2));
await browser.close();
