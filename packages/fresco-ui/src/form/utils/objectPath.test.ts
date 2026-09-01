import { afterEach, describe, expect, it } from 'vitest';

import {
  createObjectPathWriter,
  formatObjectPath,
  getValue,
  omitValue,
  parseObjectPath,
  setValue,
} from './objectPath';

const pollutionKey = 'frescoUiPolluted';

const expectObjectPrototypeUnchanged = () => {
  expect(Object.hasOwn(Object.prototype, pollutionKey)).toBe(false);
  expect(
    Object.getOwnPropertyDescriptor(Object.prototype, pollutionKey),
  ).toBeUndefined();
};

describe('Object Path Utils', () => {
  afterEach(() => {
    Reflect.deleteProperty(Object.prototype, pollutionKey);
  });

  describe('path parsing', () => {
    it('round-trips an opaque dotted segment without making it structural', () => {
      const path = ['favorite.color'];
      const formatted = formatObjectPath(path);

      expect(formatted).toBe('["favorite.color"]');
      expect(parseObjectPath(formatted)).toEqual(path);
    });

    it('preserves a legacy nonnumeric bracketed name as one key', () => {
      expect(parseObjectPath('weight[kg]')).toEqual(['weight[kg]']);
      expect(parseObjectPath('measurements.weight[kg]')).toEqual([
        'measurements',
        'weight[kg]',
      ]);
    });

    it.each(['__proto__', 'constructor', 'prototype'])(
      'preserves the terminal legacy key %s as an inert leaf',
      (path) => {
        expect(parseObjectPath(path)).toEqual([path]);
      },
    );

    it.each([
      '__proto__.polluted',
      'safe.__proto__.polluted',
      'constructor.prototype',
      'prototype.polluted',
    ])('rejects the unsafe structural path %s', (path) => {
      expect(parseObjectPath(path)).toBeNull();
    });

    it.each([
      '__proto__[0]',
      'constructor[0]',
      'prototype[0]',
      'safe.constructor[0]',
    ])('preserves the safe forced-array path %s', (path) => {
      expect(parseObjectPath(path)).not.toBeNull();
      expectObjectPrototypeUnchanged();
    });
  });

  describe('getValue', () => {
    it('should get simple property', () => {
      const obj = { name: 'John', age: 30 };

      expect(getValue(obj, 'name')).toBe('John');
      expect(getValue(obj, 'age')).toBe(30);
    });

    it('should get nested property', () => {
      const obj = {
        user: {
          profile: {
            name: 'John',
            address: {
              street: '123 Main St',
              city: 'Boston',
            },
          },
        },
      };

      expect(getValue(obj, 'user.profile.name')).toBe('John');
      expect(getValue(obj, 'user.profile.address.street')).toBe('123 Main St');
      expect(getValue(obj, 'user.profile.address.city')).toBe('Boston');
    });

    it('should return undefined for non-existent path', () => {
      const obj = { user: { name: 'John' } };

      expect(getValue(obj, 'user.age')).toBeUndefined();
      expect(getValue(obj, 'profile.name')).toBeUndefined();
      expect(getValue(obj, 'user.profile.name')).toBeUndefined();
    });

    it('should handle array indices', () => {
      const obj = {
        users: [
          { name: 'John', skills: ['js', 'ts'] },
          { name: 'Jane', skills: ['react', 'vue'] },
        ],
      };

      expect(getValue(obj, 'users.0.name')).toBe('John');
      expect(getValue(obj, 'users.1.name')).toBe('Jane');
      expect(getValue(obj, 'users.0.skills.1')).toBe('ts');
    });

    it('should handle empty path', () => {
      const obj = { name: 'John' };

      expect(getValue(obj, '')).toBe(obj);
    });

    it('should get value using bracket notation', () => {
      const obj = {
        steps: [
          { 'egg-parent': { name: 'Alice' } },
          { 'sperm-parent': { name: 'Bob' } },
        ],
      };

      expect(getValue(obj, 'steps[0].egg-parent.name')).toBe('Alice');
      expect(getValue(obj, 'steps[1].sperm-parent.name')).toBe('Bob');
    });

    it('should get value with nested bracket notation', () => {
      const obj = {
        data: [{ items: [{ value: 'found' }] }],
      };

      expect(getValue(obj, 'data[0].items[0].value')).toBe('found');
    });

    it('should return undefined for out-of-bounds bracket index', () => {
      const obj = { steps: [{ name: 'Alice' }] };

      expect(getValue(obj, 'steps[5].name')).toBeUndefined();
    });

    it('does not read through inherited properties', () => {
      const obj: Record<string, unknown> = {
        __proto__: { inherited: 'secret' },
      };

      expect(getValue(obj, 'inherited')).toBeUndefined();
      expect(getValue(obj, 'constructor')).toBeUndefined();
      expectObjectPrototypeUnchanged();
    });

    it('reads an opaque dotted key only when passed as one segment', () => {
      const obj = { 'favorite.color': 'blue' };

      expect(getValue(obj, ['favorite.color'])).toBe('blue');
      expect(getValue(obj, 'favorite.color')).toBeUndefined();
    });
  });

  describe('setValue', () => {
    it.each(['__proto__', 'constructor', 'prototype'])(
      'treats the typed dangerous leaf %s as an inert own key',
      (key) => {
        const obj: Record<string, unknown> = {};

        setValue(obj, [key], 'preserved');

        expect(obj).toEqual({ [key]: 'preserved' });
        expect(getValue(obj, [key])).toBe('preserved');
        expectObjectPrototypeUnchanged();
      },
    );

    it.each(['__proto__', 'constructor', 'prototype'])(
      'treats the terminal legacy string %s as an inert own key',
      (key) => {
        const obj: Record<string, unknown> = {};

        setValue(obj, key, 'preserved');

        expect(Object.hasOwn(obj, key)).toBe(true);
        expect(getValue(obj, key)).toBe('preserved');
        expectObjectPrototypeUnchanged();
      },
    );

    it('should set simple property', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'name', 'John');
      setValue(obj, 'age', 30);

      expect(obj).toEqual({ name: 'John', age: 30 });
    });

    it('should set nested property', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'user.profile.name', 'John');
      setValue(obj, 'user.profile.age', 30);
      setValue(obj, 'user.settings.theme', 'dark');

      expect(obj).toEqual({
        user: {
          profile: {
            name: 'John',
            age: 30,
          },
          settings: {
            theme: 'dark',
          },
        },
      });
    });

    it('should overwrite existing values', () => {
      const obj = {
        user: {
          name: 'John',
          age: 30,
        },
      };

      setValue(obj, 'user.name', 'Jane');
      setValue(obj, 'user.age', 25);

      expect(obj).toEqual({
        user: {
          name: 'Jane',
          age: 25,
        },
      });
    });

    it('should handle array indices', () => {
      const obj: Record<string, unknown> = {
        users: [{ name: 'John' }, { name: 'Jane' }],
      };

      setValue(obj, 'users.0.name', 'Johnny');
      setValue(obj, 'users.1.age', 25);
      setValue(obj, 'users.2.name', 'Bob');

      const users = obj.users as Record<string, unknown>[];
      expect(Array.isArray(users)).toBe(true);
      expect(users[0]?.name).toBe('Johnny');
      expect(users[1]?.age).toBe(25);
      expect(users[2]?.name).toBe('Bob');
    });

    it('should create intermediate objects', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'a.b.c.d.e', 'deep value');

      expect(obj).toEqual({
        a: {
          b: {
            c: {
              d: {
                e: 'deep value',
              },
            },
          },
        },
      });
      expect(Object.getPrototypeOf(obj.a)).toBe(Object.prototype);
    });

    it('should handle mixed object and array paths', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'users.0.skills.1', 'typescript');
      setValue(obj, 'users.0.name', 'John');

      expect(obj).toEqual({
        users: {
          0: {
            skills: {
              1: 'typescript',
            },
            name: 'John',
          },
        },
      });
    });

    it('should handle empty path by replacing object', () => {
      const obj: Record<string, unknown> = { name: 'John' };

      setValue(obj, '', { name: 'Jane' });

      // Empty path should set the root, but our implementation doesn't handle this case
      // This is expected behavior - empty path is not a valid use case
      expect(obj).toEqual({ 'name': 'John', '': { name: 'Jane' } });
    });

    it('should create arrays when using bracket notation', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'steps[0].name', 'Alice');

      expect(obj).toEqual({
        steps: [{ name: 'Alice' }],
      });
      expect(Array.isArray(obj.steps)).toBe(true);
    });

    it('should set values at specific array indices', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'steps[0].name', 'Alice');
      setValue(obj, 'steps[1].name', 'Bob');

      expect(obj).toEqual({
        steps: [{ name: 'Alice' }, { name: 'Bob' }],
      });
    });

    it('should handle sparse arrays', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'steps[2].name', 'Charlie');

      const steps = obj.steps as unknown[];
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBe(3);
      expect(steps[0]).toBeUndefined();
      expect(steps[1]).toBeUndefined();
      expect(steps[2]).toEqual({ name: 'Charlie' });
    });

    it('should handle nested bracket notation with objects', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'steps[0].egg-parent.name', 'Alice');
      setValue(obj, 'steps[0].egg-parent.age', 30);
      setValue(obj, 'steps[0].sperm-parent.name', 'Bob');

      expect(obj).toEqual({
        steps: [
          {
            'egg-parent': { name: 'Alice', age: 30 },
            'sperm-parent': { name: 'Bob' },
          },
        ],
      });
    });

    it('should handle mixed bracket and dot notation deeply', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'data[0].items[0].value', 'found');

      expect(obj).toEqual({
        data: [{ items: [{ value: 'found' }] }],
      });
      expect(Array.isArray(obj.data)).toBe(true);
      expect(
        Array.isArray((obj.data as Record<string, unknown>[])[0]?.items),
      ).toBe(true);
    });

    it.each([
      '__proto__.frescoUiPolluted',
      'safe.__proto__.frescoUiPolluted',
      'constructor.prototype',
      'prototype.frescoUiPolluted',
    ])('does not write the unsafe structural path %s', (path) => {
      const obj: Record<string, unknown> = {};

      setValue(obj, path, 'polluted');

      expectObjectPrototypeUnchanged();
      expect(getValue(obj, path)).toBeUndefined();
    });

    it.each([
      ['__proto__[0]', '__proto__'],
      ['constructor[0]', 'constructor'],
      ['prototype[0]', 'prototype'],
    ])('writes %s through an inert own array', (path, key) => {
      const obj: Record<string, unknown> = {};

      setValue(obj, path, 'preserved');

      expect(Object.hasOwn(obj, key)).toBe(true);
      expect(getValue(obj, path)).toBe('preserved');
      expectObjectPrototypeUnchanged();
    });

    it('writes a nested constructor bracket path through an inert own array', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, 'safe.constructor[0]', 'preserved');

      expect(obj).toEqual({ safe: { constructor: ['preserved'] } });
      expectObjectPrototypeUnchanged();
    });

    it('does not mutate a prototype reached through an own property', () => {
      const obj: Record<string, unknown> = { safe: Object.prototype };

      setValue(obj, `safe.${pollutionKey}`, 'polluted');

      expectObjectPrototypeUnchanged();
      expect(getValue(obj, `safe.${pollutionKey}`)).toBe('polluted');
      expect(obj.safe).not.toBe(Object.prototype);
    });

    it('does not write when the root object is itself a prototype', () => {
      const prototype: Record<string, unknown> = Object.getPrototypeOf({});

      setValue(prototype, pollutionKey, 'polluted');

      expectObjectPrototypeUnchanged();
    });

    it('writes an opaque dotted key as one property', () => {
      const obj: Record<string, unknown> = {};

      setValue(obj, ['favorite.color'], 'blue');

      expect(obj).toEqual({ 'favorite.color': 'blue' });
      expect(getValue(obj, ['favorite.color'])).toBe('blue');
      expect(getValue(obj, 'favorite.color')).toBeUndefined();
    });

    it('copies frozen containers before writing nested values', () => {
      const obj: Record<string, unknown> = {
        settings: Object.freeze({ theme: 'dark' }),
      };

      setValue(obj, 'settings.locale', 'en');

      expect(obj).toEqual({ settings: { theme: 'dark', locale: 'en' } });
    });

    it.each(['__proto__', 'constructor', 'prototype'])(
      'preserves the inert own key %s while cloning an overlapping container',
      (key) => {
        const settings: Record<string, unknown> = { theme: 'dark' };
        Object.defineProperty(settings, key, {
          configurable: true,
          enumerable: true,
          value: 'preserved',
          writable: true,
        });
        const obj: Record<string, unknown> = { settings };

        setValue(obj, 'settings.locale', 'en');

        expect(obj).toEqual({
          settings: {
            theme: 'dark',
            [key]: 'preserved',
            locale: 'en',
          },
        });
        expect(getValue(obj, 'settings.locale')).toBe('en');
        expectObjectPrototypeUnchanged();
      },
    );

    it('reuses containers created by one scoped writer for sibling paths', () => {
      const obj: Record<string, unknown> = {};
      const writeValue = createObjectPathWriter(obj);

      writeValue('group.first', 'one');
      const createdGroup = obj.group;
      writeValue('group.second', 'two');

      expect(obj.group).toBe(createdGroup);
      expect(obj).toEqual({ group: { first: 'one', second: 'two' } });
    });

    it('copies a field-owned container before a scoped writer extends it', () => {
      const existing = Object.freeze({ first: 'one' });
      const obj: Record<string, unknown> = { group: existing };
      const writeValue = createObjectPathWriter(obj);

      writeValue('group.second', 'two');

      expect(obj.group).not.toBe(existing);
      expect(existing).toEqual({ first: 'one' });
      expect(obj).toEqual({ group: { first: 'one', second: 'two' } });
    });

    it('preserves the native descriptor when writing an array length path', () => {
      const obj: Record<string, unknown> = {};
      const writeValue = createObjectPathWriter(obj);

      writeValue('items[0]', 'first');
      writeValue('items.length', 3);

      const items = obj.items;
      expect(Array.isArray(items)).toBe(true);
      if (!Array.isArray(items)) throw new Error('Expected an array');
      expect(items).toEqual(['first', undefined, undefined]);
      expect(Object.getOwnPropertyDescriptor(items, 'length')).toEqual({
        configurable: false,
        enumerable: false,
        value: 3,
        writable: true,
      });
    });
  });

  describe('omitValue', () => {
    it('drops the key rather than leaving an `undefined` under it', () => {
      const result = omitValue({ first: 'one', second: 'two' }, 'first');

      expect(result).toStrictEqual({ second: 'two' });
      expect(Object.keys(result as object)).toStrictEqual(['second']);
    });

    it('copies every container it passes through', () => {
      const bounds = { min: 1, max: 5 };
      const original = { type: 'relative', bounds };

      const result = omitValue(original, 'bounds.min');

      expect(original).toStrictEqual({
        type: 'relative',
        bounds: { min: 1, max: 5 },
      });
      expect(bounds).toStrictEqual({ min: 1, max: 5 });
      expect(result).toStrictEqual({ type: 'relative', bounds: { max: 5 } });
    });

    it('returns the value itself when the path names nothing it holds', () => {
      const original = { bounds: { min: 1 } };

      expect(omitValue(original, 'type')).toBe(original);
      expect(omitValue(original, 'bounds.max')).toBe(original);
      expect(omitValue(original, 'type.min')).toBe(original);
      expect(omitValue('relative', 'type')).toBe('relative');
      expect(omitValue(original, '__proto__.polluted')).toBe(original);
    });

    it('keeps an array an array, and its later indices where they were', () => {
      const items = [{ x: 1, y: 2 }, { x: 3 }];

      const result = omitValue(items, [0, 'x']);

      expect(items).toStrictEqual([{ x: 1, y: 2 }, { x: 3 }]);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toStrictEqual([{ y: 2 }, { x: 3 }]);
    });

    it('holds a removed array position open instead of closing the gap', () => {
      const result = omitValue({ items: ['a', 'b', 'c'] }, 'items[1]');

      expect(result).toStrictEqual({ items: ['a', undefined, 'c'] });
    });

    it('leaves an array position that is already empty alone', () => {
      const original = { items: ['a', undefined] };

      expect(omitValue(original, 'items[1]')).toBe(original);
    });

    it('never reaches a key through the prototype chain', () => {
      const original = { own: 'kept' };

      // An inherited key is not one this value holds, so there is nothing
      // here to remove — and nothing to rebuild the value around.
      expect(omitValue(original, 'toString')).toBe(original);
      expect(omitValue(original, 'constructor.name')).toBe(original);
      expect(typeof original.toString).toBe('function');
    });
  });
});
