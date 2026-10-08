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
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  unlockWith,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { encryptionUnlocked } from '../../store/modules/ui';
import createSorter, {
  processProtocolSortRule,
} from '../../utils/createSorter';
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

/**
 * The order the name rule gives `nodes` when it compares their names as
 * stored, encrypted: the order a sorter that did not leave that rule out
 * would put them in.
 */
const storedNameOrder = (nodes: NcNode[]) =>
  ids(
    createSorter<NcNode>(
      byName.map(processProtocolSortRule(encryptedVariables)),
    )(nodes),
  );

/**
 * `nodes`, aged so that by age they fall in the reverse of their stored name
 * order. Sorted by name and then age, they can then only come out in age
 * order if the name rule was left out: comparing the stored names gives
 * every pair a difference, so the age rule would never be reached.
 */
function agedAgainstStoredNames(nodes: NcNode[]) {
  const order = storedNameOrder(nodes);
  return {
    nodes: nodes.map((node) =>
      withAge(
        node,
        order.length - order.indexOf(node[entityPrimaryKeyProperty]),
      ),
    ),
    byAge: order.toReversed(),
  };
}

// Named out of alphabetical order: by name they are alice, bob, carol.
const named = async () => [
  await makeEncryptedPerson('carol', 'Carol', 'pw'),
  await makeEncryptedPerson('alice', 'Alice', 'pw'),
  await makeEncryptedPerson('bob', 'Bob', 'pw'),
];

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

const orders = (seen: string[][]) => new Set(seen.map((order) => order.join()));

// Lets any decryption the hook started settle before asserting on the order
// it rendered, so an order that would only appear late is not missed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('useSortedNodeList with encrypted attributes', () => {
  it('sorts by the decrypted answers while the key is in force', async () => {
    const nodes = await named();
    const store = await unlockedStore(nodes);

    const { result } = renderSorted(store, nodes, byName);

    await waitFor(() =>
      expect(ids(result.current)).toEqual(['alice', 'bob', 'carol']),
    );
    // The nodes are the stored ones: their plaintext is only compared.
    for (const node of result.current) expect(nodes).toContain(node);
  });

  it('leaves the rule out while the interview is locked, applying the others, without asking for the passphrase', async () => {
    const { nodes, byAge } = agedAgainstStoredNames(await named());
    const store = await lockedStore(nodes);

    const { seen } = renderSorted(store, nodes, byNameThenAge);
    await settle();

    expect(orders(seen)).toEqual(new Set([byAge.join()]));
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('leaves the rule out when one of the answers can never be decrypted', async () => {
    const people = await named();
    const [, alice] = people;
    if (!alice) throw new Error('No alice');
    // Alice's stored name, copied onto someone else: it is bound to Alice, so
    // the key refuses it there.
    const moved: NcNode = { ...alice, [entityPrimaryKeyProperty]: 'dave' };
    const { nodes, byAge } = agedAgainstStoredNames([...people, moved]);
    const store = await unlockedStore(nodes);

    const { seen } = renderSorted(store, nodes, byNameThenAge);
    await settle();

    expect(orders(seen)).toEqual(new Set([byAge.join()]));
  });

  it('leaves the rule out again once the key stops being in force', async () => {
    const { nodes, byAge } = agedAgainstStoredNames(await named());
    const store = await unlockedStore(nodes);

    const { result, seen } = renderSorted(store, nodes, byNameThenAge);
    await waitFor(() =>
      expect(ids(result.current)).toEqual(['alice', 'bob', 'carol']),
    );

    const seenBeforeClearing = seen.length;
    act(() => {
      store.dispatch(encryptionUnlocked('another-scope'));
    });
    await settle();

    expect(orders(seen.slice(seenBeforeClearing))).toEqual(
      new Set([byAge.join()]),
    );
  });
});
