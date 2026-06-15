import os from 'os';

const WIFI_INTERFACE_NAMES = ['en0', 'wlan0', 'wifi', 'wi-fi', 'eth0'];

function isLinkLocalIPv4(address: string): boolean {
  return address.startsWith('169.254.');
}

function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function scoreLanCandidate(candidate: { name: string; address: string }): number {
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
export function resolveLanIPv4(): string | null {
  const nets = os.networkInterfaces();
  const candidates: Array<{ name: string; address: string }> = [];

  for (const [name, entries] of Object.entries(nets)) {
    for (const net of entries ?? []) {
      const family = net.family as string | number;
      const isIPv4 = family === 'IPv4' || family === 4;
      if (!isIPv4 || net.internal) continue;
      candidates.push({ name, address: net.address });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => scoreLanCandidate(right) - scoreLanCandidate(left));
  return candidates[0].address;
}
