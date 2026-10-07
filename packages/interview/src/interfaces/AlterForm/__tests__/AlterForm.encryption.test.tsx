import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  alterFormStages,
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
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

async function renderAlterForm({
  person,
  unlocked = false,
}: { person?: NcNode; unlocked?: boolean } = {}) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(
    [person ?? (await makeEncryptedPerson('n1', 'Alice', 'pw'))],
    alterFormStages,
    undefined,
    { header },
  );
  if (unlocked) await unlockWith(store, 'pw');

  // Every time the passphrase is asked for, not only the latest state.
  let prompts = 0;
  store.subscribe(() => {
    if (store.getState().ui.showPassphrasePrompter) prompts += 1;
  });

  const onStepChange = vi.fn();
  let moveForward: (() => Promise<void>) | undefined;

  function Harness() {
    const navigation = useInterviewNavigation(0);
    moveForward = navigation.moveForward;
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

  // Leave the introduction for the first person's questions.
  await next();

  return { store, onStepChange, next, prompts: () => prompts };
}

async function storedName(store: ReturnType<typeof createEncryptionStore>) {
  const [saved] = store.getState().session.network.nodes;
  const stored = saved
    ? readEncryptedAttribute(saved, 'name', encryptedVariables)
    : undefined;
  if (stored?.status !== 'encrypted') {
    throw new Error('Expected the name to be stored encrypted');
  }
  expect(stored.value.nodeId).toBe(saved?.[entityPrimaryKeyProperty]);
  const { key } = await encryptionFor('pw');
  return decryptValue(key, stored.value, stored.value);
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
    const { store, onStepChange, next } = await renderAlterForm({
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alice');
    const age = screen.getByRole('spinbutton', { name: 'Age' });
    await user.clear(age);
    await user.type(age, '41');

    await user.clear(name);
    await user.type(name, 'Alicia');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    await expect(storedName(store)).resolves.toBe('Alicia');
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty].age,
    ).toBe(41);
  });

  it('shows an answer the key cannot read as unanswered, without asking for the passphrase again', async () => {
    // A ciphertext written for another person fails to decrypt for this one.
    const elsewhere = await makeEncryptedPerson('elsewhere', 'Alice', 'pw');
    const { store, onStepChange, next, prompts } = await renderAlterForm({
      person: { ...elsewhere, [entityPrimaryKeyProperty]: 'n1' },
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(40);

    await user.type(name, 'Alicia');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    await expect(storedName(store)).resolves.toBe('Alicia');
    expect(prompts()).toBe(0);
  });
});
