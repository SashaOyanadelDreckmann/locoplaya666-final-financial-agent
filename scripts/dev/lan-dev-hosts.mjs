import os from 'os';

const WIFI_INTERFACE_NAMES = ['en0', 'wlan0', 'wifi', 'wi-fi', 'eth0'];

function isLinkLocalIPv4(address) {
  return address.startsWith('169.254.');
}

function isPrivateIPv4(address) {
  const [a, b] = address.split('.').map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function scoreLanCandidate(candidate) {
  const name = candidate.name.toLowerCase();
  let score = 0;

  if (WIFI_INTERFACE_NAMES.some((preferred) => name === preferred || name.startsWith(`${preferred}:`))) {
    score += 100;
  }
  if (isPrivateIPv4(candidate.address)) score += 50;
  if (isLinkLocalIPv4(candidate.address)) score -= 200;

  return score;
}

/** Best routable IPv4 for LAN/mobile dev (skips link-local 169.254.x.x when possible). */
export function resolveLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const [name, entries] of Object.entries(nets)) {
    for (const net of entries ?? []) {
      const isIPv4 = net.family === 'IPv4' || net.family === 4;
      if (!isIPv4 || net.internal) continue;
      candidates.push({ name, address: net.address });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => scoreLanCandidate(right) - scoreLanCandidate(left));
  return candidates[0].address;
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
