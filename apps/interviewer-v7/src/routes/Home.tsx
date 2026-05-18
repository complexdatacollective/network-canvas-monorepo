import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import { BrandHeader } from '~/components/BrandHeader';
import { ImportDialog } from '~/components/ImportDialog';
import { InterviewsDialog } from '~/components/InterviewsDialog';
import { NewSessionDialog } from '~/components/NewSessionDialog';
import { ProtocolDeck } from '~/components/ProtocolDeck';
import { ResumePill } from '~/components/ResumePill';
import { SettingsDialog } from '~/components/SettingsDialog';
import { StageBackground } from '~/components/StageBackground';
import { StatusRow } from '~/components/StatusRow';
import { TopActionBar } from '~/components/TopActionBar';
import { getSettings, listProtocols, listSessions } from '~/lib/db/api';
import type {
  ProtocolWithCounts,
  StoredSession,
  StoredSettings,
} from '~/lib/db/types';

const EASE = [0.22, 1, 0.36, 1] as const;

type OpenDialog = 'import' | 'data' | 'settings' | null;

export function HomeRoute() {
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [, setSettings] = useState<StoredSettings | null>(null);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [pendingProtocolHash, setPendingProtocolHash] = useState<string | null>(
    null,
  );
  const [, navigate] = useLocation();

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

  const haveProtocols = protocols.length > 0;

  return (
    <StageBackground className="iv-root flex min-h-dvh w-full flex-col gap-8 overflow-hidden px-11 pt-9 pb-5">
      <header className="flex items-start justify-between">
        <BrandHeader />
        <TopActionBar
          onOpenImport={() => setOpenDialog('import')}
          onOpenData={() => setOpenDialog('data')}
          onOpenSettings={() => setOpenDialog('settings')}
        />
      </header>

      <ResumePill sessions={sessions} />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.55, ease: EASE }}
        className="text-center"
      >
        <div className="all-caps font-monospace text-sea-green tracking-[0.3em]">
          {haveProtocols
            ? `${protocols.length} ${protocols.length === 1 ? 'protocol' : 'protocols'} on this device · swipe to choose`
            : 'No protocols installed yet'}
        </div>
      </motion.div>

      <ProtocolDeck
        protocols={protocols}
        sessions={sessions}
        onImport={() => setOpenDialog('import')}
        onStartInterview={setPendingProtocolHash}
      />

      <StatusRow
        protocolCount={protocols.length}
        interviewCount={sessions.length}
        onOpenData={() => setOpenDialog('data')}
      />

      <ImportDialog
        open={openDialog === 'import'}
        onClose={() => setOpenDialog(null)}
        onImported={handleImported}
      />
      <InterviewsDialog
        open={openDialog === 'data'}
        onClose={() => setOpenDialog(null)}
      />
      <SettingsDialog
        open={openDialog === 'settings'}
        onClose={() => setOpenDialog(null)}
      />

      {pendingProtocolHash ? (
        <NewSessionDialog
          open
          protocolHash={pendingProtocolHash}
          onClose={() => setPendingProtocolHash(null)}
          onCreated={(session) => {
            setPendingProtocolHash(null);
            navigate(`/interview/${session.id}`);
          }}
        />
      ) : null}
    </StageBackground>
  );
}
