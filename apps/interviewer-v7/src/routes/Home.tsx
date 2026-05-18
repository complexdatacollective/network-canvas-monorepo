import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import { BrandHeader } from '~/components/BrandHeader';
import { ImportDialog } from '~/components/ImportDialog';
import { InterviewsDialog } from '~/components/InterviewsDialog';
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
        onSessionCreated={(sessionId) => navigate(`/interview/${sessionId}`)}
      />

      <StatusRow
        protocolCount={protocols.length}
        interviewCount={sessions.length}
        onOpenData={() => setOpenDialog('data')}
      />

      <ImportDialog
        open={openDialog === 'import'}
        onClose={() => setOpenDialog(null)}
        onImported={() => void reload()}
      />
      <InterviewsDialog
        open={openDialog === 'data'}
        onClose={() => setOpenDialog(null)}
      />
      <SettingsDialog
        open={openDialog === 'settings'}
        onClose={() => setOpenDialog(null)}
      />
    </StageBackground>
  );
}
