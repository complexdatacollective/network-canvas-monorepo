import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import {
  createEncryptionStore,
  makePlainPerson,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { labelStates } from '../../interfaces/Anonymisation/__tests__/labelStates';
import { setPassphrase } from '../../store/modules/ui';
import Pair from '../Pair';

// Holds every decryption under way while set, so a label can be caught
// decrypting.
const decryption = vi.hoisted(() => ({ hold: false }));
vi.mock('../../interfaces/Anonymisation/utils', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../interfaces/Anonymisation/utils')
    >();
  return {
    ...actual,
    decryptData: (...args: Parameters<typeof actual.decryptData>) =>
      decryption.hold
        ? new Promise<string>(() => undefined)
        : actual.decryptData(...args),
  };
});

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
});

afterEach(() => {
  decryption.hold = false;
});

function renderPair(from: NcNode, to: NcNode, passphrase?: string) {
  const store = createEncryptionStore([from, to]);
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  render(
    <InterviewI18nProvider requestedLocale="en">
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <section role="group" aria-labelledby="pair-name">
            <Pair
              fromNode={from}
              toNode={to}
              edgeColor="edge-color-seq-1"
              labelId="pair-name"
            />
          </section>
        </CurrentStepProvider>
      </Provider>
    </InterviewI18nProvider>,
  );
}

describe('Pair naming the two people it asks about', () => {
  it.each(labelStates)(
    'names $state by the label its node shows',
    async ({ shows, passphrase, holdDecryption, makeNode }) => {
      decryption.hold = holdDecryption ?? false;
      renderPair(
        await makeNode('n1'),
        makePlainPerson('n2', 'Bob'),
        passphrase,
      );

      const node = await screen.findByRole('button', { name: shows });
      const shown = node.getAttribute('aria-label');

      expect(shown).toBe(shows);
      expect(
        screen.getByRole('group', { name: `${shown} and Bob` }),
      ).toBeTruthy();
    },
  );
});
