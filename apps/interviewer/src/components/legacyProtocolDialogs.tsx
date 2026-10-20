import { createElement, type ReactNode } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  getMigrationInfo,
  type SchemaVersion,
} from '@codaco/protocol-validation';
import { formatMigrationNotes } from '@codaco/protocol-validation/messages';
import type { ProtocolWithCounts } from '~/lib/db/types';
import { LEGACY_INTERVIEWER_MAJOR } from '~/lib/legacyInterviewer';

import { ExternalLink } from './ExternalLink';
import { legacyProtocolMessages } from './legacyProtocolMessages';

// The dialogs for a protocol made for an older schema: choosing what to do
// with an older file being imported, confirming its upgrade (with the
// migration's notes), and a stored schema 8 protocol's details.

/** The documentation page on protocol schema versions. */
const PROTOCOL_SCHEMA_INFORMATION_URL =
  'https://documentation.networkcanvas.com/en/get-started/protocol-schema-information';

const messages = defineMessages({
  upgradeTitle: {
    id: 'interviewer.legacyProtocolDialogs.upgradeTitle',
    defaultMessage: 'Upgrade to schema {version}?',
    description:
      'Title of the dialog that asks a researcher to confirm upgrading an older protocol to the current schema version, after reading what the upgrade changes. {version} is the current schema version number (for example 9).',
  },
  upgradeUnavailableIntro: {
    id: 'interviewer.legacyProtocolDialogs.upgradeUnavailableIntro',
    defaultMessage:
      'This protocol uses an older version of the Network Canvas protocol schema (<link>more information</link>). Interviews cannot be started with it in this version of Interviewer, but you can upgrade it to the latest version, which will unlock new features and functionality.',
    description:
      'First paragraph of the dialog confirming the upgrade of an older protocol file being imported, shown when this version of Interviewer does not include the previous version that runs older protocols, so the protocol cannot be used as it is. <link>…</link> wraps the words that open the documentation page about protocol schema versions; keep the tags around the translated words.',
  },
  importChoiceIntro: {
    id: 'interviewer.legacyProtocolDialogs.importChoiceIntro',
    defaultMessage:
      'This protocol uses an older version of the Network Canvas protocol schema (<link>more information</link>). You can either import it and use it as normal, or you can upgrade it to the latest version, which will unlock new features and functionality.',
    description:
      'First paragraph of the dialog shown when a researcher imports a protocol file made for an older schema version, offering to import it as it is or upgrade it. <link>…</link> wraps the words that open the documentation page about protocol schema versions; keep the tags around the translated words.',
  },
  upgradePleaseNote: {
    id: 'interviewer.legacyProtocolDialogs.upgradePleaseNote',
    defaultMessage:
      '<strong>Please note:</strong> upgrading may change the interview experience for participants.',
    description:
      'Caution in the dialogs that offer to upgrade an older protocol file being imported. <strong>…</strong> marks the bold lead-in; keep the tags around the translated words.',
  },
  upgradeChangesIntro: {
    id: 'interviewer.legacyProtocolDialogs.upgradeChangesIntro',
    defaultMessage:
      'If you upgrade, the following changes will be made to your protocol:',
    description:
      'Sentence directly above the list of changes an upgrade makes to an older protocol, in the dialog confirming the upgrade.',
  },
  upgradeMakesCopyOfFile: {
    id: 'interviewer.legacyProtocolDialogs.upgradeMakesCopyOfFile',
    defaultMessage:
      'Upgrading makes a copy of this protocol on schema {version} and imports that copy into this version of Interviewer. The original file is left unchanged.',
    description:
      'Paragraph in the dialogs that offer to upgrade an older protocol file being imported: upgrading never changes the file itself, it imports an upgraded copy of it. {version} is the current schema version number (for example 9).',
  },
  changesInSchemaVersion: {
    id: 'interviewer.legacyProtocolDialogs.changesInSchemaVersion',
    defaultMessage: 'Changes in schema version {version}:',
    description:
      'Heading above the list of changes for one schema version, in the dialog confirming the upgrade of an older protocol. {version} is the schema version number.',
  },
  importChoiceTitle: {
    id: 'interviewer.legacyProtocolDialogs.importChoiceTitle',
    defaultMessage: 'This protocol uses schema {version}',
    description:
      'Title of the dialog shown when a researcher imports a protocol file made for an older schema version. {version} is the file’s schema version number (for example 8).',
  },
  infoSchemaVersion: {
    id: 'interviewer.legacyProtocolDialogs.infoSchemaVersion',
    defaultMessage: 'Schema version',
    description:
      'Label in the details dialog of an older protocol, before its schema version number.',
  },
  infoImported: {
    id: 'interviewer.legacyProtocolDialogs.infoImported',
    defaultMessage: 'Imported',
    description:
      'Label in the details dialog of an older protocol, before how long ago it was imported.',
  },
  infoLastChanged: {
    id: 'interviewer.legacyProtocolDialogs.infoLastChanged',
    defaultMessage: 'Last changed',
    description:
      'Label in the details dialog of an older protocol, before how long ago the protocol itself was last changed by its author.',
  },
  infoInterviews: {
    id: 'interviewer.legacyProtocolDialogs.infoInterviews',
    defaultMessage: 'Interviews',
    description:
      'Label in the details dialog of an older protocol, before the number of interviews collected with it.',
  },
});

// Rich-text chunk formatters for the messages above, at module scope so they
// keep one identity across renders.
const renderSchemaInformationLink = (chunks: ReactNode[]) => (
  <ExternalLink href={PROTOCOL_SCHEMA_INFORMATION_URL}>{chunks}</ExternalLink>
);
const renderStrong = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

const olderSchemaIntroMessages = {
  // The choice a file gets when Interviewer 8 is bundled.
  importChoice: messages.importChoiceIntro,
  // In a build without Interviewer 8: only an upgrade can use it.
  unavailable: messages.upgradeUnavailableIntro,
} as const;

/** That an upgrade copies the file, which itself stays as it is. */
function UpgradeMakesCopy() {
  return (
    <Paragraph>
      <AppMessage
        message={messages.upgradeMakesCopyOfFile}
        values={{ version: COMPATIBLE_PROTOCOL_SCHEMA_VERSION }}
      />
    </Paragraph>
  );
}

function OlderSchemaIntro({
  variant,
}: {
  variant: keyof typeof olderSchemaIntroMessages;
}) {
  return (
    <>
      <Paragraph>
        <AppMessage
          message={olderSchemaIntroMessages[variant]}
          values={{ link: renderSchemaInformationLink }}
        />
      </Paragraph>
      <Paragraph>
        <AppMessage
          message={messages.upgradePleaseNote}
          values={{ strong: renderStrong }}
        />
      </Paragraph>
      <UpgradeMakesCopy />
    </>
  );
}

/** A real schema version (the reader checks it is a number, not which). */
const isSchemaVersion = (value: number): value is SchemaVersion =>
  Number.isInteger(value) &&
  value >= 1 &&
  value <= COMPATIBLE_PROTOCOL_SCHEMA_VERSION;

/** What an upgrade from `fromVersion` to this app's schema changes. */
export function MigrationNotes({ fromVersion }: { fromVersion: number }) {
  const intl = useAppIntl();
  if (!isSchemaVersion(fromVersion)) return null;
  const { notes } = getMigrationInfo(
    fromVersion,
    COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
  );
  if (notes.length === 0) return null;
  return (
    <>
      <Paragraph>
        <AppMessage message={messages.upgradeChangesIntro} />
      </Paragraph>
      <div className="bg-surface-2 max-h-72 overflow-y-auto rounded-sm px-4 py-2 [&_li]:mb-2 [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
        {notes.map(({ version, notes: text }) => (
          <div key={version}>
            <Heading level="h4">
              <AppMessage
                message={messages.changesInSchemaVersion}
                values={{ version }}
              />
            </Heading>
            <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
              {formatMigrationNotes(version, text, intl)}
            </RenderMarkdown>
          </div>
        ))}
      </div>
    </>
  );
}

type OpenDialog = DialogContextType['openDialog'];

/**
 * Ask to confirm upgrading a protocol file made for `fromVersion` as it is
 * imported, saying that the upgrade imports a copy and leaves the file as it
 * is, and showing what the upgrade changes. Resolves true only for the Upgrade
 * action. A protocol already on this device is never upgraded: upgrading is
 * offered only at import.
 */
export async function confirmProtocolUpgrade(
  openDialog: OpenDialog,
  {
    fromVersion,
    legacyInterviewerBundled,
  }: {
    fromVersion: number;
    /**
     * Whether this build includes Interviewer 8. Without it a schema 8
     * protocol cannot be used as it is, and a file reaches this dialog
     * without the import choice, so this dialog says all of it.
     */
    legacyInterviewerBundled: boolean;
  },
): Promise<boolean> {
  const choice = await openDialog({
    type: 'choice',
    // Not a warning: upgrading makes a copy and changes nothing that exists.
    intent: 'info',
    size: 'editor',
    title: createElement(AppMessage, {
      message: messages.upgradeTitle,
      values: { version: COMPATIBLE_PROTOCOL_SCHEMA_VERSION },
    }),
    children: (
      <>
        {legacyInterviewerBundled ? (
          // The import choice has already given the schema intro and the
          // caution; the copy is said again where the upgrade is confirmed.
          <UpgradeMakesCopy />
        ) : (
          <OlderSchemaIntro variant="unavailable" />
        )}
        <MigrationNotes fromVersion={fromVersion} />
      </>
    ),
    // Not booleans: a dialog answered by anything but this action (a test's
    // mock, a dismissal) must not read as approval.
    actions: {
      primary: {
        label: createElement(AppMessage, {
          message: legacyProtocolMessages.upgradeToSchema,
          values: { version: COMPATIBLE_PROTOCOL_SCHEMA_VERSION },
        }),
        value: 'upgrade' as const,
      },
      cancel: {
        label: createElement(AppMessage, { message: commonMessages.cancel }),
        value: null,
      },
    },
  });
  return choice === 'upgrade';
}

export type ImportRouteChoice = 'keep' | 'upgrade' | null;

/**
 * The choice for a file below this app's schema, when Interviewer 8 is
 * bundled: keep it on schema 8 (primary: imported and used as normal, its
 * interviews run as designed), upgrade it, or cancel. A schema 7 file is kept
 * on schema 8, as Interviewer 8 itself always imported it.
 */
export async function chooseImportRoute(
  openDialog: OpenDialog,
  { schemaVersion }: { schemaVersion: number },
): Promise<ImportRouteChoice> {
  const choice = await openDialog({
    type: 'choice',
    intent: 'info',
    title: createElement(AppMessage, {
      message: messages.importChoiceTitle,
      values: { version: schemaVersion },
    }),
    children: <OlderSchemaIntro variant="importChoice" />,
    actions: {
      primary: {
        label: createElement(AppMessage, {
          message: legacyProtocolMessages.keepOnSchema,
          values: { version: LEGACY_INTERVIEWER_MAJOR },
        }),
        value: 'keep' as const,
      },
      secondary: {
        label: createElement(AppMessage, {
          message: legacyProtocolMessages.upgradeToSchema,
          values: { version: COMPATIBLE_PROTOCOL_SCHEMA_VERSION },
        }),
        value: 'upgrade' as const,
      },
      cancel: {
        label: createElement(AppMessage, { message: commonMessages.cancel }),
        value: null,
      },
    },
  });
  return choice === 'keep' || choice === 'upgrade' ? choice : null;
}

/** A schema 8 protocol's details. */
export function LegacyProtocolInfo({
  protocol,
}: {
  protocol: ProtocolWithCounts;
}) {
  const intl = useAppIntl();
  const rows = [
    {
      label: messages.infoSchemaVersion,
      value: intl.formatNumber(protocol.schemaVersion),
    },
    {
      label: messages.infoImported,
      value: <TimeAgo date={protocol.importedAt} />,
    },
    ...(protocol.lastModified
      ? [
          {
            label: messages.infoLastChanged,
            value: <TimeAgo date={protocol.lastModified} />,
          },
        ]
      : []),
    {
      label: messages.infoInterviews,
      value: intl.formatNumber(protocol.sessionCount),
    },
  ];
  return (
    <>
      {protocol.description ? (
        <Paragraph>{protocol.description}</Paragraph>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {rows.map((row) => (
          <div key={row.label.id} className="contents">
            <dt className="font-semibold">{intl.formatMessage(row.label)}</dt>
            <dd className="m-0">{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export async function showLegacyProtocolInfo(
  openDialog: OpenDialog,
  protocol: ProtocolWithCounts,
) {
  await openDialog({
    type: 'acknowledge',
    intent: 'info',
    title: protocol.name,
    children: <LegacyProtocolInfo protocol={protocol} />,
    actions: {
      primary: {
        label: createElement(AppMessage, { message: commonMessages.close }),
        value: true,
      },
    },
  });
}
