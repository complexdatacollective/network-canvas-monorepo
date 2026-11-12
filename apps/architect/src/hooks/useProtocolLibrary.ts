import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

import type { LegacyProtocolChoice, StoredProtocolRow } from '~/utils/assetDB';
import {
  legacyLibraryExists,
  type LegacyStoredProtocolRow,
  listLegacyProtocols,
} from '~/utils/legacyProtocolLibrary';
import {
  listLegacyProtocolChoices,
  listProtocols,
} from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';

// Reactively read the saved-protocol library. Dexie's `liveQuery` re-emits
// whenever the `protocols` table changes (add/update/delete), so the home
// screen stays in sync without manual refetching. `isLoaded` flips true once
// every source has emitted, so callers can distinguish "still loading" from
// "empty".
//
// Architect 8's library is a second, read-only source: its protocols are
// listed beside this app's own, with what the researcher decided about each.
// Dexie shares change notifications between tabs, so an Architect 8 tab's
// edits refresh this list too — but only for tables the query read. While
// Architect 8's library does not exist yet the query reads none of it, so
// when this window is shown or focused again (after the researcher has been
// to Architect 8 in another tab or window) the hook checks whether the
// library has appeared since, and if it has, subscribes afresh.
export function useProtocolLibrary(): {
  protocols: StoredProtocolRow[];
  legacyProtocols: LegacyStoredProtocolRow[];
  legacyChoices: LegacyProtocolChoice[];
  isLoaded: boolean;
} {
  const [protocols, setProtocols] = useState<StoredProtocolRow[]>([]);
  const [legacy, setLegacy] = useState<{
    protocols: LegacyStoredProtocolRow[];
    choices: LegacyProtocolChoice[];
  }>({ protocols: [], choices: [] });
  const [ownLoaded, setOwnLoaded] = useState(false);
  const [legacyLoaded, setLegacyLoaded] = useState(false);
  // Whether the last read found Architect 8's library, and a counter that
  // re-subscribes the legacy query once a missing library has appeared.
  const [legacyFound, setLegacyFound] = useState(true);
  const [legacySubscription, setLegacySubscription] = useState(0);

  useEffect(() => {
    const subscription = liveQuery(() => listProtocols()).subscribe({
      next: (rows) => {
        setProtocols(rows);
        setOwnLoaded(true);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const subscription = liveQuery(async () => ({
      // Asked before the list is read: a library created in between is then
      // read now and checked for again later, never missed.
      found: await legacyLibraryExists(),
      protocols: await listLegacyProtocols(),
      // Losing the remembered choices loses only the "Upgraded" marks; it
      // must not also hide the protocols or keep the library from loading.
      choices: await listLegacyProtocolChoices().catch((error: unknown) => {
        reportError(error, { operation: 'legacy-choices-list' });
        return [];
      }),
    })).subscribe({
      next: ({ found, ...next }) => {
        setLegacy(next);
        setLegacyFound(found);
        setLegacyLoaded(true);
      },
      // None of the reads above rejects; this is the last guard against a
      // library that never finishes loading.
      error: () => {
        setLegacyLoaded(true);
      },
    });
    return () => subscription.unsubscribe();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `legacySubscription` counts the times Architect 8's library has appeared since the last read; each one subscribes afresh, so the query reads its tables
  }, [legacySubscription]);

  useEffect(() => {
    if (legacyFound) return undefined;
    let active = true;
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      void legacyLibraryExists().then((exists) => {
        if (exists && active) setLegacySubscription((count) => count + 1);
        return undefined;
      });
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      active = false;
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [legacyFound]);

  return {
    protocols,
    legacyProtocols: legacy.protocols,
    legacyChoices: legacy.choices,
    isLoaded: ownLoaded && legacyLoaded,
  };
}
