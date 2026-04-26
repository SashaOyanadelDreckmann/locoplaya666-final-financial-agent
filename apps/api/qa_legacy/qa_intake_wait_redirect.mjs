import { chromium } from 'playwright';

const email=`qa.agent1.wait.${Date.now()}@example.com`;
const password='QAtest!23456';
const browser=await chromium.launch({headless:true});
const page=await (await browser.newContext()).newPage();
const events=[];
page.on('response', async r=>{ if(/intake\/submit|agent|conversation|diagnosis/i.test(r.url())) events.push({url:r.url(),status:r.status(),method:r.request().method()});});

await page.goto('http://localhost:3000/register',{waitUntil:'networkidle'});
await page.waitForTimeout(900);
await page.locator('input[placeholder*="llame" i]').first().type('QA Agent',{delay:10});
await page.locator('input[type="email"]').first().type(email,{delay:10});
await page.locator('input[type="password"]').first().type(password,{delay:10});
await page.locator('button',{hasText:'Continuar'}).click();
await page.waitForTimeout(1500);

for(let step=1;step<=6;step++){
  const chips=page.locator('button.intake-chip');
  const cc=await chips.count();
  if(cc>0){ await chips.nth(0).click().catch(()=>{}); if(cc>2) await chips.nth(2).click().catch(()=>{}); }
  const fields=page.locator('input[type="text"],input[type="number"],textarea');
  const fc=await fields.count();
  for(let i=0;i<fc;i++){ const f=fields.nth(i); const t=await f.getAttribute('type'); const v=await f.inputValue().catch(()=> ''); if(!v) await f.fill(t==='number'?'1200000':`QA ${i+1}`).catch(()=>{}); }
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.waitForTimeout(200);
  if(await page.locator('button.intake-submit-btn').count()){ await page.locator('button.intake-submit-btn').click().catch(()=>{}); break; }
  if(await page.locator('button.intake-next-btn').count()) await page.locator('button.intake-next-btn').click().catch(()=>{});
  await page.waitForTimeout(900);
}

const checkpoints=[];
for (const sec of [2,5,10,20]) {
  await page.waitForTimeout(sec*1000);
  checkpoints.push({afterSec:sec,url:page.url(),text:(await page.locator('body').innerText()).slice(-120)});
}
console.log(JSON.stringify({email,events,checkpoints},null,2));
await browser.close();
