import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:3000/register', { waitUntil:'domcontentloaded' });
await page.locator('input[placeholder*="llame" i], input[type="text"]').first().fill('QA Agent');
await page.locator('input[type="email"]').first().fill(`qa.agent1.debug.${Date.now()}@example.com`);
await page.locator('input[type="password"]').first().fill('QAtest!23456');
await page.locator('button', { hasText: 'Continuar' }).click();
await page.waitForTimeout(1200);
const errors = await page.locator('.auth-error, .auth-error-text').allTextContents();
const vals = await page.locator('input').evaluateAll(nodes=>nodes.map(n=>({type:n.type,val:n.value,class:n.className,invalid:n.getAttribute('aria-invalid')})));
console.log(JSON.stringify({url:page.url(),errors,vals},null,2));
await browser.close();
