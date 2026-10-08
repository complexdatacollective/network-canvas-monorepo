import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from '../../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import {
  decryptInScope,
  getDecryptionScope,
  readCachedOutcome,
  readEncryptedAttribute,
} from '../../../interfaces/Anonymisation/decryptionScope';
import { decryptValue } from '../../../interfaces/Anonymisation/encryptionFormat';
import { addNode, updateNode } from '../session';

const mixedPatch = { set: { name: 'Bob', age: 41 }, unset: [] };

async function lockedStore(nodes: NcNode[] = []) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore(nodes, undefined, undefined, { header });
}

async function unlockedStore(nodes: NcNode[] = []) {
  const store = await lockedStore(nodes);
  await unlockWith(store, 'pw');
  const scope = getDecryptionScope(store.getState);
  if (!scope) throw new Error('expected a decryption scope');
  return { store, scope };
}

function storedName(node: NcNode | undefined) {
  const stored = node
    ? readEncryptedAttribute(node, 'name', encryptedVariables)
    : undefined;
  if (stored?.status !== 'encrypted') {
    throw new Error('expected an encrypted name');
  }
  return stored.value;
}

describe('encrypted writes', () => {
  it('refuses a patch mixing encrypted and plain values while the interview is locked, and applies none of it', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await lockedStore([node]);
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

  it('refuses to add an encrypted node while the interview is locked', async () => {
    const store = await lockedStore();

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

  it('applies a mixed patch atomically once the interview is unlocked, storing only an IV beside the value', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store, scope } = await unlockedStore([node]);

    const result = await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );
    expect(updateNode.fulfilled.match(result)).toBe(true);

    const [updated] = store.getState().session.network.nodes;
    expect(updated?.[entityAttributesProperty].age).toBe(41);
    const secure = updated?.[entitySecureAttributesMeta]?.name;
    expect(secure && Object.keys(secure)).toEqual(['iv']);
    expect(secure?.iv).toHaveLength(12);

    const value = storedName(updated);
    expect(value.data).toHaveLength(32 + 16);
    await expect(decryptValue(scope.key, value, value)).resolves.toBe('Bob');
  });

  it('binds an added node’s encrypted values to the id it is stored under', async () => {
    const { store, scope } = await unlockedStore();

    await store.dispatch(
      addNode({
        type: NODE_TYPE,
        attributeData: { name: 'Given id' },
        modelData: { [entityPrimaryKeyProperty]: 'chosen-id' },
        useEncryption: true,
        currentStep: 0,
      }),
    );
    await store.dispatch(
      addNode({
        type: NODE_TYPE,
        attributeData: { name: 'Generated id' },
        useEncryption: true,
        currentStep: 0,
      }),
    );

    const [given, generated] = store.getState().session.network.nodes;
    expect(given?.[entityPrimaryKeyProperty]).toBe('chosen-id');

    const givenValue = storedName(given);
    expect(givenValue.nodeId).toBe('chosen-id');
    await expect(decryptValue(scope.key, givenValue, givenValue)).resolves.toBe(
      'Given id',
    );

    const generatedValue = storedName(generated);
    expect(generatedValue.nodeId).toBe(generated?.[entityPrimaryKeyProperty]);
    await expect(
      decryptValue(scope.key, generatedValue, generatedValue),
    ).resolves.toBe('Generated id');
  });
});

describe('plaintext of encrypted writes', () => {
  it('is available to the scope that wrote it without decrypting again', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store, scope } = await unlockedStore([node]);

    await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );

    const [updated] = store.getState().session.network.nodes;
    expect(readCachedOutcome(scope, storedName(updated))).toEqual({
      readable: true,
      plaintext: 'Bob',
    });
  });

  it('is never served for a ciphertext copied to another node or variable', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store, scope } = await unlockedStore([node]);

    await store.dispatch(
      updateNode({ nodeId: 'n1', attributePatch: mixedPatch, currentStep: 0 }),
    );
    const [updated] = store.getState().session.network.nodes;
    const written = storedName(updated);

    const copiedToNode = { ...written, nodeId: 'n2' };
    const copiedToVariable = { ...written, variableId: 'nickname' };
    expect(readCachedOutcome(scope, copiedToNode)).toBeUndefined();
    expect(readCachedOutcome(scope, copiedToVariable)).toBeUndefined();
    await expect(decryptInScope(scope, copiedToNode)).resolves.toEqual({
      readable: false,
    });
    await expect(decryptInScope(scope, copiedToVariable)).resolves.toEqual({
      readable: false,
    });
  });
});
