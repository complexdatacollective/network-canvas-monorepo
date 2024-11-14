import createNextIntl from 'next-intl/plugin';
import NextBundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntl('./lib/i18n/request.ts');
const withBundleAnalyzer = NextBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});


/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@codaco/ui",
  ],
  experimental: {
    fallbackNodePolyfills: false, // Turning this off will cause issues with Nodejs dependencies (such as dotenv) if they get imported into client code.
  }
  /** We already do linting and typechecking as separate tasks in CI */
  // eslint: { ignoreDuringBuilds: true },
  // typescript: { ignoreBuildErrors: true },
};



// Merge NextIntl config with Next.js config
export default withBundleAnalyzer(withNextIntl(nextConfig));
