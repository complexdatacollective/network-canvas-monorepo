import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import { BrandHeader } from '~/components/BrandHeader';
import { ImportDialog } from '~/components/ImportDialog';
import { InterviewsDialog } from '~/components/InterviewsDialog';
import { NewSessionDialog } from '~/components/NewSessionDialog';
import { ProtocolDeck } from '~/components/ProtocolDeck';
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

type OpenDialog = 'import' | 'data' | 'settings' | null;

export function HomeRoute() {
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [settings, setSettings] = useState<StoredSettings | null>(null);
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

  return (
    <div className="flex min-h-dvh w-full flex-col gap-8 overflow-hidden">
      {/* Header/status own their inset; the protocol deck spans full width so
          cards can swing all the way to the screen edges. */}
      <header className="flex items-center justify-between px-11 pt-9">
        <BrandHeader />
        <ResumePill sessions={sessions} />
        <TopActionBar
          onOpenImport={() => setOpenDialog('import')}
          onOpenData={() => setOpenDialog('data')}
          onOpenSettings={() => setOpenDialog('settings')}
        />
      </header>

      <ProtocolDeck
        protocols={protocols}
        sessions={sessions}
        initialProtocolHash={settings?.lastActiveProtocolHash}
        expandingProtocolHash={pendingProtocolHash ?? undefined}
        onImport={() => setOpenDialog('import')}
        onStartInterview={setPendingProtocolHash}
      />

      {/* Always rendered so AnimatePresence inside Modal survives the close
          animation — unmounting NewSessionDialog kills its AnimatePresence
          before the reverse layoutId morph can play. */}
      {(() => {
        const pendingProtocol = pendingProtocolHash
          ? (protocols.find((p) => p.hash === pendingProtocolHash) ?? null)
          : null;
        return (
          <NewSessionDialog
            protocol={pendingProtocol}
            layoutId={
              pendingProtocolHash
                ? `protocol-card-${pendingProtocolHash}`
                : undefined
            }
            onClose={() => setPendingProtocolHash(null)}
            onCreated={(session) => {
              setPendingProtocolHash(null);
              navigate(`/interview/${session.id}`, { state: { fresh: true } });
            }}
          />
        );
      })()}

      <div className="px-11 pb-5">
        <StatusRow
          protocolCount={protocols.length}
          interviewCount={sessions.length}
          onOpenData={() => setOpenDialog('data')}
        />
      </div>

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
    </div>
  );
}
