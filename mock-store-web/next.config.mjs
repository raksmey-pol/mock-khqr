/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Soramitsu Callback API spec URLs → mock endpoints. Rewrites keep both
  // paths served by the same route handler so in-memory state stays shared.
  async rewrites() {
    return [
      {
        source: "/api/v1/health-check",
        destination: "/store/callback/health-check",
      },
      {
        source: "/api/v1/transactions/callback",
        destination: "/store/callback/transactions",
      },
    ];
  },
};

export default nextConfig;
