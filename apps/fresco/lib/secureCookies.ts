import 'server-only';
import { env } from '~/env';

/**
 * Whether Fresco's cookies carry the `Secure` flag: on in production.
 * COOKIE_SECURE overrides that when set (e.g. 'false' for test servers on
 * http://localhost, where WebKit rejects Secure cookies over plain HTTP). The
 * string comparison handles both validated (boolean) and unvalidated (string)
 * env.
 */
export function secureCookies(): boolean {
  return env.COOKIE_SECURE !== undefined
    ? String(env.COOKIE_SECURE) !== 'false'
    : env.NODE_ENV === 'production';
}
