import { chromium } from 'playwright';

const email = `qa.agent1.nn.${Date.now()}@example.com`;
const password='QAtest!23456';
const browser=await chromium.launch({headless:true});
const page=await (await browser.newContext()).newPage();
await page.goto('http://localhost:3000/register',{waitUntil:'networkidle'});
await page.waitForTimeout(900);
await page.locator('input[placeholder*="llame" i]').first().type('QA Agent',{delay:20});
await page.locator('input[type="email"]').first().type(email,{delay:20});
await page.locator('input[type="password"]').first().type(password,{delay:20});
await page.locator('button', {hasText:'Continuar'}).click();
await page.waitForTimeout(1600);

for (let i=1;i<=6;i++) {
  // click first 2 chips each step
  const chips=page.locator('button.intake-chip');
  const cc=await chips.count();
  if (cc>0) {
    await chips.nth(0).click().catch(()=>{});
    if (cc>2) await chips.nth(Math.min(2,cc-1)).click().catch(()=>{});
  }

  const txt=page.locator('input[type="text"],input[type="number"],textarea');
  const tc=await txt.count();
  for(let j=0;j<tc;j++){
    const v=await txt.nth(j).inputValue().catch(()=> '');
    if(!v) await txt.nth(j).fill(j%2?'1000000':'QA').catch(()=>{});
  }

  const next=page.locator('button.intake-next-btn').first();
  const count=await next.count();
  if(!count){
    const btns=await page.locator('button').evaluateAll(ns=>ns.map(n=>({t:(n.textContent||'').trim(),cls:n.className,disabled:n.disabled})));
    const body=(await page.locator('body').innerText()).slice(0,800);
    console.log(JSON.stringify({step:i,url:page.url(),noNext:true,btns,body},null,2));
    await page.screenshot({path:`/tmp/qa-agent1-steps/no-next-step-${i}.png`, fullPage:true});
    break;
  }
  await next.click().catch(()=>{});
  await page.waitForTimeout(1200);
}
await browser.close();
