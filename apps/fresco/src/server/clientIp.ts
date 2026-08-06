import '@tanstack/react-start/server-only';
import { getRequestHeader } from '@tanstack/react-start/server';

/**
 * `utils/getClientIp.ts` over Start's request headers. Synchronous, because
 * Start's header access is.
 */
export function getClientIp(): string | null {
  const cfConnectingIp = getRequestHeader('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  const xRealIp = getRequestHeader('x-real-ip');
  if (xRealIp) return xRealIp;

  const xForwardedFor = getRequestHeader('x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return null;
}
