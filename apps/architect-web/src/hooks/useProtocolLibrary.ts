import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

import { type StoredProtocolRow } from '~/utils/assetDB';
import { listProtocols } from '~/utils/protocolLibrary';

// Reactively read the saved-protocol library. Dexie's `liveQuery` re-emits
// whenever the `protocols` table changes (add/update/delete), so the home
// screen stays in sync without manual refetching.
export function useProtocolLibrary(): StoredProtocolRow[] {
  const [protocols, setProtocols] = useState<StoredProtocolRow[]>([]);

  useEffect(() => {
    const subscription = liveQuery(() => listProtocols()).subscribe({
      next: setProtocols,
    });
    return () => subscription.unsubscribe();
  }, []);

  return protocols;
}
