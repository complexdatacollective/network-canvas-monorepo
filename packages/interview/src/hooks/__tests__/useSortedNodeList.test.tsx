import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type SortRule,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import {
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  unlockWith,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { encryptionUnlocked } from '../../store/modules/ui';
import useSortedNodeList from '../useSortedNodeList';

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

const byName: SortRule[] = [
  { property: asEntityAttributeReference('name'), direction: 'asc' },
];
const byNameThenAge: SortRule[] = [
  ...byName,
  { property: asEntityAttributeReference('age'), direction: 'asc' },
];

const ids = (nodes: readonly NcNode[]) =>
  nodes.map((node) => node[entityPrimaryKeyProperty]);

const withAge = (node: NcNode, age: number): NcNode => ({
  ...node,
  [entityAttributesProperty]: { ...node[entityAttributesProperty], age },
});

// Named out of alphabetical order, and aged in yet another: by name they are
// alice, bob, carol; by age bob, carol, alice.
async function people() {
  return [
    withAge(await makeEncryptedPerson('carol', 'Carol', 'pw'), 30),
    withAge(await makeEncryptedPerson('alice', 'Alice', 'pw'), 50),
    withAge(await makeEncryptedPerson('bob', 'Bob', 'pw'), 20),
  ];
}

async function lockedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore(nodes, undefined, undefined, { header });
}

async function unlockedStore(nodes: NcNode[]) {
  const store = await lockedStore(nodes);
  await unlockWith(store, 'pw');
  return store;
}

function renderSorted(
  store: EncryptionStore,
  nodes: NcNode[],
  rules: SortRule[],
) {
  const seen: string[][] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const rendered = renderHook(
    () => {
      const sorted = useSortedNodeList(nodes, rules);
      seen.push(ids(sorted));
      return sorted;
    },
    { wrapper },
  );
  return { ...rendered, seen };
}

// Lets any decryption the hook started settle before asserting on the order
// it rendered, so an order that would only appear late is not missed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('useSortedNodeList with encrypted attributes', () => {
  it('sorts by the decrypted answers while the key is in force', async () => {
    const nodes = await people();
    const store = await unlockedStore(nodes);

    const { result } = renderSorted(store, nodes, byName);

    await waitFor(() =>
      expect(ids(result.current)).toEqual(['alice', 'bob', 'carol']),
    );
    // The nodes are the stored ones: their plaintext is only compared.
    for (const node of result.current) expect(nodes).toContain(node);
  });

  it('keeps the order it was given while the interview is locked, without asking for the passphrase', async () => {
    const nodes = await people();
    const store = await lockedStore(nodes);

    const { seen } = renderSorted(store, nodes, byName);
    await settle();

    expect(new Set(seen.map((order) => order.join()))).toEqual(
      new Set(['carol,alice,bob']),
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('still applies the rules on other attributes while the interview is locked', async () => {
    const nodes = await people();
    const store = await lockedStore(nodes);

    const { result } = renderSorted(store, nodes, byNameThenAge);
    await settle();

    expect(ids(result.current)).toEqual(['bob', 'carol', 'alice']);
  });

  it('keeps the order it was given when one of the answers can never be decrypted', async () => {
    const nodes = await people();
    const [, alice] = nodes;
    if (!alice) throw new Error('No alice');
    // Alice's stored name, copied onto someone else: it is bound to Alice, so
    // the key refuses it there.
    const moved: NcNode = { ...alice, [entityPrimaryKeyProperty]: 'dave' };
    const withUnreadable = [...nodes, moved];
    const store = await unlockedStore(withUnreadable);

    const { seen } = renderSorted(store, withUnreadable, byName);
    await settle();

    expect(new Set(seen.map((order) => order.join()))).toEqual(
      new Set(['carol,alice,bob,dave']),
    );
  });

  it('returns to the order it was given once the key stops being in force', async () => {
    const nodes = await people();
    const store = await unlockedStore(nodes);

    const { result, seen } = renderSorted(store, nodes, byName);
    await waitFor(() =>
      expect(ids(result.current)).toEqual(['alice', 'bob', 'carol']),
    );

    const seenBeforeClearing = seen.length;
    act(() => {
      store.dispatch(encryptionUnlocked('another-scope'));
    });
    await settle();

    expect(
      new Set(seen.slice(seenBeforeClearing).map((order) => order.join())),
    ).toEqual(new Set(['carol,alice,bob']));
  });
});
