export const ComponentTypes = {
  Boolean: 'Boolean',
  CheckboxGroup: 'CheckboxGroup',
  Number: 'Number',
  RadioGroup: 'RadioGroup',
  Text: 'Text',
  TextArea: 'TextArea',
  Toggle: 'Toggle',
  ToggleButtonGroup: 'ToggleButtonGroup',
  VisualAnalogScale: 'VisualAnalogScale',
  LikertScale: 'LikertScale',
  DatePicker: 'DatePicker',
  RelativeDatePicker: 'RelativeDatePicker',
} as const;

export const VariableTypes = {
  boolean: 'boolean',
  text: 'text',
  number: 'number',
  datetime: 'datetime',
  ordinal: 'ordinal',
  scalar: 'scalar',
  categorical: 'categorical',
  layout: 'layout',
  location: 'location',
} as const;

export const NON_RENDERABLE_VARIABLE_TYPES = new Set<string>([
  VariableTypes.layout,
  VariableTypes.location,
]);

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys of the `as const` ComponentTypes table above, so exactly its literal keys
export const ComponentTypesKeys = Object.keys(
  ComponentTypes,
) as (keyof typeof ComponentTypes)[];
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys of the `as const` VariableTypes table above, so exactly its literal keys
export const VariableTypesKeys = Object.keys(
  VariableTypes,
) as (keyof typeof VariableTypes)[];
export type VariableType = (typeof VariableTypesKeys)[number];
export type ComponentType = (typeof ComponentTypesKeys)[number];

export const DEFAULT_MIN_DATE = { years: 100 }; // DateTime.minus(DEFAULT_MIN_DATE);

export const DEFAULT_TYPE = 'full';

export const DATE_FORMATS = {
  full: 'yyyy-MM-dd',
  month: 'yyyy-MM',
  year: 'yyyy',
} as const;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys of the `as const` DATE_FORMATS table above, so exactly its literal keys
export const DATE_FORMATS_KEYS = Object.keys(
  DATE_FORMATS,
) as (keyof typeof DATE_FORMATS)[];

export type DateFormat = (typeof DATE_FORMATS_KEYS)[number];
