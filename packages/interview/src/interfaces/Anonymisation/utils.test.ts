import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import type { EntityAttributesProperty, NcNode } from '@codaco/shared-consts';

import { testVariableId } from '../../__tests__/testIds';
import { encryptionFor } from './__tests__/encryptionFixtures';
import { generateSecureAttributes, writesEncryptedValue } from './utils';

const SECRET = testVariableId('secret');
const NAME = testVariableId('name');
const NICKNAME = testVariableId('nickname');

describe('generateSecureAttributes', () => {
  // A roster column that names no codebook variable is stored under its own
  // heading, which may be `__proto__`.
  it('keeps a __proto__ attribute beside an encrypted one as an own property', async () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );
    const attributes: NcNode[EntityAttributesProperty] = Object.fromEntries([
      ['__proto__', 'column value'],
      [SECRET, 'secret value'],
    ]);
    const codebookVariables: Record<string, Variable> = {
      [SECRET]: {
        component: 'Text',
        encrypted: true,
        name: 'secret',
        type: 'text',
      },
    };

    const { key } = await encryptionFor('test passphrase');
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(attributes, codebookVariables, key, 'n1');

    expect(secureAttributes).toBeDefined();
    if (!secureAttributes) {
      throw new Error('Expected encrypted attribute metadata');
    }
    expect(Object.keys(secureAttributes)).toEqual([SECRET]);
    expect(secureAttributes[SECRET]?.iv).toHaveLength(12);
    expect(encryptedAttributes[SECRET]).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect(Object.hasOwn(encryptedAttributes, '__proto__')).toBe(true);
    expect(encryptedAttributes['__proto__']).toBe('column value');
    expect(Object.getPrototypeOf(secureAttributes)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(encryptedAttributes)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
    ).toEqual(prototypeDescriptor);
  });
});

describe('writesEncryptedValue', () => {
  const variables: Record<string, Variable> = {
    [NAME]: {
      name: 'name',
      type: 'text',
      component: 'Text',
      encrypted: true,
    },
    [NICKNAME]: {
      name: 'nickname',
      type: 'text',
      component: 'Text',
    },
  };

  it.each([
    [{ [NAME]: 'Alice' }, true],
    [{ [NICKNAME]: 'Al' }, false],
    [{ [NAME]: undefined, [NICKNAME]: 'Al' }, false],
    [{ unknown: 'value' }, false],
  ])(
    'agrees with generateSecureAttributes for %o',
    async (attributes, expected) => {
      const stored = Object.fromEntries(
        Object.entries(attributes).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      const { key } = await encryptionFor('passphrase');
      const { secureAttributes } = await generateSecureAttributes(
        stored,
        variables,
        key,
        'n1',
      );

      expect(writesEncryptedValue(attributes, variables)).toBe(expected);
      expect(Object.keys(secureAttributes ?? {}).length > 0).toBe(expected);
    },
  );
});
