/** @type {import('next').NextConfig} */
const nextConfig = {
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
