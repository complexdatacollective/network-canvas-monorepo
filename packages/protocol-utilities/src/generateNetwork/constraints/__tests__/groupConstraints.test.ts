import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variables,
} from '@codaco/protocol-validation';

import { buildEntityConstraints } from '../buildConstraints';
import type { DateResolution } from '../dateWindow';
import { resolveGenerationOrder } from '../dependencyOrder';
import {
  comparatorBound,
  type ComparatorDateBound,
  emptyGroupBounds,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from '../groupConstraints';
import type { ConstrainedVariable, EntityConstraints } from '../types';

const TODAY = '2026-07-27';

function propagate(entity: EntityConstraints) {
  const { order, membersOf, groupOf } = resolveGenerationOrder(entity);

  return propagateComparatorBounds(
    intersectGroupConstraints(entity, membersOf),
    order,
    groupComparatorEdges(entity, groupOf),
  );
}

function chain(minValue: number, maxValue: number): EntityConstraints {
  return buildEntityConstraints(
    {
      a: { name: 'A', type: 'number', validation: { minValue, maxValue } },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue,
          maxValue,
          greaterThanVariable: asEntityAttributeReference('a'),
        },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: {
          minValue,
          maxValue,
          greaterThanVariable: asEntityAttributeReference('b'),
        },
      },
    },
    TODAY,
  );
}

/** Datetime variables over one window, each strictly after the one before. */
function dateChain(
  ids: readonly string[],
  parameters: { type: 'full' | 'month' | 'year'; min: string; max: string },
): EntityConstraints {
  const variables: Variables = {};

  ids.forEach((id, index) => {
    const previous = ids[index - 1];
    variables[id] = {
      name: id.toUpperCase(),
      type: 'datetime',
      parameters,
      ...(previous === undefined
        ? {}
        : {
            validation: {
              greaterThanVariable: asEntityAttributeReference(previous),
            },
          }),
    };
  });

  return buildEntityConstraints(variables, TODAY);
}

function labelled(values: number[]) {
  return values.map((value) => ({ label: `Option ${value}`, value }));
}

function groupsOf(entity: EntityConstraints) {
  return intersectGroupConstraints(
    entity,
    resolveGenerationOrder(entity).membersOf,
  );
}

/** Every crossing the entity's multi-member groups leave nothing between. */
function crossings(entity: EntityConstraints) {
  const { membersOf } = resolveGenerationOrder(entity);
  const groups = intersectGroupConstraints(entity, membersOf);

  return [...membersOf].flatMap(([group, memberIds]) => {
    const intersected = groups.get(group);
    if (intersected === undefined || memberIds.length < 2) return [];

    const members = memberIds.flatMap((id) => {
      const member = entity.get(id);
      return member === undefined ? [] : [member];
    });

    return emptyGroupBounds(members, intersected.constraints);
  });
}

/** Two ordinals held equal, each offering the values it is given. */
function heldEqualOrdinals(a: number[], b: number[]): EntityConstraints {
  return buildEntityConstraints(
    {
      a: { name: 'Rating A', type: 'ordinal', options: labelled(a) },
      b: {
        name: 'Rating B',
        type: 'ordinal',
        options: labelled(b),
        validation: { sameAs: asEntityAttributeReference('a') },
      },
    },
    TODAY,
  );
}

function heldEqualBooleans(a: boolean[], b: boolean[]): EntityConstraints {
  const choices = (values: boolean[]) =>
    values.map((value) => ({ label: String(value), value }));

  return buildEntityConstraints(
    {
      a: {
        name: 'Flag A',
        type: 'boolean',
        component: 'Boolean',
        options: choices(a),
      },
      b: {
        name: 'Flag B',
        type: 'boolean',
        component: 'Boolean',
        options: choices(b),
        validation: { sameAs: asEntityAttributeReference('a') },
      },
    },
    TODAY,
  );
}

function optionValues(variable: ConstrainedVariable | undefined) {
  return variable?.entry.options?.map((option) => option.value);
}

describe('intersectGroupConstraints', () => {
  it('offers a group only the option values every member of it can hold', () => {
    const groups = groupsOf(heldEqualOrdinals([1, 2, 3], [2, 3, 4]));

    expect(optionValues(groups.get('a'))).toEqual([2, 3]);
  });

  it('leaves the options alone when a member has no options of its own', () => {
    // `emptyGroupBounds` refuses this group for its types; the intersection
    // still has to leave the ordinal something rather than emptying its list
    // over a member that was never going to contribute one.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Rating A', type: 'ordinal', options: labelled([1, 2]) },
        b: {
          name: 'Note',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(optionValues(groupsOf(entity).get('a'))).toEqual([1, 2]);
  });

  it('keeps the options it was given when the members share none', () => {
    // The feasibility pass refuses this protocol; until it does, a value one
    // member can hold beats the empty option list that draws nothing at all.
    const groups = groupsOf(heldEqualOrdinals([1, 2], [3, 4]));

    expect(optionValues(groups.get('a'))).toEqual([1, 2]);
  });

  it('narrows a two-valued Boolean member to the choice shared by its group', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'Flag A', type: 'boolean', component: 'Toggle' },
        b: {
          name: 'Flag B',
          type: 'boolean',
          component: 'Boolean',
          options: [{ label: 'Yes', value: true }],
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    const variable = groupsOf(entity).get('a');
    expect(variable?.entry.component).toBe('Boolean');
    expect(optionValues(variable)).toEqual([true]);
  });
});

describe('emptyGroupBounds', () => {
  it('reports options the members of a group share none of', () => {
    expect(crossings(heldEqualOrdinals([1, 2], [3, 4]))).toEqual([
      {
        rules: ['options'],
        detail:
          'the options offered by "Rating A" (1, 2) and by "Rating B" (3, 4) have no value in common',
      },
    ]);
  });

  it('reports Boolean choices held equal with no value in common', () => {
    expect(crossings(heldEqualBooleans([true], [false]))).toEqual([
      {
        rules: ['options'],
        detail:
          'the options offered by "Flag A" (true) and by "Flag B" (false) have no value in common',
      },
    ]);
  });

  it('reports nothing when the members share an option', () => {
    expect(crossings(heldEqualOrdinals([1, 2], [2, 3]))).toEqual([]);
  });

  it('reports nothing about options when only one member has any', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'Rating A', type: 'ordinal', options: labelled([1, 2]) },
        b: {
          name: 'Note',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    // The types are what is wrong with this pairing, and the only thing
    // reported: an ordinal's option list is not narrowed by a member that has
    // none, so there is no options conflict to name alongside it.
    expect(crossings(entity).map(({ rules }) => rules)).toEqual([['type']]);
  });

  it('leaves a lone member falling short of its own to the per-variable check', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'Foods A',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { minSelected: 3 },
        },
        b: {
          name: 'Note',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity).map(({ rules }) => rules)).toEqual([['type']]);
  });

  it('reports a minSelected the options left to the group cannot fill', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'Foods A',
          type: 'categorical',
          options: labelled([1, 2, 3]),
          validation: { minSelected: 2 },
        },
        b: {
          name: 'Foods B',
          type: 'categorical',
          options: labelled([3, 4, 5]),
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['minSelected', 'options'],
        detail:
          'minSelected 2 exceeds the 1 option shared by "Foods A" (1, 2, 3) and by "Foods B" (3, 4, 5)',
      },
    ]);
  });

  it('says when a member already falls short of its own minSelected', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'Foods A',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { minSelected: 3 },
        },
        b: {
          name: 'Foods B',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['minSelected', 'options'],
        detail:
          'minSelected 3 exceeds the 2 options shared by "Foods A" (1, 2) and by "Foods B" (1, 2), which one of these variables already declares on its own',
      },
    ]);
  });

  it('reports the types of a group whose members hold different ones', () => {
    // `sameAs` names a variable id and the schema asks nothing of the type it
    // names, so this is a protocol a researcher can write today. Drawn, it
    // leaves the boolean's attribute holding the text value.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Note', type: 'text' },
        b: {
          name: 'Flag',
          type: 'boolean',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['type'],
        detail:
          'the types of "Note" (text) and "Flag" (boolean) have no value in common',
      },
    ]);
  });

  it('reports the types of an ordinal held equal to a categorical', () => {
    // Drawing from options is not enough to share a value: a categorical value
    // is an array of option values and an ordinal value is a single one.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Rating', type: 'ordinal', options: labelled([1, 2]) },
        b: {
          name: 'Foods',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['type'],
        detail:
          'the types of "Rating" (ordinal) and "Foods" (categorical) have no value in common',
      },
    ]);
  });

  it('reports nothing about the types of a group that shares one', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'Note A', type: 'text' },
        b: {
          name: 'Note B',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([]);
  });

  it('leaves a number held equal to a scalar to its bounds', () => {
    // Both are drawn as plain numbers, and the scalar's 0-1 scale reaches the
    // group as minValue/maxValue, so the bounds already say whatever there is
    // to say about which values the two can share. The number declares the
    // rule because the schema gives `scalar` no `sameAs` of its own.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Weight', type: 'scalar' },
        b: {
          name: 'Count',
          type: 'number',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([]);
  });

  it('reports a number whose declared range the scalar scale excludes', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'Weight', type: 'scalar' },
        b: {
          name: 'Count',
          type: 'number',
          validation: {
            minValue: 5,
            maxValue: 10,
            sameAs: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['minValue', 'maxValue'],
        detail: 'minValue 5 exceeds maxValue 1',
      },
    ]);
  });

  it('reports the picker resolutions of two dates held equal', () => {
    // Both members are datetime, so the type check has nothing to say about
    // this pairing. What separates them is the string each control writes: a
    // month field holds `YYYY-MM` and a full one `YYYY-MM-DD`, and raw equality
    // asks for the same string at both ends. Drawn, the group emits the
    // representative's — leaving the full field holding '2026-07', which its
    // own picker cannot display.
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start month',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
        },
        finish: {
          name: 'Finish day',
          type: 'datetime',
          parameters: { type: 'full', min: '2026-01-01', max: '2026-12-31' },
          validation: { sameAs: asEntityAttributeReference('start') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['parameters'],
        detail:
          'the date resolutions of "Start month" (month) and "Finish day" (full) have no value in common',
      },
    ]);
  });

  it('reports them the same way when the finer picker is the representative', () => {
    // Which member the group draws against decides which of the two fields is
    // left holding a string it cannot show, and nothing else: the pairing is
    // refused from either side.
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start day',
          type: 'datetime',
          parameters: { type: 'full', min: '2026-01-01', max: '2026-12-31' },
        },
        finish: {
          name: 'Finish year',
          type: 'datetime',
          parameters: { type: 'year', min: '2026', max: '2026' },
          validation: { sameAs: asEntityAttributeReference('start') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['parameters'],
        detail:
          'the date resolutions of "Start day" (full) and "Finish year" (year) have no value in common',
      },
    ]);
  });

  it('reports nothing about two dates held equal at one resolution', () => {
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
        },
        finish: {
          name: 'Finish',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-03', max: '2026-09' },
          validation: { sameAs: asEntityAttributeReference('start') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([]);
  });

  it('still reports a same-resolution pair whose windows do not overlap', () => {
    // `parameters` is the rule either way, so the resolution check must not
    // stand in for the range one: these two agree on the units and still leave
    // no date between them.
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-07', max: '2026-12' },
        },
        finish: {
          name: 'Finish',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-03' },
          validation: { sameAs: asEntityAttributeReference('start') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['parameters'],
        detail: 'the date range 2026-07 to 2026-03 is empty',
      },
    ]);
  });

  it('reports only the types of a date held equal to something that is not one', () => {
    // A group that is not all dates is a type conflict, and naming its
    // resolutions alongside would point a researcher at a picker setting that
    // could never have made the pairing work.
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
        },
        note: {
          name: 'Note',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('start') },
        },
      },
      TODAY,
    );

    expect(crossings(entity).map(({ rules }) => rules)).toEqual([['type']]);
  });
});

describe('propagateComparatorBounds', () => {
  it('raises floors along the chain and lowers ceilings back down it', () => {
    const { groups, inverted } = propagate(chain(0, 3));

    expect(groups.get('a')?.constraints.minValue).toBe(0);
    expect(groups.get('a')?.constraints.maxValue).toBe(1);
    expect(groups.get('b')?.constraints.minValue).toBe(1);
    expect(groups.get('b')?.constraints.maxValue).toBe(2);
    expect(groups.get('c')?.constraints.minValue).toBe(2);
    expect(groups.get('c')?.constraints.maxValue).toBe(3);
    expect([...inverted]).toEqual([]);
  });

  it('gives a variable that declares no bounds the ceiling its comparison implies', () => {
    const entity = buildEntityConstraints(
      {
        score: {
          name: 'Score',
          type: 'number',
          validation: { minValue: 0, maxValue: 10 },
        },
        baseline: {
          name: 'Baseline',
          type: 'number',
          validation: { lessThanVariable: asEntityAttributeReference('score') },
        },
      },
      TODAY,
    );

    const { groups, inverted } = propagate(entity);

    expect(groups.get('baseline')?.constraints.maxValue).toBe(9);
    expect(groups.get('baseline')?.constraints.minValue).toBeUndefined();
    expect([...inverted]).toEqual([]);
  });

  it('reports every group a chain too long for its range leaves nothing for', () => {
    const { groups, inverted, incomparable } = propagate(chain(0, 1));

    expect([...inverted].toSorted()).toEqual(['a', 'b', 'c']);
    // The fault here really is the range, so nothing is reported as a type
    // mismatch: the two causes carry different messages.
    expect([...incomparable]).toEqual([]);
    // The declared bounds are kept, so a draw made before the feasibility pass
    // refuses the protocol still lands inside them.
    expect(groups.get('a')?.constraints).toMatchObject({
      minValue: 0,
      maxValue: 1,
    });
  });

  it('leaves a group inverted by its own bounds out of the report', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 50, maxValue: 20 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    expect([...propagate(entity).inverted]).toEqual([]);
  });

  it('steps a day off each end of a comparison between two dates', () => {
    const { groups, inverted } = propagate(
      dateChain(['start', 'end'], {
        type: 'full',
        min: '2026-01-01',
        max: '2026-01-31',
      }),
    );

    expect(groups.get('end')?.constraints.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-02',
      max: '2026-01-31',
    });
    expect(groups.get('start')?.constraints.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-01',
      max: '2026-01-30',
    });
    expect([...inverted]).toEqual([]);
  });

  it('steps in the unit of the resolution the two dates are written at', () => {
    const { groups } = propagate(
      dateChain(['start', 'end'], {
        type: 'month',
        min: '2026-01',
        max: '2026-06',
      }),
    );

    expect(groups.get('end')?.constraints.dateWindow?.min).toBe('2026-02');
    expect(groups.get('start')?.constraints.dateWindow?.max).toBe('2026-05');
  });

  it('reports a chain of dates too long for the years it has', () => {
    const { groups, inverted } = propagate(
      dateChain(['a', 'b', 'c'], { type: 'year', min: '2026', max: '2027' }),
    );

    expect([...inverted].toSorted()).toEqual(['a', 'b', 'c']);
    expect(groups.get('a')?.constraints.dateWindow).toEqual({
      resolution: 'year',
      min: '2026',
      max: '2027',
    });
  });

  it('rewrites a bound crossing between two resolutions into the units it lands in', () => {
    // The runtime parses both ends with `new Date(...)`, which puts a partial
    // date at the first instant of its period: `2026-01` is `2026-01-01`. So
    // the earliest month after `2026-01-15` is `2026-02`, January having begun
    // before the day it must follow; and the latest day before `2026-12` is
    // `2026-11-30`, the two coinciding on the first of December.
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start',
          type: 'datetime',
          parameters: { type: 'full', min: '2026-01-15', max: '2026-12-31' },
        },
        end: {
          name: 'End',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
          validation: {
            greaterThanVariable: asEntityAttributeReference('start'),
          },
        },
      },
      TODAY,
    );

    const { groups, inverted } = propagate(entity);

    expect(groups.get('end')?.constraints.dateWindow).toEqual({
      resolution: 'month',
      min: '2026-02',
      max: '2026-12',
    });
    expect(groups.get('start')?.constraints.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-15',
      max: '2026-11-30',
    });
    expect([...inverted]).toEqual([]);
  });

  it('steps a strict scalar-below-number comparison by the scalar grid', () => {
    // `s < n` with `n` pinned to 1: the largest grid value below 1 is 0.99.
    // Stepping by the number's whole-unit gap instead would empty the scalar's
    // range and falsely refuse a protocol `s = 0.5, n = 1` satisfies.
    const entity = buildEntityConstraints(
      {
        s: {
          name: 'S',
          type: 'scalar',
          component: 'VisualAnalogScale',
          validation: { lessThanVariable: asEntityAttributeReference('n') },
        },
        n: {
          name: 'N',
          type: 'number',
          validation: { minValue: 1, maxValue: 1 },
        },
      },
      TODAY,
    );

    const { groups, inverted } = propagate(entity);

    expect(groups.get('s')?.constraints.maxValue).toBe(0.99);
    expect([...inverted]).toEqual([]);
  });

  it('keeps a scalar ceiling stepped down from a number on the scalar grid', () => {
    // 3 - 0.01 lands beside the grid in binary floating point; the stored
    // bound must be the grid value itself or every draw would clamp oddly.
    const entity = buildEntityConstraints(
      {
        s: {
          name: 'S',
          type: 'scalar',
          component: 'VisualAnalogScale',
          validation: { lessThanVariable: asEntityAttributeReference('n') },
        },
        n: {
          name: 'N',
          type: 'number',
          validation: { minValue: 0, maxValue: 3 },
        },
      },
      TODAY,
    );

    const { groups } = propagate(entity);

    // The scalar's own domain caps it at 1 before the comparator's 2.99 could.
    expect(groups.get('s')?.constraints.maxValue).toBe(1);
    expect(groups.get('n')?.constraints.minValue).toBe(0.01);
  });

  it('refuses a number compared against a date', () => {
    // `compareVariables` is handed the declaring variable's type, so this one
    // coerces both ends with `Number(...)`: '2006-01-14' becomes NaN, nothing
    // further in that function compares a number against a string, and it
    // returns 0. Age 72 is therefore reported as neither greater nor less than
    // the date, and no draw the generator could make would change that.
    const entity = buildEntityConstraints(
      {
        born: {
          name: 'Born',
          type: 'datetime',
          parameters: { type: 'full', min: '2000-01-01', max: '2010-12-31' },
        },
        age: {
          name: 'Age',
          type: 'number',
          validation: {
            minValue: 1,
            maxValue: 100,
            greaterThanVariable: asEntityAttributeReference('born'),
          },
        },
      },
      TODAY,
    );

    const { groups, inverted, incomparable } = propagate(entity);

    expect([...inverted].toSorted()).toEqual(['age', 'born']);
    // Reported apart from the ranges, because a range of any width would leave
    // this pairing exactly as unsatisfiable.
    expect([...incomparable].toSorted()).toEqual(['age', 'born']);
    // The declared bounds are kept, the way an over-long chain keeps its own:
    // a draw made before the feasibility pass refuses the protocol still lands
    // inside the range a participant's form would enforce.
    expect(groups.get('age')?.constraints).toMatchObject({
      minValue: 1,
      maxValue: 100,
    });
  });

  it('refuses the pairing from the date side and when it is not strict', () => {
    // From this end `new Date(...)` reads the number as milliseconds since the
    // epoch, so the comparison is decided by that accident rather than by the
    // rule. Non-strict is refused alongside strict because a pairing reported
    // only under `>` would be "fixed" by writing `>=`, which silences the
    // message without making the rule mean anything.
    const entity = buildEntityConstraints(
      {
        count: {
          name: 'Count',
          type: 'number',
          validation: { minValue: 0, maxValue: 10 },
        },
        seen: {
          name: 'Seen',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('count'),
          },
        },
      },
      TODAY,
    );

    expect([...propagate(entity).inverted].toSorted()).toEqual([
      'count',
      'seen',
    ]);
  });

  it('refuses a scalar compared against a date', () => {
    const entity = buildEntityConstraints(
      {
        seen: {
          name: 'Seen',
          type: 'datetime',
          parameters: { type: 'full', min: '2026-01-01', max: '2026-12-31' },
        },
        weight: {
          name: 'Weight',
          type: 'scalar',
          component: 'VisualAnalogScale',
          validation: {
            lessThanVariable: asEntityAttributeReference('seen'),
          },
        },
      },
      TODAY,
    );

    expect([...propagate(entity).inverted].toSorted()).toEqual([
      'seen',
      'weight',
    ]);
  });

  it('leaves a number compared against a number alone', () => {
    // The boundary the refusal must not cross: two ends the runtime can
    // genuinely order still propagate, and are not reported.
    const { groups, inverted } = propagate(chain(0, 10));

    expect([...inverted]).toEqual([]);
    expect(groups.get('c')?.constraints.minValue).toBe(2);
  });

  it('leaves two dates at different resolutions alone', () => {
    // The other boundary: a comparison across resolutions is not the pairing
    // this refuses. The runtime parses both ends as instants and enforces it,
    // and `comparatorBound` writes each bound in the units of the end it lands
    // on — so the pair generates, as the case above it asserts in detail.
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start',
          type: 'datetime',
          parameters: { type: 'full', min: '2026-01-15', max: '2026-12-31' },
        },
        end: {
          name: 'End',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
          validation: {
            greaterThanVariable: asEntityAttributeReference('start'),
          },
        },
      },
      TODAY,
    );

    expect([...propagate(entity).inverted]).toEqual([]);
  });

  /** Two date variables over their own windows, the second strictly after. */
  function datePair(
    a: { type: DateResolution; min: string; max: string },
    b: { type: DateResolution; min: string; max: string },
    rule = 'greaterThanVariable',
  ): EntityConstraints {
    return buildEntityConstraints(
      {
        a: { name: 'A', type: 'datetime', parameters: a },
        b: {
          name: 'B',
          type: 'datetime',
          parameters: b,
          validation: { [rule]: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );
  }

  it('refuses a strict comparison against a date pinned at the end of the calendar', () => {
    // The floor `b` needs is the day after the last one the calendar holds.
    // `addSteps` writes that as `10000-01-01`, which sorts below every
    // four-digit year — so `tighten` reads it as the looser bound and drops it,
    // and without the emptiness being recorded where it happens `b` keeps a
    // window whose every date breaks the rule.
    const { groups, inverted } = propagate(
      datePair(
        { type: 'full', min: '9999-12-31', max: '9999-12-31' },
        { type: 'full', min: '1920-01-01', max: '9999-12-31' },
      ),
    );

    // `a` is reported alongside it, its own ceiling having been stepped back
    // below the one date it can hold: pinning the lower end at the last date
    // leaves neither end of the rule anywhere to go.
    expect([...inverted].toSorted()).toEqual(['a', 'b']);
    // Declared bounds are kept, so a draw made before the feasibility pass
    // refuses the protocol still lands on a date the picker offers.
    expect(groups.get('b')?.constraints.dateWindow).toMatchObject({
      min: '1920-01-01',
      max: '9999-12-31',
    });
  });

  it('leaves a non-strict comparison against that same date satisfiable', () => {
    // The boundary the refusal must not cross: `>=` is satisfied by the last
    // date itself, so both ends generate.
    const { groups, inverted } = propagate(
      datePair(
        { type: 'full', min: '9999-12-31', max: '9999-12-31' },
        { type: 'full', min: '1920-01-01', max: '9999-12-31' },
        'greaterThanOrEqualToVariable',
      ),
    );

    expect([...inverted]).toEqual([]);
    expect(groups.get('b')?.constraints.dateWindow).toMatchObject({
      min: '9999-12-31',
      max: '9999-12-31',
    });
  });

  it('refuses a coarser end asked to clear the last period the calendar holds', () => {
    // A year picker held after a month pinned at `9999-12` has to clear the
    // whole of 9999 whether or not the rule is strict, and there is no later
    // year to clear it into.
    const { inverted } = propagate(
      datePair(
        { type: 'month', min: '9999-12', max: '9999-12' },
        { type: 'year', min: '1920', max: '9999' },
        'greaterThanOrEqualToVariable',
      ),
    );

    expect([...inverted].toSorted()).toEqual(['a', 'b']);
  });

  /** `b > a`, each number declaring the range it is given. */
  function numberPair(
    a: { minValue: number; maxValue: number },
    b: { minValue: number; maxValue: number },
  ): EntityConstraints {
    return buildEntityConstraints(
      {
        a: { name: 'A', type: 'number', validation: a },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            ...b,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );
  }

  it('keeps both ranges of a strict comparison neither of which holds an integer', () => {
    // Every value in `[0.3, 0.4]` is above every value in `[0.1, 0.2]`, and the
    // draw fills both on the two-decimal grid. Stepping a whole unit between
    // them raises `b`'s floor to 1.1 and refuses a protocol that generates.
    const { groups, inverted } = propagate(
      numberPair(
        { minValue: 0.1, maxValue: 0.2 },
        { minValue: 0.3, maxValue: 0.4 },
      ),
    );

    expect([...inverted]).toEqual([]);
    expect(groups.get('a')?.constraints).toMatchObject({
      minValue: 0.1,
      maxValue: 0.2,
    });
    expect(groups.get('b')?.constraints).toMatchObject({
      minValue: 0.3,
      maxValue: 0.4,
    });
  });

  it('steps a fractional end by the grid and a whole-valued one by a unit', () => {
    // One end of a comparison holding whole values does not make the other
    // one's step a whole unit: the gap is the finer of the two, which is the
    // closest any pair of values the two draws can produce comes.
    const fractionalLower = propagate(
      numberPair(
        { minValue: 0.1, maxValue: 0.2 },
        { minValue: 0, maxValue: 10 },
      ),
    );
    expect([...fractionalLower.inverted]).toEqual([]);
    expect(fractionalLower.groups.get('b')?.constraints.minValue).toBe(0.11);

    const fractionalUpper = propagate(
      numberPair(
        { minValue: 0, maxValue: 10 },
        { minValue: 0.1, maxValue: 0.2 },
      ),
    );
    expect([...fractionalUpper.inverted]).toEqual([]);
    expect(fractionalUpper.groups.get('a')?.constraints.maxValue).toBe(0.19);
  });

  it('separates a range by the only two values it holds', () => {
    // `[0.001, 0.009]` holds no multiple of the grid at all, so the draw is its
    // two ends and nothing between them. A strict comparison across it is
    // satisfied by those two, and a step of a whole grid place would refuse it.
    const { groups, inverted } = propagate(
      numberPair(
        { minValue: 0.001, maxValue: 0.009 },
        { minValue: 0.001, maxValue: 0.009 },
      ),
    );

    expect([...inverted]).toEqual([]);
    expect(groups.get('a')?.constraints.maxValue).toBe(0.001);
    expect(groups.get('b')?.constraints.minValue).toBe(0.009);
  });

  it('still refuses a fractional chain longer than its range can separate', () => {
    // The other direction: `[0.1, 0.11]` holds two grid values, so a third
    // variable in the chain has nowhere to sit and every group is reported.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0.1, maxValue: 0.11 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0.1,
            maxValue: 0.11,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: {
            minValue: 0.1,
            maxValue: 0.11,
            greaterThanVariable: asEntityAttributeReference('b'),
          },
        },
      },
      TODAY,
    );

    expect([...propagate(entity).inverted].toSorted()).toEqual(['a', 'b', 'c']);
  });
});

/**
 * The bound one end of a date comparison puts on the other, which is the whole
 * of what makes a cross-resolution comparison enforceable rather than skipped.
 * Tabulated directly because the two resolutions and the two strictnesses
 * interact: a floor steps whenever the ends fail to coincide, strict or not,
 * while a ceiling steps only when they do coincide and the rule is strict.
 */
describe('comparatorBound', () => {
  /**
   * The bound as the one string it names, or the word `empty` where the
   * comparison names none — no date being written that way, the two readings
   * cannot be confused for each other.
   */
  const stated = (bound: ComparatorDateBound | undefined) => {
    if (bound === undefined) return undefined;
    return bound.kind === 'empty' ? 'empty' : bound.value;
  };

  const floor = (target: string, resolution: DateResolution, strict: boolean) =>
    stated(comparatorBound(target, resolution, { boundsUpper: true, strict }));
  const ceiling = (
    target: string,
    resolution: DateResolution,
    strict: boolean,
  ) =>
    stated(comparatorBound(target, resolution, { boundsUpper: false, strict }));

  it('steps a coinciding bound only where the comparison is strict', () => {
    expect(floor('2026-06-17', 'full', true)).toBe('2026-06-18');
    expect(floor('2026-06-17', 'full', false)).toBe('2026-06-17');
    expect(ceiling('2026-06-17', 'full', true)).toBe('2026-06-16');
    expect(ceiling('2026-06-17', 'full', false)).toBe('2026-06-17');
  });

  it('reads a coarser target at the first instant of its period', () => {
    // `2026-06` is `2026-06-01`, so a strictly later day is the second and the
    // latest earlier day is the last of May. A non-strict floor may sit on the
    // first itself, the two being the same instant.
    expect(floor('2026-06', 'full', true)).toBe('2026-06-02');
    expect(floor('2026-06', 'full', false)).toBe('2026-06-01');
    expect(ceiling('2026-06', 'full', true)).toBe('2026-05-31');
    expect(ceiling('2026-06', 'full', false)).toBe('2026-06-01');
    expect(floor('2026', 'full', true)).toBe('2026-01-02');
    expect(floor('2026', 'month', false)).toBe('2026-01');
  });

  it('clears the whole period when the coarser end is the one being bounded', () => {
    // `2026-06` starts before `2026-06-17`, so it satisfies neither `>` nor
    // `>=` and the floor is July either way. The ceiling is June either way,
    // for the same reason: it already sits earlier.
    expect(floor('2026-06-17', 'month', true)).toBe('2026-07');
    expect(floor('2026-06-17', 'month', false)).toBe('2026-07');
    expect(ceiling('2026-06-17', 'month', true)).toBe('2026-06');
    expect(ceiling('2026-06-17', 'month', false)).toBe('2026-06');
    expect(floor('2026-06-17', 'year', false)).toBe('2027');
    expect(ceiling('2026-06-17', 'year', true)).toBe('2026');
  });

  it('leaves a value that is no date at all unbounded', () => {
    expect(floor('', 'full', true)).toBe(undefined);
    expect(floor('not a date', 'full', true)).toBe(undefined);
    expect(floor('2026-06-17T09:00:00Z', 'full', true)).toBe(undefined);
  });

  /**
   * A step past either end of the calendar is the comparison having no
   * solution, not a bound to be clamped: holding a strict floor at the last
   * date the picker offers would readmit the one date the rule excludes, and
   * the overflowed string cannot be caught later either — `10000-01-01` sorts
   * below every four-digit year, so a floor written there is dropped as the
   * looser bound and the draw goes on to emit a date the rule forbids.
   */
  it('has no bound for a strict comparison against the last date the calendar holds', () => {
    expect(floor('9999-12-31', 'full', true)).toBe('empty');
    expect(floor('9999-12', 'month', true)).toBe('empty');
    expect(floor('9999', 'year', true)).toBe('empty');
  });

  it('has no bound for a strict comparison against the first date each picker offers', () => {
    // The two `<select>` resolutions list their years unpadded, so year 1000 is
    // the earliest either offers; a native date input reaches back to year one.
    expect(ceiling('0001-01-01', 'full', true)).toBe('empty');
    expect(ceiling('1000-01', 'month', true)).toBe('empty');
    expect(ceiling('1000', 'year', true)).toBe('empty');
  });

  it('leaves a non-strict comparison pinned at either end satisfiable', () => {
    expect(floor('9999-12-31', 'full', false)).toBe('9999-12-31');
    expect(floor('9999-12', 'month', false)).toBe('9999-12');
    expect(floor('9999', 'year', false)).toBe('9999');
    expect(ceiling('0001-01-01', 'full', false)).toBe('0001-01-01');
    expect(ceiling('1000-01', 'month', false)).toBe('1000-01');
    expect(ceiling('1000', 'year', false)).toBe('1000');
  });

  it('has no bound where clearing the last period leaves the calendar', () => {
    // A coarser end has to clear the whole period whether or not the rule is
    // strict, and there is no month or year after the last one.
    expect(floor('9999-12-31', 'month', false)).toBe('empty');
    expect(floor('9999-12-31', 'year', false)).toBe('empty');
    // A ceiling already sits earlier than a finer target, so it is the target's
    // own period and stays inside the calendar.
    expect(ceiling('9999-12-31', 'month', true)).toBe('9999-12');
    expect(ceiling('9999-12-31', 'year', true)).toBe('9999');
  });
});
