import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc, rpcClient } from '../lib/api.ts';
import RegistryCredentialForm from './RegistryCredentialForm.tsx';

const messages = defineMessages({
  heading: {
    id: 'studio.accountRegistry.heading',
    defaultMessage: 'Template Registry',
    description: 'Heading for Registry account linking.',
  },
  intro: {
    id: 'studio.accountRegistry.intro',
    defaultMessage:
      'Link your publisher identity to this Studio account. The publishing credential is verified once and is never saved by Studio.',
    description: 'Registry linking explanation.',
  },
  unavailable: {
    id: 'studio.accountRegistry.unavailable',
    defaultMessage: 'This Studio instance has no Template Registry configured.',
    description: 'Registry unavailable message.',
  },
  failed: {
    id: 'studio.accountRegistry.failed',
    defaultMessage: 'Registry account details could not be loaded.',
    description: 'Registry link read failure.',
  },
  linked: {
    id: 'studio.accountRegistry.linked',
    defaultMessage: 'Linked as {name} on {origin}.',
    description: 'Linked Registry publisher identity.',
  },
  credential: {
    id: 'studio.accountRegistry.credential',
    defaultMessage: 'Registry publishing credential',
    description: 'Registry credential field label.',
  },
  link: {
    id: 'studio.accountRegistry.link',
    defaultMessage: 'Verify and link account',
    description: 'Registry link submit label.',
  },
  linkFailed: {
    id: 'studio.accountRegistry.linkFailed',
    defaultMessage:
      'The credential could not be verified. Check it in the Registry and try again.',
    description: 'Registry link error.',
  },
  linkSucceeded: {
    id: 'studio.accountRegistry.linkSucceeded',
    defaultMessage: 'The Registry publisher identity was linked.',
    description: 'Registry link success announcement.',
  },
});

export default function AccountRegistry() {
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const status = useQuery(orpc.account.registry.queryOptions());
  const [linkedNotice, setLinkedNotice] = useState(false);
  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" margin="none" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.intro)}
        </Paragraph>
      </div>
      <Surface spacing="lg">
        {status.isPending && <Spinner size="sm" />}
        {status.isError && (
          <Alert variant="destructive">
            {intl.formatMessage(messages.failed)}
          </Alert>
        )}
        {status.data?.origin === null && (
          <Alert>{intl.formatMessage(messages.unavailable)}</Alert>
        )}
        {status.data?.link && (
          <Alert>
            {intl.formatMessage(messages.linked, {
              name: status.data.link.publisher.name,
              origin: status.data.origin,
            })}
          </Alert>
        )}
        {linkedNotice && (
          <div role="status" aria-live="polite">
            <Alert>{intl.formatMessage(messages.linkSucceeded)}</Alert>
          </div>
        )}
        {status.data?.origin && (
          <RegistryCredentialForm
            label={intl.formatMessage(messages.credential)}
            submitLabel={intl.formatMessage(messages.link)}
            onSubmit={async (credential) => {
              setLinkedNotice(false);
              try {
                await rpcClient.account.linkRegistry({ credential });
                await queryClient.invalidateQueries({
                  queryKey: orpc.account.registry.key(),
                });
                setLinkedNotice(true);
                return { success: true };
              } catch {
                return {
                  success: false,
                  formErrors: [intl.formatMessage(messages.linkFailed)],
                };
              }
            }}
          />
        )}
      </Surface>
    </div>
  );
}
