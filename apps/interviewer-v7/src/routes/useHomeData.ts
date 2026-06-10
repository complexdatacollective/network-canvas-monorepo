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
    const [p, s, st] = await Promise.all([
      listProtocols(),
      listSessions(),
      getSettings(),
    ]);
    setProtocols(p);
    setSessions(s);
    setSettings(st);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { protocols, sessions, settings, reload };
}
