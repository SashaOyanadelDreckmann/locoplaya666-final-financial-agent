import { chromium, devices } from 'playwright';

const WEB_URL = 'https://financieramente.up.railway.app';
const EMAIL = 'camila.rosas.qa.1780637502@gmail.com';
const PASSWORD = 'Providencia36!';
const TEST_AMOUNT = '423456';

const DEFAULT_ROWS = [
  { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 850000, note: '' },
  { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0, note: '' },
  { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0, note: '' },
  { id: 'expense_transport', category: 'Transporte', type: 'expense', amount: 0, note: '' },
  { id: 'expense_services', category: 'Servicios básicos', type: 'expense', amount: 0, note: '' },
  { id: 'expense_debt', category: 'Deuda / cuotas', type: 'expense', amount: 0, note: '' },
];

const results = {
  seeded: false,
  login: false,
  modalOpen: false,
  tableTab: false,
  rowTapped: false,
  chatSent: false,
  rentUpdated: false,
  transportUnchanged: true,
  apiActionId: null,
  errors: [],
};

function log(step, detail = '') {
  console.log(`[${step}]${detail ? ` ${detail}` : ''}`);
}

async function seedPanelState(page) {
  const sessionRes = await page.request.get(`${WEB_URL}/backend/api/session`);
  const csrfToken = sessionRes.headers()['x-csrf-token'] ?? '';
  const panelState = {
    budgetRows: DEFAULT_ROWS,
    budgetChatAnswers: [],
    bankSimulation: {
      products: [
        {
          id: 'qa-prod-1',
          label: 'Banco Demo · Cuenta Corriente',
          bank: 'Banco Demo',
          productType: 'checking_account',
          simulationAccepted: true,
          connected: true,
          randomMode: false,
          uploadedFiles: ['cartola.csv'],
          parsedDocuments: [
            {
              documentId: 'doc-qa-1',
              name: 'cartola.csv',
              text: '2026-05-01,ABONO,+1000',
            },
          ],
          assistant: {
            summaryText: 'Resumen QA',
            messages: [],
          },
          dashboard: {
            summary: 'Dashboard listo',
            keyMetrics: {
              inflows_total: 1000,
              outflows_total: 0,
              net_flow: 1000,
              avg_movement: 1000,
              movement_count: 1,
            },
          },
        },
      ],
      activeProductId: 'qa-prod-1',
      lockedMonth: '2026-05',
      connected: true,
      randomMode: false,
      uploadedFiles: ['cartola.csv'],
      parsedDocuments: [
        { documentId: 'doc-qa-1', name: 'cartola.csv', text: '2026-05-01,ABONO,+1000' },
      ],
    },
    savedReports: [],
    updatedAt: new Date().toISOString(),
  };

  const saveRes = await page.request.post(`${WEB_URL}/backend/api/panel-state`, {
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    data: { panelState },
  });
  if (!saveRes.ok()) {
    throw new Error(`panel-state seed failed: HTTP ${saveRes.status()}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'es-CL',
  });
  const page = await context.newPage();

  page.on('pageerror', (err) => results.errors.push(`pageerror: ${err.message}`));

  page.on('response', async (response) => {
    if (!response.url().includes('/api/budget-chat')) return;
    try {
      const json = await response.json();
      results.apiActionId = json?.action?.id ?? json?.actions?.[0]?.id ?? null;
      log('api', `budget-chat action=${results.apiActionId} source=${json?.source ?? 'unknown'}`);
    } catch {
      // ignore parse errors
    }
  });

  try {
    log('1', 'login');
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('.auth-submit');
    await page.waitForURL('**/agent**', { timeout: 60000 });
    results.login = true;

    log('1b', 'seed panel state to unlock budget');
    await seedPanelState(page);
    await page.goto(`${WEB_URL}/agent`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    results.seeded = true;

    log('2', 'open budget modal');
    const budgetBtn = page.locator('[data-panel-section="budget"]');
    await budgetBtn.waitFor({ state: 'visible', timeout: 30000 });
    const locked = await budgetBtn.evaluate((el) => el.classList.contains('is-locked'));
    if (locked) throw new Error('Presupuesto bloqueado para la cuenta QA');
    await budgetBtn.click();
    await page.locator('.budget-modal').waitFor({ state: 'visible', timeout: 30000 });
    results.modalOpen = true;

    log('3', 'switch to Tabla');
    await page.getByRole('button', { name: 'Tabla', exact: true }).click();
    await page.waitForTimeout(500);
    results.tableTab = true;

    log('4', 'tap rent row');
    const rentRow = page.locator('#budget-row-expense_rent');
    await rentRow.waitFor({ state: 'visible', timeout: 15000 });
    await rentRow.locator('td').first().click({ force: true });
    await page.waitForTimeout(300);
    const rentActive = await rentRow.evaluate((el) => el.classList.contains('is-active-row'));
    results.rowTapped = rentActive;
    if (!rentActive) throw new Error('expense_rent no quedó activa tras el tap');

    const transportBefore = await page
      .locator('#budget-row-expense_transport input')
      .first()
      .inputValue()
      .catch(() => '');

    log('5', 'switch to Asistente and send amount');
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    const input = page.locator('.bcc-hero-input');
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.fill(TEST_AMOUNT);
    await page.locator('.bcc-hero-send').click();

    await page.waitForFunction(
      () => {
        const thinking = document.querySelector('.bcc-hero-thinking');
        const inputEl = document.querySelector('.bcc-hero-input');
        return !thinking && inputEl && !inputEl.hasAttribute('disabled');
      },
      { timeout: 45000 },
    );
    results.chatSent = true;

    log('6', 'verify table amounts');
    await page.getByRole('button', { name: 'Tabla', exact: true }).click();
    await page.waitForTimeout(500);

    const rentAmount = await page.locator('#budget-row-expense_rent input').nth(1).inputValue();
    const transportAmount = await page
      .locator('#budget-row-expense_transport input')
      .first()
      .inputValue()
      .catch(() => '');

    results.rentUpdated = rentAmount === TEST_AMOUNT;
    results.transportUnchanged = transportAmount === transportBefore;

    log('result', JSON.stringify({ ...results, rentAmount, transportAmount, transportBefore }, null, 2));

    const passed =
      results.login &&
      results.seeded &&
      results.modalOpen &&
      results.tableTab &&
      results.rowTapped &&
      results.chatSent &&
      results.rentUpdated &&
      results.transportUnchanged &&
      results.apiActionId === 'expense_rent';

    if (!passed) {
      process.exitCode = 1;
      console.error('FAIL: mobile row-tap override verification did not pass');
    } else {
      console.log('PASS: tap rent → send amount updates expense_rent');
    }
  } catch (error) {
    results.errors.push(String(error?.message ?? error));
    console.error('FAIL:', error);
    console.error(JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main();
