import { chromium } from 'playwright-core';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

function log(step, detail = '') {
  console.log(`[tx-smoke] ${step}${detail ? `: ${detail}` : ''}`);
}

async function loginIfNeeded(page) {
  await page.goto(`${BASE_URL}/agent`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!page.url().includes('/login')) return;

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error('Redirigió a login. Define TEST_EMAIL y TEST_PASSWORD para correr el smoke test.');
  }

  log('login');
  await page.fill('#login-email', TEST_EMAIL);
  await page.fill('#login-password', TEST_PASSWORD);
  await page.click('button.auth-submit');
  await page.waitForURL('**/agent**', { timeout: 30000 });
}

async function openTransactionsModal(page) {
  const card = page.locator('.panel-feature-card.panel-pos-transactions').first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.click();
  await page.locator('#transactions-modal-title').waitFor({ state: 'visible', timeout: 15000 });
}

async function runFlow(page) {
  log('open modal');
  await openTransactionsModal(page);

  log('create product');
  const createBtn = page.locator('.tx-create-product-btn').first();
  await createBtn.click();
  await page.locator('h4', { hasText: 'Autorización del producto' }).waitFor({ timeout: 10000 });

  log('fill institution');
  const bankInput = page.locator('.tx-consent-card input').first();
  await bankInput.fill('Banco de Chile (simulacion)');

  log('fill template');
  const templateInput = page.locator('.tx-consent-card input').nth(1);
  await templateInput.fill('Cuenta corriente');

  log('accept consent');
  await page.locator('.tx-consent-toggle').click();

  const continueBtn = page.locator('.tx-consent-continue-main');
  await continueBtn.waitFor({ state: 'visible', timeout: 5000 });
  if (await continueBtn.isDisabled()) {
    const cta = await page.locator('.tx-meta-card p').nth(1).innerText();
    throw new Error(`Botón de autorización sigue deshabilitado. CTA: ${cta}`);
  }

  log('authorize');
  await continueBtn.click();
  await page.locator('.tx-consent-continue-main', { hasText: 'Autorizando…' }).waitFor({ timeout: 5000 }).catch(() => {});

  log('wait evidence step');
  await page.waitForFunction(() => {
    const modal = document.querySelector('.transactions-modal');
    return modal?.getAttribute('data-stage') === 'evidence';
  }, { timeout: 12000 });

  const stage = await page.locator('.transactions-modal').getAttribute('data-stage');
  if (stage !== 'evidence') {
    throw new Error(`Se esperaba data-stage=evidence, recibido: ${stage}`);
  }

  const error = page.locator('.tx-consent-card .bcc-hero-error');
  if (await error.count()) {
    throw new Error(`Error visible en consentimiento: ${await error.first().innerText()}`);
  }

  log('evidence assistant visible');
  await page.locator('.tx-content-card').filter({ hasText: 'Asistente' }).first().waitFor({ timeout: 10000 });

  log('PASS', 'Flujo autorización → evidencias OK');
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await loginIfNeeded(page);
    await runFlow(page);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[tx-smoke] FAIL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
