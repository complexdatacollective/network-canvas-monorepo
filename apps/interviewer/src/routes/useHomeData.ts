import { useCallback, useEffect, useState } from 'react';

import { getSettings, listProtocols, listSessions } from '~/lib/db/api';
import type {
  ProtocolWithCounts,
  StoredSessionLite,
  StoredSettings,
} from '~/lib/db/types';

type HomeData = {
  protocols: ProtocolWithCounts[];
  sessions: StoredSessionLite[];
  settings: StoredSettings | null;
};

const EMPTY_HOME_DATA: HomeData = {
  protocols: [],
  sessions: [],
  settings: null,
};

// Resolves to null when the load fails, so the caller keeps what it has.
async function loadHomeData(): Promise<HomeData | null> {
  try {
    const [protocols, sessions, settings] = await Promise.all([
      listProtocols(),
      listSessions(),
      getSettings(),
    ]);
    return { protocols, sessions, settings };
  } catch {
    // Load failures leave state empty; the DB facade logs the underlying error.
    return null;
  }
}

// Loads the data the Home route renders (protocols of every schema, sessions
// and settings, all from the one database) and exposes `reload` so mutations
// elsewhere (imports, deletes, settings changes) can refresh them
// together.
export function useHomeData() {
  const [data, setData] = useState<HomeData>(EMPTY_HOME_DATA);

  const reload = useCallback(async () => {
    const next = await loadHomeData();
    if (next) setData(next);
  }, []);

  // The lists live in IndexedDB, so the only way to know them is to ask and
  // wait: the state written here is that answer arriving, which is what an
  // effect is for.
  useEffect(() => {
    const load = async () => {
      const next = await loadHomeData();
      if (next) setData(next);
    };
    void load();
  }, []);

  return { ...data, reload };
}
