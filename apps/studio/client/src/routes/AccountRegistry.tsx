import { useQuery, useQueryClient } from '@tanstack/react-query';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc, rpcClient } from '../lib/api.ts';

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
});

export default function AccountRegistry() {
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const status = useQuery(orpc.account.registry.queryOptions());
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
        {status.data?.origin && (
          <Form
            onSubmit={async ({ credential }) => {
              if (typeof credential !== 'string') return { success: false };
              try {
                await rpcClient.account.linkRegistry({ credential });
                await queryClient.invalidateQueries({
                  queryKey: orpc.account.registry.key(),
                });
                return { success: true };
              } catch {
                return {
                  success: false,
                  formErrors: [intl.formatMessage(messages.linkFailed)],
                };
              }
            }}
          >
            <Field
              name="credential"
              label={intl.formatMessage(messages.credential)}
              component={InputField}
              type="password"
              autoComplete="off"
              required
            />
            <SubmitButton>{intl.formatMessage(messages.link)}</SubmitButton>
          </Form>
        )}
      </Surface>
    </div>
  );
}
