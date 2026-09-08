import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  ComponentTypes,
  DATE_RESOLUTION,
  datePickerParametersSchema,
  isValidDateAtResolution,
  relativeDatePickerParametersSchema,
  VariableTypes,
} from '@codaco/protocol-validation';

const messages = defineMessages({
  resolutionFull: {
    id: 'protocolBuilder.variableParameters.resolutionFull',
    defaultMessage: 'Year, month and day (YYYY-MM-DD)',
    description:
      'Choice offered for how precise a date a field collects: a whole calendar date. The bracketed pattern is the literal format the protocol stores and is not translated.',
  },
  resolutionMonth: {
    id: 'protocolBuilder.variableParameters.resolutionMonth',
    defaultMessage: 'Year and month (YYYY-MM)',
    description:
      'Choice offered for how precise a date a field collects: a month within a year. The bracketed pattern is the literal format the protocol stores and is not translated.',
  },
  resolutionYear: {
    id: 'protocolBuilder.variableParameters.resolutionYear',
    defaultMessage: 'Year only (YYYY)',
    description:
      'Choice offered for how precise a date a field collects: a year on its own. The bracketed pattern is the literal format the protocol stores and is not translated.',
  },
  minLabelRequired: {
    id: 'protocolBuilder.variableParameters.minLabelRequired',
    defaultMessage: 'Write what the low end of the scale means.',
    description:
      'Refusal shown under the field naming the low end of a sliding scale when the researcher has left it empty. The participant sees this wording at one end of the scale, so a scale with no such words is a line with nothing at either end of it.',
  },
  maxLabelRequired: {
    id: 'protocolBuilder.variableParameters.maxLabelRequired',
    defaultMessage: 'Write what the high end of the scale means.',
    description:
      'Refusal shown under the field naming the high end of a sliding scale when the researcher has left it empty.',
  },
  dateNotAtResolution: {
    id: 'protocolBuilder.variableParameters.dateNotAtResolution',
    defaultMessage:
      'Write this date as {pattern}, to match the resolution chosen above.',
    description:
      'Refusal shown under one of the two bounding dates of a date field when it is not written at the precision the field collects. pattern is the literal format the protocol stores — YYYY-MM-DD, YYYY-MM or YYYY — and is not translated.',
  },
  datesOutOfOrder: {
    id: 'protocolBuilder.variableParameters.datesOutOfOrder',
    defaultMessage: 'The latest date cannot be earlier than the earliest date.',
    description:
      'Refusal shown under the latest-date field when the researcher has set it before the earliest date, which would leave the participant no date to choose.',
  },
  anchorNotADate: {
    id: 'protocolBuilder.variableParameters.anchorNotADate',
    defaultMessage: 'Write the anchor date as YYYY-MM-DD.',
    description:
      'Refusal shown under the anchor-date field when what is written there is not a whole calendar date. YYYY-MM-DD is the literal format the protocol stores and is not translated.',
  },
  daysNotWhole: {
    id: 'protocolBuilder.variableParameters.daysNotWhole',
    defaultMessage: 'Write a whole number of days, zero or more.',
    description:
      'Refusal shown under one of the two day-count fields of a relative date field when it holds something other than a whole number of days that is not negative.',
  },
  settingsRefused: {
    id: 'protocolBuilder.variableParameters.settingsRefused',
    defaultMessage:
      'These settings cannot be saved as they are written. Check the values below.',
    description:
      'Refusal shown over the whole block of settings an input control takes, when the protocol refuses them for a reason the editor has no wording of its own for. The settings themselves are listed underneath it.',
  },
});

/**
 * The settings one input control takes, as the protocol schema shapes them.
 *
 * Not a property of the attribute's TYPE: a datetime attribute holds a date
 * either way, but a `DatePicker` is bounded by two dates and a resolution
 * while a `RelativeDatePicker` is a window of days either side of an anchor,
 * and the schema says so by splitting datetime into two variable schemas
 * keyed on `component`. So the shape is decided by the control, and a control
 * change makes whatever was authored for the old one meaningless rather than
 * portable.
 */
export type ParameterShape = 'datePicker' | 'relativeDatePicker' | 'scalar';

/**
 * Which settings this attribute's control takes, or `null` for a control that
 * takes none.
 *
 * A scalar is decided by its type alone, because `VisualAnalogScale` is the
 * only control that renders one; the two date controls are told apart by name.
 * A datetime attribute with no control yet has no shape either — nothing can
 * be authored for a control nobody has chosen.
 */
export const parameterShapeFor = (
  type: unknown,
  component: unknown,
): ParameterShape | null => {
  if (type === VariableTypes.scalar) return 'scalar';
  if (type !== VariableTypes.datetime) return null;
  if (component === ComponentTypes.DatePicker) return 'datePicker';
  if (component === ComponentTypes.RelativeDatePicker) {
    return 'relativeDatePicker';
  }
  return null;
};

/**
 * The keys each shape owns, in the order they are asked for.
 *
 * This is what makes a control change drop what the old control needed: only
 * these keys are read from the draft and only these are written back, so a
 * `min` authored for a date picker never reaches a relative picker's block.
 */
const PARAMETER_KEYS = {
  datePicker: ['type', 'min', 'max'],
  relativeDatePicker: ['anchor', 'before', 'after'],
  scalar: ['minLabel', 'maxLabel'],
} as const satisfies Record<ParameterShape, readonly string[]>;

/** The resolution a date picker assumes when the protocol declares none. */
export const DEFAULT_DATE_RESOLUTION = 'full';

/**
 * How each date resolution is offered, written out whole.
 *
 * Keyed against the schema's own table so a resolution added there cannot go
 * unoffered, but the sentences are not assembled from it: a label built by
 * gluing a phrase to a format string is a label no translator can move around.
 */
export const DATE_RESOLUTION_LABELS = {
  full: messages.resolutionFull,
  month: messages.resolutionMonth,
  year: messages.resolutionYear,
} as const satisfies Record<keyof typeof DATE_RESOLUTION, MessageDescriptor>;

export type DateResolution = keyof typeof DATE_RESOLUTION_LABELS;

/**
 * The resolutions, in the order they are offered — coarsening as the list goes
 * down. Written out rather than read off the record above, which is unordered,
 * and typed against it so an entry that is not a resolution cannot be listed.
 */
const DATE_RESOLUTION_VALUES: readonly DateResolution[] = [
  'full',
  'month',
  'year',
];

export const dateResolutionOptions = (intl: IntlShape) =>
  DATE_RESOLUTION_VALUES.map((value) => ({
    value,
    label: intl.formatMessage(DATE_RESOLUTION_LABELS[value]),
  }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A `parameters` block mid-edit, which may hold anything until it is saved. */
export const readParameters = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

/** The resolution these parameters declare, or the one the runtime assumes. */
export const dateResolutionOf = (parameters: unknown): DateResolution => {
  const held = readParameters(parameters).type;
  return (
    DATE_RESOLUTION_VALUES.find((value) => value === held) ??
    DEFAULT_DATE_RESOLUTION
  );
};

/**
 * The years a date bound may be chosen from, as Architect's own date settings
 * offer them (`components/Parameters/DatePicker.tsx` hands the same pair to
 * the same control). The two editors author the same key for the same runtime,
 * so they offer the same years.
 *
 * The floor is the schema's: `datePickerParametersSchema` takes any four-digit
 * year of 1000 or later at year and month resolution, and `datePickerWindows`
 * clamps the coarse dropdowns to the same 1000. The ceiling is short of the
 * schema's 9999 because a year dropdown is a closed list and nine thousand
 * entries is not a list anyone can use. A bound beyond it stays valid and is
 * left exactly as authored — this window decides what can be CHOSEN here, not
 * what may be held.
 */
const DATE_BOUND_EARLIEST = '1000-01-01';
const DATE_BOUND_LATEST = '3000-12-31';

/**
 * The window the controls that author `min` and `max` offer, or `null` where
 * they need none.
 *
 * At year and month resolution the control is a pair of closed dropdowns, and
 * a `DatePicker` given no bounds of its own builds them from the window it
 * shows a PARTICIPANT by default — 1920 to today. Those are answers, not
 * bounds: a researcher offered only them cannot author an earliest year of
 * 1900 or a latest of 2030, and cannot even see one the protocol already
 * holds.
 *
 * Full resolution gets nothing, deliberately. It renders a native date input,
 * which stays genuinely unbounded while neither bound is declared and accepts
 * the years 0001-0999 the coarse window cannot represent; handing it this
 * window would narrow what a researcher can type.
 */
export const dateBoundWindow = (
  resolution: DateResolution,
): Readonly<{ min: string; max: string }> | null =>
  resolution === 'full'
    ? null
    : { min: DATE_BOUND_EARLIEST, max: DATE_BOUND_LATEST };

/**
 * The `parameters` block this shape would write, from whatever the draft holds.
 *
 * `undefined` when nothing is authored, so an attribute nobody has configured
 * carries no key at all rather than an empty object — and so a control change
 * that leaves the new control's settings blank removes the old control's
 * settings rather than leaving them behind to be rejected by the schema.
 *
 * An emptied control reports `''`, not an absent key, so a cleared bound has
 * to read as unauthored here or it would be written back as a blank string.
 * Judged after trimming, the way every other unanswered-or-not question in
 * this package is judged: a scale label of nothing but spaces shows the
 * participant nothing and reads out as nothing. The value is stored as it was
 * typed, though — trimming decides whether there is an answer, not what it is.
 */
export const parametersForShape = (
  shape: ParameterShape,
  parameters: unknown,
): Record<string, unknown> | undefined => {
  const held = readParameters(parameters);
  const written: Record<string, unknown> = {};
  for (const key of PARAMETER_KEYS[shape]) {
    const value = held[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    written[key] = value;
  }
  return Object.keys(written).length === 0 ? undefined : written;
};

/**
 * These settings with one of them replaced, and whatever that replacement
 * invalidates removed.
 *
 * The date bounds are stored AT the resolution they were chosen under — a
 * full date is not a year — so changing the resolution leaves them
 * unreadable by the control that has to display them and unacceptable to the
 * schema that has to parse them. Re-deriving them would quietly widen a window
 * the researcher chose deliberately, so they go; the control says that it will
 * happen before it does, and says that it has once it has.
 */
export const parametersWith = (
  shape: ParameterShape,
  parameters: unknown,
  key: string,
  value: unknown,
): Record<string, unknown> => {
  const next = { ...readParameters(parameters) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  if (shape === 'datePicker' && key === 'type') {
    delete next.min;
    delete next.max;
  }
  return next;
};

/**
 * The settings a control cannot do without.
 *
 * The schema leaves both of these optional, because a protocol written before
 * this editor existed must still import. An editor asking the question is a
 * different matter: a scale with no end labels is a line with nothing at
 * either end of it, and the researcher looking at this form is the only person
 * who can say what belongs there. Matches Architect, which requires the same
 * two.
 *
 * The controls carry `required` as well, so an empty one is refused by the
 * browser before this runs. This is what catches the case the browser calls
 * answered and a participant would not: a label of nothing but spaces.
 *
 * A relative picker requires nothing — an absent anchor MEANS the date of the
 * interview, and absent day offsets mean the runtime's own defaults. Nor does
 * a date picker's resolution: it is seeded and cannot be cleared, and a
 * resolution that is not one of the three is the schema's own to refuse.
 */
const REQUIRED_PARAMETERS = {
  datePicker: [],
  relativeDatePicker: [],
  scalar: ['minLabel', 'maxLabel'],
} as const satisfies Record<ParameterShape, readonly string[]>;

/**
 * One of the settings some control cannot do without, whichever control that
 * is. Derived from `REQUIRED_PARAMETERS` rather than written out, so the
 * refusals below are exhaustive BY CONSTRUCTION.
 */
type RequiredParameterKey =
  (typeof REQUIRED_PARAMETERS)[ParameterShape][number];

/**
 * What the researcher is told about each of them.
 *
 * Keyed on the union above and indexed without a fallback: a shape that starts
 * requiring a new setting fails to compile until somebody writes the sentence
 * for it. The open keying this replaces fell back to a generic "This setting
 * is required.", so that same change compiled and shipped a placeholder under
 * a field whose own refusal nobody had noticed was missing. The generic
 * sentence is gone with the fallback: it had exactly one reader, and that
 * reader was the defect.
 */
const REQUIRED_MESSAGES = {
  minLabel: messages.minLabelRequired,
  maxLabel: messages.maxLabelRequired,
} as const satisfies Record<RequiredParameterKey, MessageDescriptor>;

/**
 * The protocol's own parameter schemas, so this editor and the save that
 * follows it cannot disagree about what is allowed.
 *
 * A scalar has none of its own: `minLabel`/`maxLabel` are two optional
 * strings with no rule relating them, so the only thing to check is that they
 * are there. Everything the whole-variable parse would still catch remains
 * caught — `validateVariableDraft` runs on every request this editor builds.
 */
const SHAPE_SCHEMAS = {
  datePicker: datePickerParametersSchema,
  relativeDatePicker: relativeDatePickerParametersSchema,
  scalar: null,
} as const satisfies Record<ParameterShape, unknown>;

/** Messages that belong to the whole block rather than to one control. */
export const PARAMETERS_BLOCK = '';

export type ParameterIssues = Readonly<Record<string, readonly string[]>>;

/** Files one refusal under the control it belongs to. */
type AddIssue = (key: string, message: string) => void;

/**
 * What a date picker's own bounds are wrong about, in this editor's words.
 *
 * The same three questions `datePickerParametersSchema` asks about the pair a
 * researcher can actually see and change: is each bound a real date at the
 * precision this field collects, and does the range run forwards. Asked here
 * rather than left to the parse because the schema answers in sentences
 * written for whoever reads a log — `DatePicker "min" must not be after "max"`
 * names a control and two keys, neither of which is on screen, and is
 * hard-coded English that no catalog can translate.
 *
 * The literal format is passed in as a value rather than written into the
 * sentence: it is what the protocol stores, so it is the same in every
 * language, and it changes with the resolution the researcher chose.
 */
const addDatePickerIssues = (
  written: Readonly<Record<string, unknown>>,
  add: AddIssue,
): void => {
  const resolution = dateResolutionOf(written);
  const { label: pattern } = DATE_RESOLUTION[resolution];
  const bounds = ['min', 'max'] as const;
  const readable = (value: unknown): value is string =>
    typeof value === 'string' && isValidDateAtResolution(value, resolution);

  for (const bound of bounds) {
    const value = written[bound];
    if (value === undefined) continue;
    if (!readable(value)) {
      add(bound, createMessageError(messages.dateNotAtResolution, { pattern }));
    }
  }
  const [min, max] = [written.min, written.max];
  // Compared as text, the way the schema does: every resolution stores a date
  // whose lexical order is its calendar order.
  if (readable(min) && readable(max) && min > max) {
    add('max', createMessageError(messages.datesOutOfOrder));
  }
};

/**
 * What a relative date picker's window is wrong about.
 *
 * A negative day offset is the reachable case: the fields carry `min={0}`,
 * which is a browser hint the researcher can type past, and `asWholeDays`
 * hands `-3` through as a number the schema then refuses.
 */
const addRelativeDatePickerIssues = (
  written: Readonly<Record<string, unknown>>,
  add: AddIssue,
): void => {
  const anchor = written.anchor;
  if (
    anchor !== undefined &&
    !(typeof anchor === 'string' && isValidDateAtResolution(anchor, 'full'))
  ) {
    add('anchor', createMessageError(messages.anchorNotADate));
  }
  for (const key of ['before', 'after'] as const) {
    const value = written[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      add(key, createMessageError(messages.daysNotWhole));
    }
  }
};

/**
 * What is wrong with these settings, per control.
 *
 * Reported before the request is built so a bad bound lands on the control
 * that holds it rather than in the "not saved" alert, where the researcher
 * cannot tell which of the two dates the schema is complaining about.
 *
 * Encoded rather than formatted, and so taking no formatter: this is asked
 * while a form is being judged, where there is no reader and no language, and
 * its answer is held in the editor's state until the next submission.
 * `FieldErrors` decodes it where it renders it, so a refusal already on screen
 * follows a change of language while it waits — which a sentence formatted
 * here could not.
 *
 * The protocol's own schema is asked LAST, and only when nothing above it has
 * a complaint: it is the belt and braces for what this editor has no wording
 * of its own for — a year the interview's own date control could never select
 * — and what it refuses is reported against the block rather than in its
 * words. Asking it alongside the authored checks would report the same
 * reversed range twice, once usefully and once as "these settings cannot be
 * saved".
 */
export const validateParameters = (
  shape: ParameterShape,
  parameters: unknown,
): ParameterIssues => {
  const written = parametersForShape(shape, parameters) ?? {};
  const issues: Record<string, string[]> = {};
  const add: AddIssue = (key, message) => {
    (issues[key] ??= []).push(message);
  };

  for (const key of REQUIRED_PARAMETERS[shape]) {
    if (written[key] === undefined) {
      add(key, createMessageError(REQUIRED_MESSAGES[key]));
    }
  }
  if (shape === 'datePicker') addDatePickerIssues(written, add);
  if (shape === 'relativeDatePicker') addRelativeDatePickerIssues(written, add);

  const schema = SHAPE_SCHEMAS[shape];
  if (
    schema !== null &&
    !hasParameterIssues(issues) &&
    !schema.safeParse(written).success
  ) {
    add(PARAMETERS_BLOCK, createMessageError(messages.settingsRefused));
  }

  return issues;
};

export const hasParameterIssues = (issues: ParameterIssues): boolean =>
  Object.values(issues).some((reported) => reported.length > 0);
