import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../../__tests__/schemaIssues.ts';
import { testId } from '../../../../__tests__/testIds.ts';
import { createBaseProtocol } from '../../../../utils/test-utils.ts';
import { ProtocolSchemaV9 } from '../../schema.ts';
import {
  filterRuleSchema,
  FilterSchema,
  type FilterOperator,
} from '../filter.ts';

/**
 * What a rule's operand may be is asked of the rule schema itself, not only of
 * the whole protocol.
 *
 * `FilterSchema`, `filterRuleSchema` and `filterValueSchema` are part of this
 * package's published surface, and a host validating a filter through them —
 * rather than through `CurrentProtocolSchema` — used to be told a fractional
 * count was fine: the integer constraint for the four operators that COUNT
 * selected options lived only in the protocol schema's own cross-reference
 * pass. These hold the exported schema to the same statement the operand table
 * makes.
 */

const countRule = (value: unknown) => ({
  id: testId('rule-1'),
  type: 'node' as const,
  options: {
    type: 'person',
    attribute: 'mood',
    operator: 'OPTIONS_EQUALS' as FilterOperator,
    value,
  },
});

const filterOf = (rule: unknown) => ({ rules: [rule] });

describe('the operand a filter rule compares against', () => {
  it('refuses a fractional count of selected options', () => {
    const result = FilterSchema.safeParse(filterOf(countRule(1.5)));

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) =>
      candidate.message.includes(
        'Operator "OPTIONS_EQUALS" requires a whole number of options, but got 1.5',
      ),
    );
    expect(issue).toBeDefined();
    expect(issue?.path).toEqual(['rules', 0, 'options', 'value']);
  });

  it('accepts a whole count of selected options', () => {
    expect(FilterSchema.safeParse(filterOf(countRule(2))).success).toBe(true);
  });

  it('refuses a count that is not a number at all', () => {
    const result = filterRuleSchema.safeParse(countRule('2'));

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) =>
        issue.message.includes(
          'Operator "OPTIONS_EQUALS" requires a numeric value (count), but got string',
        ),
      ),
    ).toBe(true);
  });

  it('accepts a fraction where the comparison is against a number, not a count', () => {
    // A scalar attribute records a normalised 0-1 reading, and a number
    // attribute may hold any quantity a study measures: an integer-only
    // operand would leave `closeness > 0.5` inexpressible.
    const result = filterRuleSchema.safeParse({
      id: testId('rule-1'),
      type: 'node',
      options: {
        type: 'person',
        attribute: 'closeness',
        operator: 'GREATER_THAN',
        value: 0.5,
      },
    });

    expect(result.success).toBe(true);
  });

  it('leaves an option-bearing operand to the editor, shape and all', () => {
    // The ruling on issue #1548: whether an operand is still one of the
    // options its attribute authored is an editor question, so the schema asks
    // only what shape the value has. A list of option values parses whether or
    // not those options still exist.
    const result = filterRuleSchema.safeParse({
      id: testId('rule-1'),
      type: 'node',
      options: {
        type: 'person',
        attribute: 'mood',
        operator: 'INCLUDES',
        value: ['retired'],
      },
    });

    expect(result.success).toBe(true);
  });

  it('reports a refused operand through a filter that names a join', () => {
    // The reason a rule is refused has to survive the filter it sits in. Both
    // of the shapes a filter used to be allowed to take matched this one, so
    // both failed on the rule — and the two failures were reported as a single
    // "Invalid input" against the whole filter, with the reason discarded.
    const result = FilterSchema.safeParse({
      join: 'OR',
      rules: [countRule(1.5)],
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.map((issue) => [issue.message, issue.path]),
    ).toContainEqual([
      'Operator "OPTIONS_EQUALS" requires a whole number of options, but got 1.5',
      ['rules', 0, 'options', 'value'],
    ]);
  });

  it('asks nothing of a presence rule, which compares no operand', () => {
    const result = filterRuleSchema.safeParse({
      id: testId('rule-1'),
      type: 'node',
      options: { type: 'person', operator: 'EXISTS' },
    });

    expect(result.success).toBe(true);
  });
});

describe('how the rules in a filter combine', () => {
  const presenceRule = (id: string) => ({
    id: testId(id),
    type: 'node' as const,
    options: { type: 'person', operator: 'EXISTS' as FilterOperator },
  });

  it('lets a lone rule stand without a join', () => {
    expect(
      FilterSchema.safeParse({ rules: [presenceRule('rule-1')] }).success,
    ).toBe(true);
  });

  it('refuses two rules that never said how they combine', () => {
    const result = FilterSchema.safeParse({
      rules: [presenceRule('rule-1'), presenceRule('rule-2')],
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.map((issue) => [issue.message, issue.path]),
    ).toContainEqual([
      'A filter with more than one rule must say how they combine, with a join of "AND" or "OR".',
      ['join'],
    ]);
  });

  it('refuses a filter with no rules at all', () => {
    expect(
      parseIssues(FilterSchema.safeParse({ join: 'AND', rules: [] })),
    ).toEqual([{ path: 'rules', code: 'too_small' }]);
  });
});

describe('a node rule naming a layout', () => {
  // The base protocol's Sociogram places people in `layoutPosition`; the rule
  // asks it of the stage's skip logic.
  const withLayoutRule = (options: Record<string, unknown>) => {
    const protocol = createBaseProtocol();
    return withFinishStage({
      ...protocol,
      stages: protocol.stages.map((stage) =>
        stage.type === 'Sociogram'
          ? {
              ...stage,
              skipLogic: {
                action: 'SHOW',
                filter: {
                  rules: [
                    {
                      id: testId('layout-rule'),
                      type: 'node',
                      options: { attribute: 'layoutPosition', ...options },
                    },
                  ],
                },
              },
            }
          : stage,
      ),
    });
  };
  const sociogramIndex = createBaseProtocol().stages.findIndex(
    ({ type }) => type === 'Sociogram',
  );
  const optionsPath = `stages.${sociogramIndex}.skipLogic.filter.rules.0.options`;

  it('accepts a node rule naming a layout on any node type', () => {
    for (const type of ['person', 'colleague']) {
      for (const operator of ['EXISTS', 'NOT_EXISTS']) {
        expect({
          type,
          operator,
          issues: parseIssues(
            ProtocolSchemaV9.safeParse(withLayoutRule({ type, operator })),
          ),
        }).toEqual({ type, operator, issues: [] });
      }
    }
  });

  it('rejects a node rule naming an unknown layout', () => {
    expect(
      parseIssues(
        ProtocolSchemaV9.safeParse(
          withLayoutRule({
            type: 'person',
            attribute: 'elsewhere',
            operator: 'EXISTS',
          }),
        ),
      ),
    ).toEqual([
      {
        path: `${optionsPath}.attribute`,
        code: 'custom',
        message: '"elsewhere" is not a valid attribute ID',
      },
    ]);
  });

  it('rejects a layout rule with an operator outside LAYOUT_RULE_OPERATORS', () => {
    expect(
      parseIssues(
        ProtocolSchemaV9.safeParse(
          withLayoutRule({
            type: 'person',
            operator: 'GREATER_THAN',
            value: 1,
          }),
        ),
      ),
    ).toEqual([
      {
        path: `${optionsPath}.operator`,
        code: 'custom',
        message:
          'Operator "GREATER_THAN" is not valid for a layout. Valid operators: EXISTS, NOT_EXISTS, EXACTLY, NOT',
      },
    ]);
  });
});
