import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { NcEncryptionHeader } from '@codaco/shared-consts';

import type { InterviewPayload } from '../../contract/types';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import {
  createEncryptionStore,
  encryptionFor,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { unlockEncryption } from '../../interfaces/Anonymisation/unlockEncryption';
import { setShowPassphrasePrompter } from '../../store/modules/ui';
import type { StageProps } from '../../types';
import PassphrasePrompter from '../PassphrasePrompter';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Stages = InterviewPayload['protocol']['stages'];

const anonymisationStage = (
  id: string,
  validation: StageProps<'Anonymisation'>['stage']['validation'],
): StageProps<'Anonymisation'>['stage'] => ({
  id,
  type: 'Anonymisation',
  label: { en: 'Protect your answers' },
  explanationText: {
    title: { en: 'Protect your answers' },
    body: { en: 'Choose one.' },
  },
  validation,
});

const informationStage: Stages[number] = {
  id: 'information',
  type: 'Information',
  label: { en: 'Welcome' },
  title: { en: 'Welcome' },
  items: [],
};

/**
 * Holds every key derivation until released, so the check of a passphrase
 * can be observed while it is under way. Counts the derivations started.
 */
function holdKeyDerivation() {
  const derive = crypto.subtle.deriveKey.bind(crypto.subtle);
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const deriveKey = vi
    .spyOn(crypto.subtle, 'deriveKey')
    .mockImplementation(async (...args) => {
      await released;
      return derive(...args);
    });
  return { deriveKey, release };
}

async function openPrompter({
  header,
  stages = [informationStage],
}: { header?: NcEncryptionHeader; stages?: Stages } = {}) {
  const store = createEncryptionStore([], stages, undefined, { header });
  store.dispatch(setShowPassphrasePrompter(true));

  render(
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale="en">
        <PassphrasePrompter />
      </InterviewI18nProvider>
    </Provider>,
  );

  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Enter your Passphrase' }),
  );
  const dialog = await screen.findByRole('dialog');
  // Each label also carries a visual required marker.
  const passphrase = await within(dialog).findByLabelText(/^Passphrase/, {
    selector: 'input',
  });
  const submit = screen.getByRole('button', { name: 'Submit passphrase' });
  return { store, user, dialog, passphrase, submit };
}

const confirmField = (dialog: HTMLElement) =>
  within(dialog).queryByLabelText(/^Confirm Passphrase/, { selector: 'input' });

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  passphrase: string,
  confirmation = passphrase,
) {
  const first = within(dialog).getByLabelText(/^Passphrase/, {
    selector: 'input',
  });
  const second = confirmField(dialog);
  if (!second) throw new Error('expected a confirmation field');
  await user.clear(first);
  await user.type(first, passphrase);
  await user.clear(second);
  await user.type(second, confirmation);
  await user.click(screen.getByRole('button', { name: 'Submit passphrase' }));
  return { first, second };
}

describe('PassphrasePrompter in an interview without a passphrase', () => {
  it('has the participant choose one of at least eight characters, confirmed, and puts it in force', async () => {
    const { store, user, dialog } = await openPrompter();

    expect(dialog).toHaveAccessibleName('Choose a passphrase');
    expect(confirmField(dialog)).toHaveAttribute('type', 'password');

    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');
    const { first } = await choose(user, dialog, 'seven77');

    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(first).toHaveAccessibleDescription(
      expect.stringContaining('Too short. Enter at least 8 characters.'),
    );
    expect(deriveKey).not.toHaveBeenCalled();
    expect(store.getState().session.network.encryption).toBeUndefined();

    await choose(user, dialog, 'eight888');

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(store.getState().session.network.encryption).toBeDefined();
    expect(store.getState().ui.encryptionKeyId).not.toBeNull();
    expect(deriveKey).toHaveBeenCalledTimes(1);
  });

  it('refuses a passphrase whose confirmation does not match it', async () => {
    const { store, user, dialog } = await openPrompter();
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');

    const { second } = await choose(user, dialog, 'passphrase', 'passphrasf');

    await waitFor(() => expect(second).toHaveAttribute('aria-invalid', 'true'));
    expect(second).toHaveAccessibleDescription(
      expect.stringContaining('must be the same as'),
    );
    expect(deriveKey).not.toHaveBeenCalled();
    expect(store.getState().session.network.encryption).toBeUndefined();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('holds the passphrase to the minimum length of the protocol’s first Anonymisation stage, even one below the default', async () => {
    const { store, user, dialog } = await openPrompter({
      stages: [
        informationStage,
        anonymisationStage('first', { minLength: 4 }),
        anonymisationStage('second', { minLength: 12 }),
      ],
    });

    const { first } = await choose(user, dialog, 'abc');
    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(first).toHaveAccessibleDescription(
      expect.stringContaining('Too short. Enter at least 4 characters.'),
    );

    await choose(user, dialog, 'abcd');

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(store.getState().session.network.encryption).toBeDefined();
  });
});

describe('PassphrasePrompter in an interview whose passphrase has been chosen', () => {
  it('asks for it once, without length rules, and turns away any other even when no answer is encrypted yet', async () => {
    const { header } = await encryptionFor('pw');
    const { store, user, dialog, passphrase, submit } = await openPrompter({
      header,
    });

    expect(dialog).toHaveAccessibleName('Enter your Passphrase');
    expect(passphrase).toHaveAttribute('type', 'password');
    expect(confirmField(dialog)).not.toBeInTheDocument();
    expect(passphrase).not.toHaveAccessibleDescription(
      expect.stringContaining('Enter at least'),
    );
    expect(store.getState().session.network.nodes).toEqual([]);

    await user.type(passphrase, 'no');
    await user.click(submit);

    await waitFor(() =>
      expect(passphrase).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(passphrase).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    expect(passphrase).not.toHaveAccessibleDescription(
      expect.stringContaining('Too short'),
    );
    expect(store.getState().ui.encryptionKeyId).toBeNull();
    expect(store.getState().session.network.encryption).toEqual(header);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.clear(passphrase);
    await user.type(passphrase, 'pw');
    await user.click(submit);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(store.getState().ui.encryptionKeyId).not.toBeNull();
    expect(store.getState().session.network.encryption).toEqual(header);
  });

  it('says it is checking the passphrase, and starts no second check while it does', async () => {
    const { header } = await encryptionFor('pw');
    const { store, user, dialog, passphrase, submit } = await openPrompter({
      header,
    });
    const status = within(dialog).getByRole('status');
    expect(status).toBeEmptyDOMElement();
    expect(
      within(dialog).getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument();

    const { deriveKey, release } = holdKeyDerivation();
    await user.type(passphrase, 'pw');
    await user.click(submit);

    await waitFor(() => expect(deriveKey).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(passphrase).toBeDisabled();
    expect(status).toHaveTextContent('Checking your passphrase…');

    await user.click(submit);
    await user.type(passphrase, '{Enter}');
    expect(deriveKey).toHaveBeenCalledTimes(1);

    // Nor can the dialog be closed, to be opened again and offer another.
    expect(
      within(dialog).queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    release();

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(store.getState().ui.encryptionKeyId).not.toBeNull();

    // Attempts on one store run one after another, so this one settles only
    // after any the dialog started; it derives the key once itself.
    await unlockEncryption(store, 'pw');
    expect(deriveKey).toHaveBeenCalledTimes(2);
  });
});
