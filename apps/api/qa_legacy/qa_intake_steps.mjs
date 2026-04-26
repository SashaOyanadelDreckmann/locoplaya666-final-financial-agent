import { chromium } from 'playwright';
import fs from 'fs';

const email = `qa.agent1.steps.${Date.now()}@example.com`;
const password = 'QAtest!23456';
const outDir='/tmp/qa-agent1-steps'; fs.mkdirSync(outDir,{recursive:true});
const browser = await chromium.launch({headless:true});
const page = await (await browser.newContext()).newPage();
const bad=[]; const fails=[]; const cons=[]; const trail=[];
page.on('response', async r=>{ if(r.status()>=400){ let b=''; try{b=(await r.text()).slice(0,220);}catch{} bad.push({url:r.url(),status:r.status(),method:r.request().method(),body:b}); }});
page.on('requestfailed', r=>fails.push({url:r.url(),method:r.method(),failure:r.failure()?.errorText||'unknown'}));
page.on('console', m=>cons.push({type:m.type(),text:m.text()}));
const snap=async(n)=>{ const p=`${outDir}/${n}.png`; await page.screenshot({path:p,fullPage:true}); return p; };

await page.goto('http://localhost:3000/register', { waitUntil:'networkidle' });
await page.waitForTimeout(1000);
await page.locator('input[placeholder*="llame" i]').first().type('QA Agent',{delay:20});
await page.locator('input[type="email"]').first().type(email,{delay:20});
await page.locator('input[type="password"]').first().type(password,{delay:20});
await page.locator('button', {hasText:'Continuar'}).click();
await page.waitForTimeout(2000);
trail.push({step:'after_register',url:page.url()});
await snap('01-intake-step1');

for(let i=1;i<=7;i++){
  // select default chips if available
  const groups = [
    /Menos de 25|25 – 34|35 – 44|45 – 55|Más de 55/,
    /Dependiente|Independiente|Ambos|Estudiante|Sin trabajo/,
    /Sí|Si|No/,
    /Básico|Intermedio|Avanzado|Conservador|Balanceado|Agresivo/
  ];
  for (const g of groups) {
    const btn = page.locator('button').filter({ hasText: g }).first();
    if (await btn.count()) await btn.click().catch(()=>{});
  }
  // fill visible inputs
  const textLike = page.locator('input[type="text"]:visible, input[type="number"]:visible, textarea:visible');
  const tc = await textLike.count();
  for (let j=0;j<tc;j++) {
    const el = textLike.nth(j);
    const type = await el.getAttribute('type');
    const v = await el.inputValue().catch(()=> '');
    if (v) continue;
    await el.fill(type==='number' ? String(1000000 + j*100000) : `QA valor ${j+1}`).catch(()=>{});
  }

  await page.evaluate(()=>window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const next = page.locator('button.intake-next-btn, button:has-text("Continuar"), button:has-text("Finalizar"), button:has-text("Completar")').first();
  if (!(await next.count())) {
    trail.push({step:`loop_${i}`,url:page.url(),note:'no_next_button'});
    break;
  }
  await next.click().catch(()=>{});
  await page.waitForTimeout(1500);
  trail.push({step:`loop_${i}`,url:page.url(),bodyHead:(await page.locator('body').innerText()).slice(0,120)});
  await snap(`step-${i}`);
}

const result={email,trail,finalUrl:page.url(),bad,fails,cons};
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
