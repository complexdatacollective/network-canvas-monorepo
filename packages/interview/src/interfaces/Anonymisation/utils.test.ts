import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import type { EntityAttributesProperty, NcNode } from '@codaco/shared-consts';

import { generateSecureAttributes, writesEncryptedValue } from './utils';

describe('generateSecureAttributes', () => {
  it('preserves encrypted __proto__ attributes and their metadata as own properties', async () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );
    const attributes: NcNode[EntityAttributesProperty] = Object.fromEntries([
      ['__proto__', 'secret value'],
    ]);
    const encryptedVariable: Variable = {
      component: 'Text',
      encrypted: true,
      name: '__proto__',
      type: 'text',
    };
    const codebookVariables: Record<string, Variable> = Object.fromEntries([
      ['__proto__', encryptedVariable],
    ]);

    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        attributes,
        codebookVariables,
        'test passphrase',
      );

    expect(secureAttributes).toBeDefined();
    if (!secureAttributes) {
      throw new Error('Expected encrypted attribute metadata');
    }
    expect(Object.hasOwn(secureAttributes, '__proto__')).toBe(true);
    expect(Object.hasOwn(encryptedAttributes, '__proto__')).toBe(true);
    expect(secureAttributes['__proto__']?.iv).toHaveLength(12);
    expect(secureAttributes['__proto__']?.salt).toHaveLength(16);
    expect(encryptedAttributes['__proto__']).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect(Object.getPrototypeOf(secureAttributes)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(encryptedAttributes)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
    ).toEqual(prototypeDescriptor);
  });
});

describe('writesEncryptedValue', () => {
  const variables: Record<string, Variable> = {
    name: { name: 'name', type: 'text', component: 'Text', encrypted: true },
    nickname: { name: 'nickname', type: 'text', component: 'Text' },
  };

  it.each([
    [{ name: 'Alice' }, true],
    [{ nickname: 'Al' }, false],
    [{ name: undefined, nickname: 'Al' }, false],
    [{ unknown: 'value' }, false],
  ])(
    'agrees with generateSecureAttributes for %o',
    async (attributes, expected) => {
      const stored = Object.fromEntries(
        Object.entries(attributes).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      const { secureAttributes } = await generateSecureAttributes(
        stored,
        variables,
        'passphrase',
      );

      expect(writesEncryptedValue(attributes, variables, true)).toBe(expected);
      expect(Object.keys(secureAttributes ?? {}).length > 0).toBe(expected);
    },
  );

  it('encrypts nothing while the experiment is off', () => {
    expect(writesEncryptedValue({ name: 'Alice' }, variables, false)).toBe(
      false,
    );
  });
});
