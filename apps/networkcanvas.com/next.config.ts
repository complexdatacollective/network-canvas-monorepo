import { join } from 'node:path';

import type { NextConfig } from 'next';
import createNextIntl from 'next-intl/plugin';

import { defaultSiteLocale } from '@codaco/shared-consts';

const withNextIntl = createNextIntl('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.NODE_ENV === 'development'
    ? {}
    : { output: 'export' as const }),
  // Production locale negotiation is handled by the Netlify edge function.
  // Match that behavior locally, where the edge function is not available.
  ...(process.env.NODE_ENV === 'development'
    ? {
        redirects: async () => [
          {
            source: '/',
            destination: `/${defaultSiteLocale}/`,
            permanent: false,
          },
        ],
      }
    : {}),
  trailingSlash: true,
  // Pin the workspace root: in a git worktree Next otherwise detects the parent
  // checkout's pnpm-workspace.yaml and infers the wrong root.
  turbopack: { root: join(import.meta.dirname, '..', '..') },
  // Ships untranspiled TSX from workspace source.
  transpilePackages: ['@codaco/fresco-ui'],
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
