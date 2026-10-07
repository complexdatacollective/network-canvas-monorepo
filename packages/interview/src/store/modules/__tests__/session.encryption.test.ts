import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import {
  createEncryptionStore,
  encryptedVariables,
  makeEncryptedPerson,
  makePlainPerson,
  NODE_TYPE,
} from '../../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import {
  getDecryptionScope,
  getEncryptedValue,
  isNumberArray,
  readCachedPlaintext,
} from '../../../interfaces/Anonymisation/decryptionScope';
import { decryptData } from '../../../interfaces/Anonymisation/utils';
import { addNode, addNodesAndEdges, updateNode } from '../session';
import { setPassphrase, setPassphraseInvalid } from '../ui';

const mixedPatch = { set: { name: 'Bob', age: 41 }, unset: [] };

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

const passphraseChanges: {
  change: string;
  apply: (store: EncryptionStore) => void;
}[] = [
  {
    change: 'is replaced',
    apply: (store) => {
      store.dispatch(setPassphrase('another passphrase'));
    },
  },
  {
    change: 'is found not to work',
    apply: (store) => {
      store.dispatch(setPassphraseInvalid(true));
    },
  },
];

describe('encrypted writes', () => {
  it('refuses a patch mixing encrypted and plain values when no passphrase is in force, and applies none of it', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    const before = store.getState().session.network;

    const result = await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );

    if (!updateNode.rejected.match(result)) {
      throw new Error('expected the update to be refused');
    }
    expect(result.error.name).toBe('PassphraseRequiredError');
    expect(store.getState().session.network).toBe(before);
  });

  it('refuses an encrypted update while the passphrase in force is known to be invalid', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('pw'));
    store.dispatch(setPassphraseInvalid(true));
    const before = store.getState().session.network;

    const result = await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );

    expect(updateNode.rejected.match(result)).toBe(true);
    expect(store.getState().session.network).toBe(before);
  });

  it('refuses to add an encrypted node while the passphrase in force is known to be invalid', async () => {
    const store = createEncryptionStore([]);
    store.dispatch(setPassphrase('pw'));
    store.dispatch(setPassphraseInvalid(true));

    const result = await store.dispatch(
      addNode({
        type: NODE_TYPE,
        attributeData: { name: 'Bob' },
        useEncryption: true,
        currentStep: 0,
      }),
    );

    expect(addNode.rejected.match(result)).toBe(true);
    expect(store.getState().session.network.nodes).toEqual([]);
  });

  it('applies a mixed patch atomically once a passphrase is in force', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('pw'));

    const result = await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );
    expect(updateNode.fulfilled.match(result)).toBe(true);

    const [updated] = store.getState().session.network.nodes;
    const stored = updated?.[entityAttributesProperty];
    const secure = updated?.[entitySecureAttributesMeta]?.name;
    expect(stored?.age).toBe(41);
    expect(isNumberArray(stored?.name)).toBe(true);
    expect(secure).toBeDefined();
    if (!isNumberArray(stored?.name))
      throw new Error('Expected a stored ciphertext');
    if (!secure) throw new Error('Expected secure-attribute metadata');
    await expect(
      decryptData({ secureAttributes: secure, data: stored.name }, 'pw'),
    ).resolves.toBe('Bob');
  });
});

// Each write is dispatched, and so starts encrypting with the passphrase then
// in force, before the passphrase changes.
describe.each(passphraseChanges)(
  'encrypted writes while their passphrase $change',
  ({ apply }) => {
    it('refuses an update and applies none of it', async () => {
      const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
      const store = createEncryptionStore([node]);
      store.dispatch(setPassphrase('pw'));
      const before = store.getState().session.network;

      const pending = store.dispatch(
        updateNode({
          nodeId: 'n1',
          attributePatch: mixedPatch,
          currentStep: 0,
        }),
      );
      apply(store);
      const result = await pending;

      if (!updateNode.rejected.match(result)) {
        throw new Error('expected the update to be refused');
      }
      expect(result.error.name).toBe('PassphraseRequiredError');
      expect(store.getState().session.network).toBe(before);
    });

    it('refuses to add a node', async () => {
      const store = createEncryptionStore([]);
      store.dispatch(setPassphrase('pw'));
      const before = store.getState().session.network;

      const pending = store.dispatch(
        addNode({
          type: NODE_TYPE,
          attributeData: { name: 'Bob' },
          useEncryption: true,
          currentStep: 0,
        }),
      );
      apply(store);
      const result = await pending;

      if (!addNode.rejected.match(result)) {
        throw new Error('expected the node to be refused');
      }
      expect(result.error.name).toBe('PassphraseRequiredError');
      expect(store.getState().session.network).toBe(before);
    });

    it('refuses to add a batch of nodes, and applies none of it', async () => {
      const store = createEncryptionStore([]);
      store.dispatch(setPassphrase('pw'));
      const before = store.getState().session.network;

      const pending = store.dispatch(
        addNodesAndEdges({
          nodes: [
            {
              type: NODE_TYPE,
              attributeData: { name: 'Bob' },
              modelData: { [entityPrimaryKeyProperty]: 'bob' },
              useEncryption: true,
            },
            {
              type: NODE_TYPE,
              attributeData: { age: 30 },
              modelData: { [entityPrimaryKeyProperty]: 'carol' },
            },
          ],
          edges: [],
          currentStep: 0,
        }),
      );
      apply(store);
      const result = await pending;

      if (!addNodesAndEdges.rejected.match(result)) {
        throw new Error('expected the batch to be refused');
      }
      expect(result.error.name).toBe('PassphraseRequiredError');
      expect(store.getState().session.network).toBe(before);
    });
  },
);

describe('writes with the encrypted-variables experiment off', () => {
  it('stores an answer to a variable marked encrypted as plaintext without a passphrase', async () => {
    const store = createEncryptionStore(
      [makePlainPerson('n1', 'Alice')],
      undefined,
      undefined,
      { encryptionEnabled: false },
    );

    const result = await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );

    expect(updateNode.fulfilled.match(result)).toBe(true);
    const [updated] = store.getState().session.network.nodes;
    expect(updated?.[entityAttributesProperty]).toEqual({
      name: 'Bob',
      age: 41,
    });
    expect(updated?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('does not refuse a write while a passphrase is flagged invalid', async () => {
    const store = createEncryptionStore(
      [makePlainPerson('n1', 'Alice')],
      undefined,
      undefined,
      { encryptionEnabled: false },
    );
    store.dispatch(setPassphrase('pw'));
    store.dispatch(setPassphraseInvalid(true));

    const result = await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );

    expect(updateNode.fulfilled.match(result)).toBe(true);
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty],
    ).toEqual({ name: 'Bob', age: 41 });
  });
});

describe('plaintext of encrypted writes', () => {
  it('is available to the passphrase scope that wrote it without decrypting again', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('pw'));
    const scope = getDecryptionScope(store, 'pw');
    if (!scope) throw new Error('expected a decryption scope');

    await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );

    const [updated] = store.getState().session.network.nodes;
    const written = updated
      ? getEncryptedValue(updated, 'name', encryptedVariables, true)
      : undefined;
    expect(written).toBeDefined();
    if (!written) throw new Error('Expected an encrypted value to be written');
    expect(readCachedPlaintext(scope, written)).toBe('Bob');
  });

  it('is discarded with the passphrase that wrote it', async () => {
    const store = createEncryptionStore([]);
    store.dispatch(setPassphrase('pw'));
    const scope = getDecryptionScope(store, 'pw');
    if (!scope) throw new Error('expected a decryption scope');

    await store.dispatch(
      addNode({
        type: NODE_TYPE,
        attributeData: { name: 'Bob' },
        useEncryption: true,
        currentStep: 0,
      }),
    );
    expect(scope.plaintexts.size).toBe(1);

    store.dispatch(setPassphrase(''));
    expect(scope.plaintexts.size).toBe(0);
    expect(getDecryptionScope(store, 'pw')).toBeUndefined();
  });
});
