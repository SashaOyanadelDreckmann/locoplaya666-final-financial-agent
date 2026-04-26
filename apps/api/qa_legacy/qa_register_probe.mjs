import { chromium } from 'playwright';

const email = `qa.agent1.probe.${Date.now()}@example.com`;
const password = 'QAtest!23456';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const events=[];
page.on('request', r=>{ if(/auth\/register|register/i.test(r.url())) events.push({t:'request',url:r.url(),method:r.method()});});
page.on('response', async r=>{ if(/auth\/register|register/i.test(r.url())) { let body=''; try{body=(await r.text()).slice(0,200);}catch{} events.push({t:'response',url:r.url(),status:r.status(),body}); }});

await page.goto('http://localhost:3000/register', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const inputs = await page.locator('input').evaluateAll(nodes => nodes.map(n => ({type:n.type,placeholder:n.placeholder,name:n.name,id:n.id,disabled:n.disabled})));

const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
const passInputs = page.locator('input[type="password"]');
await emailInput.fill(email);
if (await passInputs.count()) await passInputs.nth(0).fill(password);
if ((await passInputs.count()) > 1) await passInputs.nth(1).fill(password);

const btnTexts = await page.locator('button').evaluateAll(nodes => nodes.map(n=>({text:n.textContent?.trim(),type:n.getAttribute('type'),disabled:n.disabled})));
const submit = page.locator('button').filter({ hasText: /crear cuenta|registr|continuar|empezar/i }).first();
if (await submit.count()) await submit.click({timeout:5000}); else await page.keyboard.press('Enter');

await page.waitForTimeout(3500);
console.log(JSON.stringify({email,finalUrl:page.url(),inputs,btnTexts,events,body:(await page.locator('body').innerText()).slice(0,500)},null,2));
await browser.close();
