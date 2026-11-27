'use client';

import { createElement, type ReactNode, useId, useMemo, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { useFieldValueFormat } from '@codaco/fresco-ui/form/ContentLocale';
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
import Hint from '@codaco/fresco-ui/form/Hint';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import {
  filterValidationProps,
  makeValidationHints,
} from '@codaco/fresco-ui/form/validation/helpers';
import type {
  ComponentType,
  LocalizedString,
  Variable,
} from '@codaco/protocol-validation';

import { DynamicMarkdown } from '../dynamicValues/DynamicText';
import { markdownSource } from '../dynamicValues/resolveDynamicText';
import {
  type ResolvedProtocolText,
  useResolveLocalizedString,
} from '../localization/ProtocolLocalizationProvider';
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

/**
 * A caption, with any dynamic values in it marked out. The field's label
 * renders a string caption as markdown but shows a node as it is, so a
 * caption with values is rendered as markdown here, with the values kept out
 * of it.
 */
export const shownLabel = ({ text, parts }: ResolvedProtocolText): ReactNode =>
  parts === undefined ? text : <DynamicMarkdown parts={parts} />;

/**
 * A hint, which the field renders as markdown, with any dynamic values in it
 * marked out and kept out of the markdown.
 */
const shownHint = ({ text, parts }: ResolvedProtocolText): ReactNode =>
  parts === undefined ? text : <DynamicMarkdown parts={parts} />;

/** The props a protocol field's control takes, besides its name and value. */
type ControlProps = {
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
} & Partial<ValidationPropsCatalogue>;

/**
 * The control a protocol field renders, with its parameters and validation
 * props: one resolution, shared by the interview's field and the control
 * Architect shows inside a form's field block, so the two never differ.
 */
function useProtocolFieldControl(field: ProtocolFieldDefinition): Readonly<{
  component: ValidFieldComponent;
  props: ControlProps;
}> {
  const resolve = useResolveLocalizedString();
  const { component, optionsApply } = resolveRenderedControl({
    type: field.type,
    component: field.component,
    validation: field.validation,
  });

  const props: ControlProps = {
    ...(field.showValidationHints !== undefined && {
      showValidationHints: field.showValidationHints,
    }),
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
      props.minLabel = markdownSource(resolve(minLabel));
    }
    if (isLocalizedString(maxLabel)) {
      props.maxLabel = markdownSource(resolve(maxLabel));
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

  return { component: fieldTypeMap[component], props };
}

type ProtocolFieldProps = {
  field: ProtocolFieldDefinition;
  name?: string;
  /** Shown in place of the field's authored label. */
  label?: ReactNode;
  /** Shown in place of the field's authored hint. */
  hint?: ReactNode;
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
  label,
  hint,
  initialValue,
  autoFocus,
  validationContext,
}: ProtocolFieldProps) {
  const resolve = useResolveLocalizedString();
  const { component, props } = useProtocolFieldControl(field);

  return (
    <Field
      {...props}
      name={name}
      nameMode="opaque"
      label={label ?? shownLabel(resolve(field.label))}
      {...(hint !== undefined
        ? { hint }
        : field.hint !== undefined && { hint: shownHint(resolve(field.hint)) })}
      {...(initialValue !== undefined && { initialValue })}
      {...(autoFocus !== undefined && { autoFocus })}
      {...(validationContext !== undefined && { validationContext })}
      component={component}
    />
  );
}

type ProtocolFieldControlProps = Readonly<{
  field: ProtocolFieldDefinition;
  /**
   * The id of the element that names the control: the question, which the
   * caller draws above it.
   */
  labelledBy?: string;
  /** The answer the control starts with. */
  initialValue?: FieldValue;
  disabled?: boolean;
  readOnly?: boolean;
  /**
   * What the comparison rules (`sameAs`, `greaterThanVariable`, …) name
   * their target with, for their validation hints.
   */
  validationContext?: ValidationContext;
}>;

/**
 * A protocol field's control as the participant meets it, without its
 * question or hint: the validation hints (when the field shows them) and the
 * control itself, with the field's component, options, parameters and
 * validation resolved exactly as the interview resolves them. Belongs to no
 * form: its answer is kept here, so a caller that draws the question itself
 * (Architect's field block, whose question and hint are text that the
 * researcher edits) can show the control without registering an answer in a
 * form of its own.
 */
export function ProtocolFieldControl({
  field,
  labelledBy,
  initialValue,
  disabled,
  readOnly,
  validationContext,
}: ProtocolFieldControlProps) {
  const id = useId();
  const intl = useAppIntl();
  const valueLocale = useFieldValueFormat().locale;
  const { component, props } = useProtocolFieldControl(field);
  const [value, setValue] = useState<FieldValue | undefined>(initialValue);
  const required = props.required === true;
  const hintId = `${id}-hint`;
  const { showValidationHints, ...controlProps } = props;

  const validationSummary = useMemo(
    () =>
      showValidationHints
        ? makeValidationHints(
            { ...controlProps, validationContext },
            intl,
            valueLocale,
          )
        : undefined,
    // The props are rebuilt on every render; the field they come from is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showValidationHints, field, validationContext, intl, valueLocale],
  );

  return (
    <div className="flex flex-col gap-2" data-protocol-field-control="">
      {validationSummary !== undefined && (
        <Hint id={hintId} validationSummary={validationSummary} />
      )}
      {createElement(component, {
        ...filterValidationProps(controlProps),
        id,
        'name': field.variable,
        value,
        'onChange': setValue,
        disabled,
        readOnly,
        'aria-required': required,
        ...(labelledBy !== undefined && { 'aria-labelledby': labelledBy }),
        ...(validationSummary !== undefined && {
          'aria-describedby': hintId,
        }),
      })}
    </div>
  );
}
