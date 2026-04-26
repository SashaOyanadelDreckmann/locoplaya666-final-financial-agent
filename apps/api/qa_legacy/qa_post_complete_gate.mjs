import { chromium } from 'playwright';

const email='qa.agent1.wait.1777082403700@example.com';
const password='QAtest!23456';
const browser=await chromium.launch({headless:true});
const page=await (await browser.newContext()).newPage();
await page.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
await page.locator('input[type="email"]').first().type(email,{delay:10});
await page.locator('input[type="password"]').first().type(password,{delay:10});
await page.locator('button',{hasText:/Continuar|Entrar|Iniciar/i}).click();
await page.waitForTimeout(2500);
const afterLogin=page.url();
await page.goto('http://localhost:3000/intake',{waitUntil:'networkidle'});
await page.waitForTimeout(1500);
const afterIntakeVisit=page.url();
const txt=(await page.locator('body').innerText()).slice(0,250);
console.log(JSON.stringify({afterLogin,afterIntakeVisit,txt},null,2));
await browser.close();
