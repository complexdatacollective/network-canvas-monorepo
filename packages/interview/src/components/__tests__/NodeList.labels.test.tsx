import { act, fireEvent, render, screen } from '@testing-library/react';
import { motion } from 'motion/react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import type { NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  makeEncryptedPerson,
  makePlainPerson,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import {
  LABEL_PASSPHRASE,
  labelStates,
  liveRegionTexts,
} from '../../interfaces/Anonymisation/__tests__/labelStates';
import { setPassphrase } from '../../store/modules/ui';
import NodeList from '../NodeList';

// While set, every decryption waits for it, so a label can be caught
// decrypting and a decryption can settle after the passphrase is re-entered.
const decryption = vi.hoisted(() => ({
  held: undefined as Promise<void> | undefined,
}));
vi.mock('../../interfaces/Anonymisation/utils', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../interfaces/Anonymisation/utils')
    >();
  return {
    ...actual,
    decryptData: async (...args: Parameters<typeof actual.decryptData>) => {
      await decryption.held;
      return actual.decryptData(...args);
    },
  };
});

const holdForever = () => {
  decryption.held = new Promise<void>(() => undefined);
};

function holdUntilReleased() {
  let release = () => {};
  decryption.held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    decryption.held = undefined;
    release();
  };
}

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
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

afterEach(() => {
  decryption.held = undefined;
});

function renderNodeList(nodes: NcNode[], passphrase?: string) {
  const store = createEncryptionStore(nodes);
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  render(
    <AnimationProvider disableAnimations reducedMotion="always">
      <InterviewI18nProvider requestedLocale="en">
        <Provider store={store}>
          <TestProtocolLocalization>
            <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
              <DndStoreProvider>
                {/* NodeList mounts its items once the variants a stage runs
                  have finished. */}
                <motion.div initial="initial" animate="animate">
                  <NodeList items={nodes} announcedName="People" />
                </motion.div>
              </DndStoreProvider>
            </CurrentStepProvider>
          </TestProtocolLocalization>
        </Provider>
      </InterviewI18nProvider>
    </AnimationProvider>,
  );
  return store;
}

/** The list item the list shows as `label`; the node is the item itself. */
async function findItem(label: string) {
  const item = await screen.findByRole('option', { name: label });
  return { node: item, item };
}

describe('NodeList announcing a keyboard drag', () => {
  it.each(labelStates)(
    'names $state by the label the list shows',
    async ({ shows, passphrase, holdDecryption, makeNode }) => {
      if (holdDecryption) holdForever();
      renderNodeList([await makeNode('n1')], passphrase);

      const { node, item } = await findItem(shows);
      const shown = node.getAttribute('aria-label');
      expect(shown).toBe(shows);
      // The drag source's live region is made by an effect, which a node that
      // renders without waiting for decryption can be found before.
      await act(async () => {});

      act(() => {
        item.focus();
        fireEvent.keyDown(item, { key: 'd', ctrlKey: true });
      });
      expect(liveRegionTexts()).toContain(
        `${shown} grabbed, use arrow keys to navigate to drop targets, press Escape to cancel`,
      );

      act(() => {
        fireEvent.keyDown(item, { key: 'Escape' });
      });
      expect(liveRegionTexts()).toContain(
        `Drop cancelled, ${shown} returned to original position`,
      );
    },
  );
});

describe('NodeList announcing a drag after the passphrase is entered again', () => {
  it('names a decryption that fails under the new entry as the list shows it', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', LABEL_PASSPHRASE);
    const release = holdUntilReleased();
    const store = renderNodeList([node], 'wrong');
    await findItem('🔒');

    // Entered again while the first attempt is under way: the new entry
    // joins that attempt, and must learn that it failed.
    act(() => {
      store.dispatch(setPassphrase('wrong'));
    });
    await act(async () => {});
    release();

    const { item } = await findItem('⚠️');
    await act(async () => {});
    act(() => {
      item.focus();
      fireEvent.keyDown(item, { key: 'd', ctrlKey: true });
    });

    expect(liveRegionTexts()).toContain(
      '⚠️ grabbed, use arrow keys to navigate to drop targets, press Escape to cancel',
    );
  });
});

describe('NodeList typeahead', () => {
  // Zed comes first, so typing moves focus off it only on a match.
  const listWith = async (passphrase?: string) =>
    renderNodeList(
      [
        makePlainPerson('n0', 'Zed'),
        await makeEncryptedPerson('n1', 'Alice', LABEL_PASSPHRASE),
      ],
      passphrase,
    );

  // Typed once the list has caught up with what its nodes show: each node
  // and the list read a decrypted name in the same tick, not the same render.
  const typeInto = async (item: HTMLElement, key: string) => {
    await act(async () => {});
    act(() => {
      item.focus();
      fireEvent.keyDown(item, { key });
    });
  };

  it('finds a person by the decrypted name the list shows', async () => {
    await listWith(LABEL_PASSPHRASE);
    const { item: zed } = await findItem('Zed');
    const { item: alice } = await findItem('Alice');

    await typeInto(zed, 'a');

    expect(alice.getAttribute('data-focused')).toBe('true');
  });

  it('finds a person by a name decrypted after the list was shown', async () => {
    const store = await listWith();
    const { item: zed } = await findItem('Zed');
    await findItem('🔒');

    act(() => {
      store.dispatch(setPassphrase(LABEL_PASSPHRASE));
    });
    const { item: alice } = await findItem('Alice');
    await typeInto(zed, 'a');

    expect(alice.getAttribute('data-focused')).toBe('true');
  });

  it('does not find a person by a name locked again', async () => {
    const store = await listWith(LABEL_PASSPHRASE);
    const { item: zed } = await findItem('Zed');
    await findItem('Alice');

    act(() => {
      store.dispatch(setPassphrase(''));
    });
    const { item: locked } = await findItem('🔒');
    await typeInto(zed, 'a');

    expect(locked.getAttribute('data-focused')).toBeNull();
  });

  it('does not find a locked person by their id', async () => {
    await listWith();
    const { item: zed } = await findItem('Zed');
    const { item: locked } = await findItem('🔒');

    // The locked person's id is n1.
    await typeInto(zed, 'n');

    expect(locked.getAttribute('data-focused')).toBeNull();
  });
});
