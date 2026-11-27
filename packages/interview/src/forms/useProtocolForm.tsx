'use client';

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useSelector } from 'react-redux';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import FieldNamespace, {
  resolveFieldName,
  resolveFieldPath,
} from '@codaco/fresco-ui/form/FieldNamespace';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import { ALLOWED_MARKDOWN_SECTION_TAGS } from '@codaco/fresco-ui/RenderMarkdown';
import { formDocumentReading } from '@codaco/network-query';
import {
  type ComposerFormField,
  type FormField,
  type LocalizedString,
  type ProtocolObjectId,
  type StageSubject,
} from '@codaco/protocol-validation';

import { assetBlockImages } from '../components/AssetBlock';
import { ContentDocument } from '../content/ContentDocument';
import {
  useDynamicValueSources,
  useStageShowsDynamicValues,
} from '../dynamicValues/DynamicValueScope';
import {
  FormDynamicValues,
  type LabelNode,
} from '../dynamicValues/FormDynamicValues';
import { useStageSelector } from '../hooks/useStageSelector';
import { useResolveLocalizedSource } from '../localization/ProtocolLocalizationProvider';
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

type FieldDefinition = ProtocolFieldDefinition & { id: ProtocolObjectId };

/**
 * The context a form's fields validate in, with the captions the
 * variable-comparison validators name their target with. Those are resolved
 * where this is called, inside `FormDynamicValues` where the form has one,
 * so a caption showing an earlier answer reads the answer as typed and a
 * validation message names the question as it is on screen.
 */
function useFieldValidationContext(
  fields: readonly FieldDefinition[],
  validationContext: ValidationContext | null,
): ValidationContext | undefined {
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
  return useMemo(
    () =>
      validationContext === null
        ? undefined
        : { ...validationContext, variableLabels },
    [validationContext, variableLabels],
  );
}

type FieldRendering = Readonly<{
  unavailableVariables: readonly string[];
  initialValues: Record<string, FieldValue> | undefined;
  /** Everything but `variableLabels`, which is added here. */
  validationContext: ValidationContext | null;
}>;

const initialValueOf = (
  initialValues: Record<string, FieldValue> | undefined,
  variable: string,
): FieldValue | undefined =>
  initialValues &&
  Object.hasOwn(initialValues, variable) &&
  initialValues[variable] !== undefined
    ? initialValues[variable]
    : undefined;

/** A Network Composer's fields: a list, each field in turn. */
function ProtocolFormFields({
  fields,
  unavailableVariables,
  initialValues,
  autoFocus,
  validationContext,
}: FieldRendering & {
  fields: readonly FieldDefinition[];
  autoFocus: boolean;
}) {
  const fieldContext = useFieldValidationContext(fields, validationContext);

  return (
    <>
      {fields.map((field, index) => (
        <ProtocolFormField
          key={field.id}
          field={field}
          unavailable={unavailableVariables.includes(field.variable)}
          initialValue={initialValueOf(initialValues, field.variable)}
          autoFocus={autoFocus && index === 0}
          validationContext={fieldContext}
        />
      ))}
    </>
  );
}

/**
 * Records, for as long as a field is on screen, that it is: a field in a
 * version of a logic block that is not shown is not mounted.
 */
function ShownField({
  fieldId,
  shown,
  children,
}: {
  fieldId: string;
  shown: RefObject<Set<string>>;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const fields = shown.current;
    fields.add(fieldId);
    return () => {
      fields.delete(fieldId);
    };
  }, [fieldId, shown]);
  return children;
}

/**
 * A form's text as the participant reads it, with each of its fields where
 * the text places it, in the version of each logic block that the answers so
 * far choose (see `ContentDocument`).
 */
function ProtocolFormDocument({
  content,
  fields,
  shown,
  unavailableVariables,
  initialValues,
  autoFocus,
  validationContext,
}: FieldRendering & {
  content: LocalizedString;
  /** The fields the document places, in the language shown. */
  fields: readonly FieldDefinition[];
  shown: RefObject<Set<string>>;
  autoFocus: boolean;
}) {
  const fieldContext = useFieldValidationContext(fields, validationContext);
  const byId = useMemo(
    () =>
      new Map<string, FieldDefinition>(
        fields.map((field) => [field.id, field]),
      ),
    [fields],
  );

  const renderField = useCallback(
    (fieldId: string, { first }: Readonly<{ first: boolean }>) => {
      const field = byId.get(fieldId);
      if (field === undefined) return null;
      return (
        <ShownField fieldId={fieldId} shown={shown}>
          <ProtocolFormField
            field={field}
            unavailable={unavailableVariables.includes(field.variable)}
            initialValue={initialValueOf(initialValues, field.variable)}
            autoFocus={autoFocus && first}
            validationContext={fieldContext}
          />
        </ShownField>
      );
    },
    [byId, shown, unavailableVariables, initialValues, autoFocus, fieldContext],
  );

  return (
    <ContentDocument
      value={content}
      allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
      blockImages={assetBlockImages}
      renderField={renderField}
    />
  );
}

/**
 * Hook to automatically convert protocol form definitions into the new form
 * system by generating Field components with validation props.
 *
 * @param form - The form from the protocol: its text, one document per
 *                language, which places its fields and may show some only
 *                under logic, and its fields. The form asks the fields that
 *                the document in the participant's language places.
 * @param fields - The fields of a form without text (a Network Composer's),
 *                 asked in turn.
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
 * @param labelNode - How the interface names the node the form describes,
 *                    when it shows its nodes by labels of its own (Family
 *                    Pedigree's), given the node's attributes as the form's
 *                    answers leave them. The form's text and validation messages naming
 *                    a field then show the node's label as the interface
 *                    shows it, in place of the codebook's label rules.
 * @param isParticipant - Whether the node the form describes is the
 *                    participant, where the interface draws the participant
 *                    among its nodes (Family Pedigree's person form), so the
 *                    fields' text can choose its wording by it.
 */
export default function useProtocolForm({
  form,
  fields: listedFields,
  autoFocus = false,
  initialValues,
  subject,
  namespace,
  currentEntityId,
  formValueAliases,
  unavailableVariables = NO_VARIABLES,
  precedingVariables = NO_VARIABLES,
  newEntityAttributes,
  labelNode,
  isParticipant,
}: (
  | {
      /**
       * A form: its text, which places its fields, and its fields. Undefined
       * where an interface asks no form of its own (a Family Pedigree
       * without one).
       */
      form:
        | Readonly<{
            content: LocalizedString;
            fields: readonly FormField[];
          }>
        | undefined;
      fields?: never;
    }
  | {
      /** A form without text (a Network Composer's): its fields in turn. */
      fields: readonly ComposerFormField[];
      form?: never;
    }
) & {
  autoFocus?: boolean;
  initialValues?: Record<string, FieldValue>;
  subject?: Subject;
  namespace?: string;
  currentEntityId?: string;
  formValueAliases?: Readonly<Record<string, string>>;
  unavailableVariables?: readonly string[];
  precedingVariables?: readonly string[];
  newEntityAttributes?: Readonly<Record<string, unknown>>;
  labelNode?: LabelNode;
  isParticipant?: boolean;
}) {
  const stageValidationContext = useStageSelector(getValidationContext);
  const baseValidationContext =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stage without a subject (Information) has a null stageSubject, which ValidationContext does not allow; the form's own subject replaces it below whenever fields name one
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

  // The fields the form asks in the language the participant reads: those
  // its text there places, in the order it places them, in any version of
  // its logic blocks. A field only another language's text places is not
  // part of this form.
  const resolveSource = useResolveLocalizedSource();
  const resolvedDocument =
    form === undefined ? undefined : resolveSource(form.content);
  const documentText = resolvedDocument?.text;
  const documentLocale = resolvedDocument?.locale;
  // What the form's logic is read against: its document, and the variable
  // each of the fields that it places writes (see `FormDynamicValues`).
  const documentReading = useMemo(
    () =>
      form === undefined ||
      documentText === undefined ||
      documentLocale === undefined
        ? undefined
        : formDocumentReading(form, {
            text: documentText,
            locale: documentLocale,
          }),
    [form, documentText, documentLocale],
  );
  const fields = useMemo((): Array<FormField | ComposerFormField> => {
    if (form === undefined) return [...(listedFields ?? [])];
    return [...(documentReading?.fieldVariables.keys() ?? [])].flatMap((id) => {
      const field = form.fields.find((entry) => entry.id === id);
      return field === undefined ? [] : [field];
    });
  }, [form, listedFields, documentReading]);

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

  // The fields on screen: a field in a version of a logic block that is not
  // shown is not mounted (see `ShownField`).
  const shownFieldIds = useRef(new Set<string>());

  /**
   * The change a submission of `values` makes to the entity's attributes. A
   * stored answer the form could not show is never part of it unless the
   * participant entered a new one, while the question is shown. A question
   * that logic hides is cleared; a question only another language's text
   * asks is left as it is.
   */
  const toAttributePatch = useCallback(
    (values: Record<string, FieldValue>) =>
      formValuesToAttributePatch(coerceValues(values), {
        fields: fields.map((field) => field.variable),
        shown: new Set(
          fields
            .filter(
              (field) =>
                form === undefined || shownFieldIds.current.has(field.id),
            )
            .map((field) => field.variable),
        ),
        keepWhenUnanswered: unavailableVariables,
      }),
    [coerceValues, fields, form, unavailableVariables],
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
  // The input control of each field the form asks in the language shown, in
  // the order its document places them: what analytics counts. A field only
  // another language's document places is not asked, so it is not counted.
  const fieldComponents = useMemo(
    () => fieldsMetadata.map((field) => field.component),
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
  const stageShowsDynamicValues = useStageShowsDynamicValues();
  const formVariables = useMemo(
    () => [
      ...precedingVariables,
      ...fieldsMetadata.map((field) => field.variable),
    ],
    [precedingVariables, fieldsMetadata],
  );

  const renderedFields =
    form === undefined ? (
      <ProtocolFormFields
        fields={fieldsMetadata}
        unavailableVariables={unavailableVariables}
        initialValues={initialValues}
        autoFocus={autoFocus}
        validationContext={validationContext}
      />
    ) : (
      <ProtocolFormDocument
        content={form.content}
        fields={fieldsMetadata}
        shown={shownFieldIds}
        unavailableVariables={unavailableVariables}
        initialValues={initialValues}
        autoFocus={autoFocus}
        validationContext={validationContext}
      />
    );

  // The fields' captions can show values of the entity the form describes,
  // including answers given in its earlier fields (see `FormDynamicValues`).
  // A stage whose text shows no values leaves the fields as they are.
  const showsDynamicValues =
    dynamicValueSources !== null && stageShowsDynamicValues;
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
        {...(labelNode !== undefined && { labelNode })}
        {...(isParticipant !== undefined && { isParticipant })}
        {...(documentReading !== undefined && { document: documentReading })}
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

  return {
    /**
     * The form as the participant answers it: its text and fields, with the
     * answers so far read by its logic and its values (see
     * `FormDynamicValues`). Must be rendered inside the form's store.
     */
    formContent: inFormScope(renderedFields),
    coerceValues,
    toAttributePatch,
    componentByVariable,
    fieldComponents,
    variableByFieldPath,
    passphraseNeeded,
  };
}
