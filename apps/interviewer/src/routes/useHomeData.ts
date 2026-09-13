import { useCallback, useEffect, useState } from 'react';

import { getSettings, listProtocols, listSessions } from '~/lib/db/api';
import type {
  ProtocolWithCounts,
  StoredSessionLite,
  StoredSettings,
} from '~/lib/db/types';

// Loads the data the Home route renders (protocols, sessions, settings) and
// exposes `reload` so mutations elsewhere (imports, deletes, settings
// changes) can refresh all three together.
export function useHomeData() {
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
  const [sessions, setSessions] = useState<StoredSessionLite[]>([]);
  const [settings, setSettings] = useState<StoredSettings | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, s, st] = await Promise.all([
        listProtocols(),
        listSessions(),
        getSettings(),
      ]);
      setProtocols(p);
      setSessions(s);
      setSettings(st);
    } catch {
      // Load failures leave state empty; the DB facade logs the underlying error.
    }
  }, []);

  // The three lists live in IndexedDB, so the only way to know them is to ask
  // and wait: the state written here is that answer arriving, which is what an
  // effect is for.
  useEffect(() => {
    void reload();
  }, [reload]);

  return { protocols, sessions, settings, reload };
}
