'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type {
  FieldValue,
  ValidationPropsCatalogue,
  ValidFieldComponent,
} from '@codaco/fresco-ui/form/Field/types';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import DatePickerField from '@codaco/fresco-ui/form/fields/DatePicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RelativeDatePickerField from '@codaco/fresco-ui/form/fields/RelativeDatePicker';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import ToggleButtonGroupField from '@codaco/fresco-ui/form/fields/ToggleButtonGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import VisualAnalogScaleField from '@codaco/fresco-ui/form/fields/VisualAnalogScale';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import type {
  ComponentType,
  LocalizedString,
  Variable,
} from '@codaco/protocol-validation';

import { useResolveLocalizedString } from '../localization/ProtocolLocalizationProvider';
import { buildDatePickerBoundProps } from './buildDatePickerBoundProps';
import { buildFieldValidationProps } from './buildFieldValidationProps';
import { resolveRenderedControl } from './resolveRenderedControl';

const fieldTypeMap: Record<ComponentType, ValidFieldComponent> = {
  Text: InputField,
  TextArea: TextAreaField,
  Number: InputField,
  RadioGroup: RadioGroupField,
  CheckboxGroup: CheckboxGroupField,
  Boolean: BooleanField,
  Toggle: ToggleField,
  ToggleButtonGroup: ToggleButtonGroupField,
  VisualAnalogScale: VisualAnalogScaleField,
  LikertScale: LikertScaleField,
  DatePicker: DatePickerField,
  RelativeDatePicker: RelativeDatePickerField,
};

type ProtocolFieldOption = {
  label: LocalizedString;
  value: string | number | boolean;
  negative?: boolean;
};

export type ProtocolFieldDefinition = {
  variable: string;
  label: LocalizedString;
  type: Variable['type'];
  component: ComponentType;
  hint?: LocalizedString;
  showValidationHints?: boolean;
  options?: readonly ProtocolFieldOption[];
  parameters?: Record<string, unknown>;
  validation?: Record<string, unknown>;
};

// `parameters` is a loose record (a NetworkComposer field may carry any key),
// so a scale's end label is checked for the localized shape before it is used.
const isLocalizedString = (value: unknown): value is LocalizedString =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.values(value).every((text) => typeof text === 'string');

type ProtocolFieldProps = {
  field: ProtocolFieldDefinition;
  name?: string;
  initialValue?: FieldValue;
  autoFocus?: boolean;
  validationContext?: ValidationContext;
};

/**
 * Render one protocol-authored field with the same component resolution,
 * parameters, and validation adapter used by the interview form interfaces.
 *
 * Keeping this as the primitive beneath `useProtocolForm` lets authoring tools
 * mount a faithful isolated preview without reconstructing the interview's
 * control map or validation semantics.
 */
export default function ProtocolField({
  field,
  name = field.variable,
  initialValue,
  autoFocus,
  validationContext,
}: ProtocolFieldProps) {
  const resolve = useResolveLocalizedString();
  const { component, optionsApply } = resolveRenderedControl({
    type: field.type,
    component: field.component,
    validation: field.validation,
  });

  const props: {
    name: string;
    nameMode: 'opaque';
    label: string;
    hint?: string;
    showValidationHints?: boolean;
    options?: (Omit<ProtocolFieldOption, 'label'> & {
      label: string;
    })[];
    useColumns?: boolean;
    type?: string;
    minLabel?: string;
    maxLabel?: string;
    min?: string | number;
    max?: string | number;
    anchor?: string;
    before?: number;
    after?: number;
    initialValue?: FieldValue;
    autoFocus?: boolean;
    validationContext?: ValidationContext;
  } & Partial<ValidationPropsCatalogue> = {
    name,
    nameMode: 'opaque',
    label: resolve(field.label).text,
    ...(field.hint !== undefined && { hint: resolve(field.hint).text }),
    ...(field.showValidationHints !== undefined && {
      showValidationHints: field.showValidationHints,
    }),
    ...(initialValue !== undefined && { initialValue }),
    ...(autoFocus !== undefined && { autoFocus }),
    ...(validationContext !== undefined && { validationContext }),
  };

  if (field.validation) {
    Object.assign(
      props,
      buildFieldValidationProps({
        type: field.type,
        variable: field.variable,
        validation: field.validation,
      }),
    );
  }

  // `optionsApply` is false for a control the resolver swapped: the
  // replacement asks its own two-valued question, so the codebook's boolean
  // options would change the question's answer domain.
  if (field.options && optionsApply) {
    props.options = field.options.map((option) => ({
      ...option,
      label: resolve(option.label).text,
    }));
    if (
      (component === 'CheckboxGroup' || component === 'RadioGroup') &&
      field.options.length > 6
    ) {
      props.useColumns = true;
    }
  }

  if (field.type === 'number') props.type = 'number';
  if (field.type === 'scalar') props.type = 'range';

  if (component === 'VisualAnalogScale' && field.parameters) {
    const { minLabel, maxLabel } = field.parameters;
    if (isLocalizedString(minLabel)) {
      props.minLabel = resolve(minLabel).text;
    }
    if (isLocalizedString(maxLabel)) {
      props.maxLabel = resolve(maxLabel).text;
    }
  }

  if (component === 'DatePicker' && field.parameters) {
    const parameterType = field.parameters.type;
    if (typeof parameterType === 'string') props.type = parameterType;
  }

  if (component === 'RelativeDatePicker' && field.parameters) {
    const { anchor, before, after } = field.parameters;
    if (typeof anchor === 'string') props.anchor = anchor;
    if (typeof before === 'number') props.before = before;
    if (typeof after === 'number') props.after = after;
  }

  Object.assign(
    props,
    buildDatePickerBoundProps({
      component,
      parameters: field.parameters,
    }),
  );

  const FieldComponent = fieldTypeMap[component];
  return <Field {...props} component={FieldComponent} />;
}
