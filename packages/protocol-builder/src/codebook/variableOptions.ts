import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { ComponentTypes, VariableTypes } from '@codaco/protocol-validation';

const messages = defineMessages({
  unnamedAnswer: {
    id: 'protocolBuilder.codebookVariable.unnamedBooleanAnswer',
    defaultMessage:
      'Write what this answer says, or clear both to offer Yes and No.',
    description:
      'Refusal shown under one of the two answers of a yes/no attribute when it has been left blank while the other is written. Clearing both is a real answer: an attribute that names neither is offered to the participant as Yes and No.',
  },
  repeatedAnswer: {
    id: 'protocolBuilder.codebookVariable.repeatedBooleanAnswer',
    defaultMessage:
      'Give this answer different words: two buttons saying the same thing cannot be told apart.',
    description:
      'Refusal shown under the second of the two answers of a yes/no attribute when both have been given the same words, which leaves the participant two buttons they cannot tell apart.',
  },
});

/**
 * The list of answers an attribute offers, as the protocol schema shapes them.
 *
 * Two different lists live under the same `options` key. A categorical or
 * ordinal attribute holds as many answers as the researcher writes, each with a
 * stored value of its own and at least two of them
 * (`categoricalOptionsSchema`). A boolean is written as two, and their values
 * are the two booleans rather than anything the researcher chooses
 * (`booleanOptionsSchema`) — what is authored is the words on them, and which
 * of the two is shown as the negative answer. A pair recording one of each is
 * the shape this editor writes rather than one the schema holds it to, and
 * `heldBooleanAnswersReason` is where the difference is dealt with.
 *
 * So the shape is not a property of the key: it is decided by the attribute,
 * the way a `ParameterShape` is decided by the control — and the two lists are
 * not portable between attributes that hold them.
 */
export type OptionsShape = 'choice' | 'boolean';

/**
 * Which list this attribute holds, or `null` for one that holds none.
 *
 * A categorical or ordinal attribute is decided by its type alone: every
 * control either kind can be rendered with reads the same list. A boolean is
 * decided by the CONTROL, because the schema splits boolean into two variable
 * schemas keyed on it — `Boolean`, the control that makes a participant choose
 * between two named answers, takes the pair; `Toggle`, a switch that is on or
 * off, is a strict schema with no `options` key at all, so a boolean carrying
 * both is refused outright.
 *
 * A boolean that names no control yet keeps its pair: `component` is optional
 * on the schema that takes them, so a boolean the `Boolean` control could
 * render may already carry the words it would show — and an editor treating
 * those as belonging to nothing would drop them on the next save.
 */
export const optionsShapeFor = (
  type: unknown,
  component: unknown,
): OptionsShape | null => {
  if (type === VariableTypes.ordinal || type === VariableTypes.categorical) {
    return 'choice';
  }
  if (type !== VariableTypes.boolean) return null;
  return component === ComponentTypes.Toggle ? null : 'boolean';
};

/** One of the two answers a boolean offers, as the schema holds it. */
export type BooleanAnswer = Readonly<{
  label: string;
  value: boolean;
  /** Shown in red when the participant selects it. */
  negative?: boolean;
}>;

/** Both of them, in the order the protocol stores them. */
export type BooleanAnswers = readonly [BooleanAnswer, BooleanAnswer];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readBooleanAnswer = (
  option: unknown,
  fallbackValue: boolean,
): BooleanAnswer => {
  const held = isRecord(option) ? option : {};
  return {
    label: typeof held.label === 'string' ? held.label : '',
    value: typeof held.value === 'boolean' ? held.value : fallbackValue,
    ...(typeof held.negative === 'boolean' ? { negative: held.negative } : {}),
  };
};

/**
 * Why the answers this attribute holds are not the pair the fieldset writes.
 *
 * `count` is a list of some other length. `values` is two answers that do not
 * record one `true` and one `false` — both recording the same boolean, or one
 * recording something that is not a boolean at all.
 *
 * Read by the editor, which says which of the two it is: a researcher told a
 * pair of answers "offers a different number of them" is being sent to look
 * for an answer that is not on the screen.
 */
export type HeldBooleanAnswersReason = 'count' | 'values';

/** Whether these two answers record one `true` and one `false`. */
const recordsBothBooleans = (options: readonly unknown[]): boolean => {
  const values = options.map((option) =>
    isRecord(option) && typeof option.value === 'boolean' ? option.value : null,
  );
  return values.includes(true) && values.includes(false);
};

/**
 * Why the fieldset is not the editor for the answers this attribute holds, or
 * `null` where it is.
 *
 * The fieldset is exactly two answers, keyed and labelled by the boolean each
 * one records, and it writes exactly two. `booleanOptionsSchema` holds a
 * boolean's answers to neither of those things: it is a plain array with no
 * length of its own and no rule relating one entry's `value` to the other's,
 * and `BooleanField` renders every entry it is given — falling back to Yes and
 * No only where the protocol carries no `options` key at all. So a protocol
 * may hold one answer, or four, or two that both record `true`, and each of
 * them is a button a participant meets.
 *
 * Those are lists this editor cannot show. Shown as the pair, one answer would
 * gain a second the researcher never wrote and four would lose two; two
 * recording the same boolean would arrive at a fieldset that tells its two
 * fields apart by exactly the thing they share, and could only be drawn by
 * imposing `true` and `false` on them — which is a rewrite of what every
 * answer already given to the second button MEANS. None of that is the
 * researcher's to be given without asking, so the fieldset is not offered and
 * the list is written back exactly as it was authored — an attribute whose
 * answers this editor cannot edit can still be renamed, retyped and given a
 * validation rule.
 *
 * An attribute naming NO answers is the pair: it is what a boolean starts as,
 * and the two blank fields are how the researcher names them. So is an empty
 * array, which the schema refuses for a `Boolean` control and which clearing
 * both fields takes away.
 */
export const heldBooleanAnswersReason = (
  options: unknown,
): HeldBooleanAnswersReason | null => {
  if (!Array.isArray(options) || options.length === 0) return null;
  if (options.length !== 2) return 'count';
  return recordsBothBooleans(options) ? null : 'values';
};

/** Whether the fieldset is the editor for them, on the same terms. */
const holdsEditableBooleanAnswers = (options: unknown): boolean =>
  heldBooleanAnswersReason(options) === null;

/**
 * Every answer this attribute holds, for an editor that can only show them.
 *
 * Read the way the pair is read — a label of nothing where none was written,
 * the recorded boolean as the protocol holds it — but positionally faithful
 * and never repaired: this is what the participant meets, not something being
 * edited.
 */
export const readHeldBooleanAnswers = (
  options: unknown,
): readonly BooleanAnswer[] =>
  Array.isArray(options)
    ? options.map((option) => readBooleanAnswer(option, false))
    : [];

/**
 * The two answers as the editor holds them, from whatever the draft carries.
 *
 * The value each answer records is read from the protocol rather than imposed
 * by position: the schema constrains neither the order of the pair nor which
 * boolean each carries, and answers already collected mean whatever the pair
 * said when they were given — so reversing them would quietly rewrite what
 * every stored answer means.
 *
 * Nothing is imposed at all, and nothing needs to be: this is read only for a
 * pair `heldBooleanAnswersReason` has already found to record one `true` and
 * one `false`. A pair recording anything else is not shown as the fieldset,
 * because repairing it into one is the same rewrite by another name.
 *
 * The positional fallbacks are for the answers that are not THERE — a boolean
 * that names none carries no entries, and the two blank fields it opens as are
 * the true one and the false one.
 */
export const readBooleanAnswers = (options: unknown): BooleanAnswers => {
  const held = Array.isArray(options) ? options : [];
  return [readBooleanAnswer(held[0], true), readBooleanAnswer(held[1], false)];
};

/** Whether neither of these two answers has been given any words. */
const namesNoAnswer = (answers: BooleanAnswers): boolean =>
  answers.every((answer) => answer.label.trim() === '');

/**
 * Whether these two answers are, entry for entry, the pair already stored.
 *
 * Asked of the protocol as it was found rather than of a reading of it, so
 * that only a pair of TWO counts: an attribute holding an empty list is read
 * as two blank fields the same way one holding no list at all is, and writing
 * the fields back over the empty list would put two answers into a protocol
 * that stored none.
 *
 * Everything the fieldset can change is compared, `negative` included — a
 * switch flicked beside two blank labels is an answer field the researcher
 * touched, and whitespace is compared as typed because the label is stored as
 * typed.
 */
const isThePairAlreadyStored = (
  answers: BooleanAnswers,
  stored: unknown,
): boolean => {
  if (!Array.isArray(stored) || stored.length !== 2) return false;
  if (!recordsBothBooleans(stored)) return false;
  const held = readBooleanAnswers(stored);
  return answers.every((answer, index) => {
    const other = held[index];
    return (
      other !== undefined &&
      answer.label === other.label &&
      answer.value === other.value &&
      answer.negative === other.negative
    );
  });
};

/**
 * The `options` block these two answers would be written as, or `undefined`
 * when neither of them has been named and the attribute did not already store
 * a pair saying so.
 *
 * Absent is not the same as empty here, and neither is the same as a pair
 * nobody has written words for — all three are things a participant meets
 * differently. The boolean control offers Yes and No when the protocol names
 * no options at all, offers nothing at all when it names an empty list (which
 * the schema refuses for exactly that reason), and renders whatever entries it
 * IS given: a stored pair of blank labels is two buttons with nothing on them.
 *
 * So an attribute nobody has written words for carries no `options` key, and
 * clearing both labels takes the key away again rather than leaving two blank
 * buttons behind — but a blank pair the protocol already stored is written
 * back untouched. Which of those two a participant meets is the researcher's
 * to settle by clearing the fields, and a save that only renamed the attribute
 * never asked them.
 *
 * Whether there is an answer is judged after trimming, the way every other
 * unanswered-or-not question in this package is judged: a label of nothing but
 * spaces is a button a participant cannot read. The value is stored as it was
 * typed, though — trimming decides whether there is an answer, not what it is.
 *
 * `negative` follows the label: an answer with no words has nothing to style,
 * so a switch left on beside two cleared labels goes with them.
 */
const booleanOptionsFrom = (
  options: unknown,
  storedOptions: unknown,
): readonly BooleanAnswer[] | undefined => {
  const answers = readBooleanAnswers(options);
  if (!namesNoAnswer(answers)) return answers;
  return isThePairAlreadyStored(answers, storedOptions) ? answers : undefined;
};

/**
 * The `options` this shape would write, from whatever the draft holds.
 *
 * `undefined` means the attribute carries no `options` key at all — which is
 * what a control that cannot show a list has to write, because the request
 * builder lays the draft OVER the variable the codebook holds and a key the
 * draft no longer carries would otherwise survive being taken away.
 *
 * A choice list is passed through exactly as it was authored: it is edited a
 * row at a time by controls that already hold the schema's shape, and anything
 * wrong with it is the request builder's to refuse against the row it belongs
 * to.
 *
 * A boolean's answers are passed through on the same terms wherever they are
 * not the pair the fieldset writes — see `heldBooleanAnswersReason`. Only
 * what the researcher was shown is rewritten.
 *
 * `storedOptions` is the list the editor opened on, and it settles the one
 * question the draft alone cannot answer: two blank fields are what a
 * researcher who has written nothing sees AND what one who has just cleared
 * both sees, and those two save differently — see `booleanOptionsFrom`.
 */
export const optionsForShape = (
  shape: OptionsShape | null,
  options: unknown,
  storedOptions: unknown,
): unknown => {
  if (shape === null) return undefined;
  if (shape === 'choice') return options;
  if (!holdsEditableBooleanAnswers(options)) return options;
  return booleanOptionsFrom(options, storedOptions);
};

export type BooleanAnswerIssues = Readonly<Record<number, readonly string[]>>;

/**
 * What is wrong with these two answers, per answer.
 *
 * One named and the other blank is the case the schema accepts (`label` is any
 * string) and a participant cannot answer: a control with one button they can
 * read and one they cannot. Reported against the answer that is blank rather
 * than against the pair, so the researcher is told which of the two to write.
 *
 * Both named the same words is the same failure by the other route, and the
 * schema accepts it for the same reason — `booleanOptionsSchema.label` is a
 * bare `z.string()`, and nothing downstream compares the two. It is reported
 * against the SECOND answer, which is the one repeating what the first already
 * says, and only when the first has no complaint of its own: a blank beside a
 * named one is not a repetition, and telling the researcher both at once about
 * the same pair would be telling them to do two contradictory things.
 *
 * Judged after trimming and CASE-SENSITIVELY, unlike the uniqueness rule on a
 * categorical attribute's options. The harm here is the participant's, not the
 * export's: the two labels are rendered exactly as they were typed, so "Yes"
 * and "yes" are two buttons that can be told apart, while "Yes" and "Yes " are
 * one button written twice. A categorical option's label is compared
 * case-insensitively because its VALUE becomes a key.
 *
 * Naming neither is not a refusal: it is the answer that offers Yes and No,
 * and it is the state an attribute already storing a blank pair opens in —
 * see `booleanOptionsFrom`, which is what decides between the two. Nor is
 * anything
 * about a list the fieldset never offered: answers the researcher was not
 * shown are answers they cannot be asked to fix, and they are saved as they
 * were authored either way.
 *
 * Encoded rather than formatted, and so taking no formatter: this is asked
 * while a form is being judged, where there is no reader and no language, and
 * its answer is held in the editor's state until the next submission.
 * `FieldErrors` decodes it where it renders it, so a refusal already on screen
 * follows a change of language while it waits.
 */
export const validateBooleanAnswers = (
  options: unknown,
): BooleanAnswerIssues => {
  if (!holdsEditableBooleanAnswers(options)) return {};
  const written = readBooleanAnswers(options);
  if (namesNoAnswer(written)) return {};
  const issues: Record<number, string[]> = {};
  written.forEach((answer, index) => {
    if (answer.label.trim() === '') {
      issues[index] = [createMessageError(messages.unnamedAnswer)];
    }
  });
  const [first, second] = written;
  if (issues[1] === undefined && first.label.trim() === second.label.trim()) {
    issues[1] = [createMessageError(messages.repeatedAnswer)];
  }
  return issues;
};

export const hasBooleanAnswerIssues = (issues: BooleanAnswerIssues): boolean =>
  Object.values(issues).some((reported) => reported.length > 0);
