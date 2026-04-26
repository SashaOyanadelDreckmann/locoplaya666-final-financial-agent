import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:3000/register', { waitUntil:'networkidle' });
await page.waitForTimeout(1500);
const nameInput = page.locator('input[placeholder*="llame" i]').first();
const emailInput = page.locator('input[type="email"]').first();
const passInput = page.locator('input[type="password"]').first();
await nameInput.click(); await nameInput.type('QA Agent', { delay: 30 });
await emailInput.click(); await emailInput.type(`qa.agent1.debug2.${Date.now()}@example.com`, { delay: 20 });
await passInput.click(); await passInput.type('QAtest!23456', { delay: 20 });
await page.waitForTimeout(200);
await page.locator('button', { hasText: 'Continuar' }).click();
await page.waitForTimeout(1500);
const errors = await page.locator('.auth-error, .auth-error-text').allTextContents();
const vals = await page.locator('input').evaluateAll(nodes=>nodes.map(n=>({type:n.type,val:n.value,invalid:n.getAttribute('aria-invalid')})));
console.log(JSON.stringify({url:page.url(),errors,vals},null,2));
await browser.close();
