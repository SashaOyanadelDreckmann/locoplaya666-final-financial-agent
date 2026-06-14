#!/usr/bin/env node
/**
 * Production smoke checks — validates live + ready endpoints after deploy.
 *
 * Env:
 *   API_HEALTH_URL  — e.g. https://<api>.up.railway.app
 *   WEB_HEALTH_URL  — e.g. https://financieramente.up.railway.app
 */

const API_BASE = (process.env.API_HEALTH_URL || '').replace(/\/+$/, '');
const WEB_BASE = (process.env.WEB_HEALTH_URL || '').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.PROD_SMOKE_TIMEOUT_MS || 20_000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      redirect: 'follow',
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { res, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkApiLiveness() {
  assert(API_BASE, 'API_HEALTH_URL is required');
  const { res, body } = await fetchJson(`${API_BASE}/health/live`);
  assert(res.ok, `API /health/live expected 2xx, got ${res.status}`);
  const status = body?.data?.status ?? body?.status;
  assert(status === 'ok', `API liveness status expected ok, got ${JSON.stringify(body)}`);
  console.log('ok api /health/live');
}

async function checkApiReadiness() {
  assert(API_BASE, 'API_HEALTH_URL is required');
  const { res, body } = await fetchJson(`${API_BASE}/health/ready`);
  assert(res.status === 200, `API /health/ready expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  const ready = body?.data?.ready ?? body?.ready;
  assert(ready === true, `API readiness expected ready=true, got ${JSON.stringify(body)}`);
  const approval = body?.data?.checks?.approvalEmail?.status ?? body?.checks?.approvalEmail?.status;
  if (approval === 'degraded') {
    console.warn('warn api approvalEmail=degraded (RESEND_API_KEY missing)');
  }
  console.log('ok api /health/ready');
}

async function checkWebLiveness() {
  if (!WEB_BASE) {
    console.log('skip web checks (WEB_HEALTH_URL not set)');
    return;
  }
  const { res, body } = await fetchJson(`${WEB_BASE}/health`);
  assert(res.ok, `WEB /health expected 2xx, got ${res.status}`);
  assert(body?.ok === true, `WEB /health expected ok=true, got ${JSON.stringify(body)}`);
  console.log('ok web /health');
}

async function checkWebReadiness() {
  if (!WEB_BASE) return;
  const { res, body } = await fetchJson(`${WEB_BASE}/health/ready`);
  assert(res.status === 200, `WEB /health/ready expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  assert(body?.ok === true, `WEB /health/ready expected ok=true, got ${JSON.stringify(body)}`);
  console.log('ok web /health/ready');
}

async function main() {
  await checkApiLiveness();
  await checkApiReadiness();
  await checkWebLiveness();
  await checkWebReadiness();
  console.log('prod-smoke=success');
}

main().catch((error) => {
  console.error('prod-smoke=failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
