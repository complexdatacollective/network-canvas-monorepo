'use client';

import { type ReactNode, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import FieldNamespace, {
  resolveFieldName,
  resolveFieldPath,
} from '@codaco/fresco-ui/form/FieldNamespace';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import type {
  ComposerFormField,
  FormField,
  StageSubject,
} from '@codaco/protocol-validation';

import { useDynamicValueSources } from '../dynamicValues/DynamicValueScope';
import { FormDynamicValues } from '../dynamicValues/FormDynamicValues';
import { useStageSelector } from '../hooks/useStageSelector';
import {
  getValidationContext,
  type Subject,
  selectFieldMetadataFromVariables,
  selectFieldMetadataWithSubject,
} from '../selectors/forms';
import { getCodebookVariablesForSubjectType } from '../selectors/protocol';
import { useVariableLabels } from './buildVariableLabels';
import { coerceFormValues } from './coerceFormValues';
import { formValuesToAttributePatch } from './formValuesToAttributePatch';
import type { ProtocolFieldDefinition } from './ProtocolField';
import ProtocolFormField from './ProtocolFormField';
import { useValidationNetwork } from './useValidationNetwork';

const NO_VARIABLES: readonly string[] = [];

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
 * A form's fields, with the captions the variable-comparison validators name
 * their target with. Those are resolved here, inside `FormDynamicValues`
 * where the form has one, so a caption showing an earlier answer reads the
 * answer as typed and a validation message names the question as it is on
 * screen.
 */
function ProtocolFormFields({
  fields,
  unavailableVariables,
  initialValues,
  autoFocus,
  validationContext,
}: {
  fields: readonly ProtocolFieldDefinition[];
  unavailableVariables: readonly string[];
  initialValues: Record<string, FieldValue> | undefined;
  autoFocus: boolean;
  /** Everything but `variableLabels`, which is added here. */
  validationContext: ValidationContext | null;
}) {
  /**
   * The participant-facing text for each variable this form asks about, for
   * the variable-comparison validators to name their target with. Shared with
   * the screens that render a field without going through this hook (a
   * categorical "other" input, a quick-add popover, the pedigree's side
   * panel), so one comparison rule reads the same way wherever it is asked —
   * see `buildVariableLabels` for what may and may not go in it.
   *
   * Read off the SAME metadata the fields are rendered from, rather than
   * recomputed from the authored fields, so a validator can only name a field
   * by the caption the participant is reading on this screen.
   * `useVariableLabels` keys on content, so the fresh array mapped here does
   * not destabilise `validationContext`.
   */
  const variableLabels = useVariableLabels(
    fields.map((field) => ({ variable: field.variable, label: field.label })),
  );
  const fieldContext = useMemo(
    () =>
      validationContext === null
        ? undefined
        : { ...validationContext, variableLabels },
    [validationContext, variableLabels],
  );

  return (
    <>
      {fields.map((field, index) => {
        const initialValue =
          initialValues &&
          Object.hasOwn(initialValues, field.variable) &&
          initialValues[field.variable] !== undefined
            ? initialValues[field.variable]
            : undefined;

        return (
          <ProtocolFormField
            key={index}
            field={field}
            unavailable={unavailableVariables.includes(field.variable)}
            initialValue={initialValue}
            autoFocus={autoFocus && index === 0}
            validationContext={fieldContext}
          />
        );
      })}
    </>
  );
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
 * @param formValueAliases - Maps codebook variable IDs to interface-owned form
 *                    keys while preserving the original ID for metadata lookup.
 * @param unavailableVariables - Variables whose stored answer can never be
 *                    shown (see `useProtectedFormValues`). Each is shown as
 *                    unavailable, and `toAttributePatch` leaves it as stored
 *                    unless the participant enters a new answer.
 * @param precedingVariables - Variables the interface's own controls ask in
 *                    the same form before these fields (Family Pedigree's
 *                    name, gender identity and sex assigned at birth). The
 *                    fields' text can show their answers as they are given,
 *                    as validation allows.
 * @param newEntityAttributes - What a new entity is created with besides the
 *                    form's answers (a Name Generator prompt's additional
 *                    attributes), which the fields' text can show while the
 *                    entity is being created.
 */
export default function useProtocolForm({
  fields,
  autoFocus = false,
  initialValues,
  subject,
  namespace,
  currentEntityId,
  formValueAliases,
  unavailableVariables = NO_VARIABLES,
  precedingVariables = NO_VARIABLES,
  newEntityAttributes,
}: {
  fields: Array<FormField | ComposerFormField>;
  autoFocus?: boolean;
  initialValues?: Record<string, FieldValue>;
  subject?: Subject;
  namespace?: string;
  currentEntityId?: string;
  formValueAliases?: Readonly<Record<string, string>>;
  unavailableVariables?: readonly string[];
  precedingVariables?: readonly string[];
  newEntityAttributes?: Readonly<Record<string, unknown>>;
}) {
  const stageValidationContext = useStageSelector(getValidationContext);
  const baseValidationContext =
    stageValidationContext as ValidationContext | null;

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

  const { context: validationNetwork, passphraseNeeded } = useValidationNetwork(
    stageValidationContext,
    subjectToStageSubject(stableSubject) ?? stageValidationContext.stageSubject,
    fieldsMetadata.map((field) => field.variable),
    currentEntityId,
  );

  const validationContext = useMemo<ValidationContext | null>(() => {
    if (!baseValidationContext) return null;

    // Stages without a top-level subject (e.g. Information) leave
    // stageSubject null, which the context-dependent validators
    // (unique/sameAs/differentFrom/greaterThanVariable) dereference. When the
    // caller supplies a concrete subject for the rendered fields, use it as the
    // stageSubject so those validators resolve against the right entity type.
    const resolvedSubject = subjectToStageSubject(stableSubject);
    const stageSubject = resolvedSubject ?? baseValidationContext.stageSubject;

    return {
      ...baseValidationContext,
      ...validationNetwork,
      stageSubject,
      ...(currentEntityId !== undefined ? { currentEntityId } : {}),
      ...(formValueAliases !== undefined ? { formValueAliases } : {}),
    };
  }, [
    baseValidationContext,
    currentEntityId,
    formValueAliases,
    stableSubject,
    validationNetwork,
  ]);

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

  /**
   * The change a submission of `values` makes to the entity's attributes. A
   * stored answer the form could not show is never part of it unless the
   * participant entered a new one.
   */
  const toAttributePatch = useCallback(
    (values: Record<string, FieldValue>) =>
      formValuesToAttributePatch(
        coerceValues(values),
        fields.map((field) => field.variable),
        { keepWhenUnanswered: unavailableVariables },
      ),
    [coerceValues, fields, unavailableVariables],
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

  const variableByFieldPath = useMemo(() => {
    const namespacePath = namespace ? resolveFieldPath([], namespace) : [];
    return Object.fromEntries(
      fieldsMetadata.map((field) => [
        resolveFieldName(namespacePath, field.variable, 'opaque'),
        field.variable,
      ]),
    );
  }, [fieldsMetadata, namespace]);

  const dynamicValueSources = useDynamicValueSources();
  const formVariables = useMemo(
    () => [
      ...precedingVariables,
      ...fieldsMetadata.map((field) => field.variable),
    ],
    [precedingVariables, fieldsMetadata],
  );

  const renderedFields = (
    <ProtocolFormFields
      fields={fieldsMetadata}
      unavailableVariables={unavailableVariables}
      initialValues={initialValues}
      autoFocus={autoFocus}
      validationContext={validationContext}
    />
  );

  // The fields' captions can show values of the entity the form describes,
  // including answers given in its earlier fields (see `FormDynamicValues`).
  // A stage that binds no values leaves the fields as they are.
  const showsDynamicValues =
    dynamicValueSources !== null &&
    Object.keys(dynamicValueSources.bindings).length > 0;
  const inFormScope = (children: ReactNode): ReactNode => {
    const scoped = showsDynamicValues ? (
      <FormDynamicValues
        formSubject={
          subjectToStageSubject(stableSubject) ??
          stageValidationContext.stageSubject
        }
        stageSubject={stageValidationContext.stageSubject}
        entityId={currentEntityId}
        initialValues={initialValues}
        variables={formVariables}
        {...(newEntityAttributes !== undefined && { newEntityAttributes })}
        coerce={coerceValues}
      >
        {children}
      </FormDynamicValues>
    ) : (
      children
    );
    return namespace ? (
      <FieldNamespace prefix={namespace}>{scoped}</FieldNamespace>
    ) : (
      scoped
    );
  };

  const fieldComponents: ReactNode = inFormScope(renderedFields);

  return {
    fieldComponents,
    /**
     * Puts other text about the form (an Ego Form's title) in the same scope
     * as its fields, so it shows the participant's answers as they are given.
     * Must be rendered inside the form's store.
     */
    withFormValues: inFormScope,
    coerceValues,
    toAttributePatch,
    componentByVariable,
    variableByFieldPath,
    passphraseNeeded,
  };
}
