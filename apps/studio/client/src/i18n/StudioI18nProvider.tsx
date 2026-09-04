import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { resolveAppLocale } from '@codaco/app-i18n/negotiate';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import { SUPPORTED_STUDIO_LOCALES } from '@codaco/studio-rpc';
import type { SupportedStudioLocale } from '@codaco/studio-rpc';

import { orpc, rpcClient } from '../lib/api.ts';
import { sessionQueryOptions } from '../lib/session.ts';
import { studioCatalogs } from '../locales/catalogs.ts';
import { studioDefaultLocale, studioLocales } from './locales.ts';
import {
  clearLocaleMirror,
  readLocaleMirror,
  writeLocaleMirror,
} from './mirror.ts';

/**
 * Studio's half of the app locale machinery (2026-09-04 localization design
 * §5.1): the negotiation chain, the device mirror, and the account-preference
 * write. `AppI18nProvider` below owns rendering and `<html lang>`/`<html dir>`;
 * this module owns which locale is active and where the choice persists.
 *
 * The chain is stored preference → device mirror → browser negotiation →
 * default. Before identity loads, the mirror stands in for the stored
 * preference (that is what it exists for); `LocaleSync`, a leaf inside the
 * signed-in shell, applies the server's answer once `me` resolves and keeps
 * the mirror agreeing with it.
 */

/** Where a preference write to the account stands. */
export type LocaleSaveState = 'idle' | 'saving' | 'saved' | 'error';

type StudioLocaleContextValue = Readonly<{
  /**
   * The explicit stored preference — a declared locale tag, or `null` when
   * the researcher follows browser negotiation ("Automatic").
   */
  preference: string | null;
  saveState: LocaleSaveState;
  /**
   * The researcher's own choice: applies immediately, mirrors to the device,
   * and — for a signed-in session and a server-storable tag — persists to the
   * account. The dev-only pseudo-locale is device-only and never sent.
   */
  setLocale: (locale: string | null) => void;
  /**
   * `LocaleSync`'s entry point: the server-stored preference for `userId`,
   * applied unless a fresher local change by that same account is still
   * unacknowledged.
   */
  applyServerPreference: (locale: string | null, userId: string) => void;
}>;

const StudioLocaleContext = createContext<StudioLocaleContextValue | null>(
  null,
);

function isSupportedStudioLocale(
  value: string,
): value is SupportedStudioLocale {
  return (SUPPORTED_STUDIO_LOCALES as readonly string[]).includes(value);
}

function resolveActiveLocale(preference: string | null): string {
  return resolveAppLocale({
    stored: preference,
    requested: navigator.languages,
    locales: studioLocales,
    defaultLocale: studioDefaultLocale,
  }).locale;
}

export function StudioI18nProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Resolved synchronously, before the first route renders beneath this
  // provider (design invariant 7): a returning researcher's own device never
  // sees a language flash. `source` distinguishes a mirror that decided from
  // a mirror that was absent or no longer declared — only the former is an
  // explicit preference the language page should show.
  const [preference, setPreference] = useState<string | null>(() => {
    const resolved = resolveAppLocale({
      stored: readLocaleMirror(),
      requested: navigator.languages,
      locales: studioLocales,
      defaultLocale: studioDefaultLocale,
    });
    return resolved.source === 'stored' ? resolved.locale : null;
  });
  const [saveState, setSaveState] = useState<LocaleSaveState>('idle');

  // The preference as of this render, for callbacks that must compare
  // against the current value rather than the one they closed over.
  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;

  // A local choice the server has not yet reflected back through `me`. While
  // one is outstanding — in flight, or kept after a failed write — a stale
  // `me` payload must not clobber it (`LocaleSync` reads cached data first).
  //
  // It is stamped with BOTH the account that issued the write and the write's
  // generation, because a bare `{ locale }` marker suppresses the server's own
  // preference in three ways that all end with a researcher stuck in the wrong
  // language until they reload:
  //
  //   - set for a device-only choice (signed out, or the pseudo-locale), it
  //     can never be acknowledged, because no write was ever sent;
  //   - kept across sign-out and a sign-in as somebody else, it answers for an
  //     account that did not make it;
  //   - overwritten by a second choice, it lets the first write's late reply
  //     acknowledge the second.
  const pendingServerAck = useRef<{
    locale: string | null;
    userId: string;
    generation: number;
  } | null>(null);
  const writeGeneration = useRef(0);

  const setLocale = useCallback(
    (locale: string | null) => {
      setSaveState('idle');
      setPreference(locale);
      if (locale === null) {
        clearLocaleMirror();
      } else {
        writeLocaleMirror(locale);
      }

      // Every call supersedes any write still in flight, so a reply that
      // arrives after a newer choice cannot revive its own save state or
      // acknowledge somebody else's locale.
      const generation = ++writeGeneration.current;

      // The pseudo-locale is a development aid, never a stored preference
      // (design §4.7); and with no session there is no account to store to —
      // the mirror alone carries a signed-out device's choice. Neither leaves
      // a pending marker: nothing will ever acknowledge one, and a permanent
      // marker means the account's own preference never applies at sign-in.
      const storable =
        locale !== PSEUDO_LOCALE &&
        (locale === null || isSupportedStudioLocale(locale));
      const signedIn =
        queryClient.getQueryData(sessionQueryOptions.queryKey) === 'signedIn';
      // Identity comes from the cache `LocaleSync` already populates. Without
      // it there is nobody to attribute the write to, so it is not sent —
      // rather than sent unattributably, which is what would let it answer for
      // the next account.
      const userId = queryClient.getQueryData(
        orpc.me.queryOptions().queryKey,
      )?.userId;

      if (!storable || !signedIn || userId === undefined) {
        pendingServerAck.current = null;
        return;
      }

      pendingServerAck.current = { locale, userId, generation };
      setSaveState('saving');
      void (async () => {
        try {
          await rpcClient.account.updateLocale({ locale });
          if (writeGeneration.current !== generation) return;
          setSaveState('saved');
          // `me` now reports the new value; refetch so LocaleSync's
          // acknowledgment comparison sees it rather than a stale payload.
          await queryClient.invalidateQueries({ queryKey: orpc.me.key() });
        } catch {
          if (writeGeneration.current !== generation) return;
          // The local change stands — the device honours it via the mirror —
          // and the language page surfaces that the account write failed.
          // The pending marker stays, so a refetch of the old server value
          // cannot silently revert what the researcher chose.
          setSaveState('error');
        }
      })();
    },
    [queryClient],
  );

  const applyServerPreference = useCallback(
    (locale: string | null, userId: string) => {
      // A development aid outranks the account: the pseudo-locale is never
      // stored, so the server can only ever disagree with it, and letting that
      // disagreement win would end the session it was turned on for.
      if (preferenceRef.current === PSEUDO_LOCALE) return;

      const pending = pendingServerAck.current;
      if (pending !== null) {
        if (pending.userId !== userId) {
          // Another account's unacknowledged write. It has no standing here,
          // and keeping it would lock this researcher out of their own
          // preference for the rest of the session.
          pendingServerAck.current = null;
        } else {
          // Server wins over the mirror, but not over a fresher local change
          // the server has not acknowledged yet.
          if (locale === pending.locale) pendingServerAck.current = null;
          return;
        }
      }
      if (locale === preferenceRef.current) return;
      if (locale === null) {
        clearLocaleMirror();
      } else {
        writeLocaleMirror(locale);
      }
      setPreference(locale);
    },
    [],
  );

  const activeLocale = useMemo(
    () => resolveActiveLocale(preference),
    [preference],
  );

  const value = useMemo<StudioLocaleContextValue>(
    () => ({ preference, saveState, setLocale, applyServerPreference }),
    [preference, saveState, setLocale, applyServerPreference],
  );

  return (
    <StudioLocaleContext.Provider value={value}>
      <AppI18nProvider
        locale={activeLocale}
        locales={studioLocales}
        messages={studioCatalogs[activeLocale]}
        onLocaleChange={setLocale}
      >
        {children}
      </AppI18nProvider>
    </StudioLocaleContext.Provider>
  );
}

/** Locale preference state for the language page and `LocaleSync`. */
export function useStudioLocale(): StudioLocaleContextValue {
  const context = useContext(StudioLocaleContext);
  if (context === null) {
    throw new Error('useStudioLocale requires a StudioI18nProvider ancestor');
  }
  return context;
}
