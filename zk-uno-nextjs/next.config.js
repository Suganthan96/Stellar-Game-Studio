/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack is default in Next.js 16; declare an empty config to acknowledge
  // we're using it alongside the webpack fallback config below.
  turbopack: {},
  webpack: (config) => {
    // polyfill Buffer for stellar-sdk in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve('buffer/'),
      crypto: false,
      stream: false,
      path: false,
      fs: false,
    };
    return config;
  },
};

module.exports = nextConfig;
