import { chromium } from 'playwright';
import fs from 'fs';

const base = 'http://localhost:3000';
const outDir = '/tmp/qa-agent1';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const logs = { console: [], pageErrors: [], requestFailures: [], badResponses: [], steps: [] };
page.on('console', m => logs.console.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => logs.pageErrors.push(String(e)));
page.on('requestfailed', r => logs.requestFailures.push({ url: r.url(), method: r.method(), failure: r.failure()?.errorText || 'unknown' }));
page.on('response', r => {
  const status = r.status();
  if (status >= 400) logs.badResponses.push({ url: r.url(), status, method: r.request().method() });
});

const email = `qa.agent1.${Date.now()}@example.com`;
const password = 'QAtest!23456';

const snap = async (name) => {
  const p = `${outDir}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
};

try {
  logs.steps.push('open_home');
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  const homeTitle = await page.title();
  const homeUrl = page.url();
  const homeSnap = await snap('01-home');

  logs.steps.push('navigate_to_register');
  const targets = [
    page.getByRole('link', { name: /crear cuenta|regístrate|registrate|registro|sign up|get started|empezar|comenzar/i }),
    page.getByRole('button', { name: /crear cuenta|regístrate|registrate|registro|sign up|get started|empezar|comenzar/i }),
    page.locator('a[href*="register"],a[href*="signup"],a[href*="sign-up"],a[href*="auth"],a[href*="onboarding"],a[href*="intake"]'),
  ];
  let navOk = false;
  for (const t of targets) {
    const c = await t.count().catch(() => 0);
    if (c > 0) {
      await t.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
      navOk = true;
      break;
    }
  }
  if (!navOk) {
    for (const r of ['/register', '/signup', '/auth/register', '/onboarding', '/intake']) {
      const res = await page.goto(base + r, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      if (res && res.status() < 400) {
        navOk = true;
        break;
      }
    }
  }

  const regUrl = page.url();
  const regSnap = await snap('02-register');

  logs.steps.push('submit_register_form');
  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i]').first();
  const passInputs = page.locator('input[type="password"], input[name*="password" i], input[id*="password" i]');
  const emailCount = await emailInput.count();
  const passCount = await passInputs.count();
  let submitted = false;

  if (emailCount > 0 && passCount > 0) {
    await emailInput.fill(email);
    await passInputs.nth(0).fill(password);
    if (passCount > 1) {
      await passInputs.nth(1).fill(password).catch(() => {});
    }

    const submit = page.getByRole('button', { name: /crear cuenta|registrar|registrarme|sign up|continuar|empezar|submit/i }).first();
    if (await submit.count()) {
      await submit.click({ timeout: 10000 }).catch(() => {});
    } else {
      await page.keyboard.press('Enter').catch(() => {});
    }
    submitted = true;
  }

  await page.waitForTimeout(2500);
  const postRegisterUrl = page.url();
  const postRegSnap = await snap('03-post-register');

  logs.steps.push('advance_onboarding');
  let onboardingClicks = 0;
  for (let i = 0; i < 10; i++) {
    const fillTargets = page.locator('input[type="text"],input[type="number"],textarea');
    const fillCount = await fillTargets.count();
    for (let j = 0; j < Math.min(fillCount, 5); j++) {
      const it = fillTargets.nth(j);
      const val = await it.inputValue().catch(() => '');
      if (!val) await it.fill(j % 2 ? '1000' : 'QA').catch(() => {});
    }

    const selects = page.locator('select');
    const sc = await selects.count();
    for (let j = 0; j < Math.min(sc, 4); j++) {
      const s = selects.nth(j);
      const oc = await s.locator('option').count().catch(() => 0);
      if (oc > 1) await s.selectOption({ index: 1 }).catch(() => {});
    }

    const checks = page.locator('input[type="checkbox"],input[type="radio"]');
    const cc = await checks.count();
    for (let j = 0; j < Math.min(cc, 3); j++) {
      await checks.nth(j).check().catch(() => {});
    }

    const next = page.getByRole('button', { name: /siguiente|continuar|guardar|next|finalizar|terminar|completar/i }).first();
    if (await next.count()) {
      await next.click().catch(() => {});
      onboardingClicks++;
      await page.waitForTimeout(900);
    } else {
      break;
    }
  }

  const finalUrl = page.url();
  const finalSnap = await snap('04-final');
  const bodyText = await page.locator('body').innerText();

  const result = {
    base,
    homeTitle,
    homeUrl,
    regUrl,
    email,
    registerSubmitted: submitted,
    postRegisterUrl,
    onboardingClicks,
    finalUrl,
    hasVisibleErrorText: /error|failed|fall[oó]|inválido|invalid|500|404|no se pudo/i.test(bodyText),
    screenshots: [homeSnap, regSnap, postRegSnap, finalSnap],
    logs,
  };

  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
