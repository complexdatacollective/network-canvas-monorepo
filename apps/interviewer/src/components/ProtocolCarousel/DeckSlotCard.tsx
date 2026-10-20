import { CircleAlert, CloudOff, Download, Info, Trash2 } from 'lucide-react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor, IntlShape } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  isSchema8Protocol,
  type ProtocolWithCounts,
  type StoredSession,
} from '~/lib/db/types';
import {
  type BundledLegacyInterviewer,
  LEGACY_INTERVIEWER_MAJOR,
} from '~/lib/legacyInterviewer';
import { DEVELOPMENT_PROTOCOL } from '~/lib/protocol/developmentProtocol';
import type { ImportPhase } from '~/lib/protocol/importProtocol';
import { protocolRequiresInternet } from '~/lib/protocol/protocolRequiresInternet';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';
import type { LegacyInterviewerOffline } from '~/lib/pwa/legacyInterviewerOffline';

import { legacyProtocolMessages } from '../legacyProtocolMessages';
import { NewSessionForm } from '../NewSessionForm';
import {
  DeckCard,
  DeckCardBadge,
  DeckCardFooter,
  DeckCardFooterButton,
  DeckCardFooterNote,
  type DeckCardProps,
  DeckCardProgressFooter,
} from './DeckCard';
import { DeckCardMenu } from './DeckCardMenu';
import type { DeckEntry } from './deckEntries';

const messages = defineMessages({
  startNewInterview: {
    id: 'interviewer.deckSlotCard.startNewInterview',
    defaultMessage: 'Start new interview',
    description: 'Visible copy in Interviewer Deck Slot Card.',
  },
  dismissTheSampleProtocol: {
    id: 'interviewer.deckSlotCard.dismissTheSampleProtocol',
    defaultMessage: 'Dismiss the sample protocol',
    description: 'User-facing message in Interviewer Deck Slot Card.',
  },
  installSampleProtocol: {
    id: 'interviewer.deckSlotCard.installSampleProtocol',
    defaultMessage: 'Install sample protocol',
    description: 'Visible copy in Interviewer Deck Slot Card.',
  },
  installDevelopmentProtocol: {
    id: 'interviewer.deckSlotCard.installDevelopmentProtocol',
    defaultMessage: 'Install development protocol',
    description: 'Visible copy in Interviewer Deck Slot Card.',
  },
  extracting: {
    id: 'interviewer.deckSlotCard.extracting',
    defaultMessage: 'Extracting…',
    description:
      'Pending protocol card while the imported archive is being unpacked.',
  },
  saving: {
    id: 'interviewer.deckSlotCard.saving',
    defaultMessage: 'Saving…',
    description:
      'Pending protocol card while validated protocol content is saved on this device.',
  },
});

// Status line shown on the loading card for each import phase.
const PHASE_LABEL: Record<ImportPhase, MessageDescriptor> = {
  extracting: messages.extracting,
  saving: messages.saving,
};

// What a schema 8 card offers beyond any protocol card's, and the state of
// the bundled Interviewer 8 its interviews run in. `interviewer` is null when
// this build bundles none: the card then starts no interview, and says why.
export type Schema8CardActions = {
  interviewer: BundledLegacyInterviewer | null;
  offline: LegacyInterviewerOffline;
  onShowInfo: (protocol: ProtocolWithCounts) => void;
};

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
  onInstallDevelopment: () => void;
  schema8?: Schema8CardActions;
  // When set, the case-ID form replaces the protocol card's footer.
  newSession?: {
    onCancel: () => void;
    onCreated: (session: StoredSession) => void;
  };
};

function slotCardProps(
  {
    entry,
    isActive,
    activate,
    sessionCount,
    onDeleteProtocol,
    onDismissSample,
    onInstallSample,
    onInstallDevelopment,
    schema8,
    newSession,
  }: DeckSlotCardProps,
  intl: IntlShape,
): DeckCardProps {
  if (entry.kind === 'protocol') {
    const schema8Props = isSchema8Protocol(entry.protocol)
      ? schema8CardProps(
          entry.protocol,
          { isActive, onDeleteProtocol, schema8 },
          intl,
        )
      : null;
    return {
      protocol: entry.protocol,
      isActive,
      sessionCount,
      requiresInternetConnection: protocolRequiresInternet(entry.protocol),
      onActivate: activate,
      // While the case-ID form is open it takes over the card: the
      // controls row, description, and metadata animate out (their exits
      // run alongside the footer swap) so the form — and a long heading —
      // have room.
      hideDescription: newSession !== undefined,
      hideMetadata: newSession !== undefined,
      hideControls: newSession !== undefined,
      onDelete: () => onDeleteProtocol(entry.protocol.hash),
      footer: newSession ? (
        <DeckCardFooter key="new-session">
          <NewSessionForm
            protocol={entry.protocol}
            onCancel={newSession.onCancel}
            onCreated={newSession.onCreated}
          />
        </DeckCardFooter>
      ) : schema8Props?.unavailableFooter ? (
        schema8Props.unavailableFooter
      ) : isActive ? (
        <DeckCardFooter key="start-interview">
          <DeckCardFooterButton onClick={activate}>
            {intl.formatMessage(messages.startNewInterview)}
          </DeckCardFooterButton>
        </DeckCardFooter>
      ) : undefined,
      badges: schema8Props?.badges,
      menu: schema8Props?.menu,
    };
  }
  if (entry.kind === 'sample') {
    return {
      loading: true,
      protocol: {
        name: SAMPLE_PROTOCOL.name,
        description: intl.formatMessage(SAMPLE_PROTOCOL.description),
      },
      isActive,
      hideMetadata: true,
      onActivate: activate,
      onDelete: onDismissSample,
      deleteLabel: intl.formatMessage(messages.dismissTheSampleProtocol),
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
            {intl.formatMessage(messages.installSampleProtocol)}
          </DeckCardFooterButton>
        </DeckCardFooter>
      ) : undefined,
    };
  }
  if (entry.kind === 'development') {
    // Dev-only teaser (never in the deck in production builds — see Home's
    // showDevelopmentCard). No dismiss control: it exists for developers,
    // and installing it replaces the slot anyway.
    return {
      loading: true,
      protocol: {
        name: DEVELOPMENT_PROTOCOL.name,
        description: intl.formatMessage(DEVELOPMENT_PROTOCOL.description),
      },
      isActive,
      hideMetadata: true,
      onActivate: activate,
      footer: isActive ? (
        <DeckCardFooter key="install-development">
          <DeckCardFooterButton
            color="primary"
            icon={
              <Download
                aria-hidden
                className="size-[max(14px,3.5cqi)] shrink-0"
              />
            }
            onClick={onInstallDevelopment}
          >
            {intl.formatMessage(messages.installDevelopmentProtocol)}
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
          message={intl.formatMessage(PHASE_LABEL[entry.pending.phase])}
        />
      </DeckCardFooter>
    ),
  };
}

const iconClassName = 'size-4';

// A schema 8 protocol's card is a protocol card like any other, with its
// schema shown, a menu in place of the remove control (Info, and the same
// Delete), and — when this build has no Interviewer 8 to run its
// interviews — a note instead of the start button.
function schema8CardProps(
  protocol: ProtocolWithCounts,
  {
    isActive,
    onDeleteProtocol,
    schema8,
  }: Pick<DeckSlotCardProps, 'isActive' | 'onDeleteProtocol' | 'schema8'>,
  intl: IntlShape,
): Pick<DeckCardProps, 'badges' | 'menu'> & {
  unavailableFooter: DeckCardProps['footer'];
} {
  const interviewer = schema8?.interviewer ?? null;
  const menuItems = [
    ...(schema8
      ? [
          {
            key: 'info',
            label: intl.formatMessage(legacyProtocolMessages.protocolInfo),
            icon: <Info />,
            onSelect: () => schema8.onShowInfo(protocol),
          },
        ]
      : []),
    {
      key: 'delete',
      label: intl.formatMessage(commonMessages.delete),
      icon: <Trash2 />,
      onSelect: () => onDeleteProtocol(protocol.hash),
    },
  ];

  return {
    badges: (
      <>
        <DeckCardBadge
          tone="info"
          // While Interviewer 8, which runs its interviews, is not yet saved
          // for offline use, the protocol cannot be used offline either.
          status={
            interviewer && schema8?.offline === 'not-ready' ? (
              // Named and titled on a wrapper, so the badge's own text stays
              // its label alone.
              <span
                role="img"
                aria-label={intl.formatMessage(
                  legacyProtocolMessages.notReadyOffline,
                )}
                title={intl.formatMessage(
                  legacyProtocolMessages.notReadyOffline,
                )}
                className="flex"
              >
                <CloudOff aria-hidden className={iconClassName} />
              </span>
            ) : undefined
          }
        >
          {intl.formatMessage(legacyProtocolMessages.schemaBadge, {
            version: protocol.schemaVersion,
          })}
        </DeckCardBadge>
        {!interviewer && (
          <DeckCardBadge
            tone="warning"
            icon={<CircleAlert className={iconClassName} />}
          >
            {intl.formatMessage(legacyProtocolMessages.notAvailable)}
          </DeckCardBadge>
        )}
      </>
    ),
    menu: (
      <DeckCardMenu
        label={intl.formatMessage(legacyProtocolMessages.protocolActions, {
          name: protocol.name,
        })}
        items={menuItems}
      />
    ),
    unavailableFooter:
      isActive && !interviewer ? (
        <DeckCardFooter key="schema-8-unavailable">
          <DeckCardFooterNote>
            {intl.formatMessage(legacyProtocolMessages.notAvailableHelp, {
              legacyVersion: LEGACY_INTERVIEWER_MAJOR,
            })}
          </DeckCardFooterNote>
        </DeckCardFooter>
      ) : undefined,
  };
}

// Every slot kind renders through this ONE component so the DeckCard
// element — and with it the LayoutGroup driving in-card `layout`
// animations — survives kind changes within a slot (sample → installing →
// installed protocol). Separate per-kind components would remount the card
// and snap its content into place.
export function DeckSlotCard(props: DeckSlotCardProps) {
  const intl = useAppIntl();
  return <DeckCard {...slotCardProps(props, intl)} />;
}
