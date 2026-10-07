import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import {
  decryptNodeAttributes,
  generateSecureAttributes,
  hasEncryptedAttributes,
} from './utils';

const PASSPHRASE = 'test passphrase';

const variables: Record<string, Variable> = {
  name: { name: 'name', type: 'text', component: 'Text', encrypted: true },
  age: { name: 'age', type: 'number', component: 'Number' },
};

async function makeNode(): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { name: 'Alice', age: 40 },
      variables,
      PASSPHRASE,
    );
  return {
    [entityPrimaryKeyProperty]: 'n1',
    type: 'person',
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

describe('decryptNodeAttributes', () => {
  it('returns plaintext values without their secure-attribute metadata', async () => {
    const node = await makeNode();
    expect(hasEncryptedAttributes(node, variables, true)).toBe(true);

    const decrypted = await decryptNodeAttributes(
      node,
      variables,
      PASSPHRASE,
      true,
    );

    expect(decrypted[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(decrypted[entitySecureAttributesMeta]).toBeUndefined();
    expect(hasEncryptedAttributes(decrypted, variables, true)).toBe(false);
  });

  it('rejects with the wrong passphrase', async () => {
    const node = await makeNode();
    await expect(
      decryptNodeAttributes(node, variables, 'wrong passphrase', true),
    ).rejects.toThrow();
  });

  it('rejects ciphertext of an encrypted variable that has lost its metadata', async () => {
    const { [entitySecureAttributesMeta]: _metadata, ...node } =
      await makeNode();
    await expect(
      decryptNodeAttributes(node, variables, PASSPHRASE, true),
    ).rejects.toThrow(/Secure attributes missing/);
  });

  it('passes through a plaintext value of an encrypted variable that has no metadata', async () => {
    const node: NcNode = {
      [entityPrimaryKeyProperty]: 'n2',
      type: 'person',
      [entityAttributesProperty]: { name: 'Bob' },
    };
    const decrypted = await decryptNodeAttributes(
      node,
      variables,
      PASSPHRASE,
      true,
    );
    expect(decrypted[entityAttributesProperty]).toEqual({ name: 'Bob' });
  });

  it('decrypts nothing while the experiment is off', async () => {
    const node = await makeNode();
    expect(hasEncryptedAttributes(node, variables, false)).toBe(false);

    const result = await decryptNodeAttributes(
      node,
      variables,
      PASSPHRASE,
      false,
    );

    expect(result).toEqual(node);
  });
});
