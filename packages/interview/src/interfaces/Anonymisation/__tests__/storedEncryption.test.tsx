import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { readEncryptedAttribute } from '../decryptionScope';
import { useDecryptedNodes } from '../useDecryptedNodes';
import { useProtectedFormValues } from '../useProtectedFormValues';
import {
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from './encryptionFixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

// The variables as a protocol re-imported without its encryption declares
// them: the name the interview stored encrypted is no longer marked.
const unmarkedVariables: Record<string, Variable> = {
  name: { name: 'name', label: 'name', type: 'text', component: 'Text' },
  nickname: {
    name: 'nickname',
    label: 'nickname',
    type: 'text',
    component: 'Text',
  },
  age: { name: 'age', label: 'age', type: 'number', component: 'Number' },
  pets: {
    name: 'pets',
    label: 'pets',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [
      { label: { en: 'Cat' }, value: 1 },
      { label: { en: 'Dog' }, value: 2 },
    ],
  },
};

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

async function unmarkedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore(nodes, undefined, unmarkedVariables, {
    header,
  });
}

function renderInInterview<T>(store: EncryptionStore, hook: () => T) {
  const tracker: Tracker = { track: vi.fn(), captureException: vi.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnalyticsContext.Provider value={tracker}>
      <Provider store={store}>{children}</Provider>
    </AnalyticsContext.Provider>
  );
  return renderHook(hook, { wrapper });
}

const isNumberArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

describe('a value stored encrypted under a variable the codebook does not mark', () => {
  it('is read as ciphertext by its record, and plain bytes without one as an answer', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const node: NcNode = {
      ...alice,
      [entityAttributesProperty]: {
        ...alice[entityAttributesProperty],
        pets: [1, 2],
      },
    };

    expect(readEncryptedAttribute(node, 'name', unmarkedVariables)).toEqual({
      status: 'encrypted',
      value: expect.objectContaining({ nodeId: 'n1', variableId: 'name' }),
    });
    expect(
      readEncryptedAttribute(node, 'pets', unmarkedVariables),
    ).toBeUndefined();
  });

  it('is unreadable when its record is from schema 8', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const legacy: NcNode = {
      ...alice,
      [entitySecureAttributesMeta]: {
        name: { iv: [1, 2, 3], salt: [4, 5, 6] },
      },
    };

    expect(readEncryptedAttribute(legacy, 'name', unmarkedVariables)).toEqual({
      status: 'unreadable',
      reason: 'legacy-format',
    });
  });

  it('finds no record for an attribute named like an Object method', () => {
    const node: NcNode = {
      [entityPrimaryKeyProperty]: 'n1',
      type: NODE_TYPE,
      [entityAttributesProperty]: { constructor: [1, 2] },
      [entitySecureAttributesMeta]: {},
    };

    expect(
      readEncryptedAttribute(node, 'constructor', unmarkedVariables),
    ).toBeUndefined();
  });

  it('keeps a list of people locked until the passphrase is entered, then shows the name', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await unmarkedStore([alice]);
    const nodes = [alice];

    const { result } = renderInInterview(store, () => useDecryptedNodes(nodes));

    expect(result.current).toEqual({ status: 'locked' });
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await unlockWith(store, 'pw');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const ready = result.current;
    if (ready.status !== 'ready') throw new Error('expected ready nodes');
    expect(ready.nodes[0]?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
  });

  it('keeps a form locked until the passphrase is entered, then starts it from the name, never the ciphertext', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await unmarkedStore([alice]);
    const fields = [{ variable: 'name' }, { variable: 'age' }];

    const { result } = renderInInterview(store, () =>
      useProtectedFormValues(alice, fields, unmarkedVariables),
    );

    expect(result.current).toEqual({ status: 'locked' });
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await unlockWith(store, 'pw');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const ready = result.current;
    if (ready.status !== 'ready') throw new Error('expected ready values');
    expect(ready.values).toEqual({ name: 'Alice', age: 40 });
    expect(Object.values(ready.values).some(isNumberArray)).toBe(false);
  });

  it('leaves a form with only plaintext answers ready without a passphrase', async () => {
    const store = await unmarkedStore([]);
    const bob: NcNode = {
      [entityPrimaryKeyProperty]: 'n2',
      type: NODE_TYPE,
      [entityAttributesProperty]: { name: 'Bob', pets: [1] },
    };
    const fields = [{ variable: 'name' }, { variable: 'pets' }];

    const { result } = renderInInterview(store, () =>
      useProtectedFormValues(bob, fields, unmarkedVariables),
    );

    expect(result.current).toEqual({
      status: 'ready',
      values: { name: 'Bob', pets: [1] },
      unavailable: [],
    });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
