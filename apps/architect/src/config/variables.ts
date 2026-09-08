import { get } from 'es-toolkit/compat';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import {
  type ComponentType,
  VARIABLE_TYPE_COMPONENTS,
} from '@codaco/protocol-validation';
import type { ConfigMessage, FormattedConfig } from '~/i18n/formatConfig';

import BooleanVariable from '../images/variables/boolean-variable.svg';
import CategoricalVariable from '../images/variables/categorical-variable.svg';
import DateVariable from '../images/variables/date-variable.svg';
import DefaultVariable from '../images/variables/default-variable.svg';
import LayoutVariable from '../images/variables/layout-variable.svg';
import LocationVariable from '../images/variables/location-variable.svg';
import NumberVariable from '../images/variables/number-variable.svg';
import OrdinalVariable from '../images/variables/ordinal-variable.svg';
import ScalarVariable from '../images/variables/scalar-variable.svg';
import TextVariable from '../images/variables/text-variable.svg';
const configMessages = defineMessages({
  categoricalTypes: {
    id: 'architect.config.variables.config.categoricalTypes',
    defaultMessage: 'Categorical Types',
    description: 'Input-control group heading for variable types.',
  },
  ordinalTypes: {
    id: 'architect.config.variables.config.ordinalTypes',
    defaultMessage: 'Ordinal Types',
    description: 'Input-control group heading for variable types.',
  },
  booleanTypes: {
    id: 'architect.config.variables.config.booleanTypes',
    defaultMessage: 'Boolean Types',
    description: 'Input-control group heading for variable types.',
  },
  textTypes: {
    id: 'architect.config.variables.config.textTypes',
    defaultMessage: 'Text Types',
    description: 'Input-control group heading for variable types.',
  },
  dateTypes: {
    id: 'architect.config.variables.config.dateTypes',
    defaultMessage: 'Date Types',
    description: 'Input-control group heading for variable types.',
  },
  scalarTypes: {
    id: 'architect.config.variables.config.scalarTypes',
    defaultMessage: 'Scalar Types',
    description: 'Input-control group heading for variable types.',
  },
  numberTypes: {
    id: 'architect.config.variables.config.numberTypes',
    defaultMessage: 'Number Types',
    description: 'Input-control group heading for variable types.',
  },
  number: {
    id: 'architect.config.variables.config.number',
    defaultMessage: 'Number',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  text: {
    id: 'architect.config.variables.config.text',
    defaultMessage: 'Text',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  boolean: {
    id: 'architect.config.variables.config.boolean',
    defaultMessage: 'Boolean',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  ordinal: {
    id: 'architect.config.variables.config.ordinal',
    defaultMessage: 'Ordinal',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  categorical: {
    id: 'architect.config.variables.config.categorical',
    defaultMessage: 'Categorical',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  scalar: {
    id: 'architect.config.variables.config.scalar',
    defaultMessage: 'Scalar',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  date: {
    id: 'architect.config.variables.config.date',
    defaultMessage: 'Date',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  layout: {
    id: 'architect.config.variables.config.layout',
    defaultMessage: 'Layout',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  location: {
    id: 'architect.config.variables.config.location',
    defaultMessage: 'Location',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  textInput: {
    id: 'architect.config.variables.config.textInput',
    defaultMessage: 'Text Input',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  thisIsAStandardTextInput: {
    id: 'architect.config.variables.config.thisIsAStandardTextInput',
    defaultMessage:
      'This is a standard text input, allowing for simple data entry up to approximately 30 characters.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  textArea: {
    id: 'architect.config.variables.config.textArea',
    defaultMessage: 'Text Area',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  thisIsAnExtraLargeText: {
    id: 'architect.config.variables.config.thisIsAnExtraLargeText',
    defaultMessage:
      'This is an extra large text input, allowing for simple data entry for more than 30 characters.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  numberInput: {
    id: 'architect.config.variables.config.numberInput',
    defaultMessage: 'Number Input',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  thisInputIsOptimizedForCollecting: {
    id: 'architect.config.variables.config.thisInputIsOptimizedForCollecting',
    defaultMessage:
      'This input is optimized for collecting numerical data, and will show a number pad if available.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  checkboxGroup: {
    id: 'architect.config.variables.config.checkboxGroup',
    defaultMessage: 'Checkbox Group',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  thisComponentProvidesAGroupOf: {
    id: 'architect.config.variables.config.thisComponentProvidesAGroupOf',
    defaultMessage:
      'This component provides a group of checkboxes so that multiple values can be toggled on or off.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  toggle: {
    id: 'architect.config.variables.config.toggle',
    defaultMessage: 'Toggle',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  thisComponentRendersASwitchWhich: {
    id: 'architect.config.variables.config.thisComponentRendersASwitchWhich',
    defaultMessage:
      'This component renders a switch, which can be tapped or clicked to indicate "on" or "off". By default it is in the "off" position. If you require a boolean input without a default, use the BooleanChoice component',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  radioGroup: {
    id: 'architect.config.variables.config.radioGroup',
    defaultMessage: 'Radio Group',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  thisComponentRendersAGroupOf: {
    id: 'architect.config.variables.config.thisComponentRendersAGroupOf',
    defaultMessage:
      'This component renders a group of options and allow the user to choose one.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  toggleButtonGroup: {
    id: 'architect.config.variables.config.toggleButtonGroup',
    defaultMessage: 'Toggle Button Group',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  thisComponentProvidesAColorfulButton: {
    id: 'architect.config.variables.config.thisComponentProvidesAColorfulButton',
    defaultMessage:
      'This component provides a colorful button that can be toggled "on" or "off". It is an alternative to the Checkbox Group, and allows multiple selection by default.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  likertScale: {
    id: 'architect.config.variables.config.likertScale',
    defaultMessage: 'LikertScale',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  aComponentProvidingALikertTypeScale: {
    id: 'architect.config.variables.config.aComponentProvidingALikertTypeScale',
    defaultMessage:
      'A component providing a likert-type scale in the form of a slider. Values are derived from the option properties of this attribute, with labels for each option label.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  visualAnalogScale: {
    id: 'architect.config.variables.config.visualAnalogScale',
    defaultMessage: 'VisualAnalogScale',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  aVisualAnalogScaleVASComponent: {
    id: 'architect.config.variables.config.aVisualAnalogScaleVASComponent',
    defaultMessage:
      'A Visual Analog Scale (VAS) component, which sets a normalized value between 0 and 1 representing the position of the slider between each end of the scale.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  datePicker: {
    id: 'architect.config.variables.config.datePicker',
    defaultMessage: 'DatePicker',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  aCalendarDatePickerThatAllows: {
    id: 'architect.config.variables.config.aCalendarDatePickerThatAllows',
    defaultMessage:
      'A calendar date picker that allows a respondent to quickly enter year, month, and day data.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  relativeDatePicker: {
    id: 'architect.config.variables.config.relativeDatePicker',
    defaultMessage: 'RelativeDatePicker',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  aCalendarDatePickerThatAutomatically: {
    id: 'architect.config.variables.config.aCalendarDatePickerThatAutomatically',
    defaultMessage:
      'A calendar date picker that automatically limits available dates relative to an "anchor date", which can be configured to the date of the interview session.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  booleanChoice: {
    id: 'architect.config.variables.config.booleanChoice',
    defaultMessage: 'BooleanChoice',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  aComponentForBooleanAttributesThat: {
    id: 'architect.config.variables.config.aComponentForBooleanAttributesThat',
    defaultMessage:
      'A component for boolean attributes that requires the participant to actively select an option. Unlike the toggle component, this component accepts the "required" validation.',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
});

// TODO: This should be a monolithic object that contains all variable types
// and properties. All other derivations/permutations of this data should be
// merged into this object.
//
// For example: input components, if the variable has options or properties,
// etc. Then the required properties can be picked from this object using
// map/reduce/get etc.
export const VARIABLE_TYPES = {
  number: {
    label: configMessages.number,
    value: 'number',
    icon: NumberVariable,
    color: 'paradise-pink',
  },
  text: {
    label: configMessages.text,
    value: 'text',
    icon: TextVariable,
    color: 'cerulean-blue',
  },
  boolean: {
    label: configMessages.boolean,
    value: 'boolean',
    icon: BooleanVariable,
    color: 'neon-carrot',
  },
  ordinal: {
    label: configMessages.ordinal,
    value: 'ordinal',
    icon: OrdinalVariable,
    color: 'sea-green',
  },
  categorical: {
    label: configMessages.categorical,
    value: 'categorical',
    icon: CategoricalVariable,
    color: 'mustard',
  },
  scalar: {
    label: configMessages.scalar,
    value: 'scalar',
    icon: ScalarVariable,
    color: 'kiwi',
  },
  datetime: {
    label: configMessages.date,
    value: 'datetime',
    icon: DateVariable,
    color: 'tomato',
  },
  layout: {
    label: configMessages.layout,
    value: 'layout',
    icon: LayoutVariable,
    color: 'purple-pizazz',
  },
  location: {
    label: configMessages.location,
    value: 'location',
    icon: LocationVariable,
    color: 'slate-blue-dark',
  },
};

type ComponentConfig = {
  label: ConfigMessage;
  value: string;
  description: ConfigMessage;
  image: string;
};

const COMPONENTS = {
  TextInput: {
    label: configMessages.textInput,
    value: 'Text',
    description: configMessages.thisIsAStandardTextInput,
    image: 'TextInput',
  },
  TextArea: {
    label: configMessages.textArea,
    value: 'TextArea',
    description: configMessages.thisIsAnExtraLargeText,
    image: 'TextArea',
  },
  NumberInput: {
    label: configMessages.numberInput,
    value: 'Number',
    description: configMessages.thisInputIsOptimizedForCollecting,
    image: 'NumberInput',
  },
  CheckboxGroup: {
    label: configMessages.checkboxGroup,
    value: 'CheckboxGroup',
    description: configMessages.thisComponentProvidesAGroupOf,
    image: 'CheckboxGroup',
  },
  Toggle: {
    label: configMessages.toggle,
    value: 'Toggle',
    description: configMessages.thisComponentRendersASwitchWhich,
    image: 'Toggle',
  },
  RadioGroup: {
    label: configMessages.radioGroup,
    value: 'RadioGroup',
    description: configMessages.thisComponentRendersAGroupOf,
    image: 'RadioGroup',
  },
  ToggleButtonGroup: {
    label: configMessages.toggleButtonGroup,
    value: 'ToggleButtonGroup',
    description: configMessages.thisComponentProvidesAColorfulButton,
    image: 'ToggleButtonGroup',
  },
  LikertScale: {
    label: configMessages.likertScale,
    value: 'LikertScale',
    description: configMessages.aComponentProvidingALikertTypeScale,
    image: 'LikertScale',
  },
  VisualAnalogScale: {
    label: configMessages.visualAnalogScale,
    value: 'VisualAnalogScale',
    description: configMessages.aVisualAnalogScaleVASComponent,
    image: 'VisualAnalogScale',
  },
  DatePicker: {
    label: configMessages.datePicker,
    value: 'DatePicker',
    description: configMessages.aCalendarDatePickerThatAllows,
    image: 'DatePicker',
  },
  RelativeDatePicker: {
    label: configMessages.relativeDatePicker,
    value: 'RelativeDatePicker',
    description: configMessages.aCalendarDatePickerThatAutomatically,
    image: 'RelativeDatePicker',
  },
  BooleanChoice: {
    label: configMessages.booleanChoice,
    value: 'Boolean',
    description: configMessages.aComponentForBooleanAttributesThat,
    image: 'BooleanChoice',
  },
};

// Architect's presentation metadata keyed by the control value the protocol
// schema uses. The `COMPONENTS` keys above are not those values — TextInput is
// 'Text', NumberInput is 'Number', BooleanChoice is 'Boolean' — so the schema's
// lists can only be resolved through this map. Typing it as a record over the
// schema's own `ComponentType` union means a control the schema gains without a
// matching entry here fails typechecking rather than drifting silently.
const COMPONENTS_BY_CONTROL = {
  Boolean: COMPONENTS.BooleanChoice,
  CheckboxGroup: COMPONENTS.CheckboxGroup,
  DatePicker: COMPONENTS.DatePicker,
  LikertScale: COMPONENTS.LikertScale,
  Number: COMPONENTS.NumberInput,
  RadioGroup: COMPONENTS.RadioGroup,
  RelativeDatePicker: COMPONENTS.RelativeDatePicker,
  Text: COMPONENTS.TextInput,
  TextArea: COMPONENTS.TextArea,
  Toggle: COMPONENTS.Toggle,
  ToggleButtonGroup: COMPONENTS.ToggleButtonGroup,
  VisualAnalogScale: COMPONENTS.VisualAnalogScale,
} satisfies Record<ComponentType, ComponentConfig>;

// The variable types the schema gives at least one input control. Layout and
// location have empty lists — they have no participant-facing control — so they
// have no place in the input-control dropdown.
type RenderableVariableType = {
  [
    Type in keyof typeof VARIABLE_TYPE_COMPONENTS
  ]: (typeof VARIABLE_TYPE_COMPONENTS)[Type]['length'] extends 0 ? never : Type;
}[keyof typeof VARIABLE_TYPE_COMPONENTS];

const variableTypeGroup = (
  type: RenderableVariableType,
  heading: ConfigMessage,
): [string, ComponentConfig[], ConfigMessage] => {
  const controls: readonly ComponentType[] = VARIABLE_TYPE_COMPONENTS[type];

  return [
    type,
    controls.map((control) => COMPONENTS_BY_CONTROL[control]),
    heading,
  ];
};

// Display order and group headings are Architect's own: the schema record orders
// its keys differently, so iterating it directly would reorder the dropdown.
// Only the per-type control lists come from the schema.
//
// The headings carry no `--` decoration: they name real `<optgroup>`s, which
// the browser already sets apart visually and which a screen reader already
// announces as groups. The dashes were there to make a disabled option look
// like a heading, and they were read out as part of it.
const VARIABLE_TYPES_COMPONENTS: [string, ComponentConfig[], ConfigMessage][] =
  [
    variableTypeGroup('number', configMessages.numberTypes),
    variableTypeGroup('scalar', configMessages.scalarTypes),
    variableTypeGroup('datetime', configMessages.dateTypes),
    variableTypeGroup('text', configMessages.textTypes),
    variableTypeGroup('boolean', configMessages.booleanTypes),
    variableTypeGroup('ordinal', configMessages.ordinalTypes),
    variableTypeGroup('categorical', configMessages.categoricalTypes),
  ];

// Internal config - not exported
const VARIABLE_TYPES_WITH_OPTIONS = ['ordinal', 'categorical'];

// Internal config - not exported
const VARIABLE_TYPES_WITH_PARAMETERS = ['scalar', 'datetime'];

export const VARIABLE_TYPES_WITH_COMPONENTS = VARIABLE_TYPES_COMPONENTS.map(
  ([type]) => type,
);

export const INPUT_OPTIONS = Object.values(COMPONENTS);

/**
 * The input controls a researcher can choose from, grouped by the variable
 * type each group produces.
 *
 * A real group, not a flat list punctuated by value-less "heading" options:
 * seven headings all carrying the same absent value are seven duplicate React
 * keys, and a screen reader reads each of them as one more thing to pick.
 */
export type InputControlGroup = {
  label: string;
  options: FormattedConfig<ComponentConfig>[];
};

const formattedInputOptions: {
  label: ConfigMessage;
  options: ComponentConfig[];
}[] = VARIABLE_TYPES_COMPONENTS.map(([, controls, heading]) => ({
  label: heading,
  options: controls,
}));

/** Translate known attribute metadata without changing persisted type identifiers. */
export const getVariableTypeLabel = (
  type: string | undefined,
  intl: IntlShape,
): string => {
  const descriptor = Object.entries(VARIABLE_TYPES).find(
    ([key]) => key === type,
  )?.[1].label;
  return descriptor ? intl.formatMessage(descriptor) : (type ?? '');
};

export const VARIABLE_OPTIONS = Object.values(VARIABLE_TYPES);

const isOrdinalOrCategoricalType = (
  variableType: string | null | undefined,
): variableType is string =>
  typeof variableType === 'string' &&
  VARIABLE_TYPES_WITH_OPTIONS.includes(variableType);

const isVariableTypeWithParameters = (
  variableType: string | null | undefined,
): variableType is string =>
  typeof variableType === 'string' &&
  VARIABLE_TYPES_WITH_PARAMETERS.includes(variableType);

const isBooleanWithOptions = (
  component: string | null | undefined,
): component is string =>
  typeof component === 'string' && component === COMPONENTS.BooleanChoice.value;

const findByType =
  (type: string) =>
  ([t]: [string, ComponentConfig[], ConfigMessage]) =>
    t === type;
const findByComponent =
  (component: string) =>
  ([, c]: [string, ComponentConfig[], ConfigMessage]) =>
    c.some(({ value }) => value === component);
const findTypeIndex = (
  findBy: (entry: [string, ComponentConfig[], ConfigMessage]) => boolean,
) => VARIABLE_TYPES_COMPONENTS.find(findBy) || [null, null, null];

const getComponentsForType = (type: string) => {
  const [, components] = findTypeIndex(findByType(type));

  if (!components) {
    return [COMPONENTS.TextInput];
  }

  return components;
};

const getTypeForComponent = (component: string | undefined) => {
  if (!component) return null;
  const [type] = findTypeIndex(findByComponent(component));

  return type;
};

const getColorForType = (type: string | undefined) =>
  get(VARIABLE_TYPES, [type ?? '', 'color'], 'charcoal');

const getIconForType = (type: string | undefined) =>
  get(VARIABLE_TYPES, `${type ?? ''}.icon`, DefaultVariable);

export {
  formattedInputOptions,
  getColorForType,
  getComponentsForType,
  getIconForType,
  getTypeForComponent,
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
};
