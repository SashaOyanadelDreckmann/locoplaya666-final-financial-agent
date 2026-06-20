#!/usr/bin/env node
/**
 * Purge USER-role accounts created before a cutoff date via admin API.
 *
 * Usage:
 *   node scripts/ops/purge-prod-users-before-date.mjs --dry-run
 *   node scripts/ops/purge-prod-users-before-date.mjs --execute
 *
 * Env:
 *   WEB_BASE_URL          default https://financieramente.up.railway.app
 *   ADMIN_EMAIL           default admin@financieramente.local
 *   ADMIN_PASSWORD        default Financieramente123!
 *   PURGE_CUTOFF_ISO      default 2026-06-17T04:00:00.000Z (midnight America/Santiago)
 */

const WEB_BASE = (process.env.WEB_BASE_URL || 'https://financieramente.up.railway.app').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@financieramente.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Financieramente123!';
const CUTOFF_MS = Date.parse(process.env.PURGE_CUTOFF_ISO || '2026-06-17T04:00:00.000Z');
const EXECUTE = process.argv.includes('--execute');
const DRY_RUN = process.argv.includes('--dry-run') || !EXECUTE;

function parseEnvelope(raw) {
  if (raw?.ok === true) return raw.data;
  throw new Error(raw?.detail || raw?.title || JSON.stringify(raw));
}

function mergeCookies(existing, setCookieHeaders) {
  const jar = new Map();
  for (const part of String(existing || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const header of setCookieHeaders) {
    const piece = String(header).split(';')[0]?.trim();
    if (!piece) continue;
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    jar.set(piece.slice(0, eq), piece.slice(eq + 1));
  }
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function readCookieValue(cookieJar, name) {
  for (const part of String(cookieJar || '').split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return '';
}

async function adminRequest(path, { method = 'GET', state, body } = {}) {
  const csrf = readCookieValue(state.cookieJar, 'csrf-token') || state.csrf;
  const headers = {
    accept: 'application/json',
    origin: WEB_BASE,
    referer: `${WEB_BASE}/admin`,
    cookie: state.cookieJar,
  };
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
  if (body) headers['content-type'] = 'application/json';

  const res = await fetch(`${WEB_BASE}/backend${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'follow',
  });

  state.cookieJar = mergeCookies(state.cookieJar, res.headers.getSetCookie?.() ?? []);
  const headerCsrf = res.headers.get('x-csrf-token');
  if (headerCsrf) state.csrf = headerCsrf;
  const cookieCsrf = readCookieValue(state.cookieJar, 'csrf-token');
  if (cookieCsrf) state.csrf = cookieCsrf;

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${raw?.detail || JSON.stringify(raw)}`);
  }
  return parseEnvelope(raw);
}

async function loginAdmin() {
  const state = { cookieJar: '', csrf: '' };

  const bootstrap = await fetch(`${WEB_BASE}/backend/api/session`, {
    headers: { origin: WEB_BASE, referer: `${WEB_BASE}/admin` },
  });
  state.cookieJar = mergeCookies(state.cookieJar, bootstrap.headers.getSetCookie?.() ?? []);
  state.csrf = bootstrap.headers.get('x-csrf-token') || readCookieValue(state.cookieJar, 'csrf-token') || state.csrf;

  await adminRequest('/auth/login', {
    method: 'POST',
    state,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  return state;
}

async function listAllUsers(state) {
  const users = [];
  const limit = 200;
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });
    const data = await adminRequest(`/api/analytics/users?${query}`, { state });
    users.push(...(data.users || []));
    total = Number(data.pagination?.total ?? users.length);
    offset += limit;
    if ((data.users || []).length === 0) break;
  }

  return users;
}

async function main() {
  if (!Number.isFinite(CUTOFF_MS)) {
    throw new Error('Invalid PURGE_CUTOFF_ISO');
  }

  console.log(`web=${WEB_BASE}`);
  console.log(`cutoff=${new Date(CUTOFF_MS).toISOString()} (before this instant)`);
  console.log(`mode=${DRY_RUN ? 'dry-run' : 'execute'}`);

  const state = await loginAdmin();
  const allUsers = await listAllUsers(state);

  const targets = allUsers.filter((user) => {
    if (String(user.role || '').toUpperCase() !== 'USER') return false;
    const createdMs = Date.parse(String(user.createdAt || ''));
    return Number.isFinite(createdMs) && createdMs < CUTOFF_MS;
  });

  console.log(`totalListed=${allUsers.length}`);
  console.log(`targets=${targets.length}`);
  for (const user of targets) {
    console.log(`  - ${user.id} | ${user.email} | ${user.createdAt}`);
  }

  if (DRY_RUN) {
    console.log('dry-run complete (no deletions performed)');
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const user of targets) {
    try {
      await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        state,
      });
      deleted += 1;
      console.log(`deleted ${user.id}`);
    } catch (error) {
      failed += 1;
      console.error(`failed ${user.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`done deleted=${deleted} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
