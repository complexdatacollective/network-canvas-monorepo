import { type ReactNode } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  CURRENT_SCHEMA_VERSION,
  getMigrationInfo,
  type SchemaVersion,
} from '@codaco/protocol-validation';
import { formatMigrationNotes } from '@codaco/protocol-validation/messages';
import Link from '~/components/Link';
import { LEGACY_SCHEMA_VERSION } from '~/lib/schema-8/version';

const PROTOCOL_SCHEMA_DOCUMENTATION =
  'https://documentation.networkcanvas.com/en/get-started/advanced-topics/protocol-schema-information/';

const messages = defineMessages({
  title: {
    id: 'fresco.protocolImport.upgradeChoice.title',
    defaultMessage: 'How do you want to import this protocol?',
    description:
      'Title of the dialog shown when a researcher imports a protocol made for an older schema version. Fresco offers two ways forward: import it as it is, or upgrade it to the current schema first.',
  },
  olderSchema: {
    id: 'fresco.protocolImport.upgradeChoice.olderSchema',
    defaultMessage:
      'This protocol uses an older version of the Network Canvas protocol schema (<Link>more information</Link>). You can either import it as it is, or you can upgrade it to the latest version, which will unlock new features and functionality.',
    description:
      'First paragraph of the dialog shown when importing a protocol made for an older schema version. <Link> wraps a link to the documentation page about protocol schemas.',
  },
  pleaseNote: {
    id: 'fresco.protocolImport.upgradeChoice.pleaseNote',
    defaultMessage:
      '<strong>Please note:</strong> upgrading may change the interview experience for participants. Upgrading changes only the copy Fresco imports, and leaves your original protocol file unchanged.',
    description:
      'Paragraph of the dialog shown when importing a protocol made for an older schema version, warning that upgrading it can change what participants see, and saying that the protocol file the researcher chose is not modified (only the copy stored in Fresco is upgraded). <strong> marks the words "Please note:" as bold.',
  },
  changesIntro: {
    id: 'fresco.protocolImport.upgradeChoice.changesIntro',
    defaultMessage:
      'If you upgrade, the following changes will be made to your protocol:',
    description:
      'Paragraph above the list of changes an upgrade makes, in the dialog shown when importing a protocol made for an older schema version.',
  },
  changesInSchemaVersion: {
    id: 'fresco.protocolImport.upgradeChoice.changesInSchemaVersion',
    defaultMessage: 'Changes in schema version {version}:',
    description:
      'Heading above the list of changes for one schema version, in the dialog shown when importing a protocol made for an older schema version. {version} is the schema version number.',
  },
  upgrade: {
    id: 'fresco.protocolImport.upgradeChoice.upgrade',
    defaultMessage: 'Upgrade to schema {version}',
    description:
      'Button in the dialog shown when importing a protocol made for an older schema version. Upgrades the protocol to the current schema and imports it. {version} is the current schema version number (for example 9).',
  },
  keep: {
    id: 'fresco.protocolImport.upgradeChoice.keep',
    defaultMessage: 'Import as schema {version}',
    description:
      'Button in the dialog shown when importing a protocol made for an older schema version. Imports the protocol without upgrading it, so its interviews run as the protocol was designed. {version} is the older schema version number (for example 8).',
  },
});

const renderDocumentationLink = (chunks: ReactNode[]) => (
  <Link href={PROTOCOL_SCHEMA_DOCUMENTATION} target="_blank">
    {chunks}
  </Link>
);

const renderStrong = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

function MigrationNotes({ fromVersion }: { fromVersion: SchemaVersion }) {
  const intl = useAppIntl();
  const { notes } = getMigrationInfo(fromVersion, CURRENT_SCHEMA_VERSION);
  if (notes.length === 0) return null;

  return (
    <>
      <Paragraph>
        <AppMessage message={messages.changesIntro} />
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

export type ImportChoice = 'upgrade' | 'keep';

/**
 * Ask how to import a protocol made for an older schema: upgraded to the
 * current schema, or as it is, at schema 8, to run in the schema 8 interview
 * Fresco bundles. The dialog matches the one Architect shows when it opens
 * such a protocol. Resolves null when the researcher cancels.
 */
export async function askHowToImport(
  openDialog: DialogContextType['openDialog'],
  fromVersion: SchemaVersion,
): Promise<ImportChoice | null> {
  const choice = await openDialog({
    type: 'choice',
    // Not a warning: neither choice changes the file the researcher chose.
    intent: 'info',
    size: 'editor',
    title: <AppMessage message={messages.title} />,
    children: (
      <>
        <Paragraph>
          <AppMessage
            message={messages.olderSchema}
            values={{ Link: renderDocumentationLink }}
          />
        </Paragraph>
        <Paragraph>
          <AppMessage
            message={messages.pleaseNote}
            values={{ strong: renderStrong }}
          />
        </Paragraph>
        <MigrationNotes fromVersion={fromVersion} />
      </>
    ),
    // Not booleans, so that a dialog answered with `true` (as the test
    // suite's mock answers) reads as no choice rather than as either one.
    actions: {
      primary: {
        label: (
          <AppMessage
            message={messages.upgrade}
            values={{ version: CURRENT_SCHEMA_VERSION }}
          />
        ),
        value: 'upgrade' as const,
      },
      secondary: {
        label: (
          <AppMessage
            message={messages.keep}
            values={{ version: LEGACY_SCHEMA_VERSION }}
          />
        ),
        value: 'keep' as const,
      },
      cancel: {
        label: <AppMessage message={commonMessages.cancel} />,
        value: null,
      },
    },
  });

  return choice === 'upgrade' || choice === 'keep' ? choice : null;
}
