import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { BrandHeader } from '~/components/BrandHeader';
import { DataView } from '~/components/DataView/DataView';
import { InstallBanner } from '~/components/InstallBanner';
import { ProtocolDeck } from '~/components/ProtocolCarousel/ProtocolDeck';
import { ResumePill } from '~/components/ResumePill';
import { SettingsDialog } from '~/components/SettingsDialog';
import { StatusRow } from '~/components/StatusRow';
import { TopActionBar } from '~/components/TopActionBar';
import { deleteProtocol, updateSettings } from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';
import { pickProtocolFile } from '~/lib/files/pickFile';
import { useProtocolImport } from '~/lib/protocol/useProtocolImport';
import { useLaunchedProtocolImport } from '~/lib/pwa/useLaunchedProtocolImport';
import { useLaunchFailureToast } from '~/lib/pwa/useLaunchFailureToast';

import { buildDeleteProtocolMessage } from './deleteProtocolMessage';
import {
  containerVariants,
  protocolsContainerVariants,
} from './homeAnimations';
import { useHomeData } from './useHomeData';

type OpenDialog = 'settings' | null;
type View = 'protocols' | 'data';

function viewFromLocation(location: string): View {
  return location === '/data' ? 'data' : 'protocols';
}

export function HomeRoute() {
  const { protocols, sessions, settings, reload } = useHomeData();
  const { pendingImports, startImport } = useProtocolImport({
    onInstalled: reload,
  });
  // OS-launched .netcanvas files (installed-PWA file handler) import through
  // the same pipeline as the import dialog.
  useLaunchedProtocolImport(startImport);
  // Surfaces a toast if any OS-launched handle couldn't be read.
  useLaunchFailureToast();
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [pendingProtocolHash, setPendingProtocolHash] = useState<string | null>(
    null,
  );
  // Bumped when sessions are mutated outside the DataView (synthetic-data
  // generation/deletion in Settings) so the data table re-queries.
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [location, navigate] = useLocation();
  const view = viewFromLocation(location);
  const dialog = useDialog();
  const toast = useToast();

  // If the pending hash has since been deleted (e.g. cascade-delete from
  // the Protocols route while a card was still pending), drop the pending
  // state so the backdrop doesn't strand on an empty stage.
  const newSessionActive =
    pendingProtocolHash !== null &&
    protocols.some((p) => p.hash === pendingProtocolHash);

  // Mirrors ResumePill's own render predicate (an in-progress session exists).
  // When it does, the pill occupies the band just below the header in
  // portrait, so the protocols column reserves top space to clear it.
  const hasResumableSession = sessions.some((s) => s.finishedAt === null);

  // Default the active card to the user's last-used protocol; fall back to
  // the most-recently-imported one if they've never opened a protocol (or
  // the remembered one has since been deleted).
  const initialProtocolHash = useMemo(() => {
    const lastUsed = settings?.lastActiveProtocolHash;
    if (lastUsed && protocols.some((p) => p.hash === lastUsed)) {
      return lastUsed;
    }
    if (protocols.length === 0) return undefined;
    return [...protocols].toSorted((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    )[0]?.hash;
  }, [settings?.lastActiveProtocolHash, protocols]);

  const handleImportFile = useCallback(
    (file: File) => {
      void startImport({ source: 'file', file, label: file.name });
    },
    [startImport],
  );

  const handleChooseFile = useCallback(async () => {
    const picked = await pickProtocolFile();
    if (picked) handleImportFile(picked.file);
  }, [handleImportFile]);

  const handleInstallSample = useCallback(() => {
    void startImport({ source: 'sample' });
  }, [startImport]);

  // Dev-only: installs the Development protocol (exercises every stage type)
  // without leaving a teaser card in production builds.
  const handleInstallDevelopment = useCallback(() => {
    if (!import.meta.env.DEV) return;
    void startImport({ source: 'development' });
  }, [startImport]);

  const handleDismissSample = useCallback(async () => {
    await updateSettings({ sampleProtocolDismissed: true });
    await reload();
  }, [reload]);

  const handleSessionCreated = useCallback(
    (session: StoredSession) => {
      setPendingProtocolHash(null);
      navigate(`/interview/${session.id}`);
    },
    [navigate],
  );
  const closeNewSession = useCallback(() => setPendingProtocolHash(null), []);

  // Synthetic data was generated or deleted in Settings: refresh the home
  // data (protocol counts, StatusRow) and signal the DataView to re-query.
  const handleSyntheticDataChange = useCallback(() => {
    setDataRefreshKey((key) => key + 1);
    void reload();
  }, [reload]);

  const handleDeleteProtocol = useCallback(
    async (hash: string) => {
      const protocol = protocols.find((p) => p.hash === hash);
      if (!protocol) return;
      const { description, hasUnexported } = buildDeleteProtocolMessage(
        protocol.name,
        sessions.filter((s) => s.protocolHash === hash),
      );

      const confirmed = await dialog.openDialog({
        type: 'choice',
        title: 'Delete this protocol?',
        description,
        intent: hasUnexported ? 'destructive' : 'default',
        actions: {
          primary: { label: 'Delete Protocol', value: true },
          cancel: { label: 'Cancel', value: false },
        },
      });
      if (confirmed !== true) return;

      try {
        await deleteProtocol(hash);
        toast.add({
          title: 'Protocol deleted',
          description: protocol.name,
          variant: 'success',
        });
        await reload();
      } catch (cause) {
        toast.add({
          title: 'Could not delete protocol',
          description: cause instanceof Error ? cause.message : String(cause),
          variant: 'destructive',
        });
      }
    },
    [dialog, protocols, reload, sessions, toast],
  );

  return (
    <motion.div
      variants={containerVariants}
      className="flex h-full w-full flex-col overflow-hidden"
    >
      {/* Header/status own their inset; the protocol deck spans full width so
          cards can swing all the way to the screen edges. The backdrop
          rendered below this header sits at z-40; the header itself has no
          z-index so it is visually overlaid, and `inert` keeps its
          controls out of the tab order while the new-session form is up. */}
      <InstallBanner />
      <header
        className="tablet-landscape:px-11 tablet-landscape:pt-9 relative flex items-center justify-between px-6 pt-6"
        inert={newSessionActive}
      >
        <BrandHeader />
        <TopActionBar onOpenSettings={() => setOpenDialog('settings')} />
        {/* Absolute overlay so the resume pill draws on top of other
            header items (and can grow as wide as it needs without
            pushing them around). The wrapper mirrors the header's
            padding + items-center so the pill aligns with BrandHeader
            and TopActionBar vertically. pointer-events-none lets clicks
            pass through the empty area to the items below; the pill
            itself opts back in via pointer-events-auto.

            In portrait (both iPads) there isn't room for a centered pill
            between BrandHeader and TopActionBar, so the expanded pill would
            cover the protocols/data switcher. Drop it one header-height down
            (`translate-y-full`) so it sits in the band just below the header
            — clear of the switcher — and restore the in-header centering in
            landscape, where there's room (`landscape:`). We key this off
            actual ORIENTATION, not a min-width breakpoint: the 13" iPad's
            portrait width (~1024px) would otherwise trip a min-width
            breakpoint and pull the pill up into the header. */}
        <div className="tablet-landscape:px-11 tablet-landscape:pt-9 pointer-events-none absolute inset-0 z-20 flex translate-y-full items-center justify-center px-6 pt-6 landscape:translate-y-0">
          <AnimatePresence>
            {view === 'protocols' ? (
              <ResumePill key="resume-pill" sessions={sessions} />
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'protocols' ? (
          <motion.div
            key="protocols"
            variants={protocolsContainerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            // In portrait the resume pill drops into the band just below the
            // header (see the overlay comment above). Reserve top space so the
            // protocol deck starts below it — only in portrait, and only when a
            // resumable session actually renders the pill (pill is h-20 = 80px).
            className={`flex min-h-0 w-full flex-1 flex-col gap-8 ${
              hasResumableSession ? 'portrait:pt-24' : ''
            }`}
          >
            <ProtocolDeck
              protocols={protocols}
              sessions={sessions}
              initialProtocolHash={initialProtocolHash}
              showSampleCard={
                settings
                  ? !settings.sampleProtocolDismissed &&
                    !pendingImports.some((p) => p.source === 'sample')
                  : false
              }
              pendingImports={pendingImports}
              onImport={() => void handleChooseFile()}
              onImportFile={handleImportFile}
              onStartInterview={setPendingProtocolHash}
              onDeleteProtocol={handleDeleteProtocol}
              onInstallSample={handleInstallSample}
              onDismissSample={handleDismissSample}
              newSessionProtocolHash={pendingProtocolHash}
              onCancelNewSession={closeNewSession}
              onSessionCreated={handleSessionCreated}
            />

            {import.meta.env.DEV && (
              <div
                inert={newSessionActive}
                className="tablet-landscape:px-11 flex justify-center px-6"
              >
                <Button
                  variant="text"
                  size="sm"
                  onClick={handleInstallDevelopment}
                >
                  Install development protocol
                </Button>
              </div>
            )}

            <div inert={newSessionActive} className="contents">
              <StatusRow
                protocolCount={protocols.length}
                interviewCount={sessions.length}
              />
            </div>
          </motion.div>
        ) : (
          <DataView
            key="data"
            protocols={protocols}
            onReload={reload}
            refreshKey={dataRefreshKey}
          />
        )}
      </AnimatePresence>

      <SettingsDialog
        open={openDialog === 'settings'}
        onClose={() => {
          setOpenDialog(null);
          void reload();
        }}
        onDataChange={handleSyntheticDataChange}
      />
    </motion.div>
  );
}
