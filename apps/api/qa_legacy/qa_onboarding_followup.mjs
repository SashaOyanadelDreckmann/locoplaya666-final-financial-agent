import { chromium } from 'playwright';
import fs from 'fs';

const base = 'http://localhost:3000';
const outDir = '/tmp/qa-agent1-followup';
fs.mkdirSync(outDir, { recursive: true });

const email = 'qa.agent1.1777082009932@example.com';
const password = 'QAtest!23456';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const logs = { console: [], pageErrors: [], badResponses: [], requestFailures: [] };

page.on('console', m => logs.console.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => logs.pageErrors.push(String(e)));
page.on('requestfailed', r => logs.requestFailures.push({ url: r.url(), method: r.method(), failure: r.failure()?.errorText || 'unknown' }));
page.on('response', async r => {
  if (r.status() >= 400) {
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch {}
    logs.badResponses.push({ url: r.url(), status: r.status(), method: r.request().method(), body });
  }
});

const snap = async (name) => {
  const p = `${outDir}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
};

try {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"], input[name*="password" i]').first().fill(password);
  const loginBtn = page.getByRole('button', { name: /iniciar sesión|iniciar sesion|login|entrar|continuar/i }).first();
  if (await loginBtn.count()) await loginBtn.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const postLoginUrl = page.url();
  const s1 = await snap('01-post-login');

  await page.goto(base + '/intake', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);

  for (let i = 0; i < 12; i++) {
    const textInputs = page.locator('input[type="text"],input[type="number"],textarea');
    const tc = await textInputs.count();
    for (let j = 0; j < Math.min(tc, 6); j++) {
      const f = textInputs.nth(j);
      const cur = await f.inputValue().catch(() => '');
      if (!cur) await f.fill(j % 2 ? '1500000' : 'QA Valor').catch(()=>{});
    }

    const selects = page.locator('select');
    const sc = await selects.count();
    for (let j = 0; j < Math.min(sc, 5); j++) {
      const s = selects.nth(j);
      const oc = await s.locator('option').count().catch(()=>0);
      if (oc > 1) await s.selectOption({ index: 1 }).catch(()=>{});
    }

    const range = page.locator('input[type="range"]');
    const rc = await range.count();
    for (let j = 0; j < Math.min(rc,2); j++) await range.nth(j).fill('50').catch(()=>{});

    const next = page.getByRole('button', { name: /siguiente|continuar|guardar|next|finalizar|terminar|completar/i }).first();
    if (await next.count()) {
      await next.click().catch(()=>{});
      await page.waitForTimeout(1000);
    } else break;
  }

  const s2 = await snap('02-intake-end');
  const finalUrl = page.url();
  const body = await page.locator('body').innerText();

  const result = {
    postLoginUrl,
    finalUrl,
    hasSuccessText: /completado|éxito|exito|guardado|listo|dashboard/i.test(body),
    hasErrorText: /error|fall[oó]|invalid|inválido|failed|no se pudo/i.test(body),
    screenshots: [s1, s2],
    logs
  };

  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
