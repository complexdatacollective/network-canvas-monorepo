import { loadEnv, type Plugin } from 'vite';

import { POSTHOG_HOST } from '../../../packages/shared-consts/src/posthog.ts';
import { createPostHogSourceMapsPlugin } from '../../../scripts/posthog-source-maps-plugin.ts';

/** Same credential-gated, hidden-map upload/delete lane as the other apps. */
export function studioSourceMaps(
  mode: string,
  directory: string,
  version: string,
): Plugin[] {
  const env = loadEnv(mode, directory, 'POSTHOG_');
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) return [];
  return [
    createPostHogSourceMapsPlugin({
      personalApiKey: env.POSTHOG_PERSONAL_API_KEY,
      projectId: env.POSTHOG_PROJECT_ID,
      cliBinaryPath: env.POSTHOG_CLI_BINARY_PATH || undefined,
      sourcemaps: {
        enabled: true,
        releaseName: 'Studio',
        releaseVersion: version,
        deleteAfterUpload: true,
      },
    }),
  ];
}

/** In the HTML so both CDN and Node-served clients receive the same policy. */
export function studioClientPrivacy(): Plugin {
  return {
    name: 'studio-client-privacy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { name: 'referrer', content: 'no-referrer' },
          injectTo: 'head-prepend',
        },
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            'content': [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              `connect-src 'self' data: blob: ${POSTHOG_HOST}`,
              "worker-src 'self' blob:",
              "frame-src 'self'",
              "base-uri 'none'",
              "object-src 'none'",
              "form-action 'self'",
            ].join('; '),
          },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}
