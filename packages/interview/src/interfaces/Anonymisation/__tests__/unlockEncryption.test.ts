import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  NcNetworkSchema,
  type NcNode,
} from '@codaco/shared-consts';

import type { SessionPayload, SyncHandler } from '../../../contract/types';
import { addNode, updateNode } from '../../../store/modules/session';
import {
  getDecryptionScope,
  readCachedOutcome,
  readEncryptedAttribute,
} from '../decryptionScope';
import { decryptValue } from '../encryptionFormat';
import { installEncryptionKey, unlockEncryption } from '../unlockEncryption';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  outOfBoundsHeader,
} from './encryptionFixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

type Store = ReturnType<typeof createEncryptionStore>;

/** The store an interview resumed from `store`'s session would have. */
function resume(store: Store, onSync?: SyncHandler) {
  const { network } = store.getState().session;
  return createEncryptionStore(network.nodes, undefined, undefined, {
    header: network.encryption,
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
  it('makes the first passphrase entered the interview’s, and accepts only that one afterwards', async () => {
    const store = createEncryptionStore([]);
    expect(store.getState().session.network.encryption).toBeUndefined();

    await expect(unlockEncryption(store, 'first passphrase')).resolves.toBe(
      'chosen',
    );
    const { encryption } = store.getState().session.network;
    expect(encryption).toMatchObject({
      version: 1,
      method: 'AES-256-GCM',
      kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 },
    });
    expect(encryption?.kdf.salt).toHaveLength(16);
    expect(getDecryptionScope(store.getState)).toBeDefined();

    // Resumed with no answers encrypted yet, the check value alone turns a
    // different passphrase away.
    const resumed = resume(store);
    expect(resumed.getState().session.network.nodes).toEqual([]);
    await expect(unlockEncryption(resumed, 'second passphrase')).resolves.toBe(
      'incorrect',
    );
    expect(getDecryptionScope(resumed.getState)).toBeUndefined();
    expect(resumed.getState().ui.encryptionKeyId).toBeNull();
    expect(resumed.getState().session.network.encryption).toEqual(encryption);

    await expect(unlockEncryption(resumed, 'first passphrase')).resolves.toBe(
      'verified',
    );
    expect(getDecryptionScope(resumed.getState)).toBeDefined();
  });

  it('never creates a second header when two passphrases are entered at once', async () => {
    const store = createEncryptionStore([]);

    const [first, second] = await Promise.all([
      unlockEncryption(store, 'first passphrase'),
      unlockEncryption(store, 'second passphrase'),
    ]);

    expect(first).toBe('chosen');
    // The second is checked against the header the first created.
    expect(second).toBe('incorrect');
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
    const synced: SessionPayload[] = [];
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
    expect(Object.keys(persisted?.network.encryption ?? {}).sort()).toEqual([
      'check',
      'kdf',
      'method',
      'version',
    ]);

    // What was persisted parses as a network, header included, so a host
    // validating it keeps it.
    const parsed = NcNetworkSchema.parse(persisted?.network);
    expect(parsed.encryption).toEqual(persisted?.network.encryption);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]?.[entitySecureAttributesMeta]).toEqual(
      storedAlice?.[entitySecureAttributesMeta],
    );
  });

  it('discards what the previous key decrypted when another is put in force', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { header, key } = await encryptionFor('pw');
    const store = createEncryptionStore([person], undefined, undefined, {
      header,
    });

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
  it('loads, reads its old answers as unreadable, and writes new answers in the current format once a passphrase is chosen', async () => {
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

    await expect(unlockEncryption(store, 'new passphrase')).resolves.toBe(
      'chosen',
    );
    expect(store.getState().session.network.encryption).toBeDefined();

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

describe('an interview whose encryption header is out of bounds', () => {
  it('turns every passphrase away as unavailable, without deriving a key, counting a rejection or replacing the header', async () => {
    const header = outOfBoundsHeader((await encryptionFor('pw')).header);
    const store = createEncryptionStore([], undefined, undefined, { header });
    const importKey = vi.spyOn(crypto.subtle, 'importKey');
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');
    const dispatch = vi.spyOn(store, 'dispatch');

    await expect(unlockEncryption(store, 'pw')).resolves.toBe('unavailable');
    await expect(unlockEncryption(store, 'another')).resolves.toBe(
      'unavailable',
    );

    expect(importKey).not.toHaveBeenCalled();
    expect(deriveKey).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(store.getState().session.network.encryption).toEqual(header);
    expect(store.getState().ui.encryptionKeyId).toBeNull();
    expect(getDecryptionScope(store.getState)).toBeUndefined();
  });
});
