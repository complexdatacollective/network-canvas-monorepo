import { describe, expect, it } from 'vitest';

import { deriveAssetDisplayNames, suffixAssetName } from '../assetNames';

const manifest = (...names: [id: string, name: string][]) =>
  Object.fromEntries(names.map(([id, name]) => [id, { name }]));

describe('suffixAssetName', () => {
  it('inserts the counter before the extension', () => {
    expect(suffixAssetName('people.csv', 2)).toBe('people (2).csv');
  });

  it('appends to a name with no extension', () => {
    expect(suffixAssetName('roster', 3)).toBe('roster (3)');
  });

  it('treats a leading dot as part of the name, not an extension', () => {
    expect(suffixAssetName('.hidden', 2)).toBe('.hidden (2)');
  });

  it('uses only the last dot', () => {
    expect(suffixAssetName('data.2024.csv', 2)).toBe('data.2024 (2).csv');
  });
});

describe('deriveAssetDisplayNames', () => {
  it('leaves names that are already unique exactly as stored', () => {
    expect(
      deriveAssetDisplayNames(
        manifest(['a', 'people.csv'], ['b', 'places.csv']),
      ),
    ).toEqual({ a: 'people.csv', b: 'places.csv' });
  });

  it('numbers a collision from the second occurrence', () => {
    expect(
      deriveAssetDisplayNames(
        manifest(['a', 'people.csv'], ['b', 'people.csv']),
      ),
    ).toEqual({ a: 'people.csv', b: 'people (2).csv' });
  });

  it('never takes a name away from the resource that actually stores it', () => {
    // `c` is really called `people (2).csv`, so `b` has to count past it. A
    // derived name evicting a real filename would be the same confusion in a
    // new place — and `c` would be renamed by an import it had nothing to do
    // with.
    expect(
      deriveAssetDisplayNames(
        manifest(
          ['a', 'people.csv'],
          ['b', 'people.csv'],
          ['c', 'people (2).csv'],
        ),
      ),
    ).toEqual({
      a: 'people.csv',
      b: 'people (3).csv',
      c: 'people (2).csv',
    });
  });

  it('numbers three or more of the same name in order', () => {
    expect(
      deriveAssetDisplayNames(
        manifest(['a', 'people.csv'], ['b', 'people.csv'], ['c', 'people.csv']),
      ),
    ).toEqual({
      a: 'people.csv',
      b: 'people (2).csv',
      c: 'people (3).csv',
    });
  });

  it('is stable when a name that collides is added', () => {
    // The property that makes this safe to show: importing another file
    // APPENDS, so no card already on screen is renumbered underneath the
    // researcher. Ordering by asset id would break exactly this.
    const before = deriveAssetDisplayNames(
      manifest(['a', 'people.csv'], ['b', 'people.csv']),
    );
    const after = deriveAssetDisplayNames(
      manifest(['a', 'people.csv'], ['b', 'people.csv'], ['c', 'people.csv']),
    );

    expect(after.a).toBe(before.a);
    expect(after.b).toBe(before.b);
    expect(after.c).toBe('people (3).csv');
  });

  it('assigns names in manifest key order, which is the order cards render in', () => {
    // Pins the ORDER the numbering comes from. `withAssets` maps the manifest
    // object straight into the library's Collection, so key order is the
    // reading order; deriving from anything else (asset id, a sort) would put
    // `people (2).csv` above `people.csv`. Same two entries, opposite key
    // order — the suffix follows the key order, not the id.
    expect(
      deriveAssetDisplayNames(
        manifest(['z-first', 'people.csv'], ['a-second', 'people.csv']),
      ),
    ).toEqual({ 'z-first': 'people.csv', 'a-second': 'people (2).csv' });
  });

  it('returns an empty map for an empty manifest', () => {
    expect(deriveAssetDisplayNames({})).toEqual({});
  });

  it('names an asset whose id is a prototype key like any other', () => {
    // The manifest schema is `z.record(z.string(), …)`, so `__proto__` is a
    // valid asset id, and `JSON.parse` gives a `.netcanvas` that carries one an
    // OWN `__proto__` key. Accumulating into a plain object would drop the
    // assignment on `Object.prototype`'s setter and hand the Resource Library
    // `Object.prototype` as this resource's name.
    const displayNames = deriveAssetDisplayNames(
      JSON.parse(
        '{"__proto__": {"name": "people.csv"}, "b": {"name": "people.csv"}}',
      ) as Record<string, { name: string }>,
    );

    expect(Object.keys(displayNames)).toEqual(['__proto__', 'b']);
    expect(Object.values(displayNames)).toEqual([
      'people.csv',
      'people (2).csv',
    ]);
  });
});
