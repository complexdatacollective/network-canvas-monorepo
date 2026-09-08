import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { CreateTokenSchema } from '../account-contract.ts';
import type { RegistryAccountClient, RegistryCredential } from './api.ts';
import { accountErrorMessage } from './feedback.ts';
import { messages } from './messages.ts';
import { useRequests } from './useRequests.ts';

export function Credentials({
  client,
  operator,
}: {
  client: RegistryAccountClient;
  operator: boolean;
}) {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const { run } = useRequests();
  const { run: runLoad, cancel: cancelLoad } = useRequests();
  const [credentials, setCredentials] = useState<RegistryCredential[] | null>(
    null,
  );
  const [secret, setSecret] = useState<{ token: string; id: string } | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const secretRef = useRef<HTMLPreElement>(null);
  const hadSecret = useRef(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    cancelLoad();
    try {
      const result = await runLoad((signal) => client.tokens(signal));
      if (result) {
        setCredentials(result.data);
        setError('');
      }
    } catch (cause) {
      setError(accountErrorMessage(intl, cause));
    }
  }, [cancelLoad, client, intl, runLoad]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (secret) secretRef.current?.focus();
    else if (hadSecret.current) submitRef.current?.focus();
    hadSecret.current = secret !== null;
  }, [secret]);
  return (
    <Surface className="rounded p-6">
      <Heading level="h2" ref={headingRef} tabIndex={-1}>
        {intl.formatMessage(messages.tokens)}
      </Heading>
      <Paragraph>{intl.formatMessage(messages.tokenIntro)}</Paragraph>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {secret && (
        <Surface className="mb-6 rounded p-4">
          <Heading level="h3">
            {intl.formatMessage(messages.secretTitle)}
          </Heading>
          <Paragraph>{intl.formatMessage(messages.secretHint)}</Paragraph>
          <pre
            ref={secretRef}
            tabIndex={0}
            aria-label={intl.formatMessage(messages.secretTitle)}
            className="focusable mb-4 rounded p-3 break-all whitespace-pre-wrap"
          >
            {secret.token}
          </pre>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                void run(async () => {
                  await navigator.clipboard.writeText(secret.token);
                  return true;
                })
                  .then((result) => {
                    if (result) setNotice(intl.formatMessage(messages.copied));
                  })
                  .catch(() =>
                    setError(intl.formatMessage(messages.copyFailed)),
                  );
              }}
            >
              {intl.formatMessage(messages.copy)}
            </Button>
            <Button
              onClick={() => {
                setSecret(null);
                setNotice('');
                setError('');
              }}
            >
              {intl.formatMessage(messages.dismiss)}
            </Button>
          </div>
        </Surface>
      )}
      <Form
        onSubmit={async (values) => {
          setError('');
          setNotice('');
          const parsed = CreateTokenSchema.safeParse({
            name: values.name,
            scopes: [values.scope],
            lifetime_days: Number(values.lifetime),
          });
          if (!parsed.success)
            return {
              success: false,
              formErrors: [intl.formatMessage(messages.invalid)],
            };
          try {
            const result = await run((signal) =>
              client.createToken(parsed.data, signal),
            );
            if (result) {
              setSecret({ token: result.token, id: result.credential.id });
              await load();
            }
            return { success: true };
          } catch (cause) {
            return {
              success: false,
              formErrors: [accountErrorMessage(intl, cause)],
            };
          }
        }}
      >
        <Field
          name="name"
          component={InputField}
          label={intl.formatMessage(messages.tokenName)}
          required
          maxLength={100}
          autoComplete="off"
        />
        <Field
          name="scope"
          component={SelectField}
          label={intl.formatMessage(messages.tokenScope)}
          required
          initialValue="publish"
          options={[
            {
              value: 'publish',
              label: intl.formatMessage(messages.publishScope),
            },
            ...(operator
              ? [
                  {
                    value: 'moderate',
                    label: intl.formatMessage(messages.moderateScope),
                  },
                ]
              : []),
          ]}
        />
        <Field
          name="lifetime"
          component={SelectField}
          label={intl.formatMessage(messages.lifetime)}
          required
          initialValue={90}
          options={[7, 30, 90, 365].map((days) => ({
            value: days,
            label: intl.formatMessage(messages.days, { days }),
          }))}
        />
        <SubmitButton ref={submitRef} {...(secret ? { disabled: true } : {})}>
          {intl.formatMessage(messages.issue)}
        </SubmitButton>
      </Form>
      {credentials?.length === 0 && (
        <Paragraph className="mt-6">
          {intl.formatMessage(messages.none)}
        </Paragraph>
      )}
      {credentials && credentials.length > 0 && (
        <ul className="mt-6 grid list-none gap-4 p-0">
          {credentials.map((credential) => (
            <li
              key={credential.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-current/15 pt-4"
            >
              <div className="min-w-0 break-words">
                <strong>{credential.name}</strong>
                <Paragraph>
                  {intl.formatMessage(messages.expires, {
                    date: new Date(credential.expires_at),
                  })}
                </Paragraph>
              </div>
              <Button
                onClick={() => {
                  void confirm({
                    title: intl.formatMessage(messages.revokeTitle, {
                      name: credential.name,
                    }),
                    description: intl.formatMessage(messages.revokeDescription),
                    confirmLabel: intl.formatMessage(messages.revoke),
                    intent: 'destructive',
                    finalFocus: () => headingRef.current,
                    onConfirm: async (dialogSignal) => {
                      try {
                        const result = await run((signal) =>
                          client.revokeToken(
                            credential.id,
                            AbortSignal.any([signal, dialogSignal]),
                          ),
                        );
                        if (result) {
                          if (secret?.id === credential.id) setSecret(null);
                          setNotice(intl.formatMessage(messages.revoked));
                          await load();
                        }
                      } catch (cause) {
                        throw new Error(accountErrorMessage(intl, cause), {
                          cause: cause,
                        });
                      }
                    },
                  });
                }}
              >
                {intl.formatMessage(messages.revoke)}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <Button
          className="mt-4"
          onClick={() => {
            void load();
          }}
        >
          {intl.formatMessage(messages.retry)}
        </Button>
      )}
    </Surface>
  );
}
