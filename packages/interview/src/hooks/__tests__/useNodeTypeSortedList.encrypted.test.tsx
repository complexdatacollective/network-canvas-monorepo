import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  getLocaleMetadata,
  type NodeTypeSortRule,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { createInitialNetwork } from '../../contract/network';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  encryptionFor,
  unlockWith,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { generateSecureAttributes } from '../../interfaces/Anonymisation/utils';
import { encryptionUnlocked } from '../../store/modules/ui';
import { store as createStore } from '../../store/store';
import createSorter, {
  processProtocolSortRule,
} from '../../utils/createSorter';
import useNodeTypeSortedList from '../useNodeTypeSortedList';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const NAME = testVariableId('name');
const AGE = testVariableId('age');
const TITLE = testVariableId('title');
const SIZE = testVariableId('size');

// Each type keeps its answer encrypted in a variable of its own.
const variablesOf: Record<string, Record<string, Variable>> = {
  [PERSON]: {
    [NAME]: { name: 'name', type: 'text', component: 'Text', encrypted: true },
    [AGE]: { name: 'age', type: 'number', component: 'Number' },
  },
  [PLACE]: {
    [TITLE]: {
      name: 'title',
      type: 'text',
      component: 'Text',
      encrypted: true,
    },
    [SIZE]: { name: 'size', type: 'number', component: 'Number' },
  },
};
const textOf = { [PERSON]: NAME, [PLACE]: TITLE };
const numberOf = { [PERSON]: AGE, [PLACE]: SIZE };

const createTypedStore = (nodes: NcNode[], protocolLocale = 'en') =>
  createStore(
    {
      session: {
        // The session the encryption fixtures derive their keys for.
        id: 'session-1',
        startTime: '2026-01-01T00:00:00.000Z',
        finishTime: null,
        exportTime: null,
        lastUpdated: '2026-01-01T00:00:00.000Z',
        localeOptions: [getLocaleMetadata('en')],
        network: { ...createInitialNetwork(), nodes },
      },
      protocol: {
        id: 'protocol-1',
        hash: 'hash',
        importedAt: '2026-01-01T00:00:00.000Z',
        name: 'Sorting protocol',
        schemaVersion: 9,
        localization: {
          defaultLocale: protocolLocale,
          locales: [protocolLocale],
        },
        assets: [],
        codebook: {
          node: {
            [PERSON]: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: variablesOf[PERSON],
            },
            [PLACE]: {
              name: 'Place',
              color: 'node-color-seq-2',
              shape: { default: 'square' },
              variables: variablesOf[PLACE],
            },
          },
        },
        stages: [],
      },
    },
    { onSync: () => Promise.resolve() },
  );

type TypedStore = ReturnType<typeof createTypedStore>;

async function encrypted(
  id: string,
  type: typeof PERSON,
  text: string,
): Promise<NcNode> {
  const { key } = await encryptionFor('pw');
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { [textOf[type]]: text },
      variablesOf[type] ?? {},
      key,
      id,
    );
  return {
    [entityPrimaryKeyProperty]: id,
    type,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

const rule = (type: string, property: string): NodeTypeSortRule => ({
  id: testId(`sort ${type} ${property}`),
  type,
  property: asEntityAttributeReference(property),
  direction: 'asc',
});

const byText = [rule(PERSON, NAME), rule(PLACE, TITLE)];
const byTextThenNumber = [
  rule(PERSON, NAME),
  rule(PERSON, AGE),
  rule(PLACE, TITLE),
  rule(PLACE, SIZE),
];

const ids = (nodes: readonly NcNode[]) =>
  nodes.map((node) => node[entityPrimaryKeyProperty]);

// Named out of alphabetical order within each type.
const named = async () => [
  await encrypted('carol', PERSON, 'Carol'),
  await encrypted('park', PLACE, 'Park'),
  await encrypted('alice', PERSON, 'Alice'),
  await encrypted('cafe', PLACE, 'Cafe'),
  await encrypted('bob', PERSON, 'Bob'),
];

/**
 * `nodes`, each type's group numbered so that by number it falls in the
 * reverse of the order its encrypted answers have as stored. Sorted by the
 * answer and then the number, a group can only come out in number order if
 * the answer's rule was left out; the stored ciphertexts all differ, so the
 * number rule would never be reached otherwise. Returns the order by number,
 * places first.
 */
function numberedAgainstStoredText(nodes: NcNode[]) {
  const numbers = new Map<string, number>();
  const byNumber: string[] = [];
  for (const type of [PLACE, PERSON] as const) {
    const group = nodes.filter((node) => node.type === type);
    const stored = ids(
      createSorter<NcNode>(
        [{ property: textOf[type], direction: 'asc' }].map(
          processProtocolSortRule(variablesOf[type] ?? {}),
        ),
      )(group),
    );
    stored.forEach((id, index) => numbers.set(id, stored.length - index));
    byNumber.push(...stored.toReversed());
  }
  return {
    nodes: nodes.map((node) => ({
      ...node,
      [entityAttributesProperty]: {
        ...node[entityAttributesProperty],
        [numberOf[node.type === PLACE ? PLACE : PERSON]]:
          numbers.get(node[entityPrimaryKeyProperty]) ?? 0,
      },
    })),
    byNumber,
  };
}

function renderSorted(
  store: TypedStore,
  nodes: NcNode[],
  rules: NodeTypeSortRule[],
) {
  const seen: string[][] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const rendered = renderHook(
    () => {
      const sorted = useNodeTypeSortedList(
        nodes,
        rules,
        [PLACE, PERSON],
        [PERSON, PLACE],
      );
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

describe('useNodeTypeSortedList with encrypted attributes', () => {
  it('sorts each type by its own decrypted answers while the key is in force', async () => {
    const nodes = await named();
    const store = createTypedStore(nodes);
    await unlockWith(store, 'pw');

    const { result } = renderSorted(store, nodes, byText);

    await waitFor(() =>
      expect(ids(result.current)).toEqual([
        'cafe',
        'park',
        'alice',
        'bob',
        'carol',
      ]),
    );
    for (const node of result.current) expect(nodes).toContain(node);
  });

  it('leaves the rules out while the interview is locked, applying the others, without asking for the passphrase', async () => {
    const { nodes, byNumber } = numberedAgainstStoredText(await named());
    const store = createTypedStore(nodes);

    const { seen } = renderSorted(store, nodes, byTextThenNumber);
    await settle();

    expect(orders(seen)).toEqual(new Set([byNumber.join()]));
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('leaves out only the rule of the type whose answer can never be decrypted', async () => {
    const people = await named();
    const alice = people.find(
      (node) => node[entityPrimaryKeyProperty] === 'alice',
    );
    if (!alice) throw new Error('No alice');
    // Alice's stored name, copied onto someone else: it is bound to Alice, so
    // the key refuses it there.
    const moved: NcNode = { ...alice, [entityPrimaryKeyProperty]: 'dave' };
    const { nodes, byNumber } = numberedAgainstStoredText([...people, moved]);
    const store = createTypedStore(nodes);
    await unlockWith(store, 'pw');

    const { seen } = renderSorted(store, nodes, byTextThenNumber);
    await settle();

    const peopleByNumber = byNumber.filter(
      (id) => id !== 'cafe' && id !== 'park',
    );
    expect(seen.at(-1)).toEqual(['cafe', 'park', ...peopleByNumber]);
    for (const order of seen) {
      expect(order.slice(2)).toEqual(peopleByNumber);
    }
  });

  it('leaves the rules out again once the key stops being in force', async () => {
    const { nodes, byNumber } = numberedAgainstStoredText(await named());
    const store = createTypedStore(nodes);
    await unlockWith(store, 'pw');

    const { result, seen } = renderSorted(store, nodes, byTextThenNumber);
    await waitFor(() =>
      expect(ids(result.current)).toEqual([
        'cafe',
        'park',
        'alice',
        'bob',
        'carol',
      ]),
    );

    const seenBeforeClearing = seen.length;
    act(() => {
      store.dispatch(encryptionUnlocked('another-scope'));
    });
    await settle();

    expect(orders(seen.slice(seenBeforeClearing))).toEqual(
      new Set([byNumber.join()]),
    );
  });
});

describe('useNodeTypeSortedList collation', () => {
  const plain = (id: string, type: string, text: string): NcNode => ({
    [entityPrimaryKeyProperty]: id,
    type,
    [entityAttributesProperty]: {
      [type === PLACE ? TITLE : NAME]: text,
    },
  });
  // Unencrypted answers in variables the codebook marks encrypted are
  // compared as they are stored, so only collation is in question here.
  const nodes = [
    plain('z', PERSON, 'z'),
    plain('ö', PERSON, 'ö'),
    plain('a', PERSON, 'a'),
    plain('zoo', PLACE, 'z'),
    plain('öl', PLACE, 'ö'),
  ];

  const sortedIn = (protocolLocale: string) => {
    const store = createTypedStore(nodes, protocolLocale);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>
        <InterviewI18nProvider>
          <TestProtocolLocalization
            localization={{
              defaultLocale: protocolLocale,
              locales: [protocolLocale],
            }}
          >
            {children}
          </TestProtocolLocalization>
        </InterviewI18nProvider>
      </Provider>
    );
    return ids(
      renderHook(
        () => useNodeTypeSortedList(nodes, byText, undefined, [PERSON, PLACE]),
        { wrapper },
      ).result.current,
    );
  };

  it('alphabetises each type in the language the protocol is read in', () => {
    expect(sortedIn('sv')).toEqual(['a', 'z', 'ö', 'zoo', 'öl']);
    expect(sortedIn('de')).toEqual(['a', 'ö', 'z', 'öl', 'zoo']);
  });
});
