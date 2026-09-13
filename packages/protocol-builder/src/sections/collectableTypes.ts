import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  type ComponentTypes,
  VARIABLE_TYPE_COMPONENTS,
  type VariableType,
} from '@codaco/protocol-validation';

import {
  hasParameterIssues,
  parameterShapeFor,
  validateParameters,
} from '../codebook/variableParameters.ts';
import { VARIABLE_TYPE_OPTIONS } from '../codebook/variableTypeLabels.ts';

/**
 * The attribute types a form can ask for, and what each is called.
 *
 * `layout` and `location` are left out: they hold a position rather than an
 * answer, have no input control at all, and a form cannot ask for one.
 * Answered from `VARIABLE_TYPE_COMPONENTS` rather than written out, so a type
 * the schema teaches a control to render cannot go unoffered here.
 *
 * Its own module because two families read it and neither owns it: the shared
 * `FormFieldsSection` decides what its picker offers, and a network composer's
 * field editor decides the same thing about a differently-shaped row.
 *
 * The label is the DESCRIPTOR the codebook editor names that type by — the
 * same list, in the same order — rather than the schema's token. This list
 * used to carry `type` as its own label, so the same nine choices read `Texto`
 * in one dialog and `text` in the other: the one decision this section exists
 * to ask, offered in English to every reader, with no id for any guard to see.
 * Formatted at the call site, in the reader's language, at the moment it is
 * rendered.
 */
export const TYPE_OPTIONS = VARIABLE_TYPE_OPTIONS.filter(
  ({ value }) => VARIABLE_TYPE_COMPONENTS[value].length > 0,
);

export const isCollectableType = (type: string): type is VariableType =>
  TYPE_OPTIONS.some(({ value }) => value === type);

/**
 * What each input control is called, in the reader's language.
 *
 * The schema's `component` values are identifiers — `RelativeDatePicker`,
 * `ToggleButtonGroup` — and offering them raw asks a researcher to choose
 * between words nobody wrote for them and no translator ever saw. The wording
 * follows Architect's own long-standing labels for the same controls, which is
 * what a researcher moving between the two tools already reads.
 */
const CONTROL_LABELS = defineMessages({
  Text: {
    id: 'protocolBuilder.formFields.controlText',
    defaultMessage: 'Text input',
    description:
      'Choice offered for the control a participant answers with: a single-line box they type into.',
  },
  TextArea: {
    id: 'protocolBuilder.formFields.controlTextArea',
    defaultMessage: 'Text area',
    description:
      'Choice offered for the control a participant answers with: a large box for several lines of text.',
  },
  Number: {
    id: 'protocolBuilder.formFields.controlNumber',
    defaultMessage: 'Number input',
    description:
      'Choice offered for the control a participant answers with: a box that takes a number.',
  },
  Boolean: {
    id: 'protocolBuilder.formFields.controlBoolean',
    defaultMessage: 'Yes or no buttons',
    description:
      'Choice offered for the control a participant answers with: a pair of buttons for a true or false answer.',
  },
  Toggle: {
    id: 'protocolBuilder.formFields.controlToggle',
    defaultMessage: 'Toggle',
    description:
      'Choice offered for the control a participant answers with: a single switch they turn on or off.',
  },
  RadioGroup: {
    id: 'protocolBuilder.formFields.controlRadioGroup',
    defaultMessage: 'Radio group',
    description:
      'Choice offered for the control a participant answers with: a list of options of which they pick one.',
  },
  CheckboxGroup: {
    id: 'protocolBuilder.formFields.controlCheckboxGroup',
    defaultMessage: 'Checkbox group',
    description:
      'Choice offered for the control a participant answers with: a list of options of which they may pick several.',
  },
  ToggleButtonGroup: {
    id: 'protocolBuilder.formFields.controlToggleButtonGroup',
    defaultMessage: 'Toggle button group',
    description:
      'Choice offered for the control a participant answers with: a row of buttons of which they may turn on several.',
  },
  LikertScale: {
    id: 'protocolBuilder.formFields.controlLikertScale',
    defaultMessage: 'Likert scale',
    description:
      'Choice offered for the control a participant answers with: an ordered scale from one extreme to the other.',
  },
  VisualAnalogScale: {
    id: 'protocolBuilder.formFields.controlVisualAnalogScale',
    defaultMessage: 'Visual analogue scale',
    description:
      'Choice offered for the control a participant answers with: a slider they move along a continuous line.',
  },
  DatePicker: {
    id: 'protocolBuilder.formFields.controlDatePicker',
    defaultMessage: 'Date picker',
    description:
      'Choice offered for the control a participant answers with: a calendar they choose a date from.',
  },
  RelativeDatePicker: {
    id: 'protocolBuilder.formFields.controlRelativeDatePicker',
    defaultMessage: 'Relative date picker',
    description:
      'Choice offered for the control a participant answers with: a date chosen as a number of days before or after another date.',
  },
} satisfies Record<keyof typeof ComponentTypes, MessageDescriptor>);

/**
 * What one input control is called, for a surface naming a control the
 * researcher has already chosen rather than offering the list.
 *
 * `undefined` for a `component` the schema does not know, which is what a
 * protocol authored against a later schema arrives holding.
 */
export const controlLabel = (
  component: string | undefined,
): MessageDescriptor | undefined =>
  component !== undefined && component in CONTROL_LABELS
    ? CONTROL_LABELS[component as keyof typeof CONTROL_LABELS]
    : undefined;

/**
 * The controls a given kind of answer may be collected with, each with the
 * descriptor it is named by.
 *
 * Descriptors rather than strings for the same reason as `TYPE_OPTIONS`: the
 * caller formats them where it renders them.
 */
export const controlsForType = (
  type: string,
): readonly Readonly<{ value: string; label: MessageDescriptor }>[] =>
  isCollectableType(type)
    ? VARIABLE_TYPE_COMPONENTS[type].map((value) => ({
        value,
        label: CONTROL_LABELS[value],
      }))
    : [];

/**
 * Every input control a form can collect an answer with, in the order the
 * kinds of answer are offered in — simplest first, which is the order
 * Architect's own new-attribute control list reads in
 * (`VariableDefinitionFields`: an existing attribute's list is alphabetised
 * because it is a lookup; a new one's keeps the authored progression).
 *
 * For the one row that chooses a control before there is an attribute to
 * narrow it by: the network composer's, where the control is what DECIDES the
 * kind of answer rather than the other way round.
 */
export const ALL_CONTROLS: readonly Readonly<{
  value: string;
  label: MessageDescriptor;
}>[] = Object.freeze(
  TYPE_OPTIONS.flatMap(({ value }) => [...controlsForType(value)]),
);

/**
 * The kind of answer an input control collects — the inverse of
 * {@link controlsForType}.
 *
 * Total and unambiguous, and not a convenience: every control in
 * `VARIABLE_TYPE_COMPONENTS` appears under exactly ONE type, because the
 * variable schemas are split on `component` and a control offered for two
 * kinds of answer would make a saved field mean two things. So a caller that
 * knows which control the participant answers with already knows what the
 * attribute holds — which is what lets a field preview the control it is being
 * given before the attribute it collects into exists, and what lets the
 * network composer's row invent an attribute from the control alone.
 *
 * `undefined` for a control nobody has chosen yet, and for a `component` the
 * schema does not know — which is what a protocol authored against a later
 * schema arrives holding.
 */
const TYPE_FOR_CONTROL: ReadonlyMap<string, VariableType> = new Map(
  TYPE_OPTIONS.flatMap(({ value }) =>
    VARIABLE_TYPE_COMPONENTS[value].map(
      (component): readonly [string, VariableType] => [component, value],
    ),
  ),
);

export const typeForControl = (
  control: string | undefined,
): VariableType | undefined =>
  control === undefined ? undefined : TYPE_FOR_CONTROL.get(control);

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

/**
 * Whether a name and a kind of answer are enough to make this attribute.
 *
 * False for most of them: a text box or a number is finished the moment it is
 * named, and asking the researcher to visit the codebook editor for one would
 * be a trip that decides nothing. True where the kind itself carries something
 * the researcher has not been asked for yet, and where an attribute created
 * without it would reach a participant meaning nothing:
 *
 * - a list of answers, which the schema refuses fewer than two of; and
 * - a scale, whose two end labels are what tell a participant which way along
 *   the line is which. The protocol schema takes a scale with no `parameters`
 *   at all — an unlabelled slider is a legal protocol and a useless question —
 *   so the rule that catches it is the codebook editor's own.
 *
 * The second half is ASKED of that editor rather than listed here, so the two
 * cannot drift: a shape whose settings become required is one this refuses to
 * quick-create from that moment, and a control that stops requiring them is
 * quick-created again with nothing to change. Asked of every control the kind
 * can be collected with, because the control is chosen after the kind is —
 * there is nothing yet to narrow it by, and a kind with one demanding control
 * is one a bare create cannot finish.
 */
export const needsCodebookEditorToCreate = (type: string): boolean =>
  isOptionType(type) ||
  controlsForType(type).some(({ value }) => {
    const shape = parameterShapeFor(type, value);
    return shape !== null && hasParameterIssues(validateParameters(shape, {}));
  });
