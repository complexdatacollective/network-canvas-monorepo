import { createElement } from 'react';

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
import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';
import { LEGACY_INTERVIEWER_MAJOR } from '~/lib/legacyInterviewer';

import { legacyProtocolMessages } from './legacyProtocolMessages';

// The dialogs for a protocol made for an older schema: confirming its upgrade
// (with the migration's notes), choosing what to do with an older file being
// imported, a schema 8 protocol's details, and a failed hand-over.

const messages = defineMessages({
  upgradeTitle: {
    id: 'interviewer.legacyProtocolDialogs.upgradeTitle',
    defaultMessage: 'Upgrade to schema {version}?',
    description:
      'Title of the dialog that asks a researcher to confirm upgrading an older protocol to the current schema version, after reading what the upgrade changes. {version} is the current schema version number (for example 9).',
  },
  upgradeMakesCopyOfLegacy: {
    id: 'interviewer.legacyProtocolDialogs.upgradeMakesCopyOfLegacy',
    defaultMessage:
      'Upgrading makes a new schema {currentVersion} copy of this protocol for this version of Interviewer. The schema {legacyVersion} protocol and its interviews stay unchanged in Interviewer {legacyVersion}, and no interviews are copied.',
    description:
      'Paragraph in the dialog confirming the upgrade of an older protocol stored in the previous version of Interviewer. {currentVersion} is the current schema version number (for example 9); {legacyVersion} is the older schema and previous Interviewer version number (for example 8).',
  },
  upgradeMakesCopyOfFile: {
    id: 'interviewer.legacyProtocolDialogs.upgradeMakesCopyOfFile',
    defaultMessage:
      'Upgrading imports a schema {version} copy of this protocol into this version of Interviewer. Your file is not changed.',
    description:
      'Paragraph in the dialog confirming the upgrade of an older protocol file the researcher is importing. {version} is the current schema version number (for example 9).',
  },
  readTheNotes: {
    id: 'interviewer.legacyProtocolDialogs.readTheNotes',
    defaultMessage:
      'The upgrade changes the protocol, so interviews with the copy can differ from interviews with the original. Read these notes carefully before you continue.',
    description:
      'Paragraph above the list of changes an upgrade makes to an older protocol, in the dialog confirming the upgrade.',
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
  importChoiceKeep: {
    id: 'interviewer.legacyProtocolDialogs.importChoiceKeep',
    defaultMessage:
      'Keep it on schema {legacyVersion} to run it exactly as it was designed, in Interviewer {legacyVersion}, which is included with this version of Interviewer.',
    description:
      'Paragraph in the dialog shown when importing an older protocol file, describing the first choice: install it unchanged in the previous version of Interviewer, which is included with this one. {legacyVersion} is the older schema and previous Interviewer version number (for example 8).',
  },
  importChoiceUpgrade: {
    id: 'interviewer.legacyProtocolDialogs.importChoiceUpgrade',
    defaultMessage:
      'Or upgrade it to schema {currentVersion} to use it in this version of Interviewer. Upgrading changes some of the protocol, so you will see what changes before anything is imported.',
    description:
      'Paragraph in the dialog shown when importing an older protocol file, describing the second choice: upgrade it to the current schema. {currentVersion} is the current schema version number (for example 9).',
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
  infoRunsInLegacy: {
    id: 'interviewer.legacyProtocolDialogs.infoRunsInLegacy',
    defaultMessage:
      'This protocol runs in Interviewer {version}, which also keeps its interviews and exports them.',
    description:
      'Paragraph in the details dialog of an older protocol. {version} is the previous Interviewer version number (for example 8), which runs this protocol and holds its interviews.',
  },
});

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
        <AppMessage message={messages.readTheNotes} />
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
 * Ask to confirm upgrading a protocol made for `fromVersion`, showing what
 * the upgrade changes. Resolves true only for the Upgrade action.
 */
export async function confirmProtocolUpgrade(
  openDialog: OpenDialog,
  {
    fromVersion,
    source,
  }: {
    fromVersion: number;
    /** A schema 8 protocol in Interviewer 8's library, or a file. */
    source: 'legacy-library' | 'file';
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
        <Paragraph>
          {source === 'legacy-library' ? (
            <AppMessage
              message={messages.upgradeMakesCopyOfLegacy}
              values={{
                currentVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
                legacyVersion: LEGACY_INTERVIEWER_MAJOR,
              }}
            />
          ) : (
            <AppMessage
              message={messages.upgradeMakesCopyOfFile}
              values={{ version: COMPATIBLE_PROTOCOL_SCHEMA_VERSION }}
            />
          )}
        </Paragraph>
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
 * bundled: keep it on schema 8 (primary: Interviewer 8 runs it as designed),
 * upgrade it, or cancel. Schema 7 counts as schema 8: Interviewer 8 upgrades
 * it to 8 itself when it imports it.
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
    children: (
      <>
        <Paragraph>
          <AppMessage
            message={messages.importChoiceKeep}
            values={{ legacyVersion: LEGACY_INTERVIEWER_MAJOR }}
          />
        </Paragraph>
        <Paragraph>
          <AppMessage
            message={messages.importChoiceUpgrade}
            values={{ currentVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION }}
          />
        </Paragraph>
      </>
    ),
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

/** A file could not be staged for Interviewer 8; nothing was changed. */
export async function showHandoffFailed(openDialog: OpenDialog) {
  await openDialog({
    type: 'acknowledge',
    intent: 'destructive',
    title: createElement(AppMessage, {
      message: legacyProtocolMessages.couldNotOpenInInterviewer,
      values: { version: LEGACY_INTERVIEWER_MAJOR },
    }),
    description: createElement(AppMessage, {
      message: legacyProtocolMessages.handoffFailed,
      values: { version: LEGACY_INTERVIEWER_MAJOR },
    }),
    actions: {
      primary: {
        label: createElement(AppMessage, { message: commonMessages.close }),
        value: true,
      },
    },
  });
}

/** A schema 8 protocol's details, as Interviewer 8's library has them. */
export function LegacyProtocolInfo({
  protocol,
}: {
  protocol: LegacyProtocolSummary;
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
      <Paragraph>
        <AppMessage
          message={messages.infoRunsInLegacy}
          values={{ version: LEGACY_INTERVIEWER_MAJOR }}
        />
      </Paragraph>
    </>
  );
}

export async function showLegacyProtocolInfo(
  openDialog: OpenDialog,
  protocol: LegacyProtocolSummary,
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
