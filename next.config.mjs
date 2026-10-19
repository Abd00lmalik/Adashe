/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Transpile connectkit ESM
  transpilePackages: ['connectkit'],
  webpack: (config) => {
    // Stub missing optional peer deps pulled in by @base-org/account via @wagmi/connectors
    // We don't use Base smart accounts or x402 — these are safe to stub.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/evm': false,
      '@coinbase/cdp-sdk': false,
      '@base-org/account': false,
    }
    return config
  },
}

export default nextConfig
