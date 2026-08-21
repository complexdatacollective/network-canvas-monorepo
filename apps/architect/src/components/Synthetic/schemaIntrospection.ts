import type { NumericWindow } from '~/components/Synthetic/useNumericDraft';

/**
 * Reads the synthetic schemas for the things a control has to know: which
 * distribution families a variable type offers, which parameters each family
 * carries, and the window every one of those parameters is held to.
 *
 * Introspection rather than a table, because the alternative is a second
 * statement of the schema's own bounds inside the editor — exactly what the
 * design forbids (spec governing rule 1). A family added to
 * `@codaco/protocol-validation`, or a bound narrowed there, reaches these
 * controls without anything here being edited.
 *
 * Nothing in this module names a distribution, a parameter or a number: every
 * value it returns was read out of the schema it was handed. Its unit tests
 * hold the derivation to independently written expectations, so a change in
 * Zod's internals surfaces as a failing oracle rather than as an empty select.
 */

/** The shape every Zod schema exposes its definition through. */
type ZodDefinition = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const definitionOf = (schema: unknown): ZodDefinition | undefined => {
  if (!isRecord(schema)) return undefined;
  const internals = schema._zod;
  if (!isRecord(internals)) return undefined;
  const def = internals.def;
  return isRecord(def) ? def : undefined;
};

/**
 * The wrappers that carry a schema inside them without changing the value's
 * shape. Unwrapped so a parameter declared `.optional()` reports the bounds of
 * the number underneath rather than none at all.
 */
const WRAPPER_TYPES = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'nonoptional',
  'readonly',
  'catch',
]);

const unwrap = (schema: unknown): unknown => {
  let current = schema;
  // Wrappers nest (`.optional().readonly()`), so unwrap until the innermost.
  for (;;) {
    const def = definitionOf(current);
    const type = typeof def?.type === 'string' ? def.type : undefined;
    if (def === undefined || type === undefined || !WRAPPER_TYPES.has(type)) {
      return current;
    }
    current = def.innerType;
  }
};

const isOptionalSchema = (schema: unknown): boolean => {
  let current = schema;
  for (;;) {
    const def = definitionOf(current);
    const type = typeof def?.type === 'string' ? def.type : undefined;
    if (def === undefined || type === undefined || !WRAPPER_TYPES.has(type)) {
      return false;
    }
    if (type === 'optional') return true;
    current = def.innerType;
  }
};

const shapeOf = (schema: unknown): Record<string, unknown> | undefined => {
  const def = definitionOf(unwrap(schema));
  if (def === undefined || def.type !== 'object') return undefined;
  return isRecord(def.shape) ? def.shape : undefined;
};

const unionOptionsOf = (schema: unknown): unknown[] | undefined => {
  const def = definitionOf(unwrap(schema));
  if (def === undefined) return undefined;
  if (def.type !== 'union') return undefined;
  return Array.isArray(def.options) ? def.options : undefined;
};

/** The single value a `z.literal()` accepts, where it accepts exactly one. */
const literalStringOf = (schema: unknown): string | undefined => {
  const def = definitionOf(unwrap(schema));
  if (def === undefined || def.type !== 'literal') return undefined;
  const values = def.values;
  const list = values instanceof Set ? [...values] : values;
  if (!Array.isArray(list) || list.length !== 1) return undefined;
  const [only] = list;
  return typeof only === 'string' ? only : undefined;
};

const NUMBER_FORMAT_INTEGERS = new Set(['safeint', 'int32', 'uint32', 'int64']);

/**
 * The window a number schema states, or `undefined` where the schema handed in
 * is not a number at all (a datetime bound is a string, and is edited by its
 * own control).
 */
const describeNumericWindow = (schema: unknown): NumericWindow | undefined => {
  const def = definitionOf(unwrap(schema));
  if (def === undefined || def.type !== 'number') return undefined;

  const window: NumericWindow = {
    exclusiveMin: false,
    exclusiveMax: false,
    integer: false,
  };

  const checks = Array.isArray(def.checks) ? def.checks : [];
  for (const check of checks) {
    const checkDef = definitionOf(check);
    if (checkDef === undefined) continue;
    const kind = checkDef.check;
    const value = checkDef.value;
    const inclusive = checkDef.inclusive === true;
    if (kind === 'number_format') {
      const format = checkDef.format;
      if (typeof format === 'string' && NUMBER_FORMAT_INTEGERS.has(format)) {
        window.integer = true;
      }
      continue;
    }
    if (typeof value !== 'number') continue;
    if (kind === 'greater_than') {
      // Several bounds on one field narrow rather than replace each other.
      if (window.min === undefined || value > window.min) {
        window.min = value;
        window.exclusiveMin = !inclusive;
      }
      continue;
    }
    if (kind === 'less_than') {
      if (window.max === undefined || value < window.max) {
        window.max = value;
        window.exclusiveMax = !inclusive;
      }
    }
  }

  return window;
};

/** One numeric parameter of one distribution family. */
export type SyntheticParameter = {
  /** The key it is written under in the synthetic block. */
  key: string;
  /** Whether the family accepts the parameter being left out. */
  optional: boolean;
  window: NumericWindow;
};

/** One distribution family a variable type offers, with its parameters. */
export type SyntheticDistributionSpec = {
  /** The `distribution` discriminant, e.g. `normal`. */
  family: string;
  parameters: SyntheticParameter[];
};

/**
 * Keys every family carries that are not parameters of the distribution:
 * the discriminant itself, and the missingness the editor gives its own
 * control (it is authorable with or without a distribution).
 */
const NON_PARAMETER_KEYS = new Set(['distribution', 'missingProbability']);

const describeOneDistribution = (
  option: unknown,
): SyntheticDistributionSpec | undefined => {
  const shape = shapeOf(option);
  if (shape === undefined) return undefined;
  const family = literalStringOf(shape.distribution);
  if (family === undefined) return undefined;

  const parameters: SyntheticParameter[] = [];
  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (NON_PARAMETER_KEYS.has(key)) continue;
    const window = describeNumericWindow(fieldSchema);
    // A non-numeric parameter (a datetime bound, a relative window) belongs to
    // a control that understands it; the generic parameter fields skip it.
    if (window === undefined) continue;
    parameters.push({
      key,
      optional: isOptionalSchema(fieldSchema),
      window,
    });
  }

  return { family, parameters };
};

/**
 * Every distribution family the given synthetic schema admits, in the order the
 * schema declares them, each with the numeric parameters it carries.
 *
 * Handles the shape the variable-level schemas take: a union of a
 * discriminated union of distributions with a missingness-only branch, which
 * carries no `distribution` key and contributes no family.
 */
export const describeDistributions = (
  schema: unknown,
): SyntheticDistributionSpec[] => {
  const options = unionOptionsOf(schema);
  if (options === undefined) {
    const single = describeOneDistribution(schema);
    return single === undefined ? [] : [single];
  }
  return options.flatMap((option) => describeDistributions(option));
};

/** The path segment that descends from an array schema into its element. */
export const ARRAY_ELEMENT = '[]';

const elementOf = (schema: unknown): unknown => {
  const def = definitionOf(unwrap(schema));
  if (def === undefined || def.type !== 'array') return undefined;
  return def.element;
};

/** Walks a path of object keys and array-element markers into a schema. */
const descend = (schema: unknown, path: readonly string[]): unknown => {
  let current: unknown = schema;
  for (const segment of path) {
    if (segment === ARRAY_ELEMENT) {
      current = elementOf(current);
      continue;
    }
    const shape = shapeOf(current);
    if (shape === undefined) return undefined;
    current = shape[segment];
  }
  return current;
};

/**
 * The window of one field nested inside a synthetic schema — an option
 * weight's ceiling, a selection count's floor — addressed by the keys it sits
 * under, with {@link ARRAY_ELEMENT} for a step into a list.
 */
export const describeFieldWindow = (
  schema: unknown,
  path: readonly string[],
): NumericWindow | undefined => describeNumericWindow(descend(schema, path));

/**
 * The window of one field inside one named distribution family — the datetime
 * editor's way of asking about the relative window's own offsets, which are
 * nested a level below the parameters above.
 */
export const describeNestedWindow = (
  schema: unknown,
  family: string,
  path: readonly string[],
): NumericWindow | undefined => {
  const options = unionOptionsOf(schema) ?? [schema];
  const flattened = options.flatMap((option) => {
    const nested = unionOptionsOf(option);
    return nested === undefined ? [option] : nested;
  });
  const match = flattened.find(
    (option) => literalStringOf(shapeOf(option)?.distribution) === family,
  );
  if (match === undefined) return undefined;
  return describeNumericWindow(descend(match, path));
};
