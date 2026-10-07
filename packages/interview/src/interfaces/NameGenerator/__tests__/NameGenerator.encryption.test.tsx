import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase, setPassphraseInvalid } from '../../../store/modules/ui';
import {
  createEncryptionStore,
  encryptedVariables,
  makeEncryptedPerson,
  makePlainPerson,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { getEncryptedValue } from '../../Anonymisation/decryptionScope';
import { decryptData } from '../../Anonymisation/utils';
import NameGenerator from '../NameGenerator';

vi.mock('../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));
vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));

// The list's virtualised rows do not lay out in jsdom; the tap it reports is
// what is under test, so its handler is captured and called directly.
let tapNode: ((node: NcNode) => void) | undefined;
vi.mock('../../../components/NodeList', () => ({
  default: (props: { id?: string; onItemClick?: (node: NcNode) => void }) => {
    if (props.id === 'MAIN_NODE_LIST') tapNode = props.onItemClick;
    return null;
  },
}));

// jsdom has neither observer; the stage's lists and dialogs use them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

async function renderNameGenerator(encryptionEnabled = true) {
  const person = encryptionEnabled
    ? await makeEncryptedPerson('n1', 'Alice', 'pw')
    : makePlainPerson('n1', 'Alice');
  const store = createEncryptionStore([person], undefined, undefined, {
    encryptionEnabled,
  });
  if (encryptionEnabled) store.dispatch(setPassphrase('pw'));

  const [stage] = store.getState().protocol.stages;
  if (stage?.type !== 'NameGenerator') {
    throw new Error('The fixture stage is a name generator');
  }

  render(
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale="en">
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <NameGenerator
            stage={stage}
            getNavigationHelpers={() => ({
              moveForward: vi.fn(),
              moveBackward: vi.fn(),
            })}
          />
        </CurrentStepProvider>
      </InterviewI18nProvider>
    </Provider>,
  );

  return { store, person };
}

describe('NameGenerator asking for encrypted answers', () => {
  it('takes no new answers, and opens no one for editing, while the passphrase does not work', async () => {
    const { store, person } = await renderNameGenerator();

    const add = screen.getByRole('button', { name: 'Add a person' });
    expect(add).toBeEnabled();

    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    expect(add).toBeDisabled();

    expect(tapNode).toBeInstanceOf(Function);
    await act(async () => {
      tapNode?.(person);
      // As long as decrypting the tapped person would take, so a form that
      // was going to open for them has done so.
      const value = getEncryptedValue(person, 'name', encryptedVariables, true);
      if (value) await decryptData(value, 'pw');
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('opens a tapped person on their decrypted answers once the passphrase works', async () => {
    const { person } = await renderNameGenerator();

    act(() => {
      tapNode?.(person);
    });

    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(
      'Alice',
    );
  });
});

describe('NameGenerator with the encrypted-variables experiment off', () => {
  it('takes answers and opens a tapped person without asking for a passphrase', async () => {
    const { store, person } = await renderNameGenerator(false);

    expect(screen.getByRole('button', { name: 'Add a person' })).toBeEnabled();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    act(() => {
      tapNode?.(person);
    });

    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(
      'Alice',
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
