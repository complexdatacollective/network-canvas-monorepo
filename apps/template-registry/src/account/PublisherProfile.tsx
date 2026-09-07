import { useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { ClaimPublisherSchema } from '../account-contract.ts';
import type { RegistryAccount, RegistryAccountClient } from './api.ts';
import { accountErrorMessage } from './feedback.ts';
import { messages } from './messages.ts';
import { useRequests } from './useRequests.ts';

export function PublisherProfile({
  account,
  client,
  refresh,
}: {
  account: RegistryAccount;
  client: RegistryAccountClient;
  refresh: () => void;
}) {
  const intl = useAppIntl();
  const { run } = useRequests();
  const [saved, setSaved] = useState(false);
  return (
    <Surface className="rounded p-6">
      <Heading level="h2">{intl.formatMessage(messages.publisher)}</Heading>
      <Paragraph>{intl.formatMessage(messages.publisherIntro)}</Paragraph>
      {saved && (
        <Alert variant="success">{intl.formatMessage(messages.saved)}</Alert>
      )}
      <Form
        onSubmit={async (values) => {
          setSaved(false);
          const value = ClaimPublisherSchema.safeParse({
            name: values.name,
            ...(values.orcid ? { orcid: values.orcid } : {}),
          });
          if (!value.success)
            return {
              success: false,
              formErrors: [intl.formatMessage(messages.invalid)],
            };
          try {
            const result = await run((signal) =>
              client.publisher(value.data, signal),
            );
            if (result) {
              setSaved(true);
              refresh();
            }
            return { success: true };
          } catch (error) {
            return {
              success: false,
              formErrors: [accountErrorMessage(intl, error)],
            };
          }
        }}
      >
        <Field
          name="name"
          label={intl.formatMessage(messages.publisherName)}
          component={InputField}
          initialValue={account.publisher?.name ?? ''}
          required
          maxLength={200}
          autoComplete="organization"
        />
        <Field
          name="orcid"
          label={intl.formatMessage(messages.orcid)}
          component={InputField}
          initialValue={account.publisher?.orcid ?? ''}
          maxLength={19}
          hint={intl.formatMessage(messages.orcidHint)}
          pattern={{
            regex: '^\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dX]$',
            errorMessage: intl.formatMessage(messages.invalid),
            hint: intl.formatMessage(messages.orcidHint),
          }}
          autoComplete="off"
        />
        <SubmitButton>{intl.formatMessage(messages.saveProfile)}</SubmitButton>
      </Form>
    </Surface>
  );
}
