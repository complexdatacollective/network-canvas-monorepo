import { useCallback, useEffect, useState } from 'react';

import {
  getSettings,
  listLegacyUpgrades,
  listProtocols,
  listSessions,
} from '~/lib/db/api';
import {
  type LegacyProtocolSummary,
  type LegacySessionSummary,
  listLegacyProtocols,
  listLegacySessions,
} from '~/lib/db/legacyLibrary';
import type {
  ProtocolWithCounts,
  StoredSessionLite,
  StoredSettings,
} from '~/lib/db/types';

const NO_UPGRADES: ReadonlySet<string> = new Set();

// Loads the data the Home route renders (protocols, sessions, settings, and
// Interviewer 8's protocols and interviews beside them) and exposes `reload`
// so mutations elsewhere (imports, deletes, upgrades, settings changes) can
// refresh them together.
export function useHomeData() {
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
  const [sessions, setSessions] = useState<StoredSessionLite[]>([]);
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [legacyProtocols, setLegacyProtocols] = useState<
    LegacyProtocolSummary[]
  >([]);
  const [legacySessions, setLegacySessions] = useState<LegacySessionSummary[]>(
    [],
  );
  // The schema 8 hashes that already have an upgraded copy here.
  const [upgradedLegacyHashes, setUpgradedLegacyHashes] =
    useState<ReadonlySet<string>>(NO_UPGRADES);

  const reload = useCallback(async () => {
    // Interviewer 8's library is read on its own: its reads never reject, and
    // a failure of this app's database must not hide it, nor it this one.
    const legacy = Promise.all([listLegacyProtocols(), listLegacySessions()]);
    try {
      const [p, s, st, upgrades] = await Promise.all([
        listProtocols(),
        listSessions(),
        getSettings(),
        listLegacyUpgrades(),
      ]);
      setProtocols(p);
      setSessions(s);
      setSettings(st);
      setUpgradedLegacyHashes(
        new Set(upgrades.map((record) => record.legacyHash)),
      );
    } catch {
      // Load failures leave state empty; the DB facade logs the underlying error.
    }
    const [lp, ls] = await legacy;
    setLegacyProtocols(lp);
    setLegacySessions(ls);
  }, []);

  // The lists live in IndexedDB, so the only way to know them is to ask and
  // wait: the state written here is that answer arriving, which is what an
  // effect is for.
  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    protocols,
    sessions,
    settings,
    legacyProtocols,
    legacySessions,
    upgradedLegacyHashes,
    reload,
  };
}
