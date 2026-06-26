import { describe, expect, it } from 'vitest';

import createCollectionSorter, {
  type SortFn,
} from '../sorting/createCollectionSorter';
import type { SortRule } from '../sorting/types';

type TestItem = Record<string, unknown> & {
  id: string;
  name: string;
  age: number;
};

const items: TestItem[] = [
  { id: '1', name: 'Charlie', age: 30 },
  { id: '2', name: 'Alice', age: 25 },
  { id: '3', name: 'Bob', age: 35 },
  { id: '4', name: 'Alice', age: 20 },
];

describe('createCollectionSorter', () => {
  describe('basic sorting (no prefixFns)', () => {
    it('should return items unchanged when no rules', () => {
      const sorter = createCollectionSorter<TestItem>([]);
      const result = sorter([...items]);
      expect(result.map((i) => i.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should sort by string property ascending', () => {
      const rules: SortRule[] = [
        { property: 'name', direction: 'asc', type: 'string' },
      ];
      const sorter = createCollectionSorter<TestItem>(rules);
      const result = sorter([...items]);
      expect(result.map((i) => i.name)).toEqual([
        'Alice',
        'Alice',
        'Bob',
        'Charlie',
      ]);
    });

    it('should sort by number property descending', () => {
      const rules: SortRule[] = [
        { property: 'age', direction: 'desc', type: 'number' },
      ];
      const sorter = createCollectionSorter<TestItem>(rules);
      const result = sorter([...items]);
      expect(result.map((i) => i.age)).toEqual([35, 30, 25, 20]);
    });

    it('should chain multiple sort rules', () => {
      const rules: SortRule[] = [
        { property: 'name', direction: 'asc', type: 'string' },
        { property: 'age', direction: 'asc', type: 'number' },
      ];
      const sorter = createCollectionSorter<TestItem>(rules);
      const result = sorter([...items]);
      expect(result.map((i) => i.id)).toEqual(['4', '2', '3', '1']);
    });
  });

  describe('hierarchy (ordinal) sorting', () => {
    type OrdinalItem = Record<string, unknown> & {
      id: string;
      level: string | null;
    };

    // Options in defined rank order. Alphabetical order would be
    // ['High', 'Low', 'Medium'] which differs from the defined rank.
    const hierarchy = ['Low', 'Medium', 'High'];

    const ordinalItems: OrdinalItem[] = [
      { id: 'a', level: 'High' },
      { id: 'b', level: 'Low' },
      { id: 'c', level: 'Medium' },
    ];

    it('should sort by codebook rank ascending, not alphabetically', () => {
      const rules: SortRule[] = [
        { property: 'level', direction: 'asc', type: 'hierarchy', hierarchy },
      ];
      const sorter = createCollectionSorter<OrdinalItem>(rules);
      const result = sorter([...ordinalItems]);
      // Rank ascending => Low, Medium, High (NOT alphabetical High, Low, Medium)
      expect(result.map((i) => i.level)).toEqual(['Low', 'Medium', 'High']);
    });

    it('should sort by codebook rank descending', () => {
      const rules: SortRule[] = [
        { property: 'level', direction: 'desc', type: 'hierarchy', hierarchy },
      ];
      const sorter = createCollectionSorter<OrdinalItem>(rules);
      const result = sorter([...ordinalItems]);
      expect(result.map((i) => i.level)).toEqual(['High', 'Medium', 'Low']);
    });

    it('should sink values absent from the hierarchy to the end', () => {
      const withUnknown: OrdinalItem[] = [
        { id: 'a', level: 'High' },
        { id: 'x', level: 'Unknown' },
        { id: 'b', level: 'Low' },
      ];
      const rules: SortRule[] = [
        { property: 'level', direction: 'asc', type: 'hierarchy', hierarchy },
      ];
      const sorter = createCollectionSorter<OrdinalItem>(rules);
      const result = sorter([...withUnknown]);
      expect(result.map((i) => i.id)).toEqual(['b', 'a', 'x']);
    });
  });

  describe('categorical (array-valued) sorting', () => {
    type CategoricalItem = Record<string, unknown> & {
      id: string;
      tags: (string | number)[];
    };

    // Categorical attribute values are stored as arrays of selected option
    // values. Order by the best (lowest) option index across the selection.
    const hierarchy = ['Red', 'Green', 'Blue'];

    const categoricalItems: CategoricalItem[] = [
      { id: 'a', tags: ['Blue'] },
      { id: 'b', tags: ['Green', 'Blue'] },
      { id: 'c', tags: ['Red', 'Blue'] },
    ];

    it('should order by the best (lowest) option index across the selection', () => {
      const rules: SortRule[] = [
        { property: 'tags', direction: 'asc', type: 'categorical', hierarchy },
      ];
      const sorter = createCollectionSorter<CategoricalItem>(rules);
      const result = sorter([...categoricalItems]);
      // best index: a=2 (Blue), b=1 (Green), c=0 (Red) => c, b, a
      expect(result.map((i) => i.id)).toEqual(['c', 'b', 'a']);
    });

    it('should place empty selections at the end', () => {
      const withEmpty: CategoricalItem[] = [
        { id: 'a', tags: [] },
        { id: 'b', tags: ['Green'] },
        { id: 'c', tags: ['Red'] },
      ];
      const rules: SortRule[] = [
        { property: 'tags', direction: 'asc', type: 'categorical', hierarchy },
      ];
      const sorter = createCollectionSorter<CategoricalItem>(rules);
      const result = sorter([...withEmpty]);
      expect(result.map((i) => i.id)).toEqual(['c', 'b', 'a']);
    });
  });

  describe('insertion order (*) sorting', () => {
    it('should reverse data-file order for property "*" descending', () => {
      const rules: SortRule[] = [
        { property: '*', direction: 'desc', type: 'number' },
      ];
      const sorter = createCollectionSorter<TestItem>(rules);
      const result = sorter([...items]);
      expect(result.map((i) => i.id)).toEqual(['4', '3', '2', '1']);
    });

    it('should preserve data-file order for property "*" ascending', () => {
      const rules: SortRule[] = [
        { property: '*', direction: 'asc', type: 'number' },
      ];
      const sorter = createCollectionSorter<TestItem>(rules);
      const result = sorter([...items]);
      expect(result.map((i) => i.id)).toEqual(['1', '2', '3', '4']);
    });
  });

  describe('prefixFns', () => {
    it('should apply prefixFns before sort rules', () => {
      // Prefix: sort by id descending (4,3,2,1)
      const prefixFn: SortFn<TestItem & { _createdIndex?: number }> = (a, b) =>
        b.id.localeCompare(a.id);

      const rules: SortRule[] = [
        { property: 'name', direction: 'asc', type: 'string' },
      ];

      const sorter = createCollectionSorter<TestItem>(rules, [prefixFn]);
      const result = sorter([...items]);

      // prefixFn takes priority — items sorted by id desc
      // only items with equal id would fall through to name sort
      expect(result.map((i) => i.id)).toEqual(['4', '3', '2', '1']);
    });

    it('should use sort rules as tiebreakers when prefixFn returns 0', () => {
      // Prefix: score map where Alice items tie at 0.1, others at 0.5
      const scores = new Map<string, number>([
        ['1', 0.5],
        ['2', 0.1],
        ['3', 0.5],
        ['4', 0.1],
      ]);

      const prefixFn: SortFn<TestItem & { _createdIndex?: number }> = (a, b) =>
        (scores.get(a.id) ?? 1) - (scores.get(b.id) ?? 1);

      const rules: SortRule[] = [
        { property: 'age', direction: 'asc', type: 'number' },
      ];

      const sorter = createCollectionSorter<TestItem>(rules, [prefixFn]);
      const result = sorter([...items]);

      // First: items with score 0.1 (ids 2,4) sorted by age asc → 4(20), 2(25)
      // Then: items with score 0.5 (ids 1,3) sorted by age asc → 1(30), 3(35)
      expect(result.map((i) => i.id)).toEqual(['4', '2', '1', '3']);
    });

    it('should work with prefixFns only (no sort rules)', () => {
      const prefixFn: SortFn<TestItem & { _createdIndex?: number }> = (a, b) =>
        a.age - b.age;

      const sorter = createCollectionSorter<TestItem>([], [prefixFn]);
      const result = sorter([...items]);

      expect(result.map((i) => i.age)).toEqual([20, 25, 30, 35]);
    });

    it('should return items unchanged when no rules and no prefixFns', () => {
      const sorter = createCollectionSorter<TestItem>([], []);
      const result = sorter([...items]);
      expect(result.map((i) => i.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should chain multiple prefixFns in order', () => {
      // First prefix: group by even/odd age (even=0, odd=1)
      const groupFn: SortFn<TestItem & { _createdIndex?: number }> = (a, b) =>
        (a.age % 2) - (b.age % 2);

      // Second prefix: sort by age ascending within groups
      const ageFn: SortFn<TestItem & { _createdIndex?: number }> = (a, b) =>
        a.age - b.age;

      const sorter = createCollectionSorter<TestItem>([], [groupFn, ageFn]);
      const result = sorter([...items]);

      // Even ages first (20, 30), then odd ages (25, 35)
      expect(result.map((i) => i.age)).toEqual([20, 30, 25, 35]);
    });
  });
});
