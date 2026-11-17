import { ALLOWED_ORIGINS, PREVIEW_ORIGIN_PATTERN } from './contract.ts';

/**
 * The origin the response may be read by, or `null` when the request did not
 * come from Architect or a preview of one of its pull requests. `devOrigin` is the one extra origin a local
 * development setup allows (`DEV_ALLOWED_ORIGIN` in `.dev.vars`); it is never
 * set in production.
 */
export const allowedOrigin = (
  request: Request,
  devOrigin: string | undefined,
): string | null => {
  const origin = request.headers.get('Origin');
  if (origin === null) return null;
  if ((ALLOWED_ORIGINS as readonly string[]).includes(origin)) return origin;
  if (PREVIEW_ORIGIN_PATTERN.test(origin)) return origin;
  if (devOrigin !== undefined && devOrigin !== '' && origin === devOrigin) {
    return origin;
  }
  return null;
};

/** The headers every response to an allowed origin carries. */
export const corsHeaders = (origin: string): Record<string, string> => ({
  'Access-Control-Allow-Origin': origin,
  'Vary': 'Origin',
});

/** The answer to a preflight request from an allowed origin. */
export const preflightHeaders = (origin: string): Record<string, string> => ({
  ...corsHeaders(origin),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});
