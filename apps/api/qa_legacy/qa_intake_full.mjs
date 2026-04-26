import { chromium } from 'playwright';
import fs from 'fs';

const email = `qa.agent1.full.${Date.now()}@example.com`;
const password = 'QAtest!23456';
const outDir='/tmp/qa-agent1-intake'; fs.mkdirSync(outDir,{recursive:true});
const browser = await chromium.launch({ headless:true });
const page = await (await browser.newContext()).newPage();
const bad=[]; const fails=[]; const cons=[];
page.on('response', async r=>{ if(r.status()>=400){ let b=''; try{b=(await r.text()).slice(0,220);}catch{} bad.push({url:r.url(),status:r.status(),method:r.request().method(),body:b}); }});
page.on('requestfailed', r=>fails.push({url:r.url(),method:r.method(),failure:r.failure()?.errorText||'unknown'}));
page.on('console', m=>cons.push({type:m.type(),text:m.text()}));
const snap=async(n)=>{ const p=`${outDir}/${n}.png`; await page.screenshot({path:p,fullPage:true}); return p; };

await page.goto('http://localhost:3000/register', { waitUntil:'networkidle' });
await page.waitForTimeout(1200);
await page.locator('input[placeholder*="llame" i]').first().type('QA Agent', {delay:20});
await page.locator('input[type="email"]').first().type(email,{delay:20});
await page.locator('input[type="password"]').first().type(password,{delay:20});
await snap('01-register-filled');
await page.locator('button', { hasText: 'Continuar' }).click();
await page.waitForTimeout(2500);
const afterRegisterUrl = page.url();
await snap('02-after-register');

// Intake traversal
let clicks=0;
for(let i=0;i<15;i++){
  // fill visible inputs conservatively
  const inputs = page.locator('input:visible, textarea:visible, select:visible');
  const c = await inputs.count();
  for(let j=0;j<c;j++){
    const el = inputs.nth(j);
    const tag = await el.evaluate(n=>n.tagName.toLowerCase()).catch(()=> '');
    const type = await el.getAttribute('type').catch(()=>null);
    if(tag==='select'){
      const oc = await el.locator('option').count().catch(()=>0);
      if(oc>1) await el.selectOption({index:1}).catch(()=>{});
      continue;
    }
    if(type==='radio' || type==='checkbox') { await el.check().catch(()=>{}); continue; }
    if(type==='number') {
      const v = await el.inputValue().catch(()=> '');
      if(!v) await el.fill('1500000').catch(()=>{});
      continue;
    }
    if(type==='text' || type===null || type==='email') {
      const v = await el.inputValue().catch(()=> '');
      if(!v) await el.fill('QA valor').catch(()=>{});
      continue;
    }
    if(type==='range') await el.fill('50').catch(()=>{});
  }

  const next = page.getByRole('button', { name: /siguiente|continuar|guardar|next|finalizar|terminar|completar|ir al chat|empezar/i }).first();
  if (await next.count()) {
    await next.click().catch(()=>{});
    clicks++;
    await page.waitForTimeout(1200);
  } else break;
}

const finalUrl = page.url();
const body = await page.locator('body').innerText();
const screenshots=[await snap('03-final')];
const result={email,afterRegisterUrl,finalUrl,clicks,hasErrorText:/error|fall[oó]|invalid|inválido|failed|no se pudo/i.test(body),hasSuccessText:/completad|éxito|dashboard|chat/i.test(body),bad,fails,cons,screenshots};
fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
