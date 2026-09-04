import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
   * Forgets what became of the last write. The provider outlives every screen,
   * so the control calls this as it mounts: a result belongs to the choice that
   * produced it, and announcing it again to whoever arrives next — through a
   * live region, at somebody who has chosen nothing — describes a visit that is
   * not theirs.
   */
  resetSaveState: () => void;
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
  //
  // `userId` is `null` for a write issued before `me` answered: the request
  // itself needs no identity — the session cookie carries it — so it goes out
  // either way, and only the marker is left waiting. It names the account this
  // session turns out to be, which `applyServerPreference` fills in with the
  // first identity to arrive.
  const pendingServerAck = useRef<{
    locale: string | null;
    userId: string | null;
    generation: number;
  } | null>(null);
  const writeGeneration = useRef(0);

  // Account writes run one at a time. Two `updateLocale` requests in flight
  // can settle in either order, and the account keeps whichever landed last —
  // so an older request answering last leaves the server storing a language
  // the researcher has already moved off, with the page still reporting the
  // newer one as saved and nothing on this device disagreeing until their next
  // visit.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  // Read as a subscription rather than from the cache, because this one fact
  // is about a TRANSITION: the query the guards already share, observed for
  // the moment it changes.
  const sessionState = useQuery(sessionQueryOptions).data;

  // An unattributed marker is owned by "whoever this session turns out to be",
  // and the session ending is the moment that stops being answerable: the next
  // identity to arrive belongs to somebody else, and a marker that adopted
  // them would refuse them their own preference for the rest of their visit.
  // An attributed one needs no such rule — it names its account, and
  // `applyServerPreference` drops it as soon as another one signs in.
  useEffect(() => {
    if (sessionState !== 'signedOut') return;
    if (pendingServerAck.current?.userId === null) {
      pendingServerAck.current = null;
    }
  }, [sessionState]);

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

      if (!storable || !signedIn) {
        pendingServerAck.current = null;
        return;
      }

      // Identity comes from the cache `LocaleSync` already populates, and is
      // routinely not there yet: the app shell's guard reads the team list
      // rather than `me`, so a screen is on the page — the language screen
      // included — while identity is still in flight. Waiting for it would
      // mean discarding a choice the researcher has just made and watching the
      // payload that follows put them back on the old language.
      const userId =
        queryClient.getQueryData(orpc.me.queryOptions().queryKey)?.userId ??
        null;

      pendingServerAck.current = { locale, userId, generation };
      setSaveState('saving');
      // Waits for the write before it rather than racing it. The `catch` is
      // insurance rather than a path anything takes — the body below settles
      // every outcome itself — but a predecessor that ever did reject would
      // take the whole chain with it, and the researcher would get no further
      // writes for the rest of the session with nothing to show for it.
      const previousWrite = writeQueue.current;
      writeQueue.current = (async () => {
        await previousWrite.catch(() => undefined);
        // Superseded before its turn came. The newer choice is queued behind
        // this one, so sending this would only ask the account to hold, for as
        // long as the round trip takes, a language nothing on screen claims.
        if (writeGeneration.current !== generation) return;
        try {
          await rpcClient.account.updateLocale({ locale });
          if (writeGeneration.current !== generation) return;
          setSaveState('saved');
          // `me` now reports the new value; refetch so LocaleSync's
          // acknowledgment comparison sees it rather than a stale payload.
          await queryClient.invalidateQueries({ queryKey: orpc.me.key() });
          // `LocaleSync` acknowledges the write when that refetch reports
          // something new, and it often reports nothing new: a researcher who
          // tries a language and goes back to the one they had ends on the
          // value `me` already carried, so an effect keyed on the account and
          // the locale never runs. Read the answer here as well, because what
          // acknowledges a write is the server being SEEN to hold the value,
          // not an observer happening to change. A marker left standing after
          // that refuses every later payload as stale — including the
          // preference this researcher sets on their other device.
          const stored = queryClient.getQueryData(
            orpc.me.queryOptions().queryKey,
          )?.locale;
          if (
            stored === locale &&
            pendingServerAck.current?.generation === generation
          ) {
            pendingServerAck.current = null;
          }
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

  const resetSaveState = useCallback(() => setSaveState('idle'), []);

  const applyServerPreference = useCallback(
    (locale: string | null, userId: string) => {
      // A development aid outranks the account: the pseudo-locale is never
      // stored, so the server can only ever disagree with it, and letting that
      // disagreement win would end the session it was turned on for.
      if (preferenceRef.current === PSEUDO_LOCALE) return;

      const pending = pendingServerAck.current;
      if (pending !== null) {
        // A write issued before identity resolved carries no account yet: it
        // belongs to whichever one this session turns out to be, and this is
        // that answer arriving. Adopting it here is what puts it under the
        // ordinary rules below from now on — including having no standing once
        // somebody else signs in.
        const owner = pending.userId ?? userId;
        if (owner === userId) {
          // Server wins over the mirror, but not over a fresher local change
          // the server has not acknowledged yet.
          pendingServerAck.current =
            locale === pending.locale ? null : { ...pending, userId };
          return;
        }
        // Another account's unacknowledged write. It has no standing here,
        // and keeping it would lock this researcher out of their own
        // preference for the rest of the session.
        pendingServerAck.current = null;
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
    () => ({
      preference,
      saveState,
      setLocale,
      resetSaveState,
      applyServerPreference,
    }),
    [preference, saveState, setLocale, resetSaveState, applyServerPreference],
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
