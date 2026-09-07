import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  type ComponentType as InputControl,
  ComponentTypes,
  VARIABLE_TYPE_COMPONENTS,
  type VariableType,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

import { networkCanvasMessages } from './networkCanvasMessages.ts';

/**
 * Author-facing names for the input controls a composer form field can use.
 *
 * The control ids are schema contract; these are editor copy, written out
 * whole rather than assembled from an id, so a translator moves a phrase
 * rather than reconstructing one. Each says what the PARTICIPANT will see,
 * because that is the thing the researcher is choosing between.
 *
 * Keyed against the schema's own table so a control added there cannot go
 * unnamed: the record is exhaustive over `ComponentTypes`, and a new token
 * fails to typecheck until it has words.
 */
const CONTROL_LABELS = Object.freeze({
  [ComponentTypes.Text]: networkCanvasMessages.inputControlText,
  [ComponentTypes.TextArea]: networkCanvasMessages.inputControlTextArea,
  [ComponentTypes.Number]: networkCanvasMessages.inputControlNumber,
  [ComponentTypes.RadioGroup]: networkCanvasMessages.inputControlRadioGroup,
  [ComponentTypes.CheckboxGroup]:
    networkCanvasMessages.inputControlCheckboxGroup,
  [ComponentTypes.Boolean]: networkCanvasMessages.inputControlBoolean,
  [ComponentTypes.Toggle]: networkCanvasMessages.inputControlToggle,
  [ComponentTypes.ToggleButtonGroup]:
    networkCanvasMessages.inputControlToggleButtonGroup,
  [ComponentTypes.VisualAnalogScale]:
    networkCanvasMessages.inputControlVisualAnalogScale,
  [ComponentTypes.LikertScale]: networkCanvasMessages.inputControlLikertScale,
  [ComponentTypes.DatePicker]: networkCanvasMessages.inputControlDatePicker,
  [ComponentTypes.RelativeDatePicker]:
    networkCanvasMessages.inputControlRelativeDatePicker,
}) satisfies Readonly<Record<InputControl, MessageDescriptor>>;

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
 * The controls that can render an attribute of this type, as the schema pairs
 * them.
 *
 * The same pairings the protocol schema checks a saved stage against, so a
 * control offered from here is one the stage can be saved with. An attribute
 * type nothing can render — and an unknown one — offers nothing rather than
 * everything.
 *
 * Separate from the labelling below because the two questions have different
 * answers: which controls are legal is schema, and what they are called is
 * copy. `defaultInputControl` needs only the first, and threading a formatter
 * into it to reach a label it never reads would be asking a caller for the
 * reader's language in order to ignore it.
 */
const controlsFor = (
  variableType: VariableType | undefined,
): readonly InputControl[] =>
  variableType === undefined
    ? []
    : (VARIABLE_TYPE_COMPONENTS[variableType] ?? []);

/**
 * Those controls as a picker takes them, named in the reader's language.
 *
 * Takes the formatter rather than holding one: an option list is built without
 * being rendered, and a module-level English formatter here would make every
 * control name permanently English wherever the list is shown.
 */
export function inputControlOptions(
  variableType: VariableType | undefined,
  intl: IntlShape,
): InputControlOption[] {
  return controlsFor(variableType).map((value) => ({
    value,
    label: intl.formatMessage(CONTROL_LABELS[value]),
  }));
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
  const controls = controlsFor(variableType);
  const preferred = controls.find((control) => control === codebookControl);
  return preferred ?? controls[0];
}
