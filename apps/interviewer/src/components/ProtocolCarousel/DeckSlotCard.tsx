import {
  CircleAlert,
  CircleArrowUp,
  CloudOff,
  CopyCheck,
  Download,
  ExternalLink,
  Info,
} from 'lucide-react';

import type { MessageDescriptor, IntlShape } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';
import type { StoredSession } from '~/lib/db/types';
import {
  type BundledLegacyInterviewer,
  LEGACY_INTERVIEWER_MAJOR,
  legacyDataUrl,
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

// What a schema 8 card offers, and the state of the Interviewer 8 that runs
// it. `interviewer` is null when this build bundles no Interviewer 8: the
// card then offers only Upgrade and Info.
export type LegacyCardActions = {
  interviewer: BundledLegacyInterviewer | null;
  offline: LegacyInterviewerOffline;
  onStart: (protocol: LegacyProtocolSummary) => void;
  onOpenInInterviewer: (protocol: LegacyProtocolSummary) => void;
  onUpgrade: (protocol: LegacyProtocolSummary) => void;
  onShowInfo: (protocol: LegacyProtocolSummary) => void;
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
  legacy?: LegacyCardActions;
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
    legacy,
    newSession,
  }: DeckSlotCardProps,
  intl: IntlShape,
): DeckCardProps {
  if (entry.kind === 'legacy') {
    return legacySlotCardProps(entry, { isActive, activate, legacy }, intl);
  }
  if (entry.kind === 'protocol') {
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
      ) : isActive ? (
        <DeckCardFooter key="start-interview">
          <DeckCardFooterButton onClick={activate}>
            {intl.formatMessage(messages.startNewInterview)}
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

function legacySlotCardProps(
  entry: Extract<DeckEntry, { kind: 'legacy' }>,
  {
    isActive,
    activate,
    legacy,
  }: Pick<DeckSlotCardProps, 'isActive' | 'activate' | 'legacy'>,
  intl: IntlShape,
): DeckCardProps {
  const { protocol, upgraded } = entry;
  const interviewer = legacy?.interviewer ?? null;
  const legacyVersion = { version: LEGACY_INTERVIEWER_MAJOR };
  const menuItems = [
    ...(interviewer && legacy
      ? [
          {
            key: 'open',
            label: intl.formatMessage(
              legacyProtocolMessages.openInInterviewer,
              legacyVersion,
            ),
            icon: <ExternalLink />,
            onSelect: () => legacy.onOpenInInterviewer(protocol),
          },
        ]
      : []),
    ...(legacy
      ? [
          {
            key: 'upgrade',
            label: intl.formatMessage(legacyProtocolMessages.upgradeToSchema, {
              version: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
            }),
            icon: <CircleArrowUp />,
            onSelect: () => legacy.onUpgrade(protocol),
          },
          {
            key: 'info',
            label: intl.formatMessage(legacyProtocolMessages.protocolInfo),
            icon: <Info />,
            onSelect: () => legacy.onShowInfo(protocol),
          },
        ]
      : []),
  ];

  return {
    protocol,
    isActive,
    sessionCount: protocol.sessionCount,
    onActivate: activate,
    // Interviewer 8 keeps these interviews and exports them; this app's data
    // view has none of them.
    sessionCountHref: interviewer ? legacyDataUrl(interviewer) : null,
    badges: (
      <>
        <DeckCardBadge tone="info">
          {intl.formatMessage(legacyProtocolMessages.schemaBadge, {
            version: protocol.schemaVersion,
          })}
        </DeckCardBadge>
        {upgraded && (
          <DeckCardBadge
            tone="success"
            icon={<CopyCheck className={iconClassName} />}
          >
            {intl.formatMessage(legacyProtocolMessages.upgradedBadge)}
          </DeckCardBadge>
        )}
        {!interviewer && (
          <DeckCardBadge
            tone="warning"
            icon={<CircleAlert className={iconClassName} />}
          >
            {intl.formatMessage(legacyProtocolMessages.notAvailable)}
          </DeckCardBadge>
        )}
        {interviewer && legacy?.offline === 'not-ready' && (
          <DeckCardBadge
            tone="warning"
            icon={<CloudOff className={iconClassName} />}
          >
            {intl.formatMessage(legacyProtocolMessages.notReadyOffline)}
          </DeckCardBadge>
        )}
      </>
    ),
    menu:
      menuItems.length > 0 ? (
        <DeckCardMenu
          label={intl.formatMessage(legacyProtocolMessages.protocolActions, {
            name: protocol.name,
          })}
          items={menuItems}
        />
      ) : undefined,
    footer: !isActive ? undefined : interviewer ? (
      <DeckCardFooter key="start-legacy-interview">
        <DeckCardFooterButton onClick={activate}>
          {intl.formatMessage(messages.startNewInterview)}
        </DeckCardFooterButton>
      </DeckCardFooter>
    ) : (
      <DeckCardFooter key="legacy-unavailable">
        <DeckCardFooterNote>
          {intl.formatMessage(legacyProtocolMessages.notAvailableHelp, {
            legacyVersion: LEGACY_INTERVIEWER_MAJOR,
            currentVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
          })}
        </DeckCardFooterNote>
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
  const intl = useAppIntl();
  return <DeckCard {...slotCardProps(props, intl)} />;
}
