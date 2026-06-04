/** @type {import('next').NextConfig} */
function normalizeOrigin(value) {
  const raw = (value || '').trim();
  if (!raw) return 'http://localhost:3001';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
}

const apiOrigin = normalizeOrigin(
  process.env.NEXT_PUBLIC_API_ORIGIN || process.env.NEXT_PUBLIC_API_URL
);

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
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
