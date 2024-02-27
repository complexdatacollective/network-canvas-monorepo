import createNextIntl from 'next-intl/plugin';

const withNextIntl = createNextIntl();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@acme/ui",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

// Merge NextIntl config with Next.js config
export default withNextIntl(nextConfig);
