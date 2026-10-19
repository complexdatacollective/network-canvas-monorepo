import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

import type { LegacyProtocolChoice, StoredProtocolRow } from '~/utils/assetDB';
import {
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
// edits refresh this list too.
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
      protocols: await listLegacyProtocols(),
      // Losing the remembered choices loses only the "Upgraded" marks; it
      // must not also hide the protocols or keep the library from loading.
      choices: await listLegacyProtocolChoices().catch((error: unknown) => {
        reportError(error, { operation: 'legacy-choices-list' });
        return [];
      }),
    })).subscribe({
      next: (next) => {
        setLegacy(next);
        setLegacyLoaded(true);
      },
      // Neither read above rejects; this is the last guard against a library
      // that never finishes loading.
      error: () => {
        setLegacyLoaded(true);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  return {
    protocols,
    legacyProtocols: legacy.protocols,
    legacyChoices: legacy.choices,
    isLoaded: ownLoaded && legacyLoaded,
  };
}
