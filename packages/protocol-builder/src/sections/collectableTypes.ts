import {
  VARIABLE_TYPE_COMPONENTS,
  type VariableType,
} from '@codaco/protocol-validation';

/**
 * The attribute types a form can ask for.
 *
 * `layout` and `location` are left out: they hold a position rather than an
 * answer, have no input control at all, and a form cannot ask for one.
 *
 * Its own module because two families read it and neither owns it: the shared
 * `FormFieldsSection` decides what its picker offers, and a network composer's
 * field editor decides the same thing about a differently-shaped row. Answered
 * from `VARIABLE_TYPE_COMPONENTS` rather than written out, so a type the schema
 * teaches a control to render cannot go unoffered here.
 */
const COLLECTABLE_TYPES = Object.entries(VARIABLE_TYPE_COMPONENTS).filter(
  ([, components]) => components.length > 0,
);

export const TYPE_OPTIONS = COLLECTABLE_TYPES.map(([type]) => ({
  value: type,
  label: type,
}));

export const isCollectableType = (type: string): type is VariableType =>
  COLLECTABLE_TYPES.some(([candidate]) => candidate === type);

/** The controls a given kind of answer may be collected with. */
export const controlsForType = (type: string): readonly string[] =>
  COLLECTABLE_TYPES.find(([candidate]) => candidate === type)?.[1] ?? [];

/**
 * The attribute types that ARE a list of answers.
 *
 * `categoricalOptionsSchema` requires at least two of them, so a categorical
 * or ordinal attribute cannot exist without its values — which is why these
 * two are invented through the codebook's own editor rather than from a name
 * and a type, and why a field collecting one offers a way back to that list.
 */
const OPTION_TYPES: readonly string[] = Object.freeze([
  'categorical',
  'ordinal',
]);

export const isOptionType = (type: string): boolean =>
  OPTION_TYPES.includes(type);
