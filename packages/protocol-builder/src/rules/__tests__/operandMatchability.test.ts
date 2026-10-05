import { describe, expect, it } from 'vitest';

import { predicate } from '@codaco/network-query';
/**
 * What the editor says about a stored rule, against what the interview would
 * actually do with it.
 *
 * Every other test in this directory asserts the editor against itself. This
 * one asserts it against `@codaco/network-query`'s `predicate` — the function
 * the interview runs for every participant — over the whole
 * (attribute type × operator × stored operand) space the protocol schema
 * accepts. It is the standing guard on the ruling behind issue #1548, in both
 * directions:
 *
 * - the editor must never refuse a rule some answer CAN match, because a rule
 *   that works is not the researcher's to fix;
 * - the editor must report every rule NO answer can match, because nothing
 *   downstream of it will: the schema checks the shape of an operand and stops
 *   there on purpose, and the interview compares whatever it is given.
 */
import {
  AllOperators,
  type Codebook,
  type FilterOperator,
  filterRuleSchema,
  OperatorsByVariableType,
  type VariableType,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

import { operandRequirement, operatorsForSubject } from '../operators.ts';
import { describeRule } from '../ruleDescription.ts';

const OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
];

/** One attribute of the type under test, on one node type. */
const codebookFor = (type: VariableType): Codebook =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          v: {
            name: 'V',
            type,
            ...(type === 'categorical' || type === 'ordinal'
              ? { options: OPTIONS }
              : {}),
            ...(type === 'datetime'
              ? { component: 'DatePicker', parameters: { type: 'full' } }
              : {}),
          },
        },
      },
    },
  }) as unknown as Codebook;

/**
 * Every answer a participant could record for an attribute of this type, plus
 * the operand itself wherever the attribute's own answers could hold it.
 *
 * Injecting the operand is what keeps a cell from being called unmatchable
 * merely because a fixed sample happened not to contain the value being
 * compared against. It is injected only where an ANSWER could really be that
 * value: not for the option-bearing types, whose answers are drawn from the
 * authored options, not for a date unless it is one the picker's resolution
 * records, and not for a scalar unless it is on the 0-1 scale a scalar is read
 * on.
 */
const answersFor = (type: VariableType, operand: unknown): unknown[] => {
  const base: Record<VariableType, unknown[]> = {
    boolean: [true, false, null],
    number: [0, 1, 2, 3, -5, 0.5, 3.5, 100, -100, null],
    scalar: [0, 0.25, 0.5, 0.75, 1, null],
    text: ['', 'a', 'abc', 'low', 'Low', null],
    datetime: ['2020-01-15', '2021-06-30', '1999-12-31', null],
    ordinal: ['low', 'high', null],
    categorical: [[], ['low'], ['high'], ['low', 'high'], null],
    location: ['somewhere', 'Low', 'abc', null],
    layout: [{ x: 0.5, y: 0.5 }, null],
  } as unknown as Record<VariableType, unknown[]>;
  const answers = [...base[type]];
  if (type === 'number') {
    if (typeof operand === 'number') answers.push(operand);
  } else if (type === 'scalar') {
    if (typeof operand === 'number' && operand >= 0 && operand <= 1) {
      answers.push(operand);
    }
  } else if (type === 'text' || type === 'location') {
    if (typeof operand === 'string') answers.push(operand);
  } else if (type === 'datetime') {
    if (typeof operand === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(operand)) {
      answers.push(operand);
    }
  } else if (type === 'boolean') {
    if (typeof operand === 'boolean') answers.push(operand);
  }
  return answers;
};

const canMatch = (
  type: VariableType,
  operator: FilterOperator,
  operand: unknown,
): boolean =>
  answersFor(type, operand).some((answer) =>
    predicate(operator)({ value: answer, other: operand }),
  );

const ruleFor = (operator: string, value: unknown) => ({
  type: 'node' as const,
  id: 'r1',
  options: { type: 'person', attribute: 'v', operator, value },
});

/** Everything the editor finds wrong with this rule. */
const problemCodes = (
  type: VariableType,
  operator: string,
  value: unknown,
): string[] =>
  describeRule({
    rule: ruleFor(operator, value),
    codebook: codebookFor(type),
  }).problems.map((problem) => problem.code);

const OPERANDS: readonly unknown[] = [
  true,
  false,
  0,
  1,
  2,
  3,
  3.5,
  -5,
  '',
  'abc',
  'low',
  'Low',
  '2020-01-15',
  '2020',
  ['low'],
  ['low', 'high'],
  [],
];

type Cell = Readonly<{
  type: VariableType;
  operator: FilterOperator;
  operand: unknown;
  codes: readonly string[];
}>;

const describeCell = (cell: Cell) =>
  `${cell.type} ${cell.operator} operand=${JSON.stringify(cell.operand)} problems=[${cell.codes.join(',')}]`;

/**
 * The one refusal the editor makes of a rule the interview could match.
 *
 * The schema requires a NUMBER beside a relational operator whatever the
 * attribute is, and the interview resolves a date answer to its timestamp — so
 * `born is greater than 0` matches every date after 1970, and a year-recorded
 * attribute compared against `1990` matches every later year. The editor
 * refuses both, because it has no control that could express either: a number
 * box beside a date attribute would ask the researcher for an epoch
 * millisecond. Its message says the operand is the wrong kind of value for the
 * attribute's type, which is true, and does not claim the rule cannot match.
 *
 * Carved out here rather than left out of the sweep, so that this is the ONLY
 * such refusal and a new one arrives as a failure.
 */
const isRelationalDateComparison = (cell: Cell) =>
  cell.type === 'datetime' &&
  (cell.operator === 'GREATER_THAN' ||
    cell.operator === 'GREATER_THAN_OR_EQUAL' ||
    cell.operator === 'LESS_THAN' ||
    cell.operator === 'LESS_THAN_OR_EQUAL');

/**
 * The operators that are TRUE when the comparison FAILS.
 *
 * "Some answer matches it" proves nothing about a rule built on one of these:
 * an operand of a kind the attribute could never be compared against fails
 * every comparison, so the rule matches every participant. That is not a rule
 * worth protecting from the editor's refusal, so these are left out of the
 * first direction. The second direction still covers them — a negating rule
 * that matches NOTHING would still have to be reported.
 */
const NEGATING: ReadonlySet<string> = new Set([
  'NOT',
  'NOT_EXISTS',
  'EXCLUDES',
  'DOES_NOT_CONTAIN',
  'OPTIONS_NOT_EQUALS',
]);

describe('the editor’s verdict against the interview’s predicate', () => {
  /**
   * Every (type, operator, operand) the protocol schema accepts, in both
   * directions at once: no refusal of something matchable, no silence about
   * something unmatchable.
   */
  it('refuses nothing that can match, and reports everything that cannot', () => {
    const refusedButMatchable: Cell[] = [];
    const acceptedButUnmatchable: Cell[] = [];

    for (const type of VariableTypesKeys) {
      for (const operator of AllOperators.options) {
        // The schema refuses an operator its own table does not allow for this
        // type, so such a rule cannot be stored and is not this test's
        // business.
        if (!OperatorsByVariableType[type]?.includes(operator)) continue;

        for (const operand of OPERANDS) {
          const rule = ruleFor(operator, operand);
          if (!filterRuleSchema.safeParse(rule).success) continue;

          const codes = problemCodes(type, operator, operand);
          const cell: Cell = { type, operator, operand, codes };
          const matches = canMatch(type, operator, operand);
          // A rule that was never finished is reported for that and nothing
          // else is owed about it, so `incomplete` on its own is not a
          // refusal of the comparison.
          const refusals = codes.filter((code) => code !== 'incomplete');
          if (refusals.length > 0 && matches && !NEGATING.has(operator)) {
            refusedButMatchable.push(cell);
          }
          if (codes.length === 0 && !matches) acceptedButUnmatchable.push(cell);
        }
      }
    }

    expect(
      refusedButMatchable
        .filter((cell) => !isRelationalDateComparison(cell))
        .map(describeCell),
    ).toEqual([]);
    expect(acceptedButUnmatchable.map(describeCell)).toEqual([]);
  });

  /**
   * The same question asked of the controls rather than of stored protocols:
   * every operator the editor OFFERS, entered with a value its own control
   * would accept, has to produce a rule that can match — or one the editor
   * refuses before it is committed.
   *
   * A number control is sampled inside the bounds the operand carries, because
   * those bounds are what the researcher can enter: a count of selected
   * options cannot exceed the options there are to select, and a scalar
   * reading is on a 0-1 scale.
   */
  it('offers no control whose values match nothing', () => {
    const offeredButUnmatchable: string[] = [];

    for (const type of VariableTypesKeys) {
      for (const operator of operatorsForSubject(type)) {
        const requirement = operandRequirement(type, operator);
        if (requirement === undefined || requirement.kind === 'none') continue;

        const numbers =
          type === 'categorical'
            ? [0, 1, 2]
            : type === 'scalar'
              ? [0, 0.5, 1]
              : [0, 1, 2, 3];
        const samples: unknown[] =
          requirement.control === 'boolean'
            ? [true, false]
            : requirement.control === 'wholeNumber'
              ? numbers
              : requirement.control === 'decimalNumber'
                ? numbers
                : requirement.control === 'date'
                  ? ['2020-01-15']
                  : requirement.control === 'option'
                    ? ['low']
                    : requirement.control === 'optionList'
                      ? [['low'], ['low', 'high']]
                      : ['abc'];

        for (const sample of samples) {
          // A value the editor refuses is a value it cannot commit, so it is
          // not something it offers.
          if (problemCodes(type, operator, sample).length > 0) continue;
          if (canMatch(type, operator, sample)) continue;
          offeredButUnmatchable.push(
            `${type} ${operator} ${JSON.stringify(sample)} (control ${requirement.control})`,
          );
        }
      }
    }

    expect(offeredButUnmatchable).toEqual([]);
  });
});

/**
 * The comparison the codebook bounds by counting, stated case by case.
 *
 * A categorical attribute offering two options can only ever have 0, 1 or 2 of
 * them selected, so a rule naming any other count is one no participant can
 * satisfy — and until this was reported, nothing said so: the schema accepts
 * the rule (a count is a whole number, which is all it asks), and the
 * interview's `optionsLength` simply counts the stored array.
 */
describe('a selected-option count no answer can reach', () => {
  const twoOptionCodebook = codebookFor('categorical');

  it.each([
    ['OPTIONS_GREATER_THAN', 2],
    ['OPTIONS_GREATER_THAN', 5],
    ['OPTIONS_EQUALS', 3],
    ['OPTIONS_LESS_THAN', 0],
  ])('reports %s %d', (operator, value) => {
    // The protocol schema accepts it, so the builder is the only place it can
    // be caught.
    expect(filterRuleSchema.safeParse(ruleFor(operator, value)).success).toBe(
      true,
    );
    expect(canMatch('categorical', operator as FilterOperator, value)).toBe(
      false,
    );
    expect(
      describeRule({
        rule: ruleFor(operator, value),
        codebook: twoOptionCodebook,
      }).problems.map((problem) => problem.code),
    ).toEqual(['unusableNumber']);
  });

  it.each([
    ['OPTIONS_GREATER_THAN', 1],
    ['OPTIONS_EQUALS', 0],
    ['OPTIONS_EQUALS', 2],
    ['OPTIONS_LESS_THAN', 1],
    // Satisfied by every answer that is not the count it names, so a count out
    // of reach makes it match everything rather than nothing.
    ['OPTIONS_NOT_EQUALS', 7],
  ])('says nothing about %s %d, which can match', (operator, value) => {
    expect(canMatch('categorical', operator as FilterOperator, value)).toBe(
      true,
    );
    expect(
      describeRule({
        rule: ruleFor(operator, value),
        codebook: twoOptionCodebook,
      }).problems,
    ).toEqual([]);
  });
});

/**
 * The other comparison the codebook bounds, this one by the type itself: a
 * scalar answer is a reading on a normalised 0-1 scale, so a rule naming a
 * number off that scale compares against nothing a participant can record.
 */
describe('a scalar reading no answer can reach', () => {
  const scalarCodebook = codebookFor('scalar');

  it.each([
    ['GREATER_THAN', 1],
    ['GREATER_THAN', 3.5],
    ['GREATER_THAN_OR_EQUAL', 2],
    ['LESS_THAN', 0],
    ['LESS_THAN', -5],
    ['LESS_THAN_OR_EQUAL', -5],
    ['EXACTLY', 3],
  ])('reports %s %d', (operator, value) => {
    expect(filterRuleSchema.safeParse(ruleFor(operator, value)).success).toBe(
      true,
    );
    expect(
      describeRule({
        rule: ruleFor(operator, value),
        codebook: scalarCodebook,
      }).problems.map((problem) => problem.code),
    ).toEqual(['unusableNumber']);
  });

  it.each([
    ['GREATER_THAN', 0],
    ['GREATER_THAN', 0.5],
    ['GREATER_THAN_OR_EQUAL', 1],
    ['LESS_THAN', 1],
    ['LESS_THAN_OR_EQUAL', 0],
    ['EXACTLY', 0.25],
    // Negating, so a reading off the scale makes it match every answer.
    ['NOT', 5],
  ])('says nothing about %s %d, which can match', (operator, value) => {
    expect(canMatch('scalar', operator as FilterOperator, value)).toBe(true);
    expect(
      describeRule({ rule: ruleFor(operator, value), codebook: scalarCodebook })
        .problems,
    ).toEqual([]);
  });
});
