import { join } from 'node:path';

import NextBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import createNextIntl from 'next-intl/plugin';

const withNextIntl = createNextIntl('./lib/i18n/request.ts');
const withBundleAnalyzer = NextBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const isProduction =
  process.env.VERCEL_ENV === 'production' ||
  process.env.CONTEXT === 'production' ||
  process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.NODE_ENV === 'development'
    ? {}
    : { output: 'export' as const }),
  // Static production hosts apply their own redirect rules. In development,
  // redirect before rendering so `/` never falls through to the static-export
  // redirect page's not-found fallback body.
  ...(process.env.NODE_ENV === 'development'
    ? {
        redirects: async () => [
          {
            source: '/',
            destination: '/en',
            permanent: false,
          },
        ],
      }
    : {}),
  // Pin the workspace root: in a git worktree Next otherwise detects the parent
  // checkout's pnpm-workspace.yaml and infers the wrong root.
  turbopack: { root: join(import.meta.dirname, '..', '..') },
  // Ships untranspiled TSX + assets referenced via new URL(..., import.meta.url)
  transpilePackages: ['@codaco/interface-images'],
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_IS_PRODUCTION: String(isProduction),
  },
  typedRoutes: true,
  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },
};

// Merge NextIntl config with Next.js config
export default withBundleAnalyzer(withNextIntl(nextConfig));
