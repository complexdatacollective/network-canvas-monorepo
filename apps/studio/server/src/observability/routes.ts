import { getProcedureContractOrThrow } from '@orpc/contract';

import { contract } from '@codaco/studio-rpc';

const rpcRoutes = new Set<string>();
function collectRpcRoutes(router: object, parts: string[] = []): void {
  for (const [key, value] of Object.entries(router)) {
    const path = [...parts, key];
    try {
      getProcedureContractOrThrow(contract, path);
      rpcRoutes.add(`/rpc/${path.join('/')}`);
    } catch {
      if (value !== null && typeof value === 'object')
        collectRpcRoutes(value, path);
    }
  }
}
collectRpcRoutes(contract);

const exactRoutes = new Set([
  '/healthz',
  '/readyz',
  '/metrics',
  '/ws',
  '/api/v1/status',
  '/api/v1/openapi.json',
]);
const methods = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'CONNECT',
  'TRACE',
]);

/** Finite server-owned route labels: never a raw URL, query, hash or SPA id. */
export function requestRoute(path: string): string {
  if (exactRoutes.has(path) || rpcRoutes.has(path)) return path;
  if (path.startsWith('/api/auth/')) return '/api/auth/*';
  if (path === '/storage' || path === '/storage/') return '/storage';
  if (path.startsWith('/storage/')) return '/storage/:hash';
  if (
    ['/api', '/rpc'].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  )
    return 'unmatched';
  if (path.startsWith('/assets/')) return '/assets/*';
  return 'client';
}

export function requestMethod(method: string): string {
  return methods.has(method) ? method : 'OTHER';
}
