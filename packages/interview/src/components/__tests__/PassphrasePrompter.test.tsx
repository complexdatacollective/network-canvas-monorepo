import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import {
  createEncryptionStore,
  makeEncryptedPerson,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { setShowPassphrasePrompter } from '../../store/modules/ui';
import PassphrasePrompter from '../PassphrasePrompter';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

// The label also carries a visual required marker.
const findPassphraseField = () =>
  screen.findByLabelText(/^Passphrase/, { selector: 'input' });

async function renderPrompter(passphrase: string) {
  const store = createEncryptionStore([
    await makeEncryptedPerson('n1', 'Alice', passphrase),
  ]);
  store.dispatch(setShowPassphrasePrompter(true));

  render(
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale="en">
        <PassphrasePrompter orientation="vertical" />
      </InterviewI18nProvider>
    </Provider>,
  );

  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Enter your Passphrase' }),
  );
  return { store, user };
}

describe('PassphrasePrompter', () => {
  it('turns away a passphrase that cannot unlock the saved answers, and explains why', async () => {
    const { store, user } = await renderPrompter('pw');

    const field = await findPassphraseField();
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'off');
    await user.type(field, 'wrong');
    await user.click(screen.getByRole('button', { name: 'Submit passphrase' }));

    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    expect(store.getState().ui.passphrase).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('puts a passphrase that unlocks the saved answers in force and closes', async () => {
    const { store, user } = await renderPrompter('pw');

    await user.type(await findPassphraseField(), 'pw');
    await user.click(screen.getByRole('button', { name: 'Submit passphrase' }));

    await waitFor(() => expect(store.getState().ui.passphrase).toBe('pw'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('cannot be closed while it checks a passphrase', async () => {
    const { store, user } = await renderPrompter('pw');
    let release: () => void = () => undefined;
    const checked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    const held = vi
      .spyOn(crypto.subtle, 'decrypt')
      .mockImplementation((algorithm, key, data) =>
        checked.then(() => decrypt(algorithm, key, data)),
      );

    try {
      await user.type(await findPassphraseField(), 'pw');
      await user.click(
        screen.getByRole('button', { name: 'Submit passphrase' }),
      );
      await waitFor(() => expect(held).toHaveBeenCalled());

      expect(
        screen.queryByRole('button', { name: 'Close' }),
      ).not.toBeInTheDocument();
      await user.keyboard('{Escape}');
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(store.getState().ui.passphrase).toBeNull();

      release();
      await waitFor(() => expect(store.getState().ui.passphrase).toBe('pw'));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    } finally {
      held.mockRestore();
    }
  });
});
