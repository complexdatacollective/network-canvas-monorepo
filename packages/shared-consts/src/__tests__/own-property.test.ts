import { describe, expect, it } from 'vitest';

import {
  isRecord,
  readOwnProperty,
  valueAtPath,
  writeOwnProperty,
} from '../own-property.ts';

// A roster column that matches no variable is stored under its heading, which
// may be `__proto__`.
describe('an attribute named __proto__', () => {
  it('is written as the object’s own property, leaving its prototype alone', () => {
    const target: Record<string, string> = {};
    writeOwnProperty(target, '__proto__', 'Ada');

    expect(Object.hasOwn(target, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect(Object.keys(target)).toEqual(['__proto__']);
  });

  it('reads as nothing when the object has no such property of its own', () => {
    expect(readOwnProperty({}, '__proto__')).toBeUndefined();
    expect(readOwnProperty({}, 'constructor')).toBeUndefined();
    expect(
      readOwnProperty(Object.fromEntries([['__proto__', 'Ada']]), '__proto__'),
    ).toBe('Ada');
  });
});

describe('isRecord', () => {
  it('is true of an object with keys, and of nothing else', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('text')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('valueAtPath', () => {
  const protocol = {
    stages: [{ form: { fields: [{ id: 'a' }, { id: 'b' }] } }],
  };

  it('follows keys through objects and indexes through arrays', () => {
    expect(
      valueAtPath(protocol, ['stages', 0, 'form', 'fields', 1, 'id']),
    ).toBe('b');
    expect(valueAtPath(protocol, [])).toBe(protocol);
  });

  it('reads nothing where the path leaves the value', () => {
    expect(valueAtPath(protocol, ['stages', 3, 'form'])).toBeUndefined();
    expect(valueAtPath(protocol, ['stages', 'length'])).toBeUndefined();
    expect(valueAtPath(protocol, ['stages', '0'])).toBeUndefined();
    expect(valueAtPath(protocol, ['missing', 'id'])).toBeUndefined();
    expect(valueAtPath('text', ['length'])).toBeUndefined();
  });

  it('reads only the object’s own properties', () => {
    expect(valueAtPath({}, ['constructor'])).toBeUndefined();
    expect(valueAtPath({ a: {} }, ['a', '__proto__'])).toBeUndefined();
    expect(
      valueAtPath(Object.fromEntries([['__proto__', 'Ada']]), ['__proto__']),
    ).toBe('Ada');
  });
});
