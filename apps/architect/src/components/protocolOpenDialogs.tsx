import { createElement, type ReactNode } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
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
import type {
  ChoiceDialog,
  DialogContextType,
} from '@codaco/fresco-ui/dialogs/DialogProvider';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { formatMigrationNotes } from '@codaco/protocol-validation/messages';
import ExternalLink from '~/components/ExternalLink';
import Markdown from '~/components/Markdown';
import type { ProtocolOpenResult } from '~/ducks/modules/userActions/userActions';
import { documentationLinks } from '~/utils/documentationLinks';
import {
  getBundledLegacyArchitect,
  LEGACY_ARCHITECT_MAJOR,
} from '~/utils/legacyArchitect';

import { legacyProtocolMessages } from './legacyProtocolMessages';

const additionalMessages = defineMessages({
  resourcesMissingTitle: {
    id: 'architect.additional.protocolOpenDialogs.resourcesMissingTitle',
    defaultMessage: 'Some resources are missing',
    description: 'The title text in components / protocolOpenDialogs.',
  },
  resourcesMissingDescription: {
    id: 'architect.additional.protocolOpenDialogs.resourcesMissingDescription',
    defaultMessage:
      'This protocol refers to files that were not included in it: {assetList}. Everything else opened normally. Add the files again in Resources — until you do, the protocol cannot be downloaded.',
    description: 'The description text in components / protocolOpenDialogs.',
  },
  upgradeToContinue: {
    id: 'architect.additional.protocolOpenDialogs.upgradeToContinue',
    defaultMessage: 'Upgrade to continue',
    description: 'The title text in components / protocolOpenDialogs.',
  },
  olderSchemaKeepOrUpgrade: {
    id: 'architect.protocolOpenDialogs.olderSchemaKeepOrUpgrade',
    defaultMessage:
      'This protocol uses an older version of the Network Canvas protocol schema (more information <ExternalLink>here</ExternalLink>). You can either open and edit it as normal, or you can upgrade it to the latest version, which will unlock new features and functionality.',
    description:
      'First paragraph of the dialog shown when a researcher opens a protocol made for an older schema, when Architect can still edit it unchanged (in the previous version of Architect, served alongside this one). "Open and edit it as normal" means keeping the protocol at its older schema. <ExternalLink> wraps a link to the documentation page about protocol schemas.',
  },
  olderSchemaUpgrade: {
    id: 'architect.protocolOpenDialogs.olderSchemaUpgrade',
    defaultMessage:
      'This protocol uses an older version of the Network Canvas protocol schema (more information <ExternalLink>here</ExternalLink>). You can upgrade it to the latest version, which will unlock new features and functionality.',
    description:
      'First paragraph of the dialog shown when a researcher opens a protocol made for an older schema, in a build of Architect that can only offer to upgrade it. <ExternalLink> wraps a link to the documentation page about protocol schemas.',
  },
  upgradeAffectsInterviews: {
    id: 'architect.protocolOpenDialogs.upgradeAffectsInterviews',
    defaultMessage:
      '<strong>Please note:</strong> upgrading may change the interview experience for participants, and will require you to also use the latest version of Interviewer or Fresco.',
    description:
      'Paragraph in the dialog offering to upgrade an older protocol to the current schema. Warns that interviews may look or behave differently after upgrading, and that the upgraded protocol only runs in the latest versions of Interviewer and Fresco (the apps that run interviews). <strong> wraps the opening words, shown in bold.',
  },
  upgradeMakesACopy: {
    id: 'architect.protocolOpenDialogs.upgradeMakesACopy',
    defaultMessage:
      'Upgrading creates an upgraded copy of your protocol and opens it. Your original protocol will not be changed.',
    description:
      'Paragraph in the dialog offering to upgrade an older protocol to the current schema. Explains that upgrading makes a new copy at the current schema and opens it, and that the original protocol stays as it was.',
  },
  upgradeChangesList: {
    id: 'architect.protocolOpenDialogs.upgradeChangesList',
    defaultMessage:
      'If you upgrade, the following changes will be made to your protocol:',
    description:
      'Sentence in the dialog offering to upgrade an older protocol, introducing the box below it that lists every change the upgrade makes to the protocol.',
  },
  migratingToSchemaVersionWill: {
    id: 'architect.additional.protocolOpenDialogs.migratingToSchemaVersionWill',
    defaultMessage: 'Changes in schema version {version}:',
    description:
      'Heading above the list of changes for one schema version, in the dialog shown to researchers when Architect offers to upgrade an older protocol. {version} is the schema version number.',
  },
  chooseHowToOpen: {
    id: 'architect.protocolOpenDialogs.chooseHowToOpen',
    defaultMessage: 'How do you want to open this protocol?',
    description:
      'Title of the dialog shown when a researcher opens a protocol made for an older schema and Architect offers two ways forward: upgrade a copy to the current schema, or keep editing the protocol unchanged in the previous version of Architect.',
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
  /** Upgrade the protocol. The dialog's primary action. */
  onApproveMigration?: () => Promise<void>;
  /**
   * Hand the protocol, unchanged, to the bundled Architect 8 instead. Offered
   * only when given and when this build bundles Architect 8.
   */
  onKeepLegacy?: () => Promise<void>;
  /** Where focus goes when the dialog closes and its opener has gone. */
  finalFocus?: ChoiceDialog['finalFocus'];
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
  onKeepLegacy,
  finalFocus,
}: ShowProtocolOpenResultDialogArgs): Promise<void> => {
  if (!result) {
    return;
  }
  if (result.status === 'opened') {
    // The protocol is already open behind this dialog — it says what is
    // missing and what to do, not that anything failed.
    if (result.unresolvedAssetNames?.length) {
      await openDialog({
        type: 'acknowledge',
        intent: 'warning',
        finalFocus,
        title: createElement(AppMessage, {
          message: additionalMessages.resourcesMissingTitle,
        }),
        description: createElement(AppErrorMessage, {
          error: createMessageError(
            additionalMessages.resourcesMissingDescription,
            { assetList: { list: result.unresolvedAssetNames } },
          ),
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, {
              message: additionalMessages.oK,
            }),
            value: true,
          },
        },
      });
    }
    return;
  }
  if (result.status === 'migration-required') {
    // Schema 7 and older count as schema 8 here: Architect 8 upgrades them to
    // schema 8 itself when it opens them.
    const offerKeep =
      onKeepLegacy !== undefined && getBundledLegacyArchitect() !== null;
    const renderDocumentationLink = (chunks: ReactNode[]) => (
      <ExternalLink href={documentationLinks.protocolSchema}>
        {chunks}
      </ExternalLink>
    );
    const renderStrong = (chunks: ReactNode[]) => <strong>{chunks}</strong>;
    const choice = await openDialog({
      type: 'choice',
      // Not a warning: upgrading makes a copy and changes nothing, so the
      // dialog leads with it rather than with Cancel.
      intent: 'info',
      title: createElement(AppMessage, {
        message: offerKeep
          ? additionalMessages.chooseHowToOpen
          : additionalMessages.upgradeToContinue,
      }),
      size: 'editor',
      finalFocus,
      children: (
        <>
          <Paragraph>
            {createElement(AppMessage, {
              message: offerKeep
                ? additionalMessages.olderSchemaKeepOrUpgrade
                : additionalMessages.olderSchemaUpgrade,
              values: { ExternalLink: renderDocumentationLink },
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.upgradeAffectsInterviews,
              values: { strong: renderStrong },
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.upgradeMakesACopy,
            })}
          </Paragraph>
          {result.migrationNotes.length > 0 && (
            <>
              <Paragraph>
                {createElement(AppMessage, {
                  message: additionalMessages.upgradeChangesList,
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
        </>
      ),
      // Not booleans: the test suite's dialog mock answers `true`, which must
      // read as "no choice" rather than as approval of an upgrade.
      actions: {
        primary: {
          label: createElement(AppMessage, {
            message: legacyProtocolMessages.upgradeToSchema,
            values: { version: result.targetSchemaVersion },
          }),
          value: 'upgrade' as const,
        },
        ...(offerKeep && {
          secondary: {
            label: createElement(AppMessage, {
              message: legacyProtocolMessages.keepEditingAsSchema,
              values: { version: LEGACY_ARCHITECT_MAJOR },
            }),
            value: 'legacy' as const,
          },
        }),
        cancel: {
          label: createElement(AppMessage, { message: commonMessages.cancel }),
          value: null,
        },
      },
    });
    if (choice === 'upgrade') {
      await onApproveMigration?.();
    } else if (choice === 'legacy' && offerKeep) {
      await onKeepLegacy();
    }
    return;
  }
  if (result.status === 'app-upgrade-required') {
    void openDialog({
      type: 'acknowledge',
      intent: 'destructive',
      finalFocus,
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
      finalFocus,
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
          <Paragraph intent="smallText">
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
    finalFocus,
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
        <Paragraph intent="smallText" className="mt-4">
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
