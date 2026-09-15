import type { z } from 'zod';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';

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
 * `code` is the validator's, and stays a plain string because the editor
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

/**
 * Whole sentences, one per code, rather than a frame and a clause.
 *
 * The English reads as `${fieldLabel} holds the wrong kind of value.`, and it
 * would be tempting to keep the clause on its own and glue the label in front
 * of it. ICU has no way to express that, and a language that puts the subject
 * elsewhere — or inflects the verb for it — cannot get there from a fragment
 * whose position is decided by the English. So the label is a placeholder
 * INSIDE each sentence, and a translator moves it.
 *
 * Every sentence is also still different from every other and from
 * `unrecognised`, which is what lets `schemaProblems.test.ts` prove that every
 * code the validator can produce has copy of its own here.
 */
const stageMessages = defineMessages({
  invalidType: {
    id: 'protocolBuilder.schemaProblem.invalidType',
    defaultMessage: '{fieldLabel} holds the wrong kind of value.',
    description:
      'Shown beside one section of a stage editor (a stage is one step of an interview) when the protocol refuses what a control holds. fieldLabel is the control’s own name, already in the reader’s language, and starts the sentence.',
  },
  invalidValue: {
    id: 'protocolBuilder.schemaProblem.invalidValue',
    defaultMessage: '{fieldLabel} holds a value this stage does not offer.',
    description:
      'Shown beside one section of a stage editor when a control holds something that is not one of the choices this kind of stage allows. fieldLabel is the control’s own name and starts the sentence.',
  },
  invalidFormat: {
    id: 'protocolBuilder.schemaProblem.invalidFormat',
    defaultMessage: '{fieldLabel} is not written the way this stage needs it.',
    description:
      'Shown beside one section of a stage editor when a control holds text of the right kind in the wrong shape — a date, an identifier, a pattern. fieldLabel is the control’s own name and starts the sentence.',
  },
  invalidUnion: {
    id: 'protocolBuilder.schemaProblem.invalidUnion',
    defaultMessage:
      '{fieldLabel} holds a value that fits none of the forms this stage accepts.',
    description:
      'Shown beside one section of a stage editor when a control holds something matching none of the several shapes the stage allows there. fieldLabel is the control’s own name and starts the sentence.',
  },
  tooBig: {
    id: 'protocolBuilder.schemaProblem.tooBig',
    defaultMessage: '{fieldLabel} holds more than this stage allows.',
    description:
      'Shown beside one section of a stage editor when a control holds too many items, too much text, or a number above the limit. fieldLabel is the control’s own name and starts the sentence.',
  },
  tooSmall: {
    id: 'protocolBuilder.schemaProblem.tooSmall',
    defaultMessage: '{fieldLabel} holds less than this stage needs.',
    description:
      'Shown beside one section of a stage editor when a control holds too few items, too little text, or a number below the limit. fieldLabel is the control’s own name and starts the sentence.',
  },
  notMultipleOf: {
    id: 'protocolBuilder.schemaProblem.notMultipleOf',
    defaultMessage:
      '{fieldLabel} holds a number that is not one of the steps this stage allows.',
    description:
      'Shown beside one section of a stage editor when a number has to be a multiple of some step and is not. fieldLabel is the control’s own name and starts the sentence.',
  },
  unrecognizedKeys: {
    id: 'protocolBuilder.schemaProblem.unrecognizedKeys',
    defaultMessage: '{fieldLabel} holds settings this stage does not have.',
    description:
      'Shown beside one section of a stage editor when the saved stage carries settings this kind of stage knows nothing about — usually a stage imported from an older or newer protocol. fieldLabel is the control’s own name and starts the sentence.',
  },
  invalidKey: {
    id: 'protocolBuilder.schemaProblem.invalidKey',
    defaultMessage:
      '{fieldLabel} holds an entry named something this stage cannot use.',
    description:
      'Shown beside one section of a stage editor when one entry of a keyed collection is named in a way the stage refuses. fieldLabel is the control’s own name and starts the sentence.',
  },
  invalidElement: {
    id: 'protocolBuilder.schemaProblem.invalidElement',
    defaultMessage: '{fieldLabel} holds an entry this stage cannot use.',
    description:
      'Shown beside one section of a stage editor when one entry of a collection is not something the stage accepts. fieldLabel is the control’s own name and starts the sentence.',
  },
  nothingThere: {
    id: 'protocolBuilder.schemaProblem.nothingThere',
    defaultMessage: '{fieldLabel} has no value, and this stage needs one.',
    description:
      'Shown beside one section of a stage editor when a value the stage requires is simply not there. Said for every refusal about an empty value, whatever code the validator reached for. fieldLabel is the control’s own name and starts the sentence.',
  },
  unrecognised: {
    id: 'protocolBuilder.schemaProblem.unrecognised',
    defaultMessage: '{fieldLabel} holds something this stage cannot use.',
    description:
      'Last resort, shown beside one section of a stage editor when a refusal arrives from a validator this editor has no words for. fieldLabel is the control’s own name and starts the sentence.',
  },
});

type SchemaProblemCopy =
  /**
   * Words written here, because the validator's own describe a shape: expected
   * a string, too small, not a member of this union. A researcher is authoring
   * an interview, not holding the schema, and none of that is a sentence they
   * can act on.
   */
  | Readonly<{ kind: 'authored'; sentence: MessageDescriptor }>
  /**
   * The validator's own message, kept whole. `custom` is the code every
   * cross-reference rule in the protocol schema raises — a rule naming a
   * deleted attribute, a stage using a resource the protocol does not have —
   * and those messages are already written about this protocol, in words that
   * name the thing that is wrong. Replacing them with a sentence about "a
   * value" would throw away the only part a researcher can act on.
   */
  | Readonly<{ kind: 'theValidatorsOwn' }>;

const authored = (sentence: MessageDescriptor): SchemaProblemCopy =>
  Object.freeze({ kind: 'authored' as const, sentence });

/**
 * What each kind of refusal is called in the editor's own words, one entry per
 * code, the way `RULE_PROBLEM_SUMMARIES` covers every way a filter rule can be
 * wrong.
 *
 * Each sentence names the field's label — "Node type holds the wrong kind of
 * value" — so the researcher is told which control to open as well as what is
 * wrong with it.
 */
const SCHEMA_PROBLEM_COPY: Readonly<
  Record<SchemaIssueCode, SchemaProblemCopy>
> = Object.freeze({
  invalid_type: authored(stageMessages.invalidType),
  invalid_value: authored(stageMessages.invalidValue),
  invalid_format: authored(stageMessages.invalidFormat),
  invalid_union: authored(stageMessages.invalidUnion),
  too_big: authored(stageMessages.tooBig),
  too_small: authored(stageMessages.tooSmall),
  not_multiple_of: authored(stageMessages.notMultipleOf),
  unrecognized_keys: authored(stageMessages.unrecognizedKeys),
  invalid_key: authored(stageMessages.invalidKey),
  invalid_element: authored(stageMessages.invalidElement),
  custom: Object.freeze({ kind: 'theValidatorsOwn' as const }),
});

/**
 * The same record, read by a code the type system cannot vouch for.
 *
 * Issues arrive from more than one validator, so a code arrives
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
 *
 * Encoded rather than formatted: this runs in `SectionOutlineStore`, which has
 * no reader and no language, and its answer is held on the outline snapshot
 * until something replaces it. The host that renders the section list decodes
 * it where it is read, so a problem already on screen follows a change of
 * language — and a host's own
 * plain sentence, or the validator's under `custom`, passes straight through
 * the same `formatMessageError(text, intl) ?? text`.
 *
 * The code is asked FIRST, and emptiness only afterwards. A message written
 * about this protocol outranks the fact that the value it was raised at is
 * missing — for the cross-reference rules that report at an absent key by
 * construction, that fact is the very thing the message explains.
 */
export function schemaProblemSentence(
  problem: SchemaProblem,
  fieldLabel: string,
): string {
  const copy = COPY_BY_CODE.get(problem.code);
  if (copy?.kind === 'theValidatorsOwn') return problem.message;
  const sentence = problem.absent
    ? stageMessages.nothingThere
    : (copy?.sentence ?? stageMessages.unrecognised);
  return createMessageError(sentence, { fieldLabel });
}
