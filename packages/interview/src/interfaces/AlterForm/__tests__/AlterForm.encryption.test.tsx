import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase, setPassphraseInvalid } from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  alterFormStages,
  createEncryptionStore,
  makeEncryptedPerson,
  makePlainPerson,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../Anonymisation/decryptionScope';
import { decryptData } from '../../Anonymisation/utils';
import AlterForm from '../AlterForm';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  // Reported after mount, as a real observer would, so motion's viewport
  // handlers are not run before the element they animate exists.
  observe(target: Element) {
    const bounds = target.getBoundingClientRect();
    queueMicrotask(() =>
      this.callback(
        [
          {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: bounds,
            intersectionRect: bounds,
            rootBounds: null,
            time: 0,
          },
        ],
        this,
      ),
    );
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
});

const [alterFormStage] = alterFormStages;

async function renderAlterForm(
  passphrase?: string,
  encryptionEnabled = true,
  storedPerson?: NcNode,
  others: NcNode[] = [],
) {
  const person =
    storedPerson ??
    (encryptionEnabled
      ? await makeEncryptedPerson('n1', 'Alice', 'pw')
      : makePlainPerson('n1', 'Alice'));
  const store = createEncryptionStore(
    [person, ...others],
    alterFormStages,
    undefined,
    { encryptionEnabled },
  );
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  const onStepChange = vi.fn();
  let moveForward: (() => Promise<void>) | undefined;
  let moveBackward: (() => Promise<void>) | undefined;

  function Harness() {
    const navigation = useInterviewNavigation(0);
    moveForward = navigation.moveForward;
    moveBackward = navigation.moveBackward;
    if (alterFormStage?.type !== 'AlterForm') return null;

    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        <AlterForm
          stage={alterFormStage}
          getNavigationHelpers={() => ({
            moveForward: () => void navigation.moveForward(),
            moveBackward: () => void navigation.moveBackward(),
          })}
        />
      </StageMetadataProvider>
    );
  }

  render(
    <Provider store={store}>
      <TestProtocolLocalization>
        <InterviewI18nProvider requestedLocale="en">
          <CurrentStepProvider currentStep={0} onStepChange={onStepChange}>
            <DialogProvider>
              <Harness />
            </DialogProvider>
          </CurrentStepProvider>
        </InterviewI18nProvider>
      </TestProtocolLocalization>
    </Provider>,
  );

  const next = () =>
    act(async () => {
      await moveForward?.();
    });
  // Not awaited: going back can wait on a confirmation the test answers.
  const back = () =>
    act(() => {
      void moveBackward?.();
    });

  // Leave the introduction for the first person's questions.
  await next();

  return { store, onStepChange, next, back };
}

describe('AlterForm with an encrypted question', () => {
  it('asks for the passphrase instead of taking answers it could not save', async () => {
    const { store, onStepChange, next } = await renderAlterForm();
    const before = store.getState().session.network;

    expect(
      await screen.findByText(
        /Some answers here are protected by your passphrase/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Age' })).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await next();

    expect(onStepChange).not.toHaveBeenCalled();
    expect(store.getState().session.network).toBe(before);
  });

  it('shows decrypted answers and saves encrypted and plain answers together once the passphrase is in force', async () => {
    const { store, onStepChange, next } = await renderAlterForm('pw');
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alice');

    await user.clear(name);
    await user.type(name, 'Alicia');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    const stored = saved?.[entityAttributesProperty].name;
    const secure = saved?.[entitySecureAttributesMeta]?.name;
    expect(isNumberArray(stored)).toBe(true);
    if (!isNumberArray(stored)) throw new Error('Expected a stored ciphertext');
    if (!secure) throw new Error('Expected secure-attribute metadata');
    await expect(
      decryptData({ secureAttributes: secure, data: stored }, 'pw'),
    ).resolves.toBe('Alicia');
  });

  it('removes an answer the participant clears', async () => {
    const { store, onStepChange, next } = await renderAlterForm('pw');
    const user = userEvent.setup();

    await user.clear(await screen.findByRole('spinbutton', { name: 'Age' }));
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty]).not.toHaveProperty('age');
  });

  it('keeps an answer it cannot show when the person is saved with another answer changed', async () => {
    const encrypted = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const storedCiphertext = encrypted[entityAttributesProperty].name;
    const { store, onStepChange, next } = await renderAlterForm('pw', true, {
      [entityPrimaryKeyProperty]: encrypted[entityPrimaryKeyProperty],
      type: encrypted.type,
      [entityAttributesProperty]: encrypted[entityAttributesProperty],
    });
    const user = userEvent.setup();

    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(
      '',
    );
    const age = screen.getByRole('spinbutton', { name: 'Age' });
    await user.clear(age);
    await user.type(age, '41');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty].age).toBe(41);
    expect(saved?.[entityAttributesProperty].name).toEqual(storedCiphertext);
  });

  it('keeps answers being entered, and says they were not saved, when the passphrase stops working', async () => {
    const { store, onStepChange, next } = await renderAlterForm('pw');
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Alicia');
    const before = store.getState().session.network;

    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    await next();

    expect(
      await screen.findByText(/Your answers have not been saved/),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Alicia');
    expect(onStepChange).not.toHaveBeenCalled();
    expect(store.getState().session.network).toBe(before);
  });
});

describe('AlterForm while a passphrase that cannot read the answers is in force', () => {
  it('keeps answers being entered, saving none, until the passphrase that reads them is back', async () => {
    const { store, onStepChange, next } = await renderAlterForm('pw');
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Alicia');
    const before = store.getState().session.network;

    act(() => {
      store.dispatch(setPassphrase('another passphrase'));
    });
    expect(
      await screen.findByText(/There was a problem decrypting the data/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    await next();
    expect(onStepChange).not.toHaveBeenCalled();
    expect(store.getState().session.network).toBe(before);

    act(() => {
      store.dispatch(setPassphrase('pw'));
    });
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(
      'Alicia',
    );
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    const stored = saved?.[entityAttributesProperty].name;
    const secure = saved?.[entitySecureAttributesMeta]?.name;
    if (!isNumberArray(stored)) throw new Error('Expected a stored ciphertext');
    if (!secure) throw new Error('Expected secure-attribute metadata');
    await expect(
      decryptData({ secureAttributes: secure, data: stored }, 'pw'),
    ).resolves.toBe('Alicia');
  });

  it('says the answers entered were not saved before leaving them behind', async () => {
    const { store, next, back } = await renderAlterForm('pw', true, undefined, [
      await makeEncryptedPerson('n2', 'Bob', 'pw'),
    ]);
    const user = userEvent.setup();

    // Save the first person unchanged, for the second person's questions.
    await screen.findByRole('textbox', { name: 'Name' });
    await next();
    const name = await screen.findByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveValue('Bob'));
    await user.clear(name);
    await user.type(name, 'Robert');

    act(() => {
      store.dispatch(setPassphrase('another passphrase'));
    });
    await screen.findByText(/There was a problem decrypting the data/);
    await back();

    const warning = await screen.findByRole('dialog', {
      name: 'Discard changes?',
    });
    expect(warning).toHaveTextContent(/Your answers have not been saved/);
    expect(warning).not.toHaveTextContent(/invalid data/);
  });

  it("says the first person's answers were not saved before going back to the introduction", async () => {
    const { store, back } = await renderAlterForm('pw');
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Alicia');
    const before = store.getState().session.network;

    act(() => {
      store.dispatch(setPassphrase('another passphrase'));
    });
    await screen.findByText(/There was a problem decrypting the data/);
    await back();

    const warning = await screen.findByRole('dialog', {
      name: 'Discard changes?',
    });
    expect(warning).toHaveTextContent(/Your answers have not been saved/);
    await user.click(screen.getByRole('button', { name: 'Keep changes' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Discard changes?' }),
      ).toBeNull(),
    );
    expect(screen.queryByText('About each person')).toBeNull();
    expect(store.getState().session.network).toBe(before);
  });
});

describe('AlterForm going back from the first person', () => {
  it('saves the answers entered before showing the introduction again', async () => {
    const { store, back } = await renderAlterForm('pw');
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveValue('Alice'));
    await user.clear(name);
    await user.type(name, 'Alicia');
    await back();

    expect(await screen.findByText('About each person')).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).toBeNull();
    const [saved] = store.getState().session.network.nodes;
    const stored = saved?.[entityAttributesProperty].name;
    const secure = saved?.[entitySecureAttributesMeta]?.name;
    if (!isNumberArray(stored)) throw new Error('Expected a stored ciphertext');
    if (!secure) throw new Error('Expected secure-attribute metadata');
    await expect(
      decryptData({ secureAttributes: secure, data: stored }, 'pw'),
    ).resolves.toBe('Alicia');
  });
});

describe('AlterForm with the encrypted-variables experiment off', () => {
  it('takes and saves plaintext answers without asking for a passphrase', async () => {
    const { store, onStepChange, next } = await renderAlterForm(
      undefined,
      false,
    );
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alice');
    expect(
      screen.queryByText(/Some answers here are protected by your passphrase/),
    ).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    await user.clear(name);
    await user.type(name, 'Alicia');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty].name).toBe('Alicia');
    expect(saved?.[entitySecureAttributesMeta]).toBeUndefined();
  });
});
