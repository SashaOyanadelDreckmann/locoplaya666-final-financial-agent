const lanDevHosts =
  process.env.NODE_ENV === 'production'
    ? { buildLanDevOrigins: () => [], formatLanDevBanner: () => '' }
    : require('../../scripts/dev/lan-dev-hosts.mjs');

const { buildLanDevOrigins, formatLanDevBanner } = lanDevHosts;

/** @type {import('next').NextConfig} */
function normalizeOrigin(value) {
  const raw = (value || '').trim();
  if (!raw) return 'http://localhost:3001';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
}

const apiOrigin = normalizeOrigin(
  process.env.NEXT_PUBLIC_API_ORIGIN ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://locoplaya666-final-financial-agent-production.up.railway.app'
      : 'http://127.0.0.1:3001')
);

/** Next rewrites run on the dev machine — always loopback in development. */
const backendRewriteOrigin =
  process.env.NODE_ENV === 'production'
    ? apiOrigin
    : normalizeOrigin(process.env.INTERNAL_API_ORIGIN ?? '') || 'http://127.0.0.1:3001';

const devAllowedOrigins = [
  ...(process.env.DEV_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  ...buildLanDevOrigins(Number(process.env.PORT) || 3000),
];

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  ...(process.env.NODE_ENV !== 'production' && devAllowedOrigins.length > 0
    ? { allowedDevOrigins: devAllowedOrigins }
    : {}),
  experimental: {
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  webpack: (config, { dev }) => {
    if (!dev && config?.optimization?.minimizer) {
      config.optimization.minimizer = config.optimization.minimizer.filter(
        (plugin) => {
          const name = plugin?.constructor?.name ?? '';
          return !name.toLowerCase().includes('cssminimizer');
        }
      );
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: '/demo',
        destination: '/register',
        permanent: false,
      },
      {
        source: '/budgetpreview',
        destination: '/agent',
        permanent: false,
      },
      {
        source: '/budgetpreview/:path*',
        destination: '/agent',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: `${backendRewriteOrigin.replace(/\/+$/, '')}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

if (process.env.NODE_ENV !== 'production') {
  const banner = formatLanDevBanner({
    webPort: Number(process.env.PORT) || 3000,
    apiPort: Number(process.env.API_PORT) || 3001,
  });
  if (banner) {
    // eslint-disable-next-line no-console
    console.log(banner);
  }
}
