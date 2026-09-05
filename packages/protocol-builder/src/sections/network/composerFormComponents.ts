import {
  type ComponentType as InputControl,
  ComponentTypes,
  VARIABLE_TYPE_COMPONENTS,
  type VariableType,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

/**
 * Author-facing names for the input controls a composer form field can use.
 *
 * The control ids are schema contract; these are editor copy, written out
 * whole rather than assembled from an id, so a translator moves a phrase
 * rather than reconstructing one. Each says what the PARTICIPANT will see,
 * because that is the thing the researcher is choosing between.
 */
const CONTROL_LABELS: Readonly<Record<InputControl, string>> = Object.freeze({
  [ComponentTypes.Text]: 'Single-line text box',
  [ComponentTypes.TextArea]: 'Multi-line text box',
  [ComponentTypes.Number]: 'Number box',
  [ComponentTypes.RadioGroup]: 'Radio buttons — one answer',
  [ComponentTypes.CheckboxGroup]: 'Checkboxes — several answers',
  [ComponentTypes.Boolean]: 'Yes or no buttons',
  [ComponentTypes.Toggle]: 'Toggle switch',
  [ComponentTypes.ToggleButtonGroup]: 'Toggle buttons — several answers',
  [ComponentTypes.VisualAnalogScale]: 'Sliding scale',
  [ComponentTypes.LikertScale]: 'Likert scale',
  [ComponentTypes.DatePicker]: 'Date picker',
  [ComponentTypes.RelativeDatePicker]: 'Relative date picker',
});

/**
 * The attribute types a form field can render at all.
 *
 * Read from the schema's own pairings rather than listed here: a layout or a
 * location attribute has no participant-facing control, so its list is empty
 * and the protocol schema refuses a field for one in those words. Anything
 * that gains a control later is offered here without this module changing.
 */
export const FORM_FIELD_VARIABLE_TYPES: readonly VariableType[] = Object.freeze(
  VariableTypesKeys.filter((type) => VARIABLE_TYPE_COMPONENTS[type].length > 0),
);

export type InputControlOption = Readonly<{ value: string; label: string }>;

/**
 * The controls that can render an attribute of this type.
 *
 * The same pairings the protocol schema checks a saved stage against, so a
 * control this picker offers is one the stage can be saved with. An attribute
 * type nothing can render — and an unknown one — offers nothing rather than
 * everything.
 */
export function inputControlOptions(
  variableType: VariableType | undefined,
): InputControlOption[] {
  if (variableType === undefined) return [];
  const controls: readonly InputControl[] =
    VARIABLE_TYPE_COMPONENTS[variableType] ?? [];
  return controls.map((value) => ({ value, label: CONTROL_LABELS[value] }));
}

/**
 * The control a field for this attribute should start with.
 *
 * The codebook variable's own control when the pairing allows it, because that
 * is what the researcher already decided this attribute looks like everywhere
 * else. Otherwise the first control that can render it, so a field is never
 * created holding a pairing the schema refuses.
 */
export function defaultInputControl(
  variableType: VariableType | undefined,
  codebookControl: unknown,
): string | undefined {
  const options = inputControlOptions(variableType);
  const preferred = options.find((option) => option.value === codebookControl);
  return (preferred ?? options[0])?.value;
}
