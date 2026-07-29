import { type ReactNode, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type {
  FieldValue,
  ValidationPropsCatalogue,
  ValidFieldComponent,
} from '@codaco/fresco-ui/form/Field/types';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
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
  ComposerFormField,
  ComponentType,
  FormField,
  StageSubject,
} from '@codaco/protocol-validation';

import { useStageSelector } from '../hooks/useStageSelector';
import {
  getValidationContext,
  type Subject,
  selectFieldMetadataFromVariables,
  selectFieldMetadataWithSubject,
} from '../selectors/forms';
import { getCodebookVariablesForSubjectType } from '../selectors/protocol';
import { buildDatePickerBoundProps } from './buildDatePickerBoundProps';
import { buildFieldValidationProps } from './buildFieldValidationProps';
import { coerceFormValues } from './coerceFormValues';

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

/**
 * Narrow a loosely-typed form Subject into a valid StageSubject for the
 * validation context. Returns null when the subject is absent or a node/edge
 * subject lacks a type (which can't identify a codebook entity).
 */
function subjectToStageSubject(subject?: Subject): StageSubject | null {
  if (!subject) return null;
  if (subject.entity === 'ego') return { entity: 'ego' };
  if (subject.type === undefined) return null;
  return { entity: subject.entity, type: subject.type };
}

/**
 * Hook to automatically convert protocol form definitions into the new form
 * system by generating Field components with validation props.
 *
 * @param fields - The form field definitions from the protocol
 * @param autoFocus - Whether to auto-focus the first field
 * @param initialValues - Initial values for the form fields
 * @param subject - Optional subject to use for looking up codebook variables.
 *                  If provided, uses subject from props instead of Redux state.
 *                  Required for SlidesForm where subject comes from item props.
 * @param namespace - Optional prefix for field names (e.g. "partner-0") to
 *                    avoid collisions when multiple instances share a form store.
 */
export default function useProtocolForm({
  fields,
  autoFocus = false,
  initialValues,
  subject,
  namespace,
  currentEntityId,
}: {
  fields: Array<FormField | ComposerFormField>;
  autoFocus?: boolean;
  initialValues?: Record<string, FieldValue>;
  subject?: Subject;
  namespace?: string;
  currentEntityId?: string;
}) {
  const baseValidationContext = useStageSelector(
    getValidationContext,
  ) as ValidationContext | null;

  // Callers routinely pass `subject` as an inline literal, so key on its
  // VALUES rather than its identity. A per-render subject identity would give
  // validationContext a new identity every render, which re-registers every
  // field (see useField's register effect) — and when an ancestor is
  // subscribed to the form store (e.g. the FamilyPedigree wizard steps), each
  // re-registration re-renders that ancestor, looping infinitely.
  const subjectEntity = subject?.entity;
  const subjectType = subject?.type;
  const stableSubject = useMemo<Subject | undefined>(
    () =>
      subjectEntity !== undefined
        ? {
            entity: subjectEntity,
            ...(subjectType !== undefined ? { type: subjectType } : {}),
          }
        : undefined,
    [subjectEntity, subjectType],
  );

  const validationContext = useMemo<ValidationContext | null>(() => {
    if (!baseValidationContext) return null;

    // Stages without a top-level subject (e.g. FamilyPedigree) leave
    // stageSubject null, which the context-dependent validators
    // (unique/sameAs/differentFrom/greaterThanVariable) dereference. When the
    // caller supplies a concrete subject for the rendered fields, use it as the
    // stageSubject so those validators resolve against the right entity type.
    const resolvedSubject = subjectToStageSubject(stableSubject);
    const stageSubject = resolvedSubject ?? baseValidationContext.stageSubject;

    return {
      ...baseValidationContext,
      stageSubject,
      ...(currentEntityId !== undefined ? { currentEntityId } : {}),
    };
  }, [baseValidationContext, currentEntityId, stableSubject]);

  const stageVariables = useStageSelector(getCodebookVariablesForSubjectType);
  const subjectFieldsMetadata = useSelector((state) =>
    stableSubject !== undefined
      ? selectFieldMetadataWithSubject(state, stableSubject, fields)
      : null,
  );
  const fieldsMetadata = useMemo(
    () =>
      subjectFieldsMetadata ??
      selectFieldMetadataFromVariables(stageVariables, fields),
    [subjectFieldsMetadata, stageVariables, fields],
  );

  // Names of fields whose codebook variable is a number, so the submit
  // boundary can coerce their raw string values back to real numbers.
  const numberFieldNames = useMemo(
    () =>
      new Set(
        fieldsMetadata
          .filter((field) => field.type === 'number')
          .map((field) => field.variable),
      ),
    [fieldsMetadata],
  );

  const coerceValues = useCallback(
    (values: Record<string, FieldValue>): Record<string, FieldValue> =>
      coerceFormValues(values, numberFieldNames),
    [numberFieldNames],
  );

  // Audit sweep: the input control each field actually renders with, keyed by
  // variable and resolved exactly as the rendered Field resolves it (stage
  // field first, then codebook variable). Analytics needs the real control
  // name, and the shared `FormFieldSchema` is a strictObject with no
  // `component` key — only NetworkComposer fields carry their own — so the
  // form interfaces' `'component' in field` test recorded 'unknown' for every
  // field of every non-composer form.
  const componentByVariable = useMemo(
    () =>
      Object.fromEntries(
        fieldsMetadata.map((field) => [field.variable, field.component]),
      ),
    [fieldsMetadata],
  );

  const fieldsWithMetadata = fieldsMetadata.map((field, index) => {
    const fieldName = field.variable;

    const props: {
      name: string;
      label: string;
      hint?: string;
      showValidationHints?: boolean;
      component?: string;
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
      name: fieldName,
      label: field.label,
      component: field.component,
      ...(field.hint !== undefined && { hint: field.hint }),
      ...(field.showValidationHints !== undefined && {
        showValidationHints: field.showValidationHints,
      }),
    };

    // Set autoFocus on the first field if requested
    if (autoFocus && index === 0) {
      props.autoFocus = true;
    }

    // Set initial value if provided
    if (initialValues?.[field.variable] !== undefined) {
      props.initialValue = initialValues[field.variable];
    }

    // Pass validation properties derived from the protocol validation object
    if ('validation' in field && field.validation) {
      Object.assign(
        props,
        buildFieldValidationProps({
          type: field.type,
          variable: fieldName,
          validation: field.validation,
        }),
      );
    }

    // Pass validation context for context-dependent validations (unique, sameAs, differentFrom, etc.)
    if (validationContext) {
      props.validationContext = validationContext;
    }

    // Process ordinal and categorical options
    if ('options' in field) {
      props.options = field.options;

      // Turn on columns if there are more than 6 options. Maybe a bad idea?
      if (
        (field.component === 'CheckboxGroup' ||
          field.component === 'RadioGroup') &&
        (field.options?.length ?? 0) > 6
      ) {
        props.useColumns ??= true;
      }
    }

    // Handle number inputs
    if (field.type === 'number') {
      props.type = 'number';
    }

    if (field.type === 'scalar') {
      props.type = 'range';
    }

    // Handle VisualAnalogScale parameters
    if (field.component === 'VisualAnalogScale' && field.parameters) {
      const params = field.parameters;
      if (typeof params.minLabel === 'string') props.minLabel = params.minLabel;
      if (typeof params.maxLabel === 'string') props.maxLabel = params.maxLabel;
    }

    // Forward a DatePicker's resolution to the control. Its min/max validation
    // bounds come from buildDatePickerBoundProps below, which forwards only
    // AUTHORED bounds verbatim — with none authored, fresco-ui's
    // DatePickerField deliberately leaves a full-resolution input unbounded
    // (see 35ff5dfd1), so submission validation must stay unbounded too.
    if (field.component === 'DatePicker' && field.parameters) {
      const params = field.parameters;
      if (typeof params.type === 'string') props.type = params.type;
    }

    // Forward RelativeDatePicker's anchor/before/after to the component for
    // its own UI-side range calculation, separately from the absolute
    // min/max computed below.
    if (field.component === 'RelativeDatePicker' && field.parameters) {
      const params = field.parameters;
      const paramAnchor =
        typeof params.anchor === 'string' ? params.anchor : undefined;
      const paramBefore =
        typeof params.before === 'number' ? params.before : undefined;
      const paramAfter =
        typeof params.after === 'number' ? params.after : undefined;

      if (paramAnchor !== undefined) props.anchor = paramAnchor;
      if (paramBefore !== undefined) props.before = paramBefore;
      if (paramAfter !== undefined) props.after = paramAfter;
    }

    // Pre-compute absolute min/max validation bounds for DatePicker and
    // RelativeDatePicker fields so the Field-level min/max validators fire on
    // submission. Without this, RelativeDatePicker's internally-computed
    // min/max would only constrain the native picker UI — keyboard-typed
    // out-of-range values would pass through validation. Runs whether or not
    // a `parameters` record exists: a RelativeDatePicker with an ABSENT
    // record still renders its default window (see buildDatePickerBoundProps).
    Object.assign(
      props,
      buildDatePickerBoundProps({
        component: field.component,
        parameters: field.parameters,
      }),
    );

    return props;
  });

  const renderedFields = fieldsWithMetadata.map(
    ({ component, ...fieldProps }, index) => {
      const FieldComponent = fieldTypeMap[component as ComponentType];

      return <Field key={index} {...fieldProps} component={FieldComponent} />;
    },
  );

  const fieldComponents: ReactNode = namespace ? (
    <FieldNamespace prefix={namespace}>{renderedFields}</FieldNamespace>
  ) : (
    renderedFields
  );

  return { fieldComponents, coerceValues, componentByVariable };
}
