import { describe, expect, it } from 'vitest';

import {
  applyEntityAttributePatch,
  validateAttributePatch,
} from './entityAttributePatch';

describe('validateAttributePatch', () => {
  it('accepts known set and unset keys', () => {
    expect(
      validateAttributePatch(
        { set: { name: 'Ada' }, unset: ['age'] },
        new Set(['name', 'age']),
      ),
    ).toEqual({ success: true });
  });

  it('rejects unknown set and unset keys in deterministic order', () => {
    expect(
      validateAttributePatch(
        { set: { known: true, unknownSet: false }, unset: ['unknownUnset'] },
        new Set(['known']),
      ),
    ).toEqual({
      success: false,
      error: {
        code: 'unknown-keys',
        keys: ['unknownSet', 'unknownUnset'],
      },
    });
  });

  it('rejects overlapping keys', () => {
    expect(
      validateAttributePatch(
        { set: { shared: true }, unset: ['shared'] },
        new Set(['shared']),
      ),
    ).toEqual({
      success: false,
      error: { code: 'overlapping-keys', keys: ['shared'] },
    });
  });
});

describe('applyEntityAttributePatch', () => {
  it('canonicalizes legacy input, sets and unsets values, and updates secure metadata without mutation', () => {
    const attributes = {
      keepFalse: false,
      keepZero: 0,
      keepEmpty: '',
      keepArray: [],
      legacyNull: null,
      legacyUndefined: undefined,
      remove: [1, 2, 3],
    };
    const secureAttributes = {
      remove: { iv: [1], salt: [2] },
      keepFalse: { iv: [3], salt: [4] },
    };

    const result = applyEntityAttributePatch(
      attributes,
      secureAttributes,
      {
        set: { added: 'value', encrypted: [9, 8] },
        unset: ['remove'],
      },
      { encrypted: { iv: [5], salt: [6] } },
    );

    expect(result.attributes).toStrictEqual({
      keepFalse: false,
      keepZero: 0,
      keepEmpty: '',
      keepArray: [],
      added: 'value',
      encrypted: [9, 8],
    });
    expect(Object.hasOwn(result.attributes, 'legacyUndefined')).toBe(false);
    expect(result.secureAttributes).toEqual({
      keepFalse: { iv: [3], salt: [4] },
      encrypted: { iv: [5], salt: [6] },
    });
    expect(attributes).toEqual({
      keepFalse: false,
      keepZero: 0,
      keepEmpty: '',
      keepArray: [],
      legacyNull: null,
      legacyUndefined: undefined,
      remove: [1, 2, 3],
    });
    expect(secureAttributes).toEqual({
      remove: { iv: [1], salt: [2] },
      keepFalse: { iv: [3], salt: [4] },
    });
  });

  it('collapses empty secure metadata to undefined', () => {
    const result = applyEntityAttributePatch(
      { encrypted: [1, 2, 3] },
      { encrypted: { iv: [1], salt: [2] } },
      { set: {}, unset: ['encrypted'] },
    );

    expect(result).toEqual({
      attributes: {},
      secureAttributes: undefined,
    });
  });
});
