import { join } from 'node:path';

import { withPostHogConfig } from '@posthog/nextjs-config';
import type { NextConfig } from 'next';
import createNextIntl from 'next-intl/plugin';

import { defaultSiteLocale } from '@codaco/shared-consts';

const withNextIntl = createNextIntl('./lib/i18n/request.ts');

const documentationUrl =
  process.env.NEXT_PUBLIC_DOCUMENTATION_URL ||
  (process.env.CONTEXT === 'deploy-preview' && process.env.REVIEW_ID
    ? `https://deploy-preview-${process.env.REVIEW_ID}--documentation-dev.netlify.app`
    : undefined);

// The gallery subdomain is a domain alias of the production site only. Deploy
// previews and local development serve a single host, so there the gallery
// stays a route of this site and its links keep the `/protocol-gallery` prefix.
const protocolGalleryUrl =
  process.env.NEXT_PUBLIC_PROTOCOL_GALLERY_URL ||
  (process.env.CONTEXT === 'production'
    ? 'https://protocolgallery.networkcanvas.com'
    : undefined);

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
          {
            source: '/get-started',
            destination: `/${defaultSiteLocale}/get-started/`,
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
  transpilePackages: [
    '@codaco/fresco-ui',
    '@codaco/interface-images',
    '@codaco/protocol-validation',
  ],
  images: {
    unoptimized: true,
  },
  env: {
    ...(documentationUrl
      ? { NEXT_PUBLIC_DOCUMENTATION_URL: documentationUrl }
      : {}),
    ...(protocolGalleryUrl
      ? { NEXT_PUBLIC_PROTOCOL_GALLERY_URL: protocolGalleryUrl }
      : {}),
  },
};

// PostHog needs source maps to symbolicate the exceptions posthog-js reports
// (see instrumentation-client.ts). The credentials are set only on the
// production release job (.github/workflows/ci-and-release.yml), so every other
// build — local, PR, Netlify preview — emits no maps at all. `deleteAfterUpload`
// removes them from the compiler output once uploaded, which happens in the
// post-compile hook before the static export writes `out/`, so the deployed site
// never serves a map. Both variables are declared in turbo.json's website build
// `env` so an uploading build can never reuse a non-uploading cache entry.
const posthogPersonalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;

// withPostHogConfig must stay the OUTERMOST wrapper — withNextIntl returns a
// plain object, which would drop the build hooks that upload source maps.
export default withPostHogConfig(withNextIntl(nextConfig), {
  personalApiKey: posthogPersonalApiKey ?? 'none',
  projectId: posthogProjectId ?? 'none',
  sourcemaps: {
    enabled: !!posthogPersonalApiKey && !!posthogProjectId,
    releaseName: 'Website',
    deleteAfterUpload: true,
  },
});
