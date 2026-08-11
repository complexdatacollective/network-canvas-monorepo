import { join } from 'node:path';

import NextBundleAnalyzer from '@next/bundle-analyzer';
import { withPostHogConfig } from '@posthog/nextjs-config';
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

const networkCanvasUrl =
  process.env.NEXT_PUBLIC_NETWORK_CANVAS_URL ||
  (process.env.CONTEXT === 'deploy-preview' && process.env.REVIEW_ID
    ? `https://deploy-preview-${process.env.REVIEW_ID}--networkcanvasdotdev.netlify.app`
    : undefined);

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
  transpilePackages: ['@codaco/interface-images', '@codaco/fresco-ui'],
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_IS_PRODUCTION: String(isProduction),
    ...(networkCanvasUrl
      ? { NEXT_PUBLIC_NETWORK_CANVAS_URL: networkCanvasUrl }
      : {}),
  },
  typedRoutes: true,
  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },
};

// PostHog needs source maps to symbolicate the exceptions posthog-js reports
// (see instrumentation-client.ts). The credentials are set only on the
// production release job (.github/workflows/ci-and-release.yml), so every other
// build — local, PR, Netlify preview — emits no maps at all. `deleteAfterUpload`
// removes them from the compiler output once uploaded, which happens in the
// post-compile hook before the static export writes `out/`, so the deployed site
// never serves a map. Both variables are declared in turbo.json's documentation
// build `env` so an uploading build can never reuse a non-uploading cache entry.
const posthogPersonalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;

// Merge NextIntl config with Next.js config. withPostHogConfig must stay the
// OUTERMOST wrapper — the wrappers below return a plain object, which would
// drop the build hooks that upload source maps.
export default withPostHogConfig(withBundleAnalyzer(withNextIntl(nextConfig)), {
  personalApiKey: posthogPersonalApiKey ?? 'none',
  projectId: posthogProjectId ?? 'none',
  sourcemaps: {
    enabled: !!posthogPersonalApiKey && !!posthogProjectId,
    releaseName: 'Documentation',
    deleteAfterUpload: true,
  },
});
