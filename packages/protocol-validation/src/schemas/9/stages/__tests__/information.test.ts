import { describe, expect, it } from 'vitest';

import { testId } from '../../../../__tests__/testIds.ts';
import { localized } from '../../../../utils/test-utils.ts';
import { ProtocolSchemaV9 } from '../../schema.ts';
import { informationStage } from '../information.ts';

const egoRule = (id: string) => ({
  id,
  type: 'ego' as const,
  options: {
    attribute: testId('age'),
    operator: 'LESS_THAN' as const,
    value: 65,
  },
});

const stageWithRules = (ruleIds: readonly string[]) => ({
  id: testId('info'),
  type: 'Information' as const,
  label: localized('Welcome'),
  content: localized('Welcome to the study'),
  skipLogic: {
    action: 'SHOW' as const,
    filter: { join: 'AND' as const, rules: ruleIds.map(egoRule) },
  },
});

const duplicateIdPaths = (result: {
  readonly error?: {
    readonly issues: readonly {
      readonly path: readonly PropertyKey[];
      readonly params?: unknown;
    }[];
  };
}) =>
  (result.error?.issues ?? [])
    .filter(
      ({ params }) =>
        typeof params === 'object' &&
        params !== null &&
        Reflect.get(params, 'rule') === 'duplicateObjectId',
    )
    .map(({ path }) => path.join('.'));

describe('Information stage object ids', () => {
  it('accepts skip logic rules with different ids', () => {
    const result = informationStage.safeParse(
      stageWithRules([testId('rule-a'), testId('rule-b')]),
    );
    expect(duplicateIdPaths(result)).toEqual([]);
  });

  it('refuses two skip logic rules that share an id', () => {
    const result = informationStage.safeParse(
      stageWithRules([testId('rule-a'), testId('rule-a')]),
    );
    expect(duplicateIdPaths(result)).toEqual([
      'skipLogic.filter.rules.0.id',
      'skipLogic.filter.rules.1.id',
    ]);
  });

  it('refuses the same duplicate in a whole protocol, once at each place', () => {
    const result = ProtocolSchemaV9.safeParse({
      schemaVersion: 9,
      codebook: {},
      stages: [stageWithRules([testId('rule-a'), testId('rule-a')])],
    });
    expect(duplicateIdPaths(result)).toEqual([
      'stages.0.skipLogic.filter.rules.0.id',
      'stages.0.skipLogic.filter.rules.1.id',
    ]);
  });
});
