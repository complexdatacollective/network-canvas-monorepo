import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { addNode } from '../../../store/modules/session';
import { unlockEncryption } from '../unlockEncryption';
import { useProtectedFormValues } from '../useProtectedFormValues';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from './encryptionFixtures';

const fields = [{ variable: 'name' }, { variable: 'age' }];

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

async function lockedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore(nodes, undefined, undefined, { header });
}

function renderValuesFor(store: EncryptionStore, entity: NcNode) {
  const captureException = vi.fn<Tracker['captureException']>();
  const tracker: Tracker = { track: vi.fn(), captureException };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnalyticsContext.Provider value={tracker}>
      <Provider store={store}>{children}</Provider>
    </AnalyticsContext.Provider>
  );
  const rendered = renderHook(
    ({ entity: current }: { entity: NcNode }) =>
      useProtectedFormValues(current, fields, encryptedVariables),
    { wrapper, initialProps: { entity } },
  );
  return { ...rendered, captureException };
}

async function renderValues() {
  const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
  const store = await lockedStore([person]);
  await unlockWith(store, 'pw');
  const rendered = renderValuesFor(store, person);
  await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
  return { ...rendered, person, store };
}

function readyValues(result: {
  current: ReturnType<typeof useProtectedFormValues>;
}) {
  const current = result.current;
  if (current.status !== 'ready') {
    throw new Error(`Expected ready values, got ${current.status}`);
  }
  return current.values;
}

describe('useProtectedFormValues', () => {
  it('hands a form the same values object while the answers are unchanged', async () => {
    const { result, rerender, person, store } = await renderValues();
    const opened = readyValues(result);
    expect(opened).toEqual({ name: 'Alice', age: 40 });

    rerender({ entity: person });
    expect(readyValues(result)).toBe(opened);

    await act(async () => {
      await store.dispatch(
        addNode({
          type: NODE_TYPE,
          attributeData: { age: 30 },
          useEncryption: true,
          currentStep: 0,
        }),
      );
    });
    rerender({ entity: person });
    expect(readyValues(result)).toBe(opened);
  });

  it('hands a form new values when an answer changes', async () => {
    const { result, rerender, person } = await renderValues();
    const opened = readyValues(result);

    rerender({
      entity: {
        ...person,
        [entityAttributesProperty]: {
          ...person[entityAttributesProperty],
          age: 41,
        },
      },
    });

    const changed = readyValues(result);
    expect(changed).not.toBe(opened);
    expect(changed).toEqual({ name: 'Alice', age: 41 });
  });

  it('is locked, and asks for the passphrase, while the key is not in memory', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await lockedStore([person]);

    const { result } = renderValuesFor(store, person);

    expect(result.current).toEqual({ status: 'locked' });
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('reports an answer the key cannot decrypt as unavailable, without asking for the passphrase again', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    // Alice's stored name, copied onto someone else: it is bound to Alice.
    const moved: NcNode = { ...alice, [entityPrimaryKeyProperty]: 'n2' };
    const store = await lockedStore([alice, moved]);
    await unlockWith(store, 'pw');

    const { result, captureException } = renderValuesFor(store, moved);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current).toEqual({
      status: 'ready',
      values: { age: 40 },
      unavailable: ['name'],
    });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toEqual({
      feature: 'encrypted-attributes',
      reason: 'decryption-failed',
    });
  });

  it('reports a schema 8 answer as unavailable once a new passphrase is chosen', async () => {
    const legacy: NcNode = {
      [entityPrimaryKeyProperty]: 'legacy-1',
      type: NODE_TYPE,
      [entityAttributesProperty]: { name: [9, 8, 7, 6], age: 40 },
      [entitySecureAttributesMeta]: {
        name: { iv: Array.from({ length: 12 }, () => 1), salt: [2, 3, 4] },
      },
    };
    const store = createEncryptionStore([legacy]);
    const { result, captureException } = renderValuesFor(store, legacy);
    // Saving a new answer needs a key, so the form waits for a passphrase.
    expect(result.current).toEqual({ status: 'locked' });

    await act(async () => {
      await unlockEncryption(store, 'a new passphrase');
    });

    expect(result.current).toEqual({
      status: 'ready',
      values: { age: 40 },
      unavailable: ['name'],
    });
    expect(captureException.mock.calls.map(([, props]) => props)).toEqual([
      { feature: 'encrypted-attributes', reason: 'legacy-format' },
    ]);
  });
});
