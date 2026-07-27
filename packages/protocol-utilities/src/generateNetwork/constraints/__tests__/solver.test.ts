import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variables,
} from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { buildEntityConstraints } from '../buildConstraints';
import { resolveGenerationOrder } from '../dependencyOrder';
import {
  differentFromGroups,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from '../groupConstraints';
import { solvableComponents, solveComponent } from '../solver';
import type { EntityConstraints } from '../types';
import { valueKey } from '../uniqueRegistry';
import { valueSpaceSize } from '../valueSpace';

const TODAY = '2026-07-27';
const ref = asEntityAttributeReference;

/** The same pipeline feasibility and generation run before consulting the solver. */
function analysed(entity: EntityConstraints) {
  const { order, membersOf, groupOf } = resolveGenerationOrder(entity);
  const { groups: propagated } = propagateComparatorBounds(
    intersectGroupConstraints(entity, membersOf),
    order,
    groupComparatorEdges(entity, groupOf),
  );
  return {
    propagated,
    components: solvableComponents(
      propagated,
      order,
      groupComparatorEdges(entity, groupOf),
      differentFromGroups(entity, groupOf),
    ),
  };
}

function componentsOf(entity: EntityConstraints) {
  return analysed(entity).components;
}

function build(variables: Variables): EntityConstraints {
  return buildEntityConstraints(variables, TODAY);
}

describe('solvableComponents', () => {
  it('collects each connected set of constrained groups into one component', () => {
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 3 },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 3, greaterThanVariable: ref('a') },
      },
      c: { name: 'C', type: 'boolean' },
      d: {
        name: 'D',
        type: 'boolean',
        validation: { differentFrom: ref('c') },
      },
      lone: {
        name: 'Lone',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
    });

    const components = componentsOf(entity);

    expect(components).toHaveLength(2);
    expect(components.map((component) => component.groups.toSorted())).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('enumerates integer, boolean, ordinal, scalar and datetime domains', () => {
    const entity = build({
      n: {
        name: 'N',
        type: 'number',
        validation: { minValue: 3, maxValue: 5, differentFrom: ref('m') },
      },
      m: {
        name: 'M',
        type: 'number',
        validation: { minValue: 4, maxValue: 4 },
      },
      flag: {
        name: 'Flag',
        type: 'boolean',
        validation: { differentFrom: ref('other') },
      },
      other: { name: 'Other', type: 'boolean' },
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [
          { label: 'Low', value: 1 },
          { label: 'High', value: 2 },
        ],
        validation: { differentFrom: ref('twin') },
      },
      twin: {
        name: 'Twin',
        type: 'ordinal',
        options: [
          { label: 'Low', value: 1 },
          { label: 'High', value: 2 },
        ],
      },
      s: {
        name: 'S',
        type: 'scalar',
        component: 'VisualAnalogScale',
        validation: { lessThanVariable: ref('cap') },
      },
      cap: {
        name: 'Cap',
        type: 'number',
        validation: { minValue: 1, maxValue: 1 },
      },
      when: {
        name: 'When',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2020-01-01', max: '2020-01-03' },
        validation: { differentFrom: ref('then') },
      },
      then: {
        name: 'Then',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2020-01-01', max: '2020-01-03' },
      },
    });

    const components = componentsOf(entity);
    const domainOf = (group: string): VariableValue[] | undefined => {
      const component = components.find((candidate) =>
        candidate.groups.includes(group),
      );
      return component?.tractable?.domains.get(group);
    };

    expect(domainOf('n')).toEqual([3, 4, 5]);
    expect(domainOf('m')).toEqual([4]);
    expect(domainOf('flag')).toEqual([false, true]);
    expect(domainOf('band')).toEqual([1, 2]);
    // The scalar is capped below 1 by the comparator, so its propagated grid
    // runs 0.00-0.99.
    expect(domainOf('s')).toHaveLength(100);
    expect(domainOf('s')?.[0]).toBe(0);
    expect(domainOf('s')?.[99]).toBe(0.99);
    expect(domainOf('when')).toEqual([
      '2020-01-01',
      '2020-01-02',
      '2020-01-03',
    ]);
  });

  it('enumerates categorical subsets within the selection bounds', () => {
    const options = [
      { label: 'X', value: 'x' },
      { label: 'Y', value: 'y' },
      { label: 'Z', value: 'z' },
    ];
    const entity = build({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: {
          minSelected: 2,
          maxSelected: 2,
          differentFrom: ref('twin'),
        },
      },
      twin: {
        name: 'Twin',
        type: 'categorical',
        options,
        validation: { minSelected: 2, maxSelected: 2 },
      },
    });

    const [component] = componentsOf(entity);
    const domain = component?.tractable?.domains.get('tags');

    expect(domain?.map((value) => valueKey(value)).toSorted()).toEqual([
      valueKey(['x', 'y']),
      valueKey(['x', 'z']),
      valueKey(['y', 'z']),
    ]);
  });

  it('leaves a component intractable when a domain cannot be enumerated', () => {
    const unboundedNumber = build({
      a: { name: 'A', type: 'number', validation: { differentFrom: ref('b') } },
      b: { name: 'B', type: 'number' },
    });
    const text = build({
      a: { name: 'A', type: 'text', validation: { differentFrom: ref('b') } },
      b: { name: 'B', type: 'text' },
    });

    for (const entity of [unboundedNumber, text]) {
      const [component] = componentsOf(entity);
      expect(component?.groups.toSorted()).toEqual(['a', 'b']);
      expect(component?.tractable).toBeUndefined();
    }
  });

  it('leaves a component intractable when the domain product exceeds the cap', () => {
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 999, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 999 },
      },
    });

    const [component] = componentsOf(entity);

    expect(component?.groups.toSorted()).toEqual(['a', 'b']);
    expect(component?.tractable).toBeUndefined();
  });

  it('leaves a component intractable beyond the variable-count cap', () => {
    const variables: Variables = {};
    for (let i = 0; i < 9; i++) {
      variables[`v${i}`] = {
        name: `V${i}`,
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 1,
          ...(i > 0 ? { differentFrom: ref(`v${i - 1}`) } : {}),
        },
      };
    }

    const [component] = componentsOf(build(variables));

    expect(component?.groups).toHaveLength(9);
    expect(component?.tractable).toBeUndefined();
  });

  it('mirrors the draw default of at most two selections in a categorical domain', () => {
    // A non-unique categorical without maxSelected draws one or two options;
    // a solved value must come from the same sizes, or adding a rule would
    // change what the data looks like.
    const options = Array.from({ length: 4 }, (_v, i) => ({
      label: `O${i}`,
      value: i,
    }));
    const entity = build({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: { differentFrom: ref('twin') },
      },
      twin: { name: 'Twin', type: 'categorical', options },
    });

    const [component] = componentsOf(entity);
    const domain = component?.tractable?.domains.get('tags');

    expect(domain).toHaveLength(10);
    for (const value of domain ?? []) {
      expect(Array.isArray(value) && value.length).toBeLessThanOrEqual(2);
    }
  });

  it('widens a unique categorical domain to every selection size', () => {
    const options = Array.from({ length: 4 }, (_v, i) => ({
      label: `O${i}`,
      value: i,
    }));
    const entity = build({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: { unique: true, differentFrom: ref('twin') },
      },
      twin: { name: 'Twin', type: 'categorical', options },
    });

    const [component] = componentsOf(entity);

    expect(component?.tractable?.domains.get('tags')).toHaveLength(15);
  });

  it('keeps a minSelected above the default cap as the one selection size', () => {
    // The draw clamps its selection count up to minSelected even when that
    // sits above the default ceiling of two, so the domain holds exactly the
    // size-three subsets.
    const options = Array.from({ length: 4 }, (_v, i) => ({
      label: `O${i}`,
      value: i,
    }));
    const entity = build({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: { minSelected: 3, differentFrom: ref('twin') },
      },
      twin: { name: 'Twin', type: 'categorical', options },
    });

    const [component] = componentsOf(entity);
    const domain = component?.tractable?.domains.get('tags');

    expect(domain).toHaveLength(4);
    for (const value of domain ?? []) {
      expect(Array.isArray(value) && value.length).toBe(3);
    }
  });

  it('drops duplicate option values before enumerating selections', () => {
    // An imported protocol may list one value under two labels; the draw
    // deduplicates every selection, so the domain must never hold a multiset
    // like ['x','x'] that no participant control can produce.
    const options = [
      { label: 'First X', value: 'x' },
      { label: 'Second X', value: 'x' },
      { label: 'Y', value: 'y' },
    ];
    const entity = build({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: { differentFrom: ref('twin') },
      },
      twin: { name: 'Twin', type: 'categorical', options },
    });

    const [component] = componentsOf(entity);
    const domain = component?.tractable?.domains.get('tags');

    expect(domain?.map((value) => valueKey(value)).toSorted()).toEqual(
      [valueKey(['x']), valueKey(['x', 'y']), valueKey(['y'])].toSorted(),
    );
  });

  it('declines a categorical whose combination space overflows the budget', () => {
    const options = Array.from({ length: 24 }, (_v, i) => ({
      label: `O${i}`,
      value: i,
    }));
    const entity = build({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: { maxSelected: 12, differentFrom: ref('twin') },
      },
      twin: {
        name: 'Twin',
        type: 'categorical',
        options,
        validation: { maxSelected: 2 },
      },
    });

    const [component] = componentsOf(entity);

    expect(component?.groups.toSorted()).toEqual(['tags', 'twin']);
    expect(component?.tractable).toBeUndefined();
  });

  it('agrees with valueSpaceSize about the size of every enumerated domain', () => {
    // The unique-feasibility check counts a variable's space with
    // valueSpaceSize; the solver enumerates it. If the two drift apart, a
    // unique variable could pass the count and then run out of solved values,
    // or be refused values the solver could in fact reach.
    const options = Array.from({ length: 4 }, (_v, i) => ({
      label: `O${i}`,
      value: i,
    }));
    const window = {
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2024-03-01', max: '2024-03-05' },
    } as const;
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 2, maxValue: 9 },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 12,
          greaterThanVariable: ref('a'),
        },
      },
      s1: {
        name: 'S1',
        type: 'scalar',
        component: 'VisualAnalogScale',
        validation: { lessThanVariable: ref('s2') },
      },
      s2: { name: 'S2', type: 'scalar', component: 'VisualAnalogScale' },
      w: { name: 'W', ...window },
      x: {
        name: 'X',
        ...window,
        validation: { greaterThanVariable: ref('w') },
      },
      band: {
        name: 'Band',
        type: 'ordinal',
        options,
        validation: { differentFrom: ref('flag') },
      },
      flag: { name: 'Flag', type: 'boolean' },
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: { unique: true, differentFrom: ref('twin') },
      },
      twin: { name: 'Twin', type: 'categorical', options },
    });

    const { propagated, components } = analysed(entity);
    const checked: string[] = [];
    for (const component of components) {
      const tractable = component.tractable;
      expect(tractable).toBeDefined();
      for (const group of component.groups) {
        const variable = propagated.get(group);
        expect(variable).toBeDefined();
        if (variable === undefined) continue;
        expect(tractable?.domains.get(group)?.length).toBe(
          valueSpaceSize(variable, Number.MAX_SAFE_INTEGER),
        );
        checked.push(group);
      }
    }

    expect(checked.toSorted()).toEqual([
      'a',
      'b',
      'band',
      'flag',
      's1',
      's2',
      'tags',
      'twin',
      'w',
      'x',
    ]);
  });

  it('declines a comparator between dates at different resolutions', () => {
    // The greedy fold skips such an edge; a complete search cannot claim to
    // decide a rule the draw does not enforce.
    const entity = build({
      start: {
        name: 'Start',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2026-01-01', max: '2026-01-20' },
      },
      end: {
        name: 'End',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'month', min: '2026-01', max: '2026-06' },
        validation: { greaterThanVariable: ref('start') },
      },
    });

    const [component] = componentsOf(entity);

    expect(component?.groups.toSorted()).toEqual(['end', 'start']);
    expect(component?.tractable).toBeUndefined();
  });

  it('narrows a held-equal group domain to the options every member offers', () => {
    const entity = build({
      a: {
        name: 'A',
        type: 'ordinal',
        options: [
          { label: 'One', value: 1 },
          { label: 'Two', value: 2 },
          { label: 'Three', value: 3 },
        ],
      },
      b: {
        name: 'B',
        type: 'ordinal',
        options: [
          { label: 'Two', value: 2 },
          { label: 'Three', value: 3 },
          { label: 'Four', value: 4 },
        ],
        validation: { sameAs: ref('a') },
      },
      c: {
        name: 'C',
        type: 'ordinal',
        options: [
          { label: 'Two', value: 2 },
          { label: 'Three', value: 3 },
        ],
        validation: { differentFrom: ref('a') },
      },
    });

    const [component] = componentsOf(entity);
    const groupId = component?.groups.find((group) => group !== 'c');

    expect(component?.tractable?.domains.get(groupId ?? '')).toEqual([2, 3]);
  });

  it('leaves a component intractable across an incomparable comparator', () => {
    // A number ordered against a date cannot be stepped or compared; the
    // greedy path ignores the rule, so the solver must not claim to decide it.
    const entity = build({
      n: {
        name: 'N',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 3,
          greaterThanVariable: ref('when'),
        },
      },
      when: {
        name: 'When',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2020-01-01', max: '2020-01-03' },
      },
    });

    const [component] = componentsOf(entity);

    expect(component?.groups.toSorted()).toEqual(['n', 'when']);
    expect(component?.tractable).toBeUndefined();
  });
});

describe('solveComponent', () => {
  it('finds a witness for the regression shape greedy drawing painted into a corner', () => {
    // A: [3,4] differentFrom B; B: [3,4]; D: [2,4], D <= A, D >= B.
    // B=3, A=4, D∈[3,4] satisfies everything.
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 3, maxValue: 4, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 3, maxValue: 4 },
      },
      d: {
        name: 'D',
        type: 'number',
        validation: {
          minValue: 2,
          maxValue: 4,
          lessThanOrEqualToVariable: ref('a'),
          greaterThanOrEqualToVariable: ref('b'),
        },
      },
    });

    const [component] = componentsOf(entity);
    expect(component?.tractable).toBeDefined();

    const verdict = solveComponent(component!.tractable!, {});
    expect(verdict.kind).toBe('sat');
    if (verdict.kind !== 'sat') return;

    const a = Number(verdict.assignment.get('a'));
    const b = Number(verdict.assignment.get('b'));
    const d = Number(verdict.assignment.get('d'));
    expect(a).not.toBe(b);
    expect(d).toBeLessThanOrEqual(a);
    expect(d).toBeGreaterThanOrEqual(b);
  });

  it('proves the pinned differentFrom shape unsatisfiable', () => {
    // a: [3,4] differentFrom b; b: [4,5] <= a. Propagation pins both to 4,
    // and 4 cannot differ from 4.
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 3, maxValue: 4, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue: 4,
          maxValue: 5,
          lessThanOrEqualToVariable: ref('a'),
        },
      },
    });

    const [component] = componentsOf(entity);

    expect(component?.tractable).toBeDefined();
    expect(solveComponent(component!.tractable!, {}).kind).toBe('unsat');
  });

  it('proves a pigeonhole of three mutually different values over two unsatisfiable', () => {
    const bounds = { minValue: 0, maxValue: 1 };
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { ...bounds, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { ...bounds, differentFrom: ref('c') },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: { ...bounds, differentFrom: ref('a') },
      },
    });

    const [component] = componentsOf(entity);

    expect(solveComponent(component!.tractable!, {}).kind).toBe('unsat');
  });

  it('honours pins, a domain restriction, and a value ordering', () => {
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 5, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 5 },
      },
    });
    const [component] = componentsOf(entity);
    const tractable = component!.tractable!;

    const pinned = solveComponent(tractable, {
      pins: new Map([['b', 3]]),
      orderDomain: (_group, values) => [...values],
    });
    expect(pinned.kind).toBe('sat');
    if (pinned.kind === 'sat') {
      expect(pinned.assignment.get('b')).toBe(3);
      expect(pinned.assignment.get('a')).not.toBe(3);
    }

    const restricted = solveComponent(tractable, {
      pins: new Map([['b', 3]]),
      restrict: (group, value) => group !== 'a' || value === 3 || value === 4,
    });
    expect(restricted.kind).toBe('sat');
    if (restricted.kind === 'sat')
      expect(restricted.assignment.get('a')).toBe(4);

    const ordered = solveComponent(tractable, {
      orderDomain: (_group, values) => [...values].toReversed(),
    });
    expect(ordered.kind).toBe('sat');
    if (ordered.kind === 'sat') {
      // `b` generates first; both domains run 5..0, so b takes 5 and the
      // pruned `a` takes the next value down.
      expect(ordered.assignment.get('b')).toBe(5);
      expect(ordered.assignment.get('a')).toBe(4);
    }
  });

  it('reports unsatisfiable when a pin conflicts with another pin', () => {
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 5, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 5 },
      },
    });
    const [component] = componentsOf(entity);

    const verdict = solveComponent(component!.tractable!, {
      pins: new Map<string, VariableValue>([
        ['a', 2],
        ['b', 2],
      ]),
    });

    expect(verdict.kind).toBe('unsat');
  });

  it('drops constraints to excluded groups rather than enforcing them', () => {
    // Mirrors a partial regeneration where the counterpart holds no value:
    // the greedy path has nothing to resolve the rule against and ignores it.
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 0, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 0 },
      },
    });
    const [component] = componentsOf(entity);

    const verdict = solveComponent(component!.tractable!, {
      exclude: new Set(['b']),
    });

    expect(verdict.kind).toBe('sat');
    if (verdict.kind === 'sat') {
      expect(verdict.assignment.get('a')).toBe(0);
      expect(verdict.assignment.has('b')).toBe(false);
    }
  });

  it('returns unknown when the search cap is exhausted', () => {
    // A ring of six mutually-different values needs at least six assignments,
    // so a three-node budget runs out before any verdict is possible.
    const variables: Variables = {};
    for (let i = 0; i < 6; i++) {
      variables[`v${i}`] = {
        name: `V${i}`,
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 4,
          differentFrom: ref(i > 0 ? `v${i - 1}` : 'v5'),
        },
      };
    }

    const [component] = componentsOf(build(variables));

    expect(component?.tractable).toBeDefined();
    expect(solveComponent(component!.tractable!, { maxNodes: 3 }).kind).toBe(
      'unknown',
    );
  });

  it('solves a mixed scalar and number chain on the scalar grid', () => {
    // m [0,0] < s (scalar) < n [1,1]: the only integer endpoints pin m=0, n=1,
    // and s must land strictly between on the 0.01 grid.
    const entity = build({
      m: {
        name: 'M',
        type: 'number',
        validation: { minValue: 0, maxValue: 0 },
      },
      s: {
        name: 'S',
        type: 'scalar',
        component: 'VisualAnalogScale',
        validation: {
          greaterThanVariable: ref('m'),
          lessThanVariable: ref('n'),
        },
      },
      n: {
        name: 'N',
        type: 'number',
        validation: { minValue: 1, maxValue: 1 },
      },
    });

    const [component] = componentsOf(entity);
    const verdict = solveComponent(component!.tractable!, {});

    expect(verdict.kind).toBe('sat');
    if (verdict.kind !== 'sat') return;
    const s = Number(verdict.assignment.get('s'));
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('solves date chains by string comparison at the shared resolution', () => {
    const window = {
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2020-01-03' },
    } as const;
    const entity = build({
      w: { name: 'W', ...window },
      x: {
        name: 'X',
        ...window,
        validation: { greaterThanVariable: ref('w') },
      },
      y: {
        name: 'Y',
        ...window,
        validation: { greaterThanVariable: ref('x') },
      },
    });

    const [component] = componentsOf(entity);
    const verdict = solveComponent(component!.tractable!, {});

    expect(verdict.kind).toBe('sat');
    if (verdict.kind !== 'sat') return;
    expect(verdict.assignment.get('w')).toBe('2020-01-01');
    expect(verdict.assignment.get('x')).toBe('2020-01-02');
    expect(verdict.assignment.get('y')).toBe('2020-01-03');
  });

  it('is deterministic for a fixed value ordering', () => {
    const entity = build({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 9, differentFrom: ref('b') },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 9 },
      },
    });
    const [component] = componentsOf(entity);

    const first = solveComponent(component!.tractable!, {});
    const second = solveComponent(component!.tractable!, {});

    expect(first).toEqual(second);
  });
});
