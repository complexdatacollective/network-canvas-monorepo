import { describe, expect, it } from 'vitest';

import { resolveAttrNames } from '../attrNames';

describe('resolveAttrNames', () => {
  const key = (
    name: string,
    target: 'graph' | 'node' | 'edge' | 'all' = 'node',
    builtIn = false,
    scopes?: readonly string[],
  ) => ({ name, target, builtIn, ...(scopes ? { scopes } : {}) });
  const namesOf = (keys: ReturnType<typeof key>[]) => {
    const resolved = resolveAttrNames(keys);
    return keys.map((each) => resolved.get(each));
  };

  it('keeps valid names as they are', () => {
    expect(namesOf([key('name'), key('年齢'), key('a.b')])).toEqual([
      'name',
      '年齢',
      'a.b',
    ]);
  });

  it('derives a name for the rest', () => {
    expect(namesOf([key('Full name'), key('年齢 (years)')])).toEqual([
      'Full_name',
      '年齢__years_',
    ]);
  });

  it('tells apart names that derive the same attr.name', () => {
    expect(namesOf([key('a b'), key('a?b'), key('a/b')])).toEqual([
      'a_b',
      'a_b_2',
      'a_b_3',
    ]);
  });

  it('lets a name that is already valid keep it, wherever it comes in the order', () => {
    expect(namesOf([key('a b'), key('a_b')])).toEqual(['a_b_2', 'a_b']);
    expect(namesOf([key('a_b'), key('a b')])).toEqual(['a_b', 'a_b_2']);
  });

  it('does not number a suffix that is another name', () => {
    expect(namesOf([key('a b'), key('a?b'), key('a_b_2')])).toEqual([
      'a_b',
      'a_b_3',
      'a_b_2',
    ]);
  });

  it('shares one attr.name between keys with the very same name that never meet on one element', () => {
    expect(
      namesOf([
        key('Full name', 'node', false, ['node:person']),
        key('Full name', 'node', false, ['node:place']),
        key('a?b', 'node', false, ['node:person']),
      ]),
    ).toEqual(['Full_name', 'Full_name', 'a_b']);
  });

  it('numbers keys with the very same name that can meet on one element', () => {
    expect(
      namesOf([
        key('Full name', 'node', false, ['node:person', 'node:place']),
        key('Full name', 'node', false, ['node:place']),
        key('Full_name', 'node', false, ['node:person']),
        key('Full_name', 'node', false, ['node:person']),
      ]),
    ).toEqual(['Full_name_2', 'Full_name_3', 'Full_name', 'Full_name_4']);
    expect(namesOf([key('Full name'), key('Full name')])).toEqual([
      'Full_name',
      'Full_name_2',
    ]);
  });

  it('lets keys for different elements share a derived name', () => {
    expect(namesOf([key('a b', 'node'), key('a?b', 'edge')])).toEqual([
      'a_b',
      'a_b',
    ]);
    expect(namesOf([key('a b', 'node'), key('a?b', 'graph')])).toEqual([
      'a_b',
      'a_b',
    ]);
  });

  it('keeps a key that is for every element apart from every other, but not nodes from edges', () => {
    expect(
      namesOf([key('a b', 'all'), key('a?b', 'node'), key('a*b', 'edge')]),
    ).toEqual(['a_b', 'a_b_2', 'a_b_2']);
  });

  it("keeps built-in keys' names, and moves a variable that has one", () => {
    const builtIn = key('label', 'all', true);
    const variable = key('label', 'node');
    const other = key('label_2', 'node');

    const resolved = resolveAttrNames([builtIn, variable, other]);

    expect(resolved.get(builtIn)).toBe('label');
    expect(resolved.get(other)).toBe('label_2');
    expect(resolved.get(variable)).toBe('label_3');
  });

  it('does not depend on the order of a built-in key among the others', () => {
    const builtIn = key('label', 'all', true);
    const variable = key('label', 'edge');

    const resolved = resolveAttrNames([variable, builtIn]);

    expect(resolved.get(builtIn)).toBe('label');
    expect(resolved.get(variable)).toBe('label_2');
  });
});
