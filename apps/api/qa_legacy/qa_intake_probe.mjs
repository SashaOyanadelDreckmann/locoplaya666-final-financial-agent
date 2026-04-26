import { chromium } from 'playwright';

const email = `qa.agent1.intake.${Date.now()}@example.com`;
const password = 'QAtest!23456';

const browser = await chromium.launch({ headless:true });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:3000/register', {waitUntil:'networkidle'});
await page.waitForTimeout(800);
await page.locator('input[placeholder*="llame" i]').first().type('QA Agent',{delay:20});
await page.locator('input[type="email"]').first().type(email,{delay:20});
await page.locator('input[type="password"]').first().type(password,{delay:20});
await page.locator('button', {hasText:'Continuar'}).click();
await page.waitForTimeout(2500);

// choose one option chips
await page.locator('button:has-text("25 – 34"), button:has-text("25 - 34"), button:has-text("Menos de 25")').first().click().catch(()=>{});
await page.locator('button:has-text("Dependiente"), button:has-text("Independiente")').first().click().catch(()=>{});

const clickable = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('button, [role="button"], a'));
  return els.map(el => ({
    tag: el.tagName,
    text: (el.textContent || '').trim().slice(0,80),
    role: el.getAttribute('role'),
    cls: el.className,
    top: (el).getBoundingClientRect().top,
  }));
});

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(400);
const clickableBottom = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('button, [role="button"], a'));
  return els.map(el => ({
    tag: el.tagName,
    text: (el.textContent || '').trim().slice(0,80),
    role: el.getAttribute('role'),
    cls: el.className,
    top: (el).getBoundingClientRect().top,
  }));
});

console.log(JSON.stringify({url:page.url(),clickable:clickable.slice(-15),clickableBottom:clickableBottom.slice(-15)},null,2));
await browser.close();
