import { ComponentTypes, VariableTypes } from '@codaco/protocol-validation';

/**
 * The list of answers an attribute offers, as the protocol schema shapes them.
 *
 * Two different lists live under the same `options` key. A categorical or
 * ordinal attribute holds as many answers as the researcher writes, each with a
 * stored value of its own and at least two of them
 * (`categoricalOptionsSchema`). A boolean holds exactly two, and their values
 * are the two booleans rather than anything the researcher chooses
 * (`booleanOptionsSchema`) — what is authored is the words on them, and which
 * of the two is shown as the negative answer.
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

/**
 * The words the interview shows for a boolean that names no answers of its
 * own, which are what the editor offers as placeholders.
 *
 * fresco-ui's boolean control supplies these when the `options` prop is absent
 * (a destructuring default), so an attribute nobody has written words for is
 * not an unanswerable one — it is a Yes/No question. Keyed by the value each
 * answer records rather than by position, because the protocol decides the
 * order and not this editor.
 */
export const DEFAULT_BOOLEAN_LABELS = {
  true: 'Yes',
  false: 'No',
} as const satisfies Record<'true' | 'false', string>;

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
 * The two answers as the editor holds them, from whatever the draft carries.
 *
 * The value each answer records is read from the protocol rather than imposed
 * by position: the schema constrains neither the order of the pair nor which
 * boolean each carries, and answers already collected mean whatever the pair
 * said when they were given — so reversing them would quietly rewrite what
 * every stored answer means.
 *
 * The one thing that IS imposed is that the two record different values. A
 * pair recording the same boolean twice offers the participant a choice that
 * changes nothing, and leaves this editor with two answers it cannot tell
 * apart; the words the researcher wrote are kept, and the values are taken
 * positionally.
 */
export const readBooleanAnswers = (options: unknown): BooleanAnswers => {
  const held = Array.isArray(options) ? options : [];
  const first = readBooleanAnswer(held[0], true);
  const second = readBooleanAnswer(held[1], false);
  if (first.value === second.value) {
    return [
      { ...first, value: true },
      { ...second, value: false },
    ];
  }
  return [first, second];
};

/**
 * The `options` block these two answers would be written as, or `undefined`
 * when neither of them has been named.
 *
 * Absent is not the same as empty here, and the difference is the
 * participant's: the boolean control offers Yes and No when the protocol names
 * no options at all, and offers nothing at all when it names an empty list —
 * which the schema refuses for exactly that reason. So an attribute nobody has
 * written words for carries no `options` key, and clearing both labels takes
 * the key away again rather than leaving two blank buttons behind.
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
): readonly BooleanAnswer[] | undefined => {
  const answers = readBooleanAnswers(options);
  if (answers.every((answer) => answer.label.trim() === '')) return undefined;
  return answers;
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
 */
export const optionsForShape = (
  shape: OptionsShape | null,
  options: unknown,
): unknown => {
  if (shape === null) return undefined;
  if (shape === 'choice') return options;
  return booleanOptionsFrom(options);
};

export type BooleanAnswerIssues = Readonly<Record<number, readonly string[]>>;

const UNNAMED_ANSWER =
  'Write what this answer says, or clear both to offer Yes and No.';

const REPEATED_ANSWER =
  'Give this answer different words: two buttons saying the same thing cannot be told apart.';

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
 * Naming neither is not a refusal — see `booleanOptionsFrom`.
 */
export const validateBooleanAnswers = (
  options: unknown,
): BooleanAnswerIssues => {
  const written = booleanOptionsFrom(options);
  if (written === undefined) return {};
  const issues: Record<number, string[]> = {};
  written.forEach((answer, index) => {
    if (answer.label.trim() === '') issues[index] = [UNNAMED_ANSWER];
  });
  const [first, second] = written;
  if (
    first !== undefined &&
    second !== undefined &&
    issues[1] === undefined &&
    first.label.trim() === second.label.trim()
  ) {
    issues[1] = [REPEATED_ANSWER];
  }
  return issues;
};

export const hasBooleanAnswerIssues = (issues: BooleanAnswerIssues): boolean =>
  Object.values(issues).some((messages) => messages.length > 0);
