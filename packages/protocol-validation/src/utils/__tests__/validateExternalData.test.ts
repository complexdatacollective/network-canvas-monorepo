import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import type { Network } from '../validateExternalData.ts';
import {
  findCollidingAttributeNames,
  getVariableNamesFromNetwork,
  isUsableExternalAttributeName,
  validateNames,
} from '../validateExternalData.ts';

const cafe = `caf${String.fromCharCode(0xe9)}`;
const cafeDecomposed = `cafe${String.fromCharCode(0x301)}`;

describe('validateExternalData', () => {
  describe('getVariableNamesFromNetwork', () => {
    it('should extract unique attribute names from nodes', () => {
      const network: Network = {
        nodes: [
          { [entityAttributesProperty]: { name: 'Alice', age: '30' } },
          { [entityAttributesProperty]: { name: 'Bob', gender: 'M' } },
        ],
        edges: [],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual(expect.arrayContaining(['name', 'age', 'gender']));
      expect(result.length).toBe(3);
    });

    it('should extract unique attribute names from edges', () => {
      const network: Network = {
        nodes: [],
        edges: [
          { [entityAttributesProperty]: { type: 'friend', since: '2020' } },
          {
            [entityAttributesProperty]: {
              type: 'colleague',
              strength: 'strong',
            },
          },
        ],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual(
        expect.arrayContaining(['type', 'since', 'strength']),
      );
      expect(result.length).toBe(3);
    });

    it('should extract unique attribute names from both nodes and edges', () => {
      const network: Network = {
        nodes: [
          { [entityAttributesProperty]: { name: 'Alice', age: '30' } },
          { [entityAttributesProperty]: { name: 'Bob', location: 'NYC' } },
        ],
        edges: [
          { [entityAttributesProperty]: { type: 'friend', weight: '5' } },
          { [entityAttributesProperty]: { type: 'colleague' } },
        ],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual(
        expect.arrayContaining(['name', 'age', 'location', 'type', 'weight']),
      );
      expect(result.length).toBe(5);
    });

    it('should not duplicate attribute names across items', () => {
      const network: Network = {
        nodes: [
          { [entityAttributesProperty]: { name: 'Alice', age: '30' } },
          { [entityAttributesProperty]: { name: 'Bob', age: '25' } },
          { [entityAttributesProperty]: { name: 'Charlie', age: '35' } },
        ],
        edges: [],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual(expect.arrayContaining(['name', 'age']));
      expect(result.length).toBe(2);
    });

    it('should handle empty nodes array', () => {
      const network: Network = {
        nodes: [],
        edges: [{ [entityAttributesProperty]: { type: 'friend' } }],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual(['type']);
    });

    it('should handle empty edges array', () => {
      const network: Network = {
        nodes: [{ [entityAttributesProperty]: { name: 'Alice' } }],
        edges: [],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual(['name']);
    });

    it('should handle empty network', () => {
      const network: Network = {
        nodes: [],
        edges: [],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual([]);
    });

    it('should handle undefined nodes or edges', () => {
      const network: Network = {
        nodes: undefined as never,
        edges: undefined as never,
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual([]);
    });

    it('should handle items with no attributes', () => {
      const network: Network = {
        nodes: [{ [entityAttributesProperty]: {} }],
        edges: [{ [entityAttributesProperty]: {} }],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual([]);
    });

    it('should handle complex attribute names', () => {
      const network: Network = {
        nodes: [
          {
            [entityAttributesProperty]: {
              'user.name': 'Alice',
              'user_id': '123',
              'data-value': 'test',
              'ns:field': 'value',
            },
          },
        ],
        edges: [],
      };

      const result = getVariableNamesFromNetwork(network);
      expect(result).toEqual(
        expect.arrayContaining([
          'user.name',
          'user_id',
          'data-value',
          'ns:field',
        ]),
      );
      expect(result.length).toBe(4);
    });
  });

  describe('isUsableExternalAttributeName', () => {
    it.each([
      ['a name in any script, with spaces and punctuation', '年龄 (years)'],
      ['a name spelled decomposed', 'Cafe\u0301'],
      ['__proto__', '__proto__'],
    ])('accepts %s', (_description, name) => {
      expect(isUsableExternalAttributeName(name)).toBe(true);
    });

    it.each([
      ['an empty name', ''],
      ['a leading space', ' notes'],
      ['a trailing space', 'notes '],
      ['a trailing no-break space', 'notes\u00A0'],
      ['a tab', 'first\tname'],
      ['a control character', 'no\u0007tes'],
    ])('refuses %s', (_description, name) => {
      expect(isUsableExternalAttributeName(name)).toBe(false);
    });
  });

  describe('findCollidingAttributeNames', () => {
    it('groups a name written composed and decomposed, as written', () => {
      expect(
        findCollidingAttributeNames(['age', cafe, 'name', cafeDecomposed]),
      ).toEqual([[cafe, cafeDecomposed]]);
    });

    it('does not group names that differ only in case', () => {
      expect(findCollidingAttributeNames(['Name', 'name'])).toEqual([]);
    });

    it('does not group a name repeated exactly as written', () => {
      expect(findCollidingAttributeNames([cafe, cafe])).toEqual([]);
    });
  });

  describe('validateNames', () => {
    it('should reject a name written composed and decomposed', () => {
      expect(validateNames([cafe, cafeDecomposed])).toBe(
        `Attribute names that are the same name written in different ways (${JSON.stringify(cafe)} and ${JSON.stringify(cafeDecomposed)}). Rename or remove all but one of each.`,
      );
    });

    it('should allow names that differ only in case', () => {
      expect(validateNames(['Name', 'name'])).toBe(false);
    });

    it('should report unusable and duplicated names together', () => {
      const result = validateNames(['notes ', cafe, cafeDecomposed]);
      expect(result).toContain('Attribute name not allowed ("notes ")');
      expect(result).toContain(
        'Attribute names that are the same name written in different ways',
      );
    });

    it('should return false for valid variable names', () => {
      const validNames = [
        'name',
        'age',
        'location',
        'user_id',
        'data.value',
        'ns:field',
        'item-type',
      ];

      const result = validateNames(validNames);
      expect(result).toBe(false);
    });

    it('should allow spaces inside names', () => {
      expect(validateNames(['first name', 'last name'])).toBe(false);
    });

    it('should allow punctuation and symbols', () => {
      expect(validateNames(['name!', 'age@', 'data#field', 'a/b (c)'])).toBe(
        false,
      );
    });

    it('should return error message for names that start or end with a space', () => {
      const result = validateNames([' first name', 'last name ']);
      expect(result).toBe(
        'Attribute name not allowed (" first name", "last name "). Names must not be empty, start or end with a space, or contain control characters.',
      );
    });

    it('should allow underscores', () => {
      const validNames = ['user_name', 'first_name', 'user_id'];

      const result = validateNames(validNames);
      expect(result).toBe(false);
    });

    it('should allow dots', () => {
      const validNames = ['user.name', 'data.value', 'obj.prop'];

      const result = validateNames(validNames);
      expect(result).toBe(false);
    });

    it('should allow hyphens', () => {
      const validNames = ['user-name', 'data-value', 'item-type'];

      const result = validateNames(validNames);
      expect(result).toBe(false);
    });

    it('should allow colons', () => {
      const validNames = ['ns:field', 'xml:lang', 'prefix:name'];

      const result = validateNames(validNames);
      expect(result).toBe(false);
    });

    it('should allow alphanumeric characters', () => {
      const validNames = ['name1', 'item2', 'field123', 'ABC', 'abc123'];

      const result = validateNames(validNames);
      expect(result).toBe(false);
    });

    it('should return false for empty array', () => {
      const result = validateNames([]);
      expect(result).toBe(false);
    });

    it('should return false when no argument is provided', () => {
      const result = validateNames();
      expect(result).toBe(false);
    });

    it('should identify only invalid names in mixed array', () => {
      const mixedNames = [
        'validName',
        'invalid\tname',
        'anotherValid',
        'bad name ',
      ];

      const result = validateNames(mixedNames);
      expect(result).toContain('Attribute name not allowed');
      expect(result).toContain('"invalid\\tname"');
      expect(result).toContain('"bad name "');
      expect(result).not.toContain('validName');
      expect(result).not.toContain('anotherValid');
    });

    it('should allow letters from any language', () => {
      expect(validateNames(['namé', 'naïve', '名前', 'имя', 'اسم'])).toBe(
        false,
      );
    });

    it.each([
      ['a tab', 'first\tname'],
      ['a line break', 'first\nname'],
      ['a null character', 'name\u0000'],
      ['a C1 control character', 'name\u0085'],
      ['a noncharacter', 'name\uFFFE'],
      ['a lone surrogate', 'name\uD800'],
    ])('should reject a name with %s', (_description, name) => {
      expect(validateNames([name])).toContain('Attribute name not allowed');
    });

    // The interview compares names in NFC, so this heading reaches the
    // variable called `namé`.
    it('should allow a name spelled with a decomposed accent', () => {
      expect(validateNames(['nam\u0065\u0301'])).toBe(false);
    });

    it('should reject empty string', () => {
      const invalidNames = [''];

      const result = validateNames(invalidNames);
      expect(result).toContain('Attribute name not allowed');
    });

    it('should allow complex valid combinations', () => {
      const validNames = [
        'user.first-name',
        'data_value_123',
        'xml:ns:field',
        'item-type.sub_field:name',
      ];

      const result = validateNames(validNames);
      expect(result).toBe(false);
    });
  });
});
