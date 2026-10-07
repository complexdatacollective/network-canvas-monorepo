import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { motion } from 'motion/react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  outOfBoundsHeader,
  unlockWith,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { encryptionUnlocked } from '../../store/modules/ui';
import NodeList from '../NodeList';

// The text the list hands the collection to type ahead by, for each node id,
// as the collection last read it.
const typeaheadText = vi.hoisted(() => new Map<string, string>());
vi.mock(
  '@codaco/fresco-ui/collection/components/Collection',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@codaco/fresco-ui/collection/components/Collection')
      >();
    const { createElement, useCallback } = await import('react');
    const { entityPrimaryKeyProperty: idProperty } =
      await import('@codaco/shared-consts');
    function RecordingCollection(
      props: Parameters<typeof actual.Collection<NcNode>>[0],
    ) {
      const { textValueExtractor } = props;
      const recording = useCallback(
        (node: NcNode) => {
          const text = textValueExtractor(node);
          typeaheadText.set(node[idProperty], text);
          return text;
        },
        [textValueExtractor],
      );
      return createElement(actual.Collection<NcNode>, {
        ...props,
        textValueExtractor: recording,
      });
    }
    return { ...actual, Collection: RecordingCollection };
  },
);

// Decryptions of the answers bound to these node ids wait until released, so
// a test can see a label while it is still being decrypted.
const held = vi.hoisted(() => {
  const releases: (() => void)[] = [];
  return { nodeIds: new Set<string>(), releases };
});
vi.mock(
  '../../interfaces/Anonymisation/encryptionFormat',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../interfaces/Anonymisation/encryptionFormat')
      >();
    return {
      ...actual,
      decryptValue: async (
        ...args: Parameters<typeof actual.decryptValue>
      ): Promise<string> => {
        if (held.nodeIds.has(args[2].nodeId)) {
          await new Promise<void>((resolve) => held.releases.push(resolve));
        }
        return actual.decryptValue(...args);
      },
    };
  },
);

beforeEach(() => {
  typeaheadText.clear();
  held.nodeIds.clear();
  held.releases.length = 0;
});

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

// The label a node's option shows, and the text the list types ahead by.
const shownAndTypedAhead = (nodeId: string) => ({
  shown:
    document
      .getElementById(`people-item-${nodeId}`)
      ?.getAttribute('aria-label') ?? null,
  typedAhead: typeaheadText.get(nodeId) ?? null,
});

const both = (label: string) => ({ shown: label, typedAhead: label });

describe('NodeList typeahead text', () => {
  it('is the lock a locked name shows', async () => {
    const nodes = await people();
    renderList(await lockedStore(nodes), nodes);
    await settle();

    expect(shownAndTypedAhead('alice')).toEqual(both('🔒'));
    expect(shownAndTypedAhead('bob')).toEqual(both('🔒'));
  });

  it('is the lock a name shows while it decrypts, then the name', async () => {
    const nodes = await people();
    held.nodeIds.add('bob');
    renderList(await unlockedStore(nodes), nodes);

    await waitFor(() =>
      expect(shownAndTypedAhead('alice')).toEqual(both('Alice')),
    );
    await settle();
    expect(shownAndTypedAhead('bob')).toEqual(both('🔒'));

    act(() => {
      for (const release of held.releases) release();
    });
    await waitFor(() => expect(shownAndTypedAhead('bob')).toEqual(both('Bob')));
    expect(shownAndTypedAhead('alice')).toEqual(both('Alice'));
  });

  it('is "Answer unavailable" for a name the key can never decrypt, as shown', async () => {
    const alice = await makeEncryptedPerson('alice', 'Alice', 'pw');
    const copy: NcNode = { ...alice, [entityPrimaryKeyProperty]: 'copy' };
    const nodes = [await makeEncryptedPerson('bob', 'Bob', 'pw'), copy];
    renderList(await unlockedStore(nodes), nodes);

    await waitFor(() =>
      expect(shownAndTypedAhead('copy')).toEqual(both('Answer unavailable')),
    );
    expect(shownAndTypedAhead('bob')).toEqual(both('Bob'));
  });

  it('is "Answer unavailable" when no key can ever be made, as shown', async () => {
    const nodes = await people();
    const { header } = await encryptionFor('pw');
    const store = createEncryptionStore(nodes, undefined, undefined, {
      header: outOfBoundsHeader(header),
    });
    renderList(store, nodes);
    await settle();

    expect(shownAndTypedAhead('alice')).toEqual(both('Answer unavailable'));
  });

  it('is the decrypted name once the passphrase is entered', async () => {
    const nodes = await people();
    renderList(await unlockedStore(nodes), nodes);

    await waitFor(() =>
      expect(shownAndTypedAhead('alice')).toEqual(both('Alice')),
    );
    expect(shownAndTypedAhead('bob')).toEqual(both('Bob'));
  });

  it("is the type's label that a person with no name shows", async () => {
    const unnamed: NcNode = {
      [entityPrimaryKeyProperty]: 'unnamed',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const nodes = [await makeEncryptedPerson('alice', 'Alice', 'pw'), unnamed];
    renderList(await lockedStore(nodes), nodes);
    await settle();

    expect(shownAndTypedAhead('unnamed')).toEqual(both('Person'));
  });
});
