import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { motion } from 'motion/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  unlockWith,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { encryptionUnlocked } from '../../store/modules/ui';
import NodeList from '../NodeList';

// jsdom has neither observer; the list uses them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

async function lockedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore(nodes, undefined, undefined, { header });
}

async function unlockedStore(nodes: NcNode[]) {
  const store = await lockedStore(nodes);
  await unlockWith(store, 'pw');
  return store;
}

function renderList(store: EncryptionStore, nodes: NcNode[]) {
  render(
    <Provider store={store}>
      <TestProtocolLocalization>
        <InterviewI18nProvider requestedLocale="en">
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            <DndStoreProvider>
              <motion.div initial="initial" animate="animate">
                <NodeList id="people" items={nodes} announcedName="People" />
              </motion.div>
            </DndStoreProvider>
          </CurrentStepProvider>
        </InterviewI18nProvider>
      </TestProtocolLocalization>
    </Provider>,
  );
}

async function findOption(nodeId: string) {
  return waitFor(() => {
    const option = document.getElementById(`people-item-${nodeId}`);
    if (!option) throw new Error(`No option for ${nodeId}`);
    return option;
  });
}

// Focuses the option for `from`, then types `text`, as a participant
// searching the list from the keyboard would.
async function typeFrom(from: string, text: string) {
  const option = await findOption(from);
  act(() => {
    option.focus();
  });
  await userEvent.setup().keyboard(text);
}

const isFocused = async (nodeId: string) =>
  (await findOption(nodeId)).getAttribute('data-focused') === 'true';

// Alice and Bob, under ids starting with their names' first letters.
const people = async () => [
  await makeEncryptedPerson('alice', 'Alice', 'pw'),
  await makeEncryptedPerson('bob', 'Bob', 'pw'),
];

// Lets any decryption the list started settle before typing, so text that
// would only appear late is not missed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('NodeList typeahead with encrypted names', () => {
  it('finds a person by their decrypted name once the passphrase is entered', async () => {
    // Ids that share nothing with the names, so only a name can be found.
    const nodes = [
      await makeEncryptedPerson('person-1', 'Alice', 'pw'),
      await makeEncryptedPerson('person-2', 'Bob', 'pw'),
    ];
    const store = await lockedStore(nodes);
    renderList(store, nodes);
    await findOption('person-2');

    await act(() => unlockWith(store, 'pw'));
    await screen.findByRole('option', { name: 'Bob' });
    await settle();
    await typeFrom('person-1', 'b');

    expect(await isFocused('person-2')).toBe(true);
  });

  it('finds no one by a name, or by anything else, while the interview is locked', async () => {
    const nodes = await people();
    renderList(await lockedStore(nodes), nodes);
    await settle();

    // Bob's id starts with "b" too, so a list searching ids would move.
    await typeFrom('alice', 'b');

    expect(await isFocused('alice')).toBe(true);
    expect(await isFocused('bob')).toBe(false);
  });

  it('finds no one by a name once the key stops being in force', async () => {
    const nodes = await people();
    const store = await unlockedStore(nodes);
    renderList(store, nodes);
    await screen.findByRole('option', { name: 'Bob' });
    await settle();

    act(() => {
      store.dispatch(encryptionUnlocked('another-scope'));
    });
    await settle();
    await typeFrom('alice', 'b');

    expect(await isFocused('alice')).toBe(true);
    expect(await isFocused('bob')).toBe(false);
  });

  it('matches an answer that can never be decrypted by the label it shows, not by the answer', async () => {
    const alice = await makeEncryptedPerson('alice', 'Alice', 'pw');
    // Alice's stored name, copied onto someone else: it is bound to Alice, so
    // the key refuses it there.
    const copy: NcNode = { ...alice, [entityPrimaryKeyProperty]: 'copy' };
    const nodes = [await makeEncryptedPerson('bob', 'Bob', 'pw'), copy];
    renderList(await unlockedStore(nodes), nodes);
    await screen.findByRole('option', { name: 'Answer unavailable' });
    await settle();

    await typeFrom('bob', 'an');

    expect(await isFocused('copy')).toBe(true);
  });
});
