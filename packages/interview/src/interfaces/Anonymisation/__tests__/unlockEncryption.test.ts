import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  NcNetworkSchema,
  type NcNode,
} from '@codaco/shared-consts';

import type { SessionSnapshot, SyncHandler } from '../../../contract/types';
import { addNode, updateNode } from '../../../store/modules/session';
import {
  getDecryptionScope,
  readCachedOutcome,
  readEncryptedAttribute,
} from '../decryptionScope';
import { decryptValue } from '../encryptionFormat';
import { installEncryptionKey, unlockEncryption } from '../unlockEncryption';
import { generateSecureAttributes } from '../utils';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
} from './encryptionFixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

type Store = ReturnType<typeof createEncryptionStore>;

/** The store an interview resumed from `store`'s session would have. */
function resume(store: Store, onSync?: SyncHandler) {
  const { network } = store.getState().session;
  return createEncryptionStore(network.nodes, undefined, undefined, {
    onSync,
  });
}

function addPerson(store: Store, name: string) {
  return store.dispatch(
    addNode({
      type: NODE_TYPE,
      attributeData: { name },
      useEncryption: true,
      currentStep: 0,
    }),
  );
}

/** Every path within `value` at which a CryptoKey is found. */
function cryptoKeysIn(value: unknown, path = '$'): string[] {
  if (value instanceof CryptoKey) return [path];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      cryptoKeysIn(item, `${path}[${index}]`),
    );
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      cryptoKeysIn(item, `${path}.${key}`),
    );
  }
  return [];
}

describe('unlocking an interview', () => {
  it('makes the first passphrase the interview’s, and once an answer is encrypted accepts only that one', async () => {
    const store = createEncryptionStore([]);

    await expect(unlockEncryption(store, 'first passphrase')).resolves.toBe(
      'chosen',
    );
    expect(getDecryptionScope(store.getState)).toBeDefined();
    await addPerson(store, 'Alice');

    const resumed = resume(store);
    await expect(unlockEncryption(resumed, 'second passphrase')).resolves.toBe(
      'incorrect',
    );
    expect(getDecryptionScope(resumed.getState)).toBeUndefined();
    expect(resumed.getState().ui.encryptionKeyId).toBeNull();

    await expect(unlockEncryption(resumed, 'first passphrase')).resolves.toBe(
      'verified',
    );
    expect(getDecryptionScope(resumed.getState)).toBeDefined();
  });

  it('accepts any passphrase while no answer is encrypted, since nothing exists for it to be wrong about', async () => {
    const store = createEncryptionStore([]);
    await expect(unlockEncryption(store, 'first passphrase')).resolves.toBe(
      'chosen',
    );

    // Resumed before any answer was encrypted, nothing was stored that
    // a passphrase could be checked against.
    const resumed = resume(store);
    expect(resumed.getState().session.network.nodes).toEqual([]);
    await expect(unlockEncryption(resumed, 'second passphrase')).resolves.toBe(
      'chosen',
    );
    expect(getDecryptionScope(resumed.getState)).toBeDefined();
  });

  it('turns away a wrong passphrase by trying to decrypt a stored answer', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([alice]);
    const dispatch = vi.spyOn(store, 'dispatch');

    await expect(unlockEncryption(store, 'not pw')).resolves.toBe('incorrect');
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ui/passphraseRejected' }),
    );
    expect(getDecryptionScope(store.getState)).toBeUndefined();

    await expect(unlockEncryption(store, 'pw')).resolves.toBe('verified');
    expect(getDecryptionScope(store.getState)).toBeDefined();
  });

  it('turns away the right passphrase for answers encrypted in another interview', async () => {
    const { key } = await encryptionFor('pw', 'another-session');
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { name: 'Alice' },
        encryptedVariables,
        key,
        'n1',
      );
    const copied: NcNode = {
      [entityPrimaryKeyProperty]: 'n1',
      type: NODE_TYPE,
      [entityAttributesProperty]: encryptedAttributes,
      [entitySecureAttributesMeta]: secureAttributes,
    };
    const store = createEncryptionStore([copied]);

    await expect(unlockEncryption(store, 'pw')).resolves.toBe('incorrect');
    expect(getDecryptionScope(store.getState)).toBeUndefined();
  });

  it('accepts the right passphrase when one stored answer is damaged', async () => {
    const damaged = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const name = damaged[entityAttributesProperty].name;
    if (!Array.isArray(name)) throw new Error('expected a ciphertext');
    const [first = 0, ...rest] = name as number[];
    damaged[entityAttributesProperty].name = [first ^ 1, ...rest];
    const intact = await makeEncryptedPerson('n2', 'Bob', 'pw');
    const store = createEncryptionStore([damaged, intact]);

    await expect(unlockEncryption(store, 'not pw')).resolves.toBe('incorrect');
    await expect(unlockEncryption(store, 'pw')).resolves.toBe('verified');
  });

  it('checks a second passphrase entered at once against the first', async () => {
    const store = createEncryptionStore([]);

    const [first, second, third] = await Promise.all([
      unlockEncryption(store, 'first passphrase'),
      unlockEncryption(store, 'second passphrase'),
      unlockEncryption(store, 'first passphrase'),
    ]);

    expect(first).toBe('chosen');
    // Nothing is stored yet, so each later one is checked against the key
    // already in force.
    expect(second).toBe('incorrect');
    expect(third).toBe('verified');
  });

  it('derives the key once when the passphrase is set, and once when it is entered again', async () => {
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');
    const store = createEncryptionStore([]);

    await unlockEncryption(store, 'passphrase');
    expect(deriveKey).toHaveBeenCalledTimes(1);

    await addPerson(store, 'Alice');
    await addPerson(store, 'Bob');
    const [alice] = store.getState().session.network.nodes;
    await store.dispatch(
      updateNode({
        nodeId: alice?.[entityPrimaryKeyProperty] ?? '',
        attributePatch: { set: { name: 'Alicia' }, unset: [] },
        currentStep: 0,
      }),
    );
    expect(deriveKey).toHaveBeenCalledTimes(1);

    const resumed = resume(store);
    await unlockEncryption(resumed, 'passphrase');
    expect(deriveKey).toHaveBeenCalledTimes(2);
  });

  it('keeps the key out of Redux state and out of the session handed to the host', async () => {
    const synced: SessionSnapshot[] = [];
    const onSync: SyncHandler = (_id, session) => {
      synced.push(session);
      return Promise.resolve();
    };
    const store = createEncryptionStore([], undefined, undefined, { onSync });

    await unlockEncryption(store, 'DO NOT PERSIST');
    await addPerson(store, 'Alice');
    await store.flushSync();

    const state = store.getState();
    expect(cryptoKeysIn(state)).toEqual([]);
    expect(state.ui).toEqual({
      FORM_IS_READY: false,
      encryptionKeyId: expect.any(String),
      showPassphrasePrompter: false,
    });

    expect(synced.length).toBeGreaterThan(0);
    const persisted = synced.at(-1);
    // Alice reached the session, so the checks below look at her stored
    // answer rather than passing on a network with no one in it.
    const storedAlice = persisted?.network.nodes[0];
    expect(persisted?.network.nodes).toHaveLength(1);
    expect(storedAlice?.[entityAttributesProperty].name).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect(
      Object.keys(storedAlice?.[entitySecureAttributesMeta]?.name ?? {}),
    ).toEqual(['iv']);
    expect(cryptoKeysIn(synced)).toEqual([]);
    expect(JSON.stringify(synced)).not.toContain('DO NOT PERSIST');
    expect(JSON.stringify(synced)).not.toContain('Alice');
    // Nothing about the key is stored with the network.
    expect(Object.keys(persisted?.network ?? {}).sort()).toEqual([
      'edges',
      'ego',
      'nodes',
    ]);

    // What was persisted parses as a network, so a host validating it keeps
    // every encrypted answer and its metadata.
    const parsed = NcNetworkSchema.parse(persisted?.network);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]?.[entitySecureAttributesMeta]).toEqual(
      storedAlice?.[entitySecureAttributesMeta],
    );
  });

  it('discards what the previous key decrypted when another is put in force', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { key } = await encryptionFor('pw');
    const store = createEncryptionStore([person]);

    installEncryptionKey(store, key);
    const first = getDecryptionScope(store.getState);
    if (!first) throw new Error('expected a decryption scope');
    await store.dispatch(
      updateNode({
        nodeId: 'n1',
        attributePatch: { set: { name: 'Bob' }, unset: [] },
        currentStep: 0,
      }),
    );
    expect(first.outcomes.size).toBe(1);

    installEncryptionKey(store, key);
    expect(first.outcomes.size).toBe(0);
    expect(getDecryptionScope(store.getState)).not.toBe(first);
  });
});

describe('an interview with answers in the schema 8 format', () => {
  it('loads, reads its old answers as unreadable, accepts any passphrase, and writes new answers in the current format', async () => {
    const legacy: NcNode = {
      [entityPrimaryKeyProperty]: 'legacy-1',
      type: NODE_TYPE,
      [entityAttributesProperty]: { name: [1, 2, 3, 4], age: 40 },
      [entitySecureAttributesMeta]: {
        name: { iv: Array.from({ length: 12 }, () => 7), salt: [1, 2, 3] },
      },
    };
    const store = createEncryptionStore([legacy]);

    expect(readEncryptedAttribute(legacy, 'name', encryptedVariables)).toEqual({
      status: 'unreadable',
      reason: 'legacy-format',
    });

    // The old answer can never be decrypted, so it says nothing about the
    // passphrase: it is not tried, and the passphrase becomes the
    // interview's.
    await expect(unlockEncryption(store, 'new passphrase')).resolves.toBe(
      'chosen',
    );

    const result = await addPerson(store, 'Carol');
    expect(addNode.fulfilled.match(result)).toBe(true);
    const added = store
      .getState()
      .session.network.nodes.find(
        (node) => node[entityPrimaryKeyProperty] !== 'legacy-1',
      );
    const secure = added?.[entitySecureAttributesMeta]?.name;
    expect(secure && Object.keys(secure)).toEqual(['iv']);

    const scope = getDecryptionScope(store.getState);
    const stored = added
      ? readEncryptedAttribute(added, 'name', encryptedVariables)
      : undefined;
    if (!scope || stored?.status !== 'encrypted') {
      throw new Error('expected the new answer to be encrypted');
    }
    expect(readCachedOutcome(scope, stored.value)).toEqual({
      readable: true,
      plaintext: 'Carol',
    });
    await expect(
      decryptValue(scope.key, stored.value, stored.value),
    ).resolves.toBe('Carol');

    // The old answer is left as it was.
    expect(store.getState().session.network.nodes[0]).toEqual(legacy);
  });
});
