/**
 * Where a person's language choice is kept. Each scope keeps its own choice
 * and never reads another's: a choice made in an app's switcher is not a
 * choice for an interview, and one made on an interview's language chooser
 * stage is not a choice for the app or another interview. `resolveLocale`
 * puts a scope's choice ahead of the person's requested languages.
 */

/** A scope's kept choice. Storage that fails never stops a change this visit. */
export type LocalePreferenceStore = Readonly<{
  read: () => string | null;
  /** Keeps a choice, or forgets it with null; false when storage refused. */
  write: (locale: string | null) => boolean;
}>;

/** The part of the Web Storage interface a kept choice uses. */
type KeyValueStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/**
 * A choice kept under `key` in Web Storage: `localStorage` for an app on one
 * device, `sessionStorage` for an interview in one tab. `getStorage` is called
 * on each access, since storage can be missing (server rendering) or refuse
 * access (a private window, blocked site data, a sandboxed frame).
 */
export function webStorageLocalePreference(
  getStorage: () => KeyValueStorage | null | undefined,
  key: string,
): LocalePreferenceStore {
  return {
    read: () => {
      try {
        return getStorage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write: (locale) => {
      try {
        const storage = getStorage();
        if (!storage) return false;
        if (locale === null) storage.removeItem(key);
        else storage.setItem(key, locale);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** A cookie that keeps a choice, read on the server and the client. */
export type LocalePreferenceCookie = Readonly<{
  name: string;
  /** Seconds a choice is kept. */
  maxAge: number;
  /**
   * The parent domain whose sites all share the choice. A host outside it (a
   * deploy preview, localhost) keeps its own choice instead.
   */
  domain?: string;
}>;

/** The value of the cookie in a `Cookie` header or `document.cookie`. */
export function readLocalePreferenceCookie(
  cookie: LocalePreferenceCookie,
  cookieHeader: string | null | undefined,
): string | null {
  for (const entry of (cookieHeader ?? '').split(';')) {
    const trimmed = entry.trim();
    if (!trimmed.startsWith(`${cookie.name}=`)) continue;
    const value = trimmed.slice(cookie.name.length + 1);
    if (value !== '') return value;
  }
  return null;
}

const isWithinDomain = (host: string, domain: string) => {
  const hostname = host.toLowerCase().replace(/:\d+$/, '');
  return hostname === domain || hostname.endsWith(`.${domain}`);
};

/**
 * The `Set-Cookie` / `document.cookie` values that keep a choice made on
 * `host`, or forget it with null. On a host within the cookie's domain the
 * choice is kept for the whole domain, and any choice kept for the host alone
 * is expired so it cannot shadow the shared one.
 */
export function serializeLocalePreferenceCookies(
  cookie: LocalePreferenceCookie,
  locale: string | null,
  host?: string,
): readonly string[] {
  const value = (domainAttribute: string, keep: boolean) =>
    keep && locale !== null
      ? `${cookie.name}=${locale}; Path=/;${domainAttribute} Max-Age=${cookie.maxAge}; SameSite=Lax`
      : `${cookie.name}=; Path=/;${domainAttribute} Max-Age=0; SameSite=Lax`;
  const hostOnly = value('', true);
  if (
    cookie.domain === undefined ||
    host === undefined ||
    !isWithinDomain(host, cookie.domain)
  ) {
    return [hostOnly];
  }
  return [value(` Domain=${cookie.domain};`, true), value('', false)];
}
