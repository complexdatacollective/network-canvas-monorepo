import { createElement } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { formatMigrationNotes } from '@codaco/protocol-validation/messages';
import ExternalLink from '~/components/ExternalLink';
import Markdown from '~/components/Markdown';
import type { ProtocolOpenResult } from '~/ducks/modules/userActions/userActions';
import { documentationLinks } from '~/utils/documentationLinks';
const additionalMessages = defineMessages({
  upgradeToContinue: {
    id: 'architect.additional.protocolOpenDialogs.upgradeToContinue',
    defaultMessage: 'Upgrade to continue',
    description: 'The title text in components / protocolOpenDialogs.',
  },
  thisProtocolUsesSchemaVersion: {
    id: 'architect.additional.protocolOpenDialogs.thisProtocolUsesSchemaVersion',
    defaultMessage:
      'This protocol uses schema version {value1}, which is not compatible with this version of Architect.',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  itCanBeAutomaticallyUpgradedTo: {
    id: 'architect.additional.protocolOpenDialogs.itCanBeAutomaticallyUpgradedTo',
    defaultMessage:
      'It can be automatically upgraded to schema version {value1} using our migration feature.',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  ifYouChooseToMigrateThe: {
    id: 'architect.additional.protocolOpenDialogs.ifYouChooseToMigrateThe',
    defaultMessage:
      'If you choose to migrate, the following actions will be automatically performed on your protocol. Read these notes carefully, as these actions may affect your data.',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  migratingToSchemaVersionWill: {
    id: 'architect.additional.protocolOpenDialogs.migratingToSchemaVersionWill',
    defaultMessage: 'Migrating to schema Version {version} will:',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  ifYouChooseToContinueAn: {
    id: 'architect.additional.protocolOpenDialogs.ifYouChooseToContinueAn',
    defaultMessage:
      'If you choose to continue, an upgraded copy of your protocol will be created and then opened. Your original protocol will not be changed, and can still be opened and modified using an older version of Architect. Please see our <ExternalLink> documentation on protocol schemas </ExternalLink> for more information on this topic.',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  createUpgradedCopy: {
    id: 'architect.additional.protocolOpenDialogs.createUpgradedCopy',
    defaultMessage: 'Create upgraded copy',
    description: 'The label text in components / protocolOpenDialogs.',
  },
  protocolNotCompatibleWithCurrentVersion: {
    id: 'architect.additional.protocolOpenDialogs.protocolNotCompatibleWithCurrentVersion',
    defaultMessage: 'Protocol not compatible with current version',
    description: 'The title text in components / protocolOpenDialogs.',
  },
  thisProtocolIsNotCompatibleWith: {
    id: 'architect.additional.protocolOpenDialogs.thisProtocolIsNotCompatibleWith',
    defaultMessage:
      'This protocol is not compatible with the current version of Architect.',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  inOrderToOpenItYou: {
    id: 'architect.additional.protocolOpenDialogs.inOrderToOpenItYou',
    defaultMessage:
      'In order to open it, you will need to install a version of Architect that supports schema version {value1}.',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  pleaseSeeOurDocumentationOnProtocol: {
    id: 'architect.additional.protocolOpenDialogs.pleaseSeeOurDocumentationOnProtocol',
    defaultMessage:
      'Please see our <ExternalLink> documentation on protocol schemas </ExternalLink> to locate an appropriate version, and for further information on this topic.',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  oK: {
    id: 'architect.additional.protocolOpenDialogs.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / protocolOpenDialogs.',
  },
  protocolValidationFailed: {
    id: 'architect.additional.protocolOpenDialogs.protocolValidationFailed',
    defaultMessage: 'Protocol Validation Failed',
    description: 'The title text in components / protocolOpenDialogs.',
  },
  theProtocolCouldNotBeOpened: {
    id: 'architect.additional.protocolOpenDialogs.theProtocolCouldNotBeOpened',
    defaultMessage:
      'The protocol could not be opened due to validation errors:',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
  protocolValidationErrors: {
    id: 'architect.additional.protocolOpenDialogs.protocolValidationErrors',
    defaultMessage: 'Protocol validation errors',
    description: 'The aria-label text in components / protocolOpenDialogs.',
  },
  ifTheProblemPersistsReachOut: {
    id: 'architect.additional.protocolOpenDialogs.ifTheProblemPersistsReachOut',
    defaultMessage:
      'If the problem persists, reach out on our <ExternalLink> community website. </ExternalLink>',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
});
const messages = defineMessages({
  technicalDetails: {
    id: 'architect.protocolOpenDialogs.technicalDetails',
    defaultMessage: 'Technical details (English)',
    description: 'Visible text in components / protocolOpenDialogs.',
  },
});

type ShowProtocolOpenResultDialogArgs = {
  result: ProtocolOpenResult | undefined;
  openDialog: DialogContextType['openDialog'];
  onApproveMigration?: () => Promise<void>;
};

const MigrationNotes = ({
  version,
  notes,
}: {
  version: number;
  notes: string;
}) => {
  const intl = useAppIntl();
  return <Markdown label={formatMigrationNotes(version, notes, intl)} />;
};

export const showProtocolOpenResultDialog = async ({
  result,
  openDialog,
  onApproveMigration,
}: ShowProtocolOpenResultDialogArgs): Promise<void> => {
  if (!result || result.status === 'opened') {
    return;
  }
  if (result.status === 'migration-required') {
    const confirmed = await openDialog({
      type: 'choice',
      intent: 'warning',
      title: createElement(AppMessage, {
        message: additionalMessages.upgradeToContinue,
      }),
      size: 'editor',
      children: (
        <>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.thisProtocolUsesSchemaVersion,
              values: { value1: result.protocolSchemaVersion },
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.itCanBeAutomaticallyUpgradedTo,
              values: { value1: result.targetSchemaVersion },
            })}
          </Paragraph>
          {result.migrationNotes.length > 0 && (
            <>
              <Paragraph>
                {createElement(AppMessage, {
                  message: additionalMessages.ifYouChooseToMigrateThe,
                })}
              </Paragraph>
              <div className="bg-surface-2 max-h-72 overflow-y-auto rounded-sm px-4 py-2 [&_li]:mb-2 [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
                {result.migrationNotes.map(({ version, notes }) => (
                  <div key={version}>
                    <Heading level="h4">
                      {createElement(AppMessage, {
                        message:
                          additionalMessages.migratingToSchemaVersionWill,
                        values: { version: version },
                      })}
                    </Heading>
                    <MigrationNotes version={version} notes={notes} />
                  </div>
                ))}
              </div>
            </>
          )}
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.ifYouChooseToContinueAn,
              values: {
                ExternalLink: (chunks) => (
                  <ExternalLink href={documentationLinks.protocolSchema}>
                    {chunks}
                  </ExternalLink>
                ),
              },
            })}
          </Paragraph>
        </>
      ),
      actions: {
        primary: {
          label: createElement(AppMessage, {
            message: additionalMessages.createUpgradedCopy,
          }),
          value: true,
        },
        cancel: {
          label: createElement(AppMessage, { message: commonMessages.cancel }),
          value: false,
        },
      },
    });
    if (confirmed === true) {
      await onApproveMigration?.();
    }
    return;
  }
  if (result.status === 'app-upgrade-required') {
    void openDialog({
      type: 'acknowledge',
      intent: 'destructive',
      title: createElement(AppMessage, {
        message: additionalMessages.protocolNotCompatibleWithCurrentVersion,
      }),
      children: (
        <>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.thisProtocolIsNotCompatibleWith,
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.inOrderToOpenItYou,
              values: {
                value1: result.protocolSchemaVersion,
              },
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.pleaseSeeOurDocumentationOnProtocol,
              values: {
                ExternalLink: (chunks) => (
                  <ExternalLink href={documentationLinks.protocolSchema}>
                    {chunks}
                  </ExternalLink>
                ),
              },
            })}
          </Paragraph>
        </>
      ),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: additionalMessages.oK }),
          value: true,
        },
      },
    });
    return;
  }
  if (result.status === 'validation-error') {
    void openDialog({
      type: 'acknowledge',
      intent: 'destructive',
      title: createElement(AppMessage, {
        message: additionalMessages.protocolValidationFailed,
      }),
      children: (
        <>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.theProtocolCouldNotBeOpened,
            })}
          </Paragraph>
          <ProtocolFailureDetails detail={result.message} />
          <Paragraph className="text-sm">
            {createElement(AppMessage, {
              message: additionalMessages.ifTheProblemPersistsReachOut,
              values: {
                ExternalLink: (chunks) => (
                  <ExternalLink href="https://community.networkcanvas.com/">
                    {chunks}
                  </ExternalLink>
                ),
              },
            })}
          </Paragraph>
        </>
      ),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: additionalMessages.oK }),
          value: true,
        },
      },
    });
    return;
  }
  void openDialog({
    type: 'acknowledge',
    intent: 'destructive',
    title: result.localizedTitle ? (
      <AppMessage {...result.localizedTitle} />
    ) : (
      <AppErrorMessage error={result.title} />
    ),
    children: (
      <>
        <Paragraph>
          {result.localizedMessage ? (
            <AppMessage {...result.localizedMessage} />
          ) : (
            <AppErrorMessage error={result.message} />
          )}
        </Paragraph>
        <Paragraph className="mt-4 text-sm">
          {createElement(AppMessage, {
            message: additionalMessages.ifTheProblemPersistsReachOut,
            values: {
              ExternalLink: (chunks) => (
                <ExternalLink href="https://community.networkcanvas.com/">
                  {chunks}
                </ExternalLink>
              ),
            },
          })}
        </Paragraph>
        <ProtocolFailureDetails detail={result.detail} />
      </>
    ),
    actions: {
      primary: {
        label: createElement(AppMessage, { message: additionalMessages.oK }),
        value: true,
      },
    },
  });
};

/**
 * The underlying error's own text, collapsed.
 *
 * Architect runs offline and a researcher may have exception reporting turned
 * off, so without this the only record of what actually failed is a console
 * they will never open. It stays shut by default because it is written for
 * whoever reads the bug report, not for the person who just wanted to open
 * their protocol — the dialog above it says everything they need in order to
 * decide what to do next.
 */
export const ProtocolFailureDetails = ({ detail }: { detail?: string }) => {
  const intl = useAppIntl();
  if (!detail) {
    return null;
  }

  return (
    <Accordion className="mt-4">
      <AccordionItem value="technical-details">
        <AccordionHeader>
          <AccordionTrigger>
            {intl.formatMessage(messages.technicalDetails)}
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <pre
            lang="en"
            dir="ltr"
            className="bg-surface-1 max-h-40 overflow-auto rounded-sm p-4 text-sm whitespace-pre-wrap"
          >
            {detail}
          </pre>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};
