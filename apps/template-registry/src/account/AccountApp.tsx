import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import {
  AccountRequestError,
  registryAccountClient,
  type RegistryAccount,
  type RegistryAccountClient,
} from './api.ts';
import { Credentials } from './Credentials.tsx';
import { accountErrorMessage } from './feedback.ts';
import { messages } from './messages.ts';
import { Moderation } from './Moderation.tsx';
import { PublisherProfile } from './PublisherProfile.tsx';
import { useRequests } from './useRequests.ts';

type AccountState =
  | { kind: 'ready'; account: RegistryAccount }
  | {
      kind:
        | 'loading'
        | 'signed_out'
        | 'unavailable'
        | 'signing_out'
        | 'sign_out_failed';
    };

export function AccountApp({
  client = registryAccountClient,
}: {
  client?: RegistryAccountClient;
}) {
  const intl = useAppIntl();
  const { closeAllDialogs } = useDialog();
  const { run, cancel } = useRequests();
  const [state, setState] = useState<AccountState>({ kind: 'loading' });
  const [invalidLink] = useState(() =>
    new URLSearchParams(window.location.search).has('error'),
  );
  const [sent, setSent] = useState(false);
  const sentRef = useRef<HTMLParagraphElement>(null);
  const currentAccount = useRef<RegistryAccount | null>(null);
  const refresh = useCallback(() => {
    cancel();
    void run((signal) => client.account(signal))
      .then((account) => {
        if (account) {
          const previous = currentAccount.current;
          if (
            previous &&
            (previous.id !== account.id ||
              (previous.operator && !account.operator) ||
              (!previous.suspended && account.suspended))
          )
            closeAllDialogs();
          currentAccount.current = account;
          setState({ kind: 'ready', account });
        }
      })
      .catch((error) => {
        closeAllDialogs();
        currentAccount.current = null;
        setState({
          kind:
            error instanceof AccountRequestError &&
            error.failure === 'signed_out'
              ? 'signed_out'
              : 'unavailable',
        });
      });
  }, [cancel, client, closeAllDialogs, run]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    // Error callbacks carry no state that should survive in a copied URL.
    if (window.location.search)
      window.history.replaceState(null, '', '/account');
  }, []);
  useEffect(() => {
    if (state.kind !== 'ready') return;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh, state.kind]);
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);
  const signOut = () => {
    cancel();
    closeAllDialogs();
    setSent(false);
    currentAccount.current = null;
    // Unmount every private surface before waiting for the server. Each one
    // cancels its own pending operations and discards one-time credentials.
    setState({ kind: 'signing_out' });
    void run((signal) => client.signOut(signal))
      .then((result) => {
        if (result) setState({ kind: 'signed_out' });
      })
      .catch(() => setState({ kind: 'sign_out_failed' }));
  };
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Heading level="h1">{intl.formatMessage(messages.title)}</Heading>
        {state.kind === 'ready' && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={refresh}>
              {intl.formatMessage(messages.refresh)}
            </Button>
            <Button onClick={signOut}>
              {intl.formatMessage(messages.signOut)}
            </Button>
          </div>
        )}
      </header>
      {state.kind === 'loading' && (
        <Paragraph role="status">
          {intl.formatMessage(messages.loading)}
        </Paragraph>
      )}
      {state.kind === 'signing_out' && (
        <Paragraph role="status">
          {intl.formatMessage(messages.signingOut)}
        </Paragraph>
      )}
      {state.kind === 'unavailable' && (
        <Surface className="rounded p-6">
          <Alert variant="destructive">
            {intl.formatMessage(messages.unavailable)}
          </Alert>
          <Button onClick={refresh}>
            {intl.formatMessage(messages.retry)}
          </Button>
        </Surface>
      )}
      {state.kind === 'sign_out_failed' && (
        <Surface className="rounded p-6">
          <Alert variant="destructive">
            {intl.formatMessage(messages.signOutFailed)}
          </Alert>
          <Button onClick={signOut}>
            {intl.formatMessage(messages.retry)}
          </Button>
        </Surface>
      )}
      {state.kind === 'signed_out' && (
        <Surface className="mx-auto w-full max-w-xl rounded p-6">
          <Heading level="h2">{intl.formatMessage(messages.signIn)}</Heading>
          {invalidLink && (
            <Alert variant="warning">
              {intl.formatMessage(messages.invalidLink)}
            </Alert>
          )}
          <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
          {sent ? (
            <Paragraph ref={sentRef} role="status" tabIndex={-1}>
              {intl.formatMessage(messages.sent)}
            </Paragraph>
          ) : (
            <Form
              onSubmit={async (values) => {
                try {
                  const email =
                    typeof values.email === 'string' ? values.email : '';
                  const result = await run((signal) =>
                    client.sendLink(email, signal),
                  );
                  if (result) setSent(true);
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
                name="email"
                component={InputField}
                label={intl.formatMessage(messages.email)}
                type="email"
                required
                maxLength={320}
                autoComplete="email"
                pattern={{
                  regex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
                  errorMessage: intl.formatMessage(messages.emailInvalid),
                  hint: intl.formatMessage(messages.emailInvalid),
                }}
              />
              <SubmitButton>{intl.formatMessage(messages.send)}</SubmitButton>
            </Form>
          )}
        </Surface>
      )}
      {state.kind === 'ready' && (
        <AccountSections
          key={state.account.id}
          account={state.account}
          client={client}
          refresh={refresh}
        />
      )}
    </main>
  );
}

function AccountSections({
  account,
  client,
  refresh,
}: {
  account: RegistryAccount;
  client: RegistryAccountClient;
  refresh: () => void;
}) {
  const intl = useAppIntl();
  return (
    <>
      <section aria-label={intl.formatMessage(messages.account)}>
        <Paragraph>{account.email}</Paragraph>
      </section>
      {account.suspended ? (
        <Alert variant="warning">
          {intl.formatMessage(messages.suspended)}
        </Alert>
      ) : (
        <>
          <PublisherProfile
            account={account}
            client={client}
            refresh={refresh}
          />
          {account.publisher && (
            <Credentials client={client} operator={account.operator} />
          )}
          {account.operator && account.publisher && (
            <Moderation client={client} />
          )}
        </>
      )}
    </>
  );
}
