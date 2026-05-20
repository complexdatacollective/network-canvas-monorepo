import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import { BrandHeader } from '~/components/BrandHeader';
import { DataView } from '~/components/DataView';
import { ImportDialog } from '~/components/ImportDialog';
import { NewSessionDialog } from '~/components/NewSessionDialog';
import { ProtocolDeck } from '~/components/ProtocolCarousel/ProtocolDeck';
import { ResumePill } from '~/components/ResumePill';
import { SettingsDialog } from '~/components/SettingsDialog';
import { StatusRow } from '~/components/StatusRow';
import { TopActionBar } from '~/components/TopActionBar';
import { getSettings, listProtocols, listSessions } from '~/lib/db/api';
import type {
  ProtocolWithCounts,
  StoredSession,
  StoredSettings,
} from '~/lib/db/types';

type OpenDialog = 'import' | 'settings' | null;
type View = 'protocols' | 'data';

const VIEW_EASE = [0.22, 1, 0.36, 1] as const;

const viewVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: VIEW_EASE },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.25, ease: VIEW_EASE },
  },
} as const;

function viewFromLocation(location: string): View {
  return location === '/data' ? 'data' : 'protocols';
}

export function HomeRoute() {
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [pendingProtocolHash, setPendingProtocolHash] = useState<string | null>(
    null,
  );
  const [location, navigate] = useLocation();
  const view = viewFromLocation(location);

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

  const handleImported = useCallback(
    (hash?: string) => {
      void reload();
      // ImportDialog's "Start an interview" CTA forwards the imported protocol's
      // hash so we can open the new-session flow directly. A bare close-after-import
      // (no hash) just refreshes the deck.
      if (hash) setPendingProtocolHash(hash);
    },
    [reload],
  );

  const pendingProtocol = pendingProtocolHash
    ? protocols.find((p) => p.hash === pendingProtocolHash)
    : undefined;

  return (
    <div className="flex min-h-dvh w-full flex-col gap-8 overflow-hidden">
      {/* Header/status own their inset; the protocol deck spans full width so
          cards can swing all the way to the screen edges. */}
      <header className="flex items-center justify-between px-11 pt-9">
        <BrandHeader />
        <ResumePill sessions={sessions} />
        <TopActionBar onOpenSettings={() => setOpenDialog('settings')} />
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'protocols' ? (
          <motion.div
            key="protocols"
            variants={viewVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex min-h-0 w-full flex-1 flex-col gap-8"
          >
            <ProtocolDeck
              protocols={protocols}
              sessions={sessions}
              initialProtocolHash={settings?.lastActiveProtocolHash}
              onImport={() => setOpenDialog('import')}
              onStartInterview={setPendingProtocolHash}
            />

            <NewSessionDialog
              open={!!pendingProtocol}
              protocol={pendingProtocol}
              onClose={() => setPendingProtocolHash(null)}
              onCreated={(session) => {
                setPendingProtocolHash(null);
                navigate(`/interview/${session.id}`, {
                  state: { fresh: true },
                });
              }}
            />

            <div className="px-11 pb-5">
              <StatusRow
                protocolCount={protocols.length}
                interviewCount={sessions.length}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="data"
            variants={viewVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex min-h-0 w-full flex-1 flex-col"
          >
            <DataView sessions={sessions} onReload={reload} />
          </motion.div>
        )}
      </AnimatePresence>

      <ImportDialog
        open={openDialog === 'import'}
        onClose={() => setOpenDialog(null)}
        onImported={handleImported}
      />
      <SettingsDialog
        open={openDialog === 'settings'}
        onClose={() => setOpenDialog(null)}
      />
    </div>
  );
}
