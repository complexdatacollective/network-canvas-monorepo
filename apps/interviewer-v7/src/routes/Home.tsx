import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { BrandHeader } from '~/components/BrandHeader';
import { DataView } from '~/components/DataView';
import { ImportDialog } from '~/components/ImportDialog';
import { ProtocolDeck } from '~/components/ProtocolCarousel/ProtocolDeck';
import { ResumePill } from '~/components/ResumePill';
import { SettingsDialog } from '~/components/SettingsDialog';
import { StatusRow } from '~/components/StatusRow';
import { TopActionBar } from '~/components/TopActionBar';
import {
  deleteProtocol,
  getSettings,
  listProtocols,
  listSessions,
} from '~/lib/db/api';
import type {
  ProtocolWithCounts,
  StoredSession,
  StoredSessionLite,
  StoredSettings,
} from '~/lib/db/types';

type OpenDialog = 'import' | 'settings' | null;
type View = 'protocols' | 'data';

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      when: 'beforeChildren',
      staggerChildren: 0.05,
    },
  },
  exit: {
    transition: { when: 'afterChildren', staggerChildren: 0.05 },
  },
} as const;

// Cascade variants for the Protocols branch. AnimatePresence needs the
// keyed child to be a motion component so descendant exits can complete
// before unmount; these variants don't visually animate the wrapper —
// `opacity: 1` is an identity value used so motion treats the variant
// as real and reliably propagates the hidden / visible / exit labels
// down to the deck section, chevron row, and StatusRow. With empty
// variants motion can short-circuit on first mount and skip the
// cascade entirely, leaving children at their natural state.
//
// `when: 'beforeChildren'` is intentionally omitted: the wrapper has no
// real animation to "complete" first, and pairing it with empty
// variants is what was suppressing the entry cascade. Instead,
// `delayChildren` + `staggerChildren` drive timing explicitly.
//
// Entry uses staggerDirection: -1 so the cascade walks the JSX tree in
// reverse — StatusRow first, deck section last — matching the visual
// expectation that the deck is the focal element and arrives after its
// surrounding chrome.
const protocolsContainerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.25,
      staggerDirection: -1,
    },
  },
  exit: {
    transition: {
      when: 'afterChildren',
      staggerChildren: 0.06,
      staggerDirection: -1,
    },
  },
} as const;

function viewFromLocation(location: string): View {
  return location === '/data' ? 'data' : 'protocols';
}

export function HomeRoute() {
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
  const [sessions, setSessions] = useState<StoredSessionLite[]>([]);
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [pendingProtocolHash, setPendingProtocolHash] = useState<string | null>(
    null,
  );
  const [location, navigate] = useLocation();
  const view = viewFromLocation(location);
  const dialog = useDialog();
  const toast = useToast();

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

  // If the pending hash has since been deleted (e.g. cascade-delete from
  // the Protocols route while a card was still pending), drop the pending
  // state so the backdrop doesn't strand on an empty stage.
  const newSessionActive =
    pendingProtocolHash !== null &&
    protocols.some((p) => p.hash === pendingProtocolHash);

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

  const handleSessionCreated = useCallback(
    (session: StoredSession) => {
      setPendingProtocolHash(null);
      navigate(`/interview/${session.id}`, { state: { fresh: true } });
    },
    [navigate],
  );
  const closeNewSession = useCallback(() => setPendingProtocolHash(null), []);

  const handleDeleteProtocol = useCallback(
    async (hash: string) => {
      const protocol = protocols.find((p) => p.hash === hash);
      if (!protocol) return;
      const protocolSessions = sessions.filter((s) => s.protocolHash === hash);
      const unexportedCount = protocolSessions.filter(
        (s) => s.exportedAt === null,
      ).length;
      const totalCount = protocolSessions.length;

      const hasUnexported = unexportedCount > 0;
      const title = `Delete ${protocol.name}?`;
      let description: string;
      let primaryLabel: string;
      let intent: 'default' | 'destructive';

      if (hasUnexported) {
        const recordsClause =
          unexportedCount === 1
            ? '1 interview record has not been exported and will be permanently lost'
            : `${unexportedCount} interview records have not been exported and will be permanently lost`;
        description = `${recordsClause} if you delete this protocol. Export them first if you want to keep the data. This cannot be undone.`;
        primaryLabel = 'Delete anyway';
        intent = 'destructive';
      } else {
        let body = 'Removes the protocol from this device.';
        if (totalCount > 0) {
          const recordsPhrase =
            totalCount === 1
              ? '1 interview record'
              : `${totalCount} interview records`;
          body += ` ${recordsPhrase} will also be deleted.`;
        }
        body += ' This cannot be undone.';
        description = body;
        primaryLabel = 'Delete';
        intent = 'default';
      }

      const confirmed = await dialog.openDialog({
        type: 'choice',
        title,
        description,
        intent,
        actions: {
          primary: { label: primaryLabel, value: true },
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
      className="flex h-dvh w-full flex-col overflow-hidden"
    >
      {/* Header/status own their inset; the protocol deck spans full width so
          cards can swing all the way to the screen edges. The backdrop
          rendered below this header sits at z-40; the header itself has no
          z-index so it is visually overlaid, and `inert` keeps its
          controls out of the tab order while the new-session form is up. */}
      <header
        className="relative flex items-center justify-between px-11 pt-9"
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
            itself opts back in via pointer-events-auto. */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-11 pt-9">
          <AnimatePresence>
            {view === 'protocols' ? (
              <ResumePill key="resume-pill" sessions={sessions} />
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      {/* Backdrop for the in-card "new session" form. Sits between the
          page chrome (header + StatusRow + chevron row) and the active
          DeckCard, which the ProtocolDeck section lifts to z-50 while
          this is mounted. Clicking dismisses, matching modal semantics
          without going through Base-UI's Dialog. */}
      <AnimatePresence>
        {newSessionActive && (
          <motion.button
            type="button"
            key="new-session-backdrop"
            aria-label="Cancel new interview"
            onClick={closeNewSession}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-overlay publish-colors fixed inset-0 z-40 cursor-default border-0 p-0 backdrop-blur-xs"
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {view === 'protocols' ? (
          <motion.div
            key="protocols"
            variants={protocolsContainerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex min-h-0 w-full flex-1 flex-col gap-8"
          >
            <ProtocolDeck
              protocols={protocols}
              sessions={sessions}
              initialProtocolHash={initialProtocolHash}
              onImport={() => setOpenDialog('import')}
              onStartInterview={setPendingProtocolHash}
              onDeleteProtocol={handleDeleteProtocol}
              newSessionProtocolHash={pendingProtocolHash}
              onCancelNewSession={closeNewSession}
              onSessionCreated={handleSessionCreated}
            />

            <div inert={newSessionActive} className="contents">
              <StatusRow
                protocolCount={protocols.length}
                interviewCount={sessions.length}
              />
            </div>
          </motion.div>
        ) : (
          <DataView key="data" protocols={protocols} onReload={reload} />
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
    </motion.div>
  );
}
