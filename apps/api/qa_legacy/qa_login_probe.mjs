import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const events=[];
page.on('request', r=>{ if(/auth\/login|login/i.test(r.url())) events.push({t:'request',url:r.url(),method:r.method()});});
page.on('response', r=>{ if(/auth\/login|login/i.test(r.url())) events.push({t:'response',url:r.url(),status:r.status()});});

await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

const inputs = await page.locator('input').evaluateAll(nodes => nodes.map(n => ({type:n.type,name:n.name,id:n.id,placeholder:n.placeholder,value:n.value,disabled:n.disabled})));
const buttons = await page.locator('button').evaluateAll(nodes => nodes.map(n => ({text:n.textContent?.trim(),type:n.getAttribute('type'),disabled:n.disabled})));

const email = page.locator('input[type="email"], input[name*="email" i]').first();
const pass = page.locator('input[type="password"], input[name*="password" i]').first();
if (await email.count()) await email.fill('qa.agent1.1777082009932@example.com');
if (await pass.count()) await pass.fill('QAtest!23456');

await page.waitForTimeout(300);
const buttonsAfterFill = await page.locator('button').evaluateAll(nodes => nodes.map(n => ({text:n.textContent?.trim(),type:n.getAttribute('type'),disabled:n.disabled})));

const submitBtn = page.locator('button[type="submit"]').first();
if (await submitBtn.count()) await submitBtn.click({timeout:5000}).catch(()=>{});
else await page.keyboard.press('Enter').catch(()=>{});

await page.waitForTimeout(2500);
console.log(JSON.stringify({url:page.url(),inputs,buttons,buttonsAfterFill,events,body:(await page.locator('body').innerText()).slice(0,800)},null,2));
await browser.close();
