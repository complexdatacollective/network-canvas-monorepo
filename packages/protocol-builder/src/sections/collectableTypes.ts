import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
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
 * The label is the descriptor the codebook editor names that type by rather
 * than the schema's token, so a type reaches a reader in their own language
 * wherever it is named. Formatted at the call site.
 */
export const TYPE_OPTIONS = VARIABLE_TYPE_OPTIONS.filter(
  ({ value }) => VARIABLE_TYPE_COMPONENTS[value].length > 0,
);

export const isCollectableType = (type: string): type is VariableType =>
  TYPE_OPTIONS.some(({ value }) => value === type);

/**
 * What each input control is called, in the reader's language.
 *
 * Architect's own names for these controls, which is what the documentation
 * calls them and what a protocol file spells them — do not replace them with
 * descriptive paraphrases. Spaced Title Case throughout: the control's own
 * name, with its words separated.
 */
const CONTROL_LABELS = defineMessages({
  Text: {
    id: 'protocolBuilder.formFields.controlText',
    defaultMessage: 'Text Input',
    description:
      'Choice offered for the control a participant answers with: a single-line box they type into. Architect names this control TextInput; the label is that name with its words separated.',
  },
  TextArea: {
    id: 'protocolBuilder.formFields.controlTextArea',
    defaultMessage: 'Text Area',
    description:
      'Choice offered for the control a participant answers with: a large box for several lines of text. Architect names this control TextArea; the label is that name with its words separated.',
  },
  Number: {
    id: 'protocolBuilder.formFields.controlNumber',
    defaultMessage: 'Number Input',
    description:
      'Choice offered for the control a participant answers with: a box that takes a number. Architect names this control NumberInput; the label is that name with its words separated.',
  },
  Boolean: {
    id: 'protocolBuilder.formFields.controlBoolean',
    defaultMessage: 'Boolean Choice',
    description:
      'Choice offered for the control a participant answers with: a pair of buttons for a true or false answer. Architect names this control BooleanChoice; the label is that name with its words separated.',
  },
  Toggle: {
    id: 'protocolBuilder.formFields.controlToggle',
    defaultMessage: 'Toggle',
    description:
      'Choice offered for the control a participant answers with: a single switch they turn on or off. Architect names this control Toggle, which is one word, so the label is that name unchanged.',
  },
  RadioGroup: {
    id: 'protocolBuilder.formFields.controlRadioGroup',
    defaultMessage: 'Radio Group',
    description:
      'Choice offered for the control a participant answers with: a list of options of which they pick one. Architect names this control RadioGroup; the label is that name with its words separated.',
  },
  CheckboxGroup: {
    id: 'protocolBuilder.formFields.controlCheckboxGroup',
    defaultMessage: 'Checkbox Group',
    description:
      'Choice offered for the control a participant answers with: a list of options of which they may pick several. Architect names this control CheckboxGroup; the label is that name with its words separated.',
  },
  ToggleButtonGroup: {
    id: 'protocolBuilder.formFields.controlToggleButtonGroup',
    defaultMessage: 'Toggle Button Group',
    description:
      'Choice offered for the control a participant answers with: a row of buttons of which they may turn on several. Architect names this control ToggleButtonGroup; the label is that name with its words separated.',
  },
  LikertScale: {
    id: 'protocolBuilder.formFields.controlLikertScale',
    defaultMessage: 'Likert Scale',
    description:
      'Choice offered for the control a participant answers with: an ordered scale from one extreme to the other. Architect names this control LikertScale; the label is that name with its words separated.',
  },
  VisualAnalogScale: {
    id: 'protocolBuilder.formFields.controlVisualAnalogScale',
    defaultMessage: 'Visual Analog Scale',
    description:
      'Choice offered for the control a participant answers with: a slider they move along a continuous line. Architect names this control VisualAnalogScale; the label is that name with its words separated.',
  },
  DatePicker: {
    id: 'protocolBuilder.formFields.controlDatePicker',
    defaultMessage: 'Date Picker',
    description:
      'Choice offered for the control a participant answers with: a calendar they choose a date from. Architect names this control DatePicker; the label is that name with its words separated.',
  },
  RelativeDatePicker: {
    id: 'protocolBuilder.formFields.controlRelativeDatePicker',
    defaultMessage: 'Relative Date Picker',
    description:
      'Choice offered for the control a participant answers with: a date chosen as a number of days before or after another date. Architect names this control RelativeDatePicker; the label is that name with its words separated.',
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
 * Every input control a form can collect an answer with, grouped under the
 * kind of answer each group collects.
 *
 * For a row choosing a control before there is an attribute to narrow it by:
 * the control decides the kind of answer, so the whole list is offered and the
 * groups say what each choice will make the attribute. Real `<optgroup>`s, not
 * disabled separator options — a screen reader announces those as choices.
 *
 * In the codebook editor's order (`VARIABLE_TYPE_OPTIONS`), and formatted here
 * so both inventing rows share one grouped list.
 */
export const allControlGroups = (
  intl: IntlShape,
): { label: string; options: { value: string; label: string }[] }[] =>
  TYPE_OPTIONS.map(({ value, label }) => ({
    label: intl.formatMessage(label),
    options: controlsForType(value).map((control) => ({
      value: control.value,
      label: intl.formatMessage(control.label),
    })),
  }));

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
 * quick-created again with nothing to change. Asked of the kind rather than of
 * the control that decided it, so a kind whose controls disagree cannot be
 * quick-created through its forgiving one and then switched to the demanding
 * one.
 */
export const needsCodebookEditorToCreate = (type: string): boolean =>
  isOptionType(type) ||
  controlsForType(type).some(({ value }) => {
    const shape = parameterShapeFor(type, value);
    return shape !== null && hasParameterIssues(validateParameters(shape, {}));
  });
