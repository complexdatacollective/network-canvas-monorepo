import { Download } from 'lucide-react';

import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';
import type { ImportPhase } from '~/lib/protocol/importProtocol';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';

import { NewSessionForm } from '../NewSessionForm';
import {
  DeckCard,
  DeckCardFooter,
  DeckCardFooterButton,
  type DeckCardProps,
  DeckCardProgressFooter,
} from './DeckCard';
import type { DeckEntry } from './deckEntries';

// Status line shown on the loading card for each import phase.
const PHASE_LABEL: Record<ImportPhase, string> = {
  fetching: 'Fetching…',
  extracting: 'Extracting…',
  saving: 'Saving…',
};

// A Geospatial stage renders an online map (tile server), so a protocol
// that contains one can't be administered while offline.
function protocolRequiresInternet(protocol: ProtocolWithCounts): boolean {
  return protocol.protocol.stages.some((stage) => stage.type === 'Geospatial');
}

type DeckSlotCardProps = {
  entry: Exclude<DeckEntry, { kind: 'import' }>;
  isActive: boolean;
  // Unified activation from the carousel: navigates to this slot when it is
  // not active, runs the entry's primary action when it is.
  activate: () => void;
  sessionCount: number;
  onDeleteProtocol: (hash: string) => void;
  onDismissSample: () => void;
  onInstallSample: () => void;
  // When set, the case-ID form replaces the protocol card's footer.
  newSession?: {
    onCancel: () => void;
    onCreated: (session: StoredSession) => void;
  };
};

function slotCardProps({
  entry,
  isActive,
  activate,
  sessionCount,
  onDeleteProtocol,
  onDismissSample,
  onInstallSample,
  newSession,
}: DeckSlotCardProps): DeckCardProps {
  if (entry.kind === 'protocol') {
    return {
      protocol: entry.protocol,
      isActive,
      sessionCount,
      requiresInternetConnection: protocolRequiresInternet(entry.protocol),
      onActivate: activate,
      // While the case-ID form is open it takes over the card: description
      // and metadata animate out (their exits run alongside the footer
      // swap) so the form has room.
      hideDescription: newSession !== undefined,
      hideMetadata: newSession !== undefined,
      // The delete control clears out with the rest of the card chrome
      // while the case-ID form is open.
      onDelete: newSession
        ? undefined
        : () => onDeleteProtocol(entry.protocol.hash),
      footer: newSession ? (
        <DeckCardFooter key="new-session">
          <NewSessionForm
            protocol={entry.protocol}
            onCancel={newSession.onCancel}
            onCreated={newSession.onCreated}
          />
        </DeckCardFooter>
      ) : isActive ? (
        <DeckCardFooter key="start-interview">
          <DeckCardFooterButton onClick={activate}>
            Start new interview
          </DeckCardFooterButton>
        </DeckCardFooter>
      ) : undefined,
    };
  }
  if (entry.kind === 'sample') {
    return {
      loading: true,
      protocol: {
        name: SAMPLE_PROTOCOL.name,
        description: SAMPLE_PROTOCOL.description,
      },
      isActive,
      hideMetadata: true,
      onActivate: activate,
      onDelete: onDismissSample,
      deleteLabel: 'Dismiss the sample protocol',
      footer: isActive ? (
        <DeckCardFooter key="install-sample">
          <DeckCardFooterButton
            color="primary"
            icon={
              <Download
                aria-hidden
                className="size-[max(14px,3.5cqi)] shrink-0"
              />
            }
            onClick={onInstallSample}
          >
            Install sample protocol
          </DeckCardFooterButton>
        </DeckCardFooter>
      ) : undefined,
    };
  }
  return {
    loading: true,
    protocol: {
      name: entry.pending.label || undefined,
      description: undefined,
    },
    isActive,
    footer: (
      <DeckCardFooter key="import-progress">
        <DeckCardProgressFooter
          progress={entry.pending.progress}
          message={PHASE_LABEL[entry.pending.phase]}
        />
      </DeckCardFooter>
    ),
  };
}

// Every slot kind renders through this ONE component so the DeckCard
// element — and with it the LayoutGroup driving in-card `layout`
// animations — survives kind changes within a slot (sample → installing →
// installed protocol). Separate per-kind components would remount the card
// and snap its content into place.
export function DeckSlotCard(props: DeckSlotCardProps) {
  return <DeckCard {...slotCardProps(props)} />;
}
