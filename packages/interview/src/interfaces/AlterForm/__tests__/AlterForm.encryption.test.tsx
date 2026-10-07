import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase, setPassphraseInvalid } from '../../../store/modules/ui';
import {
  alterFormStages,
  createEncryptionStore,
  makeEncryptedPerson,
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

async function renderAlterForm(passphrase?: string) {
  const store = createEncryptionStore(
    [await makeEncryptedPerson('n1', 'Alice', 'pw')],
    alterFormStages,
  );
  if (passphrase) store.dispatch(setPassphrase(passphrase));

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
      <InterviewI18nProvider requestedLocale="en">
        <CurrentStepProvider currentStep={0} onStepChange={onStepChange}>
          <DialogProvider>
            <Harness />
          </DialogProvider>
        </CurrentStepProvider>
      </InterviewI18nProvider>
    </Provider>,
  );

  const next = () =>
    act(async () => {
      await moveForward?.();
    });

  // Leave the introduction for the first person's questions.
  await next();

  return { store, onStepChange, next };
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
    if (!secure || !isNumberArray(stored)) return;
    await expect(
      decryptData({ secureAttributes: secure, data: stored }, 'pw'),
    ).resolves.toBe('Alicia');
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
