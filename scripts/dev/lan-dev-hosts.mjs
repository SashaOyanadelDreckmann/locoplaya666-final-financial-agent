import os from 'os';

/** First non-internal IPv4 (typical Wi‑Fi/Ethernet LAN address). */
export function resolveLanIPv4() {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      return net.address;
    }
  }
  return null;
}

export function buildLanDevOrigins(webPort = 3000) {
  const ip = resolveLanIPv4();
  if (!ip) return [];
  return [`http://${ip}:${webPort}`];
}

export function formatLanDevBanner(options = {}) {
  const webPort = options.webPort ?? 3000;
  const apiPort = options.apiPort ?? 3001;
  const ip = resolveLanIPv4();
  if (!ip) return null;

  const lines = [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  Mobile / LAN dev',
    `  Web:  http://${ip}:${webPort}`,
    `  API:  http://${ip}:${apiPort} (proxy via /backend on web)`,
    '  Login on phone with the SAME URL (not localhost).',
    '  QA mobile: qa-mobile-local@financieramente.invalid',
    '  Password:  Financieramente123!',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];
  return lines.join('\n');
}
