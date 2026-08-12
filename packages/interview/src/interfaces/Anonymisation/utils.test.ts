import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import type { EntityAttributesProperty, NcNode } from '@codaco/shared-consts';

import { generateSecureAttributes } from './utils';

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
