import { chromium } from 'playwright';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3000';
const OUT_TIMEOUT_MS = Number(process.env.QA_TIMEOUT_MS || 120000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrlIncludes(page, part, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (page.url().includes(part)) return true;
    await sleep(500);
  }
  return false;
}

async function completeIntake(page) {
  for (let step = 0; step < 20; step++) {
    if (page.url().includes('/agent')) return;

    const chips = page.locator('button.intake-chip');
    const chipCount = await chips.count();
    if (chipCount > 0) {
      for (let i = 0; i < Math.min(chipCount, 4); i++) {
        await chips.nth(i).click().catch(() => {});
      }
    }

    const fields = page.locator('input[type="text"],input[type="number"],textarea');
    const fieldsCount = await fields.count();
    for (let i = 0; i < fieldsCount; i++) {
      const field = fields.nth(i);
      const type = await field.getAttribute('type');
      const value = await field.inputValue().catch(() => '');
      if (!value) {
        await field.fill(type === 'number' ? String(1200000 + i * 100000) : `QA ${i + 1}`).catch(() => {});
      }
    }

    const toggles = page.locator('input[type="checkbox"],input[type="radio"]');
    const togglesCount = await toggles.count();
    for (let i = 0; i < Math.min(togglesCount, 4); i++) {
      await toggles.nth(i).check().catch(() => {});
    }

    const ranges = page.locator('input[type="range"]');
    const rangesCount = await ranges.count();
    for (let i = 0; i < rangesCount; i++) {
      await ranges.nth(i).fill('6').catch(() => {});
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await sleep(200);

    const submit = page.locator('button.intake-submit-btn').first();
    if (await submit.count()) {
      await submit.click().catch(() => {});
      await sleep(1500);
      continue;
    }

    const next = page.locator('button.intake-next-btn').first();
    if (await next.count()) {
      await next.click().catch(() => {});
      await sleep(900);
      continue;
    }

    const genericNext = page.getByRole('button', {
      name: /siguiente|continuar|finalizar|terminar|completar|guardar|preparando/i,
    }).first();
    if (await genericNext.count()) {
      await genericNext.click().catch(() => {});
      await sleep(900);
    }
  }
}

function extractAgentPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if ('ok' in raw && raw.ok === true && 'data' in raw) return raw.data;
  return raw;
}

function hasChartBlock(payload) {
  const blocks = Array.isArray(payload?.agent_blocks) ? payload.agent_blocks : [];
  return blocks.some((block) => block?.type === 'chart');
}

function hasPdfArtifact(payload) {
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  if (artifacts.some((a) => a?.type === 'pdf' || /pdf/i.test(String(a?.fileUrl ?? '')))) return true;

  const blocks = Array.isArray(payload?.agent_blocks) ? payload.agent_blocks : [];
  const blockHasPdf = blocks.some((block) => {
    if (block?.type !== 'artifact') return false;
    const artifact = block?.artifact ?? {};
    return artifact?.type === 'pdf' || /pdf/i.test(String(artifact?.fileUrl ?? ''));
  });
  if (blockHasPdf) return true;

  const msg = String(payload?.message ?? '').toLowerCase();
  return msg.includes('pdf') || msg.includes('reporte') || msg.includes('informe');
}

async function run() {
  const email = `qa.smoke.${Date.now()}@example.com`;
  const password = 'QAtest1234';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const agentResponses = [];

  page.on('response', async (res) => {
    if (!res.url().includes('/api/agent') || res.status() !== 200) return;
    try {
      const raw = await res.json();
      const payload = extractAgentPayload(raw);
      if (payload) agentResponses.push(payload);
    } catch {}
  });

  try {
    const authCard = page.locator('.auth-card').first();
    const nameInput = authCard.locator('input[type="text"]').first();
    const emailInput = authCard.locator('input[type="email"]').first();
    const passwordInput = authCard.locator('input[type="password"]').first();
    let formReady = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`${BASE_URL}/register`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      try {
        await nameInput.waitFor({ timeout: 10000 });
        await emailInput.waitFor({ timeout: 10000 });
        await passwordInput.waitFor({ timeout: 10000 });
        formReady = true;
        break;
      } catch {
        await sleep(1000);
      }
    }
    assert(formReady, 'No se pudo cargar el formulario de registro');

    await nameInput.click({ clickCount: 3 }).catch(() => {});
    await nameInput.type('QA Smoke', { delay: 20 });
    await emailInput.click({ clickCount: 3 }).catch(() => {});
    await emailInput.type(email, { delay: 20 });
    await passwordInput.click({ clickCount: 3 }).catch(() => {});
    await passwordInput.type(password, { delay: 20 });

    // Ensure values persisted before submit (avoids flaky hydration race in dev).
    assert((await nameInput.inputValue()).trim().length >= 2, 'No se pudo cargar nombre en registro');
    assert((await emailInput.inputValue()).includes('@'), 'No se pudo cargar email en registro');
    assert((await passwordInput.inputValue()).length >= 8, 'No se pudo cargar password en registro');

    await page.getByRole('button', { name: /continuar|crear/i }).first().click();
    await sleep(1800);

    await completeIntake(page);
    const arrivedAgent = await waitForUrlIncludes(page, '/agent', OUT_TIMEOUT_MS);
    if (!arrivedAgent) {
      const bodyPreview = (await page.locator('body').innerText().catch(() => '')).slice(0, 1200);
      throw new Error(`No se llegó a /agent después de completar intake. URL=${page.url()} BODY=${bodyPreview}`);
    }

    const chatInput = page.locator('textarea').first();
    await chatInput.waitFor({ timeout: 20000 });

    const chartRaw = await page.evaluate(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
      try {
        const res = await fetch('http://localhost:3001/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            user_message: 'Genera un bloque chart simple de ahorro mensual por 12 meses en CLP.',
            session_id: `qa-smoke-chart-${Date.now()}`,
            preferences: { language: 'es-CL', response_style: 'professional' },
          }),
        });
        const raw = await res.json().catch(() => null);
        return { status: res.status, raw };
      } finally {
        clearTimeout(timeout);
      }
    });
    assert(chartRaw?.status === 200, `La llamada directa de chart falló con status ${String(chartRaw?.status ?? 'unknown')}`);
    const chartResponse = extractAgentPayload(chartRaw?.raw);
    assert(hasChartBlock(chartResponse), 'La respuesta del agente no incluyó bloque de gráfico');

    const pdfRaw = await page.evaluate(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
      try {
        const res = await fetch('http://localhost:3001/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            user_message: 'Genera un informe PDF ejecutivo de este análisis y entrega el archivo.',
            session_id: `qa-smoke-${Date.now()}`,
            preferences: { language: 'es-CL', response_style: 'professional' },
          }),
        });
        const raw = await res.json().catch(() => null);
        return { status: res.status, raw };
      } finally {
        clearTimeout(timeout);
      }
    });
    assert(pdfRaw?.status === 200, `La llamada directa de PDF falló con status ${String(pdfRaw?.status ?? 'unknown')}`);
    let pdfResponse = extractAgentPayload(pdfRaw?.raw);
    assert(hasPdfArtifact(pdfResponse), 'La respuesta no mostró evidencia de generación/entrega de PDF');

    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          finalUrl: page.url(),
          checks: ['onboarding->agent', 'chart-block', 'pdf-evidence'],
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
