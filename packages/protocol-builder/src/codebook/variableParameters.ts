import {
  ComponentTypes,
  type DATE_RESOLUTION,
  datePickerParametersSchema,
  relativeDatePickerParametersSchema,
  VariableTypes,
} from '@codaco/protocol-validation';

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
  full: 'Year, month and day (YYYY-MM-DD)',
  month: 'Year and month (YYYY-MM)',
  year: 'Year only (YYYY)',
} as const satisfies Record<keyof typeof DATE_RESOLUTION, string>;

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

export const DATE_RESOLUTION_OPTIONS = DATE_RESOLUTION_VALUES.map((value) => ({
  value,
  label: DATE_RESOLUTION_LABELS[value],
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

const REQUIRED_MESSAGES: Readonly<Record<string, string>> = {
  minLabel: 'Write what the low end of the scale means.',
  maxLabel: 'Write what the high end of the scale means.',
};

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

/**
 * What is wrong with these settings, per control.
 *
 * Reported before the request is built so a bad bound lands on the control
 * that holds it rather than in the "not saved" alert, where the researcher
 * cannot tell which of the two dates the schema is complaining about.
 */
export const validateParameters = (
  shape: ParameterShape,
  parameters: unknown,
): ParameterIssues => {
  const written = parametersForShape(shape, parameters) ?? {};
  const issues: Record<string, string[]> = {};
  const add = (key: string, message: string) => {
    (issues[key] ??= []).push(message);
  };

  for (const key of REQUIRED_PARAMETERS[shape]) {
    if (written[key] === undefined) {
      add(key, REQUIRED_MESSAGES[key] ?? 'This setting is required.');
    }
  }

  const schema = SHAPE_SCHEMAS[shape];
  if (schema !== null) {
    const result = schema.safeParse(written);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const [key] = issue.path;
        add(typeof key === 'string' ? key : PARAMETERS_BLOCK, issue.message);
      }
    }
  }

  return issues;
};

export const hasParameterIssues = (issues: ParameterIssues): boolean =>
  Object.values(issues).some((messages) => messages.length > 0);
