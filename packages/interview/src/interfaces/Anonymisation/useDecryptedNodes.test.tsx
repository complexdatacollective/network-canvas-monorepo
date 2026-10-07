import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { AnalyticsContext } from '../../analytics/AnalyticsContext';
import type { Tracker } from '../../analytics/tracker';
import { updateNode } from '../../store/modules/session';
import { encryptionUnlocked } from '../../store/modules/ui';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from './__tests__/encryptionFixtures';
import { getDecryptionScope } from './decryptionScope';
import { installEncryptionKey } from './unlockEncryption';
import {
  type DecryptedNodes,
  decryptNodes,
  useDecryptedNodes,
} from './useDecryptedNodes';

const PASSPHRASE = 'test passphrase';

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

afterEach(() => {
  vi.restoreAllMocks();
});

async function lockedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor(PASSPHRASE);
  return createEncryptionStore(nodes, undefined, undefined, { header });
}

function renderDecrypted(store: EncryptionStore, initialNodes: NcNode[]) {
  const seen: DecryptedNodes[] = [];
  const captureException = vi.fn<Tracker['captureException']>();
  const tracker: Tracker = { track: vi.fn(), captureException };
  const rendered = renderHook(
    ({ nodes }) => {
      const result = useDecryptedNodes(nodes);
      seen.push(result);
      return result;
    },
    {
      initialProps: { nodes: initialNodes },
      wrapper: ({ children }: { children: ReactNode }) => (
        <AnalyticsContext.Provider value={tracker}>
          <Provider store={store}>{children}</Provider>
        </AnalyticsContext.Provider>
      ),
    },
  );
  return { ...rendered, seen, captureException };
}

function readyNodes(result: { current: DecryptedNodes }) {
  if (result.current.status !== 'ready') {
    throw new Error(`Expected ready, got ${result.current.status}`);
  }
  return result.current.nodes;
}

function names(results: DecryptedNodes[]) {
  return results.flatMap((result) =>
    result.status === 'ready'
      ? result.nodes.map((node) => node[entityAttributesProperty].name)
      : [],
  );
}

function reportedReasons(captureException: Mock<Tracker['captureException']>) {
  return captureException.mock.calls.map(([, props]) => props);
}

/** Alice's stored name, copied onto another person: bound to Alice, not them. */
async function personWithMovedName(id: string): Promise<NcNode> {
  const alice = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
  return { ...alice, [entityPrimaryKeyProperty]: id };
}

/** A person saved by schema 8's experimental format: a salt beside each IV. */
const legacyPerson: NcNode = {
  [entityPrimaryKeyProperty]: 'legacy-1',
  type: NODE_TYPE,
  [entityAttributesProperty]: { name: [9, 8, 7, 6], age: 40 },
  [entitySecureAttributesMeta]: {
    name: { iv: Array.from({ length: 12 }, () => 1), salt: [2, 3, 4] },
  },
};

describe('useDecryptedNodes', () => {
  it('returns nodes without encrypted values as they are, with no passphrase', () => {
    const nodes: NcNode[] = [
      {
        [entityPrimaryKeyProperty]: 'n1',
        type: 'person',
        [entityAttributesProperty]: { age: 40 },
      },
    ];
    const store = createEncryptionStore(nodes);
    const { result } = renderDecrypted(store, nodes);

    expect(result.current).toEqual({ status: 'ready', nodes });
    expect(readyNodes(result)).toBe(nodes);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('is locked and asks for the passphrase while the key is not in memory', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = await lockedStore([person]);
    const { result } = renderDecrypted(store, [person]);

    expect(result.current).toEqual({ status: 'locked' });
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('decrypts once the passphrase is entered', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = await lockedStore([person]);
    const { result } = renderDecrypted(store, [person]);
    const { key } = await encryptionFor(PASSPHRASE);

    act(() => {
      installEncryptionKey(store, key);
    });
    expect(result.current.status).toBe('pending');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const [decrypted] = readyNodes(result);
    expect(decrypted?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(decrypted?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('shows a value the interview has just saved without decrypting it again', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = await lockedStore([person]);
    await unlockWith(store, PASSPHRASE);
    const { result, rerender } = renderDecrypted(store, [person]);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await store.dispatch(
        updateNode({
          nodeId: 'n1',
          attributePatch: { set: { name: 'Alicia' }, unset: [] },
          currentStep: 0,
        }),
      );
    });
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
    rerender({ nodes: store.getState().session.network.nodes });

    expect(readyNodes(result)[0]?.[entityAttributesProperty].name).toBe(
      'Alicia',
    );
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('keeps the plaintext at once when only other attributes change', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = await lockedStore([person]);
    await unlockWith(store, PASSPHRASE);
    const { result, rerender } = renderDecrypted(store, [person]);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({
      nodes: [
        {
          ...person,
          [entityAttributesProperty]: {
            ...person[entityAttributesProperty],
            age: 41,
          },
        },
      ],
    });

    expect(readyNodes(result)[0]?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 41,
    });
  });

  it('locks again, and stops showing the plaintext, when the key stops being in force', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = await lockedStore([person]);
    await unlockWith(store, PASSPHRASE);
    const { result, seen } = renderDecrypted(store, [person]);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const seenBeforeClearing = seen.length;
    act(() => {
      store.dispatch(encryptionUnlocked('another-scope'));
    });

    expect(result.current).toEqual({ status: 'locked' });
    expect(names(seen.slice(seenBeforeClearing))).not.toContain('Alice');
  });

  it('leaves out, and reports, ciphertext that has no metadata to decrypt it, without asking for the passphrase', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const { [entitySecureAttributesMeta]: _lost, ...withoutMetadata } = person;
    const store = await lockedStore([withoutMetadata]);
    const { result, captureException } = renderDecrypted(store, [
      withoutMetadata,
    ]);

    expect(readyNodes(result)[0]?.[entityAttributesProperty]).toEqual({
      age: 40,
    });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    expect(reportedReasons(captureException)).toEqual([
      { feature: 'encrypted-attributes', reason: 'missing-metadata' },
    ]);
  });

  it('leaves out a schema 8 answer at once, without asking for a passphrase, and reports it once', async () => {
    const store = createEncryptionStore([legacyPerson]);
    const { result, rerender, captureException } = renderDecrypted(store, [
      legacyPerson,
    ]);

    const [node] = readyNodes(result);
    expect(node?.[entityAttributesProperty]).toEqual({ age: 40 });
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    rerender({ nodes: [{ ...legacyPerson }] });
    expect(reportedReasons(captureException)).toEqual([
      { feature: 'encrypted-attributes', reason: 'legacy-format' },
    ]);
    // Only the reason is reported: never the value, its person or question.
    const error = captureException.mock.calls[0]?.[0];
    expect(error?.message).not.toContain('legacy-1');
    expect(error?.message).not.toContain('name');
  });

  it('leaves out an answer the key cannot decrypt, keeps the key, and does not ask again', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const moved = await personWithMovedName('n2');
    const store = await lockedStore([alice, moved]);
    await unlockWith(store, PASSPHRASE);
    const keyId = store.getState().ui.encryptionKeyId;
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');

    const { result, rerender, captureException } = renderDecrypted(store, [
      alice,
      moved,
    ]);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const [first, second] = readyNodes(result);
    expect(first?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(second?.[entityAttributesProperty]).toEqual({ age: 40 });
    expect(store.getState().ui.encryptionKeyId).toBe(keyId);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    await waitFor(() =>
      expect(reportedReasons(captureException)).toEqual([
        { feature: 'encrypted-attributes', reason: 'decryption-failed' },
      ]),
    );

    // The failure is kept like a plaintext: nothing is decrypted again.
    const decryptions = decrypt.mock.calls.length;
    rerender({ nodes: [{ ...alice }, { ...moved }] });
    expect(result.current.status).toBe('ready');
    expect(decrypt).toHaveBeenCalledTimes(decryptions);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe('decryptNodes', () => {
  async function scopeFor(store: EncryptionStore) {
    await unlockWith(store, PASSPHRASE);
    const scope = getDecryptionScope(store.getState);
    if (!scope) throw new Error('Expected a decryption scope');
    return scope;
  }

  it('resolves to the nodes with their values decrypted', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = await lockedStore([person]);

    const [node] = await decryptNodes(
      [person],
      await scopeFor(store),
      () => encryptedVariables,
    );

    expect(node?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('leaves out the values that cannot be read, rather than rejecting', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const moved = await personWithMovedName('n2');
    const store = await lockedStore([alice, moved, legacyPerson]);

    const nodes = await decryptNodes(
      [alice, moved, legacyPerson],
      await scopeFor(store),
      () => encryptedVariables,
    );

    expect(nodes.map((node) => node[entityAttributesProperty])).toEqual([
      { name: 'Alice', age: 40 },
      { age: 40 },
      { age: 40 },
    ]);
  });
});
