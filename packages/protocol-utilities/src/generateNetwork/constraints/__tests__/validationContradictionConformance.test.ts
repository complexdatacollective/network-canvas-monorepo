import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  findValidationContradictions,
  type Stage,
  type StructuralCodebook,
  type ValidationContradiction,
  type Variables,
} from '@codaco/protocol-validation';

import { resolveGenerationConfig } from '../../config';
import { buildEntityConstraints } from '../buildConstraints';
import { resolveGenerationOrder } from '../dependencyOrder';
import { analyseFeasibility } from '../feasibility';
import {
  differentFromGroups,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from '../groupConstraints';
import { solvableComponents, solveComponent } from '../solver';
import { delegatedValidationContradictions } from '../validationContradictions';

const TODAY = '2026-07-28';
const config = resolveGenerationConfig({ today: TODAY });
const nameGenerator = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'prompt-1', text: 'Name people' }],
  behaviours: { minNodes: 1, maxNodes: 1 },
} as unknown as Stage;

const reference = asEntityAttributeReference;
const option = (value: string | number) => ({
  label: `Option ${String(value)}`,
  value,
});

type Fixture = {
  expectedClass: ValidationContradiction['class'];
  variables: Variables;
};

const fixtures: Fixture[] = [
  {
    expectedClass: 'invertedBounds',
    variables: {
      a: {
        name: 'Inverted',
        type: 'number',
        validation: {
          minValue: 2,
          maxValue: 1,
          differentFrom: reference('b'),
        },
      },
      b: {
        name: 'Counterpart',
        type: 'number',
        validation: { minValue: 0, maxValue: 3 },
      },
    },
  },
  {
    expectedClass: 'minSelectedExceedsOptions',
    variables: {
      a: {
        name: 'Too many',
        type: 'categorical',
        options: [option('x')],
        validation: {
          minSelected: 2,
          maxSelected: 2,
          differentFrom: reference('b'),
        },
      },
      b: {
        name: 'Other selection',
        type: 'categorical',
        options: [option('x'), option('y')],
        validation: { minSelected: 1, maxSelected: 1 },
      },
    },
  },
  {
    expectedClass: 'conflictingReferencePair',
    variables: {
      a: {
        name: 'Both',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 1,
          sameAs: reference('b'),
          differentFrom: reference('b'),
        },
      },
      b: {
        name: 'Target',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
    },
  },
  {
    expectedClass: 'strictComparatorCycle',
    variables: {
      a: {
        name: 'Cycle A',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 2,
          greaterThanVariable: reference('b'),
        },
      },
      b: {
        name: 'Cycle B',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 2,
          greaterThanVariable: reference('a'),
        },
      },
    },
  },
  {
    expectedClass: 'sameAsGroupConflict',
    variables: {
      a: {
        name: 'Group A',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 3,
          sameAs: reference('b'),
          greaterThanVariable: reference('b'),
        },
      },
      b: {
        name: 'Group B',
        type: 'number',
        validation: { minValue: 0, maxValue: 3 },
      },
    },
  },
  {
    expectedClass: 'disjointBounds',
    variables: {
      a: {
        name: 'Lower range',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 1,
          greaterThanVariable: reference('b'),
        },
      },
      b: {
        name: 'Upper range',
        type: 'number',
        validation: { minValue: 2, maxValue: 3 },
      },
    },
  },
  {
    expectedClass: 'oddDifferentFromCycle',
    variables: {
      a: {
        name: 'Odd A',
        type: 'boolean',
        validation: { differentFrom: reference('b') },
      },
      b: {
        name: 'Odd B',
        type: 'boolean',
        validation: { differentFrom: reference('c') },
      },
      c: {
        name: 'Odd C',
        type: 'boolean',
        validation: { differentFrom: reference('a') },
      },
    },
  },
  {
    expectedClass: 'pinnedEqualDifferentFrom',
    variables: {
      a: {
        name: 'Pinned A',
        type: 'number',
        validation: {
          minValue: 1,
          maxValue: 1,
          differentFrom: reference('b'),
        },
      },
      b: {
        name: 'Pinned B',
        type: 'number',
        validation: { minValue: 1, maxValue: 1 },
      },
    },
  },
  {
    expectedClass: 'pinnedDifferentFromParity',
    variables: {
      a: {
        name: 'Parity A',
        type: 'ordinal',
        options: [option(1)],
        validation: { differentFrom: reference('b') },
      },
      b: {
        name: 'Parity B',
        type: 'ordinal',
        options: [option(1), option(2)],
      },
      c: {
        name: 'Parity C',
        type: 'ordinal',
        options: [option(2)],
        validation: { differentFrom: reference('b') },
      },
    },
  },
];

type WitnessStatus = 'unsat' | 'witness' | 'declined';

function witnessStatus(
  variables: Variables,
  contradiction: ValidationContradiction,
): WitnessStatus {
  // These classes are decided before the finite solver: sameAs contraction
  // erases self-conflicting edges, while categorical domain construction
  // clamps an impossible selection floor to the option count.
  if (
    contradiction.class === 'conflictingReferencePair' ||
    contradiction.class === 'minSelectedExceedsOptions' ||
    contradiction.class === 'sameAsGroupConflict'
  ) {
    return 'declined';
  }

  const entity = buildEntityConstraints(variables, TODAY);
  const { order, membersOf, groupOf } = resolveGenerationOrder(entity);
  const groups = intersectGroupConstraints(entity, membersOf);
  const edges = groupComparatorEdges(entity, groupOf);
  const propagated = propagateComparatorBounds(groups, order, edges).groups;
  const components = solvableComponents(
    propagated,
    order,
    edges,
    differentFromGroups(entity, groupOf),
  );
  const participantGroups = new Set(
    contradiction.variableIds.map((id) => groupOf.get(id) ?? id),
  );
  const component = components.find(({ groups: componentGroups }) =>
    [...participantGroups].every((group) => componentGroups.includes(group)),
  );
  if (component?.tractable === undefined) return 'declined';

  const verdict = solveComponent(component.tractable);
  if (verdict.kind === 'unknown') return 'declined';
  return verdict.kind === 'unsat' ? 'unsat' : 'witness';
}

describe('validation contradiction delegation conformance', () => {
  it('covers every structured contradiction class and refuses it in generation', () => {
    const covered = new Set<ValidationContradiction['class']>();

    for (const fixture of fixtures) {
      const contradictions = delegatedValidationContradictions(
        fixture.variables,
        new Set(),
      );
      expect(
        contradictions.map(
          ({ class: contradictionClass }) => contradictionClass,
        ),
      ).toContain(fixture.expectedClass);
      for (const contradiction of contradictions) {
        covered.add(contradiction.class);
      }

      const codebook: StructuralCodebook = {
        node: {
          person: {
            color: 'node-color-seq-1',
            variables: fixture.variables,
          },
        },
      };
      const conflicts = analyseFeasibility(codebook, [nameGenerator], config);
      for (const contradiction of contradictions) {
        expect(
          conflicts.some(
            ({ variableIds }) =>
              variableIds.toSorted().join(',') ===
              contradiction.variableIds.toSorted().join(','),
          ),
        ).toBe(true);
      }
    }

    expect([...covered].toSorted()).toEqual(
      [
        'conflictingReferencePair',
        'disjointBounds',
        'invertedBounds',
        'minSelectedExceedsOptions',
        'oddDifferentFromCycle',
        'pinnedDifferentFromParity',
        'pinnedEqualDifferentFrom',
        'sameAsGroupConflict',
        'strictComparatorCycle',
      ].toSorted(),
    );
  });

  it('finds no solver witness for every contradiction the finite solver can represent', () => {
    const statuses = fixtures.flatMap(({ variables }) =>
      delegatedValidationContradictions(variables, new Set()).map(
        (contradiction) => ({
          class: contradiction.class,
          status: witnessStatus(variables, contradiction),
        }),
      ),
    );

    expect(statuses.filter(({ status }) => status === 'witness')).toEqual([]);
    expect(
      statuses.filter(({ status }) => status === 'unsat').length,
    ).toBeGreaterThan(0);
    expect(statuses).toContainEqual({
      class: 'conflictingReferencePair',
      status: 'declined',
    });
    expect(statuses).toContainEqual({
      class: 'minSelectedExceedsOptions',
      status: 'declined',
    });
    expect(statuses).toContainEqual({
      class: 'sameAsGroupConflict',
      status: 'declined',
    });
  });

  it('records a mixed-resolution date search as declined, not confirmed', () => {
    const variables: Variables = {
      year: {
        name: 'Year',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2020', max: '2021' },
        validation: { greaterThanVariable: reference('day') },
      },
      day: {
        name: 'Day',
        type: 'datetime',
        component: 'DatePicker',
        parameters: {
          type: 'full',
          min: '2022-01-01',
          max: '2022-01-02',
        },
      },
    };
    const contradiction = delegatedValidationContradictions(
      variables,
      new Set(),
    ).find(
      ({ class: contradictionClass }) =>
        contradictionClass === 'disjointBounds',
    );

    expect(contradiction).toBeDefined();
    if (contradiction === undefined) return;
    expect(witnessStatus(variables, contradiction)).toBe('declined');
  });

  it('uses record-level Boolean domains until every stage occurrence is resolved', () => {
    const trueOnly = [{ label: 'Yes', value: true }];
    const choiceRendered: Variables = {
      a: {
        name: 'Choice A',
        type: 'boolean',
        component: 'Boolean',
        options: trueOnly,
        validation: { differentFrom: reference('b') },
      },
      b: {
        name: 'Choice B',
        type: 'boolean',
        component: 'Boolean',
        options: trueOnly,
      },
    };

    expect(
      findValidationContradictions(choiceRendered, {
        stageEffectiveComponents: true,
      }).map(({ class: contradictionClass }) => contradictionClass),
    ).toContain('pinnedEqualDifferentFrom');
    expect(
      delegatedValidationContradictions(choiceRendered, new Set()),
    ).toEqual([]);

    const toggleRendered = {
      a: {
        name: 'Choice A',
        type: 'boolean',
        component: 'Toggle',
        options: trueOnly,
        validation: { differentFrom: reference('b') },
      },
      b: {
        name: 'Choice B',
        type: 'boolean',
        component: 'Toggle',
        options: trueOnly,
      },
    };
    expect(
      findValidationContradictions(toggleRendered, {
        stageEffectiveComponents: true,
      }),
    ).toEqual([]);
  });

  it('reports delegated contradictions with researcher-facing names, not UUIDs', () => {
    const ageId = '11111111-1111-4111-8111-111111111111';
    const retiredId = '22222222-2222-4222-8222-222222222222';
    const variables: Variables = {
      [ageId]: {
        name: 'Age',
        type: 'number',
        validation: {
          minValue: 65,
          maxValue: 80,
          lessThanVariable: reference(retiredId),
        },
      },
      [retiredId]: {
        name: 'Retired at',
        type: 'number',
        validation: { minValue: 20, maxValue: 30 },
      },
    };
    const codebook: StructuralCodebook = {
      node: {
        person: {
          color: 'node-color-seq-1',
          variables,
        },
      },
    };

    const [conflict] = analyseFeasibility(codebook, [nameGenerator], config);
    expect(conflict?.variableNames.toSorted()).toEqual(['Age', 'Retired at']);
    expect(conflict?.reason).not.toContain(ageId);
    expect(conflict?.reason).not.toContain(retiredId);
  });
});
