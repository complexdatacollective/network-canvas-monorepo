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
import type { ComponentType, Variable } from '@codaco/protocol-validation';

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

export type ProtocolFieldDefinition = {
  variable: string;
  label: string;
  type: Variable['type'];
  component: ComponentType;
  hint?: string;
  showValidationHints?: boolean;
  options?: unknown[];
  parameters?: Record<string, unknown>;
  validation?: Record<string, unknown>;
};

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
    options?: unknown[];
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
    label: field.label,
    ...(field.hint !== undefined && { hint: field.hint }),
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
    props.options = field.options;
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
    if (typeof minLabel === 'string') props.minLabel = minLabel;
    if (typeof maxLabel === 'string') props.maxLabel = maxLabel;
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
