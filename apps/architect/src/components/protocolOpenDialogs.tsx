import type { ComponentType } from 'react';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ExternalLink from '~/components/ExternalLink';
import { Markdown } from '~/components/Form/Fields';
import type { ProtocolOpenResult } from '~/ducks/modules/userActions/userActions';
type ShowProtocolOpenResultDialogArgs = {
  result: ProtocolOpenResult | undefined;
  openDialog: DialogContextType['openDialog'];
  onApproveMigration?: () => Promise<void>;
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
      title: 'Upgrade to continue',
      className: '!w-4xl',
      children: (
        <>
          <Paragraph>
            This protocol uses schema version {result.protocolSchemaVersion},
            which is not compatible with this version of Architect.
          </Paragraph>
          <Paragraph>
            It can be automatically upgraded to schema version{' '}
            {result.targetSchemaVersion} using our migration feature.
          </Paragraph>
          {result.migrationNotes.length > 0 && (
            <>
              <Paragraph>
                If you choose to migrate, the following actions will be
                automatically performed on your protocol. Read these notes
                carefully, as these actions may affect your data.
              </Paragraph>
              <div className="bg-surface-2 max-h-72 overflow-y-auto rounded-sm px-4 py-2 [&_li]:mb-2 [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
                {result.migrationNotes.map(({ version, notes }) => (
                  <div key={version}>
                    <Heading level="h4">
                      Migrating to schema Version {version} will:
                    </Heading>
                    <Markdown
                      label={notes}
                      markdownRenderers={{
                        a: ExternalLink as ComponentType<unknown>,
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          <Paragraph>
            If you choose to continue, an upgraded copy of your protocol will be
            created and then opened. Your original protocol will not be changed,
            and can still be opened and modified using an older version of
            Architect. Please see our{' '}
            <ExternalLink href="https://documentation.networkcanvas.com/advanced-topics/protocol-schema-information/">
              documentation on protocol schemas
            </ExternalLink>{' '}
            for more information on this topic.
          </Paragraph>
        </>
      ),
      actions: {
        primary: { label: 'Create upgraded copy', value: true },
        cancel: { label: 'Cancel', value: false },
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
      title: 'Protocol not compatible with current version',
      children: (
        <>
          <Paragraph>
            This protocol is not compatible with the current version of
            Architect.
          </Paragraph>
          <Paragraph>
            In order to open it, you will need to install a version of Architect
            that supports schema version {result.protocolSchemaVersion}.
          </Paragraph>
          <Paragraph>
            Please see our{' '}
            <ExternalLink href="https://documentation.networkcanvas.com/reference/protocol-schema-information/">
              documentation on protocol schemas
            </ExternalLink>{' '}
            to locate an appropriate version, and for further information on
            this topic.
          </Paragraph>
        </>
      ),
      actions: { primary: { label: 'OK', value: true } },
    });
    return;
  }
  if (result.status === 'validation-error') {
    void openDialog({
      type: 'acknowledge',
      intent: 'destructive',
      title: 'Protocol Validation Failed',
      children: (
        <>
          <Paragraph>
            The protocol file could not be opened due to validation errors:
          </Paragraph>
          <pre className="bg-surface-1 max-h-64 overflow-auto rounded-sm p-4 text-sm">
            {result.message}
          </pre>
          <Paragraph className="text-sm">
            If the problem persists, reach out on our&nbsp;
            <ExternalLink href="https://community.networkcanvas.com/">
              community website.
            </ExternalLink>
          </Paragraph>
        </>
      ),
      actions: { primary: { label: 'OK', value: true } },
    });
    return;
  }
  void openDialog({
    type: 'acknowledge',
    intent: 'destructive',
    title: result.title,
    children: (
      <>
        <Paragraph>{result.message}</Paragraph>
        <Paragraph className="mt-4 text-sm">
          If the problem persists, reach out on our&nbsp;
          <ExternalLink href="https://community.networkcanvas.com/">
            community website.
          </ExternalLink>
        </Paragraph>
      </>
    ),
    actions: { primary: { label: 'OK', value: true } },
  });
};
