import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider, useSelector } from 'react-redux';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { updateNode } from '../../../store/modules/session';
import type { RootState } from '../../../store/store';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import {
  type DecryptOutcome,
  type EncryptedValue,
  getDecryptionScope,
} from '../../Anonymisation/decryptionScope';
import {
  decryptDetails,
  readDecryptedNames,
  storedEncryptedNames,
  useDecryptedNames,
} from '../encryptedNames';
import { encryptedPerson, person } from './fixtures';

const PASSPHRASE = 'correct horse battery staple';

afterEach(() => {
  vi.restoreAllMocks();
});

/** `node`'s stored values, as if written for the person `id` instead. */
const copiedTo = (node: NcNode, id: string): NcNode => ({
  ...node,
  [entityPrimaryKeyProperty]: id,
});

/** `node` with its records replaced by ones schema 8 would have written. */
const asSchema8 = (node: NcNode): NcNode => ({
  ...node,
  [entitySecureAttributesMeta]: { name: { iv: [1, 2, 3], salt: [4, 5, 6] } },
});

async function lockedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor(PASSPHRASE);
  return createEncryptionStore(nodes, undefined, encryptedVariables, {
    header,
  });
}

async function unlockedScope(nodes: NcNode[]) {
  const store = await lockedStore(nodes);
  await unlockWith(store, PASSPHRASE);
  const scope = getDecryptionScope(store.getState);
  if (!scope) throw new Error('expected the key to be in force');
  return scope;
}

describe('storedEncryptedNames', () => {
  test('finds each name stored as ciphertext, and none stored as text or not at all', async () => {
    const bea = await encryptedPerson('bea', 'Bea', PASSPHRASE);
    const names = storedEncryptedNames(
      [bea, person('tom', { name: 'Tom' }), person('unnamed')],
      'name',
      encryptedVariables,
    );

    expect(names).toEqual([
      {
        personId: 'bea',
        stored: {
          status: 'encrypted',
          value: {
            nodeId: 'bea',
            variableId: 'name',
            iv: bea[entitySecureAttributesMeta]?.name?.iv,
            data: bea[entityAttributesProperty].name,
          },
        },
      },
    ]);
  });

  test('finds ciphertext that lost its record under an encrypted variable unreadable, and bytes under any other variable a plain answer', () => {
    const orphan = person('orphan', { name: [1, 2, 3], age: [4, 5, 6] });

    expect(storedEncryptedNames([orphan], 'name', encryptedVariables)).toEqual([
      {
        personId: 'orphan',
        stored: { status: 'unreadable', reason: 'missing-metadata' },
      },
    ]);
    expect(storedEncryptedNames([orphan], 'age', encryptedVariables)).toEqual(
      [],
    );
  });

  test('finds a name schema 8 encrypted unreadable', async () => {
    const legacy = asSchema8(await encryptedPerson('bea', 'Bea', PASSPHRASE));

    expect(storedEncryptedNames([legacy], 'name', encryptedVariables)).toEqual([
      {
        personId: 'bea',
        stored: { status: 'unreadable', reason: 'legacy-format' },
      },
    ]);
  });
});

describe('readDecryptedNames', () => {
  test('reads only the names whose decryption succeeded', async () => {
    const names = storedEncryptedNames(
      [
        await encryptedPerson('bea', 'Bea', PASSPHRASE),
        await encryptedPerson('cal', 'Cal', PASSPHRASE),
        await encryptedPerson('dee', 'Dee', PASSPHRASE),
        person('orphan', { name: [1, 2, 3] }),
      ],
      'name',
      encryptedVariables,
    );
    const outcomes = new Map<string, DecryptOutcome>([
      ['bea', { readable: true, plaintext: 'Bea' }],
      ['cal', { readable: false }],
    ]);
    // An outcome is looked up by the ciphertext, which carries its node id.
    const outcomeOf = (value: EncryptedValue) => outcomes.get(value.nodeId);

    expect(readDecryptedNames(names, outcomeOf)).toEqual(
      new Map([['bea', 'Bea']]),
    );
  });
});

describe('decryptDetails', () => {
  test('decrypts each encrypted value with the key in force, and leaves a value held as text alone', async () => {
    const bea = await encryptedPerson('bea', 'Bea', PASSPHRASE, {
      nickname: 'Bee',
    });
    const scope = await unlockedScope([bea]);

    expect(
      await decryptDetails(
        bea,
        ['name', 'nickname'],
        encryptedVariables,
        scope,
        false,
      ),
    ).toEqual({
      status: 'ready',
      values: new Map([['name', 'Bea']]),
      unavailable: [],
      unreadable: [],
    });
  });

  test('is locked while a value is encrypted and no key is in force', async () => {
    const bea = await encryptedPerson('bea', 'Bea', PASSPHRASE);

    expect(
      await decryptDetails(bea, ['name'], encryptedVariables, undefined, false),
    ).toEqual({ status: 'locked' });
  });

  test('is ready with nothing encrypted, without a key', async () => {
    expect(
      await decryptDetails(
        person('tom', { name: 'Tom' }),
        ['name'],
        encryptedVariables,
        undefined,
        false,
      ),
    ).toEqual({
      status: 'ready',
      values: new Map(),
      unavailable: [],
      unreadable: [],
    });
  });

  test('when no passphrase can ever put a key in force, an encrypted value is unavailable rather than locked', async () => {
    const bea = await encryptedPerson('bea', 'Bea', PASSPHRASE);

    expect(
      await decryptDetails(bea, ['name'], encryptedVariables, undefined, true),
    ).toEqual({
      status: 'ready',
      values: new Map(),
      unavailable: ['name'],
      unreadable: [],
    });
  });

  test('a value encrypted for someone else is unavailable, because the key cannot decrypt it here', async () => {
    const bea = await encryptedPerson('bea', 'Bea', PASSPHRASE);
    const moved = copiedTo(bea, 'cal');
    const scope = await unlockedScope([bea, moved]);

    expect(
      await decryptDetails(moved, ['name'], encryptedVariables, scope, false),
    ).toEqual({
      status: 'ready',
      values: new Map(),
      unavailable: ['name'],
      unreadable: ['decryption-failed'],
    });
  });

  test('a value that can never be read is unavailable without waiting for a key', async () => {
    const legacy = asSchema8(
      await encryptedPerson('bea', 'Bea', PASSPHRASE, {
        nickname: [7, 8, 9],
      }),
    );

    expect(
      await decryptDetails(
        legacy,
        ['name', 'nickname'],
        encryptedVariables,
        undefined,
        false,
      ),
    ).toEqual({
      status: 'ready',
      values: new Map(),
      unavailable: ['name', 'nickname'],
      unreadable: ['legacy-format', 'missing-metadata'],
    });
  });
});

describe('useDecryptedNames', () => {
  type EncryptionStore = Awaited<ReturnType<typeof lockedStore>>;

  const selectNodes = (state: RootState) => state.session.network.nodes;

  function renderNames(store: EncryptionStore) {
    const tracker: Tracker = { track: vi.fn(), captureException: vi.fn() };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AnalyticsContext.Provider value={tracker}>
        <Provider store={store}>{children}</Provider>
      </AnalyticsContext.Provider>
    );
    const rendered = renderHook(
      () =>
        useDecryptedNames({
          nodes: useSelector(selectNodes),
          nameAttribute: 'name',
          variables: encryptedVariables,
        }),
      { wrapper },
    );
    return { ...rendered, tracker };
  }

  // Lets any decryption the hook started settle before asserting that
  // nothing appeared, so a name that would only appear late is not missed.
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

  test('decrypts the names once the key is in force, and shows a name held as text by none', async () => {
    const store = await lockedStore([
      await encryptedPerson('bea', 'Bea', PASSPHRASE),
      await encryptedPerson('cal', 'Cal', PASSPHRASE),
      person('tom', { name: 'Tom' }),
    ]);
    const { result } = renderNames(store);

    await act(() => unlockWith(store, PASSPHRASE));

    await waitFor(() =>
      expect(result.current.names).toEqual(
        new Map([
          ['bea', 'Bea'],
          ['cal', 'Cal'],
        ]),
      ),
    );
  });

  test('decrypts nothing, and asks for nothing, while no key is in force', async () => {
    const store = await lockedStore([
      await encryptedPerson('bea', 'Bea', PASSPHRASE),
    ]);
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
    const { result } = renderNames(store);
    await settle();

    expect(result.current.names).toEqual(new Map());
    expect(decrypt).not.toHaveBeenCalled();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    await expect(
      result.current.decryptAll(store.getState().session.network.nodes),
    ).resolves.toEqual(new Map());
  });

  test('decryptAll decrypts the names among the nodes it is given, not the ones it rendered', async () => {
    const store = await lockedStore([
      await encryptedPerson('bea', 'Bea', PASSPHRASE),
    ]);
    await unlockWith(store, PASSPHRASE);
    const { result } = renderNames(store);

    const latest = [
      await encryptedPerson('cal', 'Cal', PASSPHRASE),
      copiedTo(await encryptedPerson('dee', 'Dee', PASSPHRASE), 'eve'),
      person('tom', { name: 'Tom' }),
    ];

    expect(await result.current.decryptAll(latest)).toEqual(
      new Map([['cal', 'Cal']]),
    );
  });

  test('serves the name the stage has just written from what it wrote, without decrypting it', async () => {
    const store = await lockedStore([
      await encryptedPerson('bea', 'Bea', PASSPHRASE),
    ]);
    await unlockWith(store, PASSPHRASE);
    const { result } = renderNames(store);
    await waitFor(() =>
      expect(result.current.names).toEqual(new Map([['bea', 'Bea']])),
    );

    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
    await act(() =>
      store.dispatch(
        updateNode({
          nodeId: 'bea',
          attributePatch: { set: { name: 'Beatrice' }, unset: [] },
          currentStep: 0,
        }),
      ),
    );

    expect(result.current.names).toEqual(new Map([['bea', 'Beatrice']]));
    expect(
      await result.current.decryptAll(store.getState().session.network.nodes),
    ).toEqual(new Map([['bea', 'Beatrice']]));
    expect(decrypt).not.toHaveBeenCalled();
  });

  test('leaves out a name that can never be read, and reports why', async () => {
    const bea = await encryptedPerson('bea', 'Bea', PASSPHRASE);
    const store = await lockedStore([
      bea,
      copiedTo(bea, 'cal'),
      asSchema8(await encryptedPerson('dee', 'Dee', PASSPHRASE)),
    ]);
    const { result, tracker } = renderNames(store);

    await act(() => unlockWith(store, PASSPHRASE));

    await waitFor(() =>
      expect(tracker.captureException).toHaveBeenCalledWith(expect.any(Error), {
        feature: 'encrypted-attributes',
        reason: 'decryption-failed',
      }),
    );
    expect(tracker.captureException).toHaveBeenCalledWith(expect.any(Error), {
      feature: 'encrypted-attributes',
      reason: 'legacy-format',
    });
    expect(result.current.names).toEqual(new Map([['bea', 'Bea']]));
  });
});
