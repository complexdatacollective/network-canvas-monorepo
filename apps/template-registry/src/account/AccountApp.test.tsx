import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import { AccountApp } from './AccountApp.tsx';
import {
  AccountRequestError,
  type RegistryAccount,
  type RegistryAccountClient,
  type RegistryCredential,
} from './api.ts';

const account: RegistryAccount = {
  id: 'verified-user',
  email: 'researcher@example.test',
  publisher: {
    id: '8447b779-209a-415e-8767-0a5e1bc39941',
    name: 'Research laboratory',
    orcid: null,
  },
  suspended: false,
  operator: false,
};
const credential: RegistryCredential = {
  id: 'a3df9e8e-2cbc-4985-96f1-f5b2e83df921',
  name: 'Trusted tool',
  scopes: ['publish'],
  created_at: '2026-09-06T00:00:00.000Z',
  expires_at: '2026-12-05T00:00:00.000Z',
  revoked_at: null,
};
const secret = `ncr1_${'a'.repeat(43)}`;
function clientFixture() {
  return {
    account: vi
      .fn<RegistryAccountClient['account']>()
      .mockResolvedValue(account),
    sendLink: vi
      .fn<RegistryAccountClient['sendLink']>()
      .mockResolvedValue({ ok: true }),
    signOut: vi
      .fn<RegistryAccountClient['signOut']>()
      .mockResolvedValue({ ok: true }),
    publisher: vi
      .fn<RegistryAccountClient['publisher']>()
      .mockResolvedValue(account.publisher!),
    tokens: vi
      .fn<RegistryAccountClient['tokens']>()
      .mockResolvedValue({ data: [] }),
    createToken: vi
      .fn<RegistryAccountClient['createToken']>()
      .mockResolvedValue({ token: secret, credential }),
    revokeToken: vi
      .fn<RegistryAccountClient['revokeToken']>()
      .mockResolvedValue({ ok: true }),
    reports: vi
      .fn<RegistryAccountClient['reports']>()
      .mockResolvedValue({ data: [], next_cursor: null }),
    curate: vi
      .fn<RegistryAccountClient['curate']>()
      .mockResolvedValue({ ok: true }),
    visibility: vi
      .fn<RegistryAccountClient['visibility']>()
      .mockResolvedValue({ ok: true }),
    suspend: vi
      .fn<RegistryAccountClient['suspend']>()
      .mockResolvedValue({ ok: true }),
    hardDelete: vi
      .fn<RegistryAccountClient['hardDelete']>()
      .mockResolvedValue({ ok: true }),
  };
}
function mount(client: RegistryAccountClient) {
  return render(
    <StrictMode>
      <AppI18nProvider
        locale="en"
        locales={[{ locale: 'en', label: 'English', direction: 'ltr' }]}
      >
        <DialogProvider>
          <AccountApp client={client} />
        </DialogProvider>
      </AppI18nProvider>
    </StrictMode>,
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function issue(user: ReturnType<typeof userEvent.setup>) {
  const name = await screen.findByLabelText(/^Credential name/);
  await user.type(name, 'Trusted tool');
  await user.click(screen.getByRole('button', { name: 'Create credential' }));
}

it('validates and focuses email, then announces a successful explicit sign-in request', async () => {
  const client = clientFixture();
  client.account.mockRejectedValue(new AccountRequestError('signed_out'));
  mount(client);
  const user = userEvent.setup();
  const send = await screen.findByRole('button', { name: 'Send sign-in link' });
  await user.click(send);
  await waitFor(() =>
    expect(screen.getByLabelText(/Email address/)).toHaveFocus(),
  );
  expect(client.sendLink).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText(/Email address/),
    'researcher@example.test',
  );
  await user.click(send);
  await waitFor(() => expect(client.sendLink).toHaveBeenCalledTimes(1));
  expect(client.sendLink.mock.calls[0]?.[0]).toBe('researcher@example.test');
  const notice = await screen.findByText(
    'Check your email for a sign-in link. Open it on this device within 5 minutes.',
  );
  expect(notice).toHaveAttribute('role', 'status');
  await waitFor(() => expect(notice).toHaveFocus());
});

it('keeps raw errors out of sign-in output and never automatically retries an ambiguous send', async () => {
  const client = clientFixture();
  client.account.mockRejectedValue(new AccountRequestError('signed_out'));
  client.sendLink.mockRejectedValue(
    new Error('private-address-token-provider-canary'),
  );
  mount(client);
  const user = userEvent.setup();
  const email = await screen.findByLabelText(/Email address/);
  await user.type(email, 'researcher@example.test');
  await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));
  expect(
    await screen.findByText(
      'The request could not be completed. Wait a moment and try again.',
    ),
  ).toBeVisible();
  expect(client.sendLink).toHaveBeenCalledTimes(1);
  expect(document.body).not.toHaveTextContent(
    'private-address-token-provider-canary',
  );
});

it('shows a credential once, focuses it, copies it explicitly and clears it on dismissal', async () => {
  const client = clientFixture();
  const writeText = vi.fn().mockResolvedValue(undefined);
  client.tokens.mockResolvedValue({ data: [credential] });
  mount(client);
  await issue(userEvent.setup());
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const value = await screen.findByText(secret);
  expect(value).toHaveFocus();
  expect(
    screen.getByRole('button', { name: 'Create credential' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Copy credential' }));
  expect(await screen.findByText('Credential copied.')).toBeVisible();
  expect(writeText).toHaveBeenCalledWith(secret);
  fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }));
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Create credential' }),
  ).toHaveFocus();
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
  expect(window.location.href).not.toContain(secret);
});

it('retains the shared submit busy guard and discards a late secret after sign-out', async () => {
  const client = clientFixture();
  const pending =
    deferred<Awaited<ReturnType<RegistryAccountClient['createToken']>>>();
  client.createToken.mockReturnValue(pending.promise);
  mount(client);
  await issue(userEvent.setup());
  await waitFor(() => expect(client.createToken).toHaveBeenCalledTimes(1));
  expect(
    screen.getByRole('button', { name: 'Create credential' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Create credential' }));
  expect(client.createToken).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('button', { name: 'Send sign-in link' });
  expect(client.createToken.mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => {
    pending.resolve({ token: secret, credential });
  });
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(screen.queryByText(account.email)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Registry credentials' }),
  ).not.toBeInTheDocument();
});

it('does not replace the post-issuance credential list with an older pending read', async () => {
  const client = clientFixture();
  const previous =
    deferred<Awaited<ReturnType<RegistryAccountClient['tokens']>>>();
  client.tokens.mockReturnValue(previous.promise);
  mount(client);
  await screen.findByRole('heading', { name: 'Registry credentials' });
  await waitFor(() => expect(client.tokens).toHaveBeenCalled());
  client.tokens.mockResolvedValue({ data: [credential] });
  await issue(userEvent.setup());
  await screen.findByRole('button', { name: 'Revoke' });
  await act(async () => previous.resolve({ data: [] }));
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeVisible();
  expect(screen.queryByText('No active credentials.')).not.toBeInTheDocument();
});

it('discards an old account refresh after sign-out and clears an already visible credential', async () => {
  const client = clientFixture();
  mount(client);
  await issue(userEvent.setup());
  await screen.findByText(secret);
  const pending = deferred<RegistryAccount>();
  client.account.mockReturnValue(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh account' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('button', { name: 'Send sign-in link' });
  await act(async () => {
    pending.resolve(account);
  });
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(screen.queryByText(account.email)).not.toBeInTheDocument();
});

it('requires explicit revoke confirmation and removes the credential after the command succeeds', async () => {
  const client = clientFixture();
  client.tokens.mockResolvedValue({ data: [credential] });
  mount(client);
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByText(
      'Tools using this credential will lose access immediately.',
    ),
  ).toBeVisible();
  expect(client.revokeToken).not.toHaveBeenCalled();
  client.tokens.mockResolvedValue({ data: [] });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
  expect(await screen.findByText('Credential revoked.')).toBeVisible();
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument(),
  );
  expect(client.revokeToken.mock.calls[0]?.[0]).toBe(credential.id);
});

it('reveals operator actions only with live access and confirms before calling the private command', async () => {
  const client = clientFixture();
  mount(client);
  await screen.findByRole('heading', { name: 'Registry credentials' });
  expect(
    screen.queryByRole('heading', { name: 'Registry administration' }),
  ).not.toBeInTheDocument();
  client.account.mockResolvedValue({ ...account, operator: true });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh account' }));
  await screen.findByRole('heading', { name: 'Registry administration' });
  const user = userEvent.setup();
  const id = '4b90c0bf-20d2-45b8-9490-f91539b12c97';
  const target = screen.getByLabelText(/^Entry ID/);
  await user.type(target, id);
  const form = target.closest('form');
  if (!form) throw new Error('Entry form missing');
  await user.selectOptions(within(form).getByLabelText(/^Action/), 'takedown');
  await user.click(within(form).getByRole('button', { name: 'Apply action' }));
  const dialog = await screen.findByRole('dialog');
  expect(client.visibility).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Take down artifact' }),
  );
  await waitFor(() => expect(client.visibility).toHaveBeenCalledTimes(1));
  expect(client.visibility.mock.calls[0]?.slice(0, 2)).toEqual([id, true]);
  await screen.findByText('Changes saved.');
  client.account.mockResolvedValue({
    ...account,
    suspended: true,
    operator: false,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh account' }));
  await screen.findByText(
    'Your publisher account is suspended. Publishing and credential changes are unavailable.',
  );
  expect(
    screen.queryByRole('heading', { name: 'Registry administration' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Registry credentials' }),
  ).not.toBeInTheDocument();
});

it('closes an open operator confirmation when a focus refresh reports revoked access', async () => {
  const client = clientFixture();
  client.account.mockResolvedValue({ ...account, operator: true });
  mount(client);
  const user = userEvent.setup();
  const target = await screen.findByLabelText(/^Entry ID/);
  await user.type(target, '4b90c0bf-20d2-45b8-9490-f91539b12c97');
  const form = target.closest('form');
  if (!form) throw new Error('Entry form missing');
  await user.selectOptions(within(form).getByLabelText(/^Action/), 'takedown');
  await user.click(within(form).getByRole('button', { name: 'Apply action' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(client.visibility).not.toHaveBeenCalled();

  const beforeRefresh = client.account.mock.calls.length;
  client.account.mockResolvedValue(account);
  fireEvent.focus(window);
  await waitFor(() =>
    expect(client.account.mock.calls.length).toBeGreaterThan(beforeRefresh),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Registry administration' }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(client.visibility).not.toHaveBeenCalled();
  expect(
    screen.getByRole('heading', { name: 'Registry credentials' }),
  ).toBeVisible();
});
