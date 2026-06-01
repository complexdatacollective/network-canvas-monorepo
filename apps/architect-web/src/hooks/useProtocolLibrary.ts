import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

import { type StoredProtocolRow } from '~/utils/assetDB';
import { listProtocols } from '~/utils/protocolLibrary';

// Reactively read the saved-protocol library. Dexie's `liveQuery` re-emits
// whenever the `protocols` table changes (add/update/delete), so the home
// screen stays in sync without manual refetching. `isLoaded` flips true on the
// first emission so callers can distinguish "still loading" from "empty".
export function useProtocolLibrary(): {
  protocols: StoredProtocolRow[];
  isLoaded: boolean;
} {
  const [protocols, setProtocols] = useState<StoredProtocolRow[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const subscription = liveQuery(() => listProtocols()).subscribe({
      next: (rows) => {
        setProtocols(rows);
        setIsLoaded(true);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  return { protocols, isLoaded };
}
