import { chromium } from 'playwright';

const email = `qa.agent1.probe2.${Date.now()}@example.com`;
const password = 'QAtest!23456';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const events=[];
page.on('request', r=>{ if(/auth\/register/i.test(r.url())) events.push({t:'request',url:r.url(),method:r.method()});});
page.on('response', async r=>{ if(/auth\/register/i.test(r.url())) { let body=''; try{body=(await r.text()).slice(0,200);}catch{} events.push({t:'response',url:r.url(),status:r.status(),body}); }});

await page.goto('http://localhost:3000/register', { waitUntil: 'domcontentloaded' });
await page.locator('input[placeholder*="llame" i], input[type="text"]').first().fill('QA Agent');
await page.locator('input[type="email"]').first().fill(email);
await page.locator('input[type="password"]').first().fill(password);

const btn = page.locator('button').filter({ hasText: /continuar|crear|registr/i }).first();
await btn.click({timeout:5000});
await page.waitForTimeout(3000);

console.log(JSON.stringify({email,finalUrl:page.url(),events,body:(await page.locator('body').innerText()).slice(0,500)},null,2));
await browser.close();
