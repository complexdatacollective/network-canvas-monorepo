import { describe, expect, it } from 'vitest';

import { filterEntityType } from '../filterEntityType';

const variables = [
  { name: 'Age', inUse: true },
  { name: 'Nickname', inUse: false },
  { name: 'Favourite colour', inUse: false },
];

const noFilter = { search: '', unusedOnly: false };

describe('filterEntityType', () => {
  it('keeps the type and all variables when no filter is active', () => {
    const result = filterEntityType(variables, {
      name: 'Person',
      inUse: true,
      ...noFilter,
    });

    expect(result.visible).toBe(true);
    expect(result.variables).toEqual(variables);
  });

  describe('"Show unused only"', () => {
    it('keeps a used type that contains unused variables, showing only the unused ones', () => {
      // Regression test: previously a used node/edge type was hidden entirely
      // under "Show unused only", concealing its unused variables.
      const result = filterEntityType(variables, {
        name: 'Person',
        inUse: true,
        search: '',
        unusedOnly: true,
      });

      expect(result.visible).toBe(true);
      expect(result.variables).toEqual([
        { name: 'Nickname', inUse: false },
        { name: 'Favourite colour', inUse: false },
      ]);
    });

    it('hides a used type whose variables are all used', () => {
      const result = filterEntityType(
        [
          { name: 'Age', inUse: true },
          { name: 'Height', inUse: true },
        ],
        { name: 'Person', inUse: true, search: '', unusedOnly: true },
      );

      expect(result.visible).toBe(false);
      expect(result.variables).toEqual([]);
    });

    it('keeps an unused type even when all of its variables are used', () => {
      const result = filterEntityType([{ name: 'Age', inUse: true }], {
        name: 'Person',
        inUse: false,
        search: '',
        unusedOnly: true,
      });

      expect(result.visible).toBe(true);
      expect(result.variables).toEqual([]);
    });
  });

  describe('search', () => {
    it('keeps a type whose name matches and shows all of its variables', () => {
      const result = filterEntityType(variables, {
        name: 'Person',
        inUse: true,
        search: 'per',
        unusedOnly: false,
      });

      expect(result.visible).toBe(true);
      expect(result.variables).toEqual(variables);
    });

    it('keeps a type when a variable name matches, narrowing to that variable', () => {
      // Regression test: previously a type whose name did not match the search
      // was hidden even when one of its variables matched.
      const result = filterEntityType(variables, {
        name: 'Person',
        inUse: true,
        search: 'nick',
        unusedOnly: false,
      });

      expect(result.visible).toBe(true);
      expect(result.variables).toEqual([{ name: 'Nickname', inUse: false }]);
    });

    it('hides a type when neither it nor its variables match', () => {
      const result = filterEntityType(variables, {
        name: 'Person',
        inUse: true,
        search: 'zzz',
        unusedOnly: false,
      });

      expect(result.visible).toBe(false);
      expect(result.variables).toEqual([]);
    });
  });

  it('combines search and "Show unused only" (unused AND matching name)', () => {
    const result = filterEntityType(variables, {
      name: 'Person',
      inUse: true,
      search: 'colour',
      unusedOnly: true,
    });

    expect(result.visible).toBe(true);
    expect(result.variables).toEqual([
      { name: 'Favourite colour', inUse: false },
    ]);
  });
});
