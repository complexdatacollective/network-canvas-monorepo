import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  /** Linting and typechecking run as separate tasks in CI. */
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
