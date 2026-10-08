import { describe, expect, it } from 'vitest';

import { readOwnProperty, writeOwnProperty } from '../ownProperty';

// `CodebookIdSchema` admits `__proto__` as an attribute id.
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
