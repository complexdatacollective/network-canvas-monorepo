import type { z } from 'zod';

/**
 * Every code the protocol schema's validator can put on an issue.
 *
 * Taken from the validator's own union rather than listed here, so upgrading it
 * cannot quietly introduce a fault nobody has written words for: the copy below
 * is total over this type, and a new code stops the build rather than reaching
 * a researcher as whatever the validator happened to say.
 */
export type SchemaIssueCode = z.core.$ZodIssue['code'];

/**
 * One thing the protocol schema refuses about a stage, as the outline needs to
 * read it.
 *
 * `code` is the validator's, and stays a plain string because the session
 * carries issues from more than one validator. `absent` is the question the
 * code cannot answer on its own: the finalised issue keeps no record of what it
 * was given, so whether the fault is "this is wrong" or "there is nothing here"
 * is settled against the draft the validator judged.
 */
export type SchemaProblem = Readonly<{
  code: string;
  /** The validator's own words. Shown only where they were written for a researcher. */
  message: string;
  /** The draft holds nothing at this path, so the fault is that it is missing. */
  absent: boolean;
}>;

type SchemaProblemCopy =
  /**
   * Words written here, because the validator's own describe a shape: expected
   * a string, too small, not a member of this union. A researcher is authoring
   * an interview, not holding the schema, and none of that is a sentence they
   * can act on.
   */
  | Readonly<{ kind: 'authored'; sentence: string }>
  /**
   * The validator's own message, kept whole. `custom` is the code every
   * cross-reference rule in the protocol schema raises — a rule naming a
   * deleted attribute, a stage using a resource the protocol does not have —
   * and those messages are already written about this protocol, in words that
   * name the thing that is wrong. Replacing them with a sentence about "a
   * value" would throw away the only part a researcher can act on.
   */
  | Readonly<{ kind: 'theValidatorsOwn' }>;

const authored = (sentence: string): SchemaProblemCopy =>
  Object.freeze({ kind: 'authored' as const, sentence });

/**
 * What each kind of refusal is called in the editor's own words, one entry per
 * code, the way `RULE_PROBLEM_SUMMARIES` covers every way a filter rule can be
 * wrong.
 *
 * Each sentence completes the field's label — "Node type holds the wrong kind
 * of value" — so the researcher is told which control to open as well as what
 * is wrong with it. They are also all different from one another and from
 * `UNRECOGNISED`, which is what lets a test prove that every code the
 * validator can produce has copy of its own here.
 */
const SCHEMA_PROBLEM_COPY: Readonly<
  Record<SchemaIssueCode, SchemaProblemCopy>
> = Object.freeze({
  invalid_type: authored('holds the wrong kind of value.'),
  invalid_value: authored('holds a value this stage does not offer.'),
  invalid_format: authored('is not written the way this stage needs it.'),
  invalid_union: authored(
    'holds a value that fits none of the forms this stage accepts.',
  ),
  too_big: authored('holds more than this stage allows.'),
  too_small: authored('holds less than this stage needs.'),
  not_multiple_of: authored(
    'holds a number that is not one of the steps this stage allows.',
  ),
  unrecognized_keys: authored('holds settings this stage does not have.'),
  invalid_key: authored(
    'holds an entry named something this stage cannot use.',
  ),
  invalid_element: authored('holds an entry this stage cannot use.'),
  custom: Object.freeze({ kind: 'theValidatorsOwn' as const }),
});

/**
 * A value that is simply not there, whatever code the validator reached for.
 *
 * Said the same way for every code because it is the same fact each time, and
 * because the code a validator picks for an absent value is its own business:
 * a missing key is `invalid_type` today and could be anything tomorrow.
 */
const NOTHING_THERE = 'has no value, and this stage needs one.';

/**
 * A refusal from a validator this package has no copy for. Never reached while
 * the protocol schema is the only source of issues — the record above is total
 * over its codes — and deliberately not the validator's own message, because
 * the whole point of that record is that a researcher never reads one.
 */
const UNRECOGNISED = 'holds something this stage cannot use.';

/**
 * The same record, read by a code the type system cannot vouch for.
 *
 * The session carries issues from more than one validator, so a code arrives
 * here as a plain string. A map keyed by string answers that question without
 * asserting the string INTO the union, which would let an unknown code read an
 * entry that is not there and hand back `undefined` as if it were copy.
 */
const COPY_BY_CODE: ReadonlyMap<string, SchemaProblemCopy> = new Map(
  Object.entries(SCHEMA_PROBLEM_COPY),
);

/**
 * What the outline says about one schema problem, in the vocabulary of the
 * stage being edited.
 *
 * `fieldLabel` is the name the control gives itself, so the sentence names the
 * place to go as well as the fault. Not used for `custom`, whose message is a
 * whole sentence of its own about a named thing.
 */
export function schemaProblemSentence(
  problem: SchemaProblem,
  fieldLabel: string,
): string {
  if (problem.absent) return `${fieldLabel} ${NOTHING_THERE}`;
  const copy = COPY_BY_CODE.get(problem.code);
  if (copy === undefined) return `${fieldLabel} ${UNRECOGNISED}`;
  return copy.kind === 'theValidatorsOwn'
    ? problem.message
    : `${fieldLabel} ${copy.sentence}`;
}
