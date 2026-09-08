import { boundedRequestMethod } from '@codaco/studio-sync/operational-http';

const exactRoutes = new Set([
  '/healthz',
  '/readyz',
  '/metrics',
  '/account',
  '/api/v1/entries',
  '/api/v1/openapi.json',
]);

/** Finite service-owned labels: no URL, query, template, publisher or token id. */
export function registryRequestRoute(path: string): string {
  if (exactRoutes.has(path)) return path;
  if (path.startsWith('/account/')) return '/account/*';
  if (path.startsWith('/api/auth/')) return '/api/auth/*';
  if (path.startsWith('/api/v1/artifacts/')) return '/api/v1/artifacts/:root';
  if (path.startsWith('/api/v1/entries/')) return '/api/v1/entries/:id/*';
  if (path.startsWith('/api/v1/account/')) return '/api/v1/account/*';
  if (path.startsWith('/api/v1/moderation/')) return '/api/v1/moderation/*';
  if (path === '/api' || path.startsWith('/api/')) return 'unmatched';
  return 'not_found';
}

export const registryRequestMethod = boundedRequestMethod;
