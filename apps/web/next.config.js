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
      : 'http://localhost:3001')
);

const devAllowedOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

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
    ];
  },
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: `${apiOrigin.replace(/\/+$/, '')}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
