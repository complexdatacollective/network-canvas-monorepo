import { useEffect, useMemo, useRef } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import type {
  LocaleTag,
  LocalizedString,
  Variables,
} from '@codaco/protocol-validation';

import type { StageFormStoreApi } from '../../form/stageEditorContext.ts';
import { useLatest } from '../../state/useLatest.ts';
import type { FormAttributeRules } from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';
import {
  type FormFieldDraft,
  formFieldDraftsOf,
  type FormFieldProblem,
  type FormFieldProblemAt,
  formFieldProblems,
  type FormFieldProblemRules,
} from './formDocumentValue.ts';

/** Where the form's fields are kept in the stage. */
const FORM_FIELDS_PATH = 'form.fields';

const ATTRIBUTE_REQUIRED = createMessageError(messages.attributeRequired);
const QUESTION_REQUIRED = createMessageError(messages.questionRequired);
const ATTRIBUTE_TAKEN = createMessageError(messages.attributeTaken);

const NO_FIELDS: ReadonlySet<string> = new Set();

/** The kinds of problem in the order that a refused save names them. */
const REFUSAL_ORDER: readonly FormFieldProblem[] = [
  'attribute',
  'taken',
  'reserved',
  'question',
];

/**
 * The problem that a refused save names, of all the form's problems: the
 * first of the kind that comes first in `REFUSAL_ORDER`. The field shown as
 * having the problem is this one too, so the message beside the form and
 * the field that it takes the researcher to are about the same field.
 */
const refusedProblem = (
  problems: readonly FormFieldProblemAt[],
): FormFieldProblemAt | undefined => {
  for (const kind of REFUSAL_ORDER) {
    const found = problems.find(({ problem }) => problem === kind);
    if (found !== undefined) return found;
  }
  return undefined;
};

/** What the refusal of a problem reads. */
type RefusalContext = Readonly<{
  fields: readonly FormFieldDraft[];
  editingLocale: LocaleTag;
  rules: FormAttributeRules;
  variables: Readonly<Variables>;
  languageName: (locale: LocaleTag) => string;
}>;

/**
 * The refusal for `found`. A field in the document of the language being
 * edited is refused in plain words beside it; one that only another
 * language's document places is refused naming that language and the
 * field.
 */
const refusalFor = (found: FormFieldProblemAt, context: RefusalContext) => {
  const elsewhere = found.locale !== context.editingLocale;
  const field = context.fields.find((entry) => entry.id === found.fieldId);
  const language = context.languageName(found.locale);
  switch (found.problem) {
    case 'attribute': {
      if (!elsewhere) return ATTRIBUTE_REQUIRED;
      const question = field?.prompt?.[found.locale];
      return question === undefined || question === ''
        ? createMessageError(messages.attributeRequiredElsewhereUnnamed, {
            language,
          })
        : createMessageError(messages.attributeRequiredElsewhere, {
            question,
            language,
          });
    }
    case 'question': {
      const attribute =
        field === undefined ? undefined : context.variables[field.variable];
      return !elsewhere || attribute === undefined
        ? QUESTION_REQUIRED
        : createMessageError(messages.questionRequiredElsewhere, {
            attribute: attribute.name,
            language,
          });
    }
    case 'taken':
      return ATTRIBUTE_TAKEN;
    case 'reserved':
      break;
  }
  return context.rules.reservedRefusal === undefined
    ? undefined
    : createMessageError(context.rules.reservedRefusal);
};

/**
 * Where a problem with the form's fields is answered for: nowhere (there is
 * none shown); at a field in the document being edited; or beside the
 * refusal, for a field that only another language's document places.
 */
type FormProblemTarget =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'field'; fieldId: string }>
  | Readonly<{ kind: 'elsewhere'; fieldId: string; locale: LocaleTag }>;

const NO_TARGET: FormProblemTarget = { kind: 'none' };

const formProblemTarget = (
  problem: Pick<FormFieldProblemAt, 'fieldId' | 'locale'> | undefined,
  editingLocale: LocaleTag,
): FormProblemTarget => {
  if (problem === undefined) return NO_TARGET;
  return problem.locale === editingLocale
    ? { kind: 'field', fieldId: problem.fieldId }
    : { kind: 'elsewhere', fieldId: problem.fieldId, locale: problem.locale };
};

type FormFieldsOptions = Readonly<{
  storeApi: StageFormStoreApi;
  disabled: boolean;
  /** The form's documents, one per language. */
  content: LocalizedString;
  editingLocale: LocaleTag;
  rules: FormAttributeRules;
  /** The attributes of the form's subject; undefined until it is chosen. */
  variables: Readonly<Variables> | undefined;
  languageName: (locale: LocaleTag) => string;
  /** The fields still being put in, which are not refused yet. */
  pendingNow: () => ReadonlySet<string>;
}>;

/**
 * The form's fields (`form.fields`), with the rule that refuses a save
 * which one of them could not make, and the problem shown while the
 * refusal is.
 *
 * The rule judges the fields once each time it runs (`formFieldProblems`)
 * and refuses the problem that `refusedProblem` picks; the problem shown is
 * the one it refused, judged again only while a refusal is shown.
 */
export function useFormFields({
  storeApi,
  disabled,
  content,
  editingLocale,
  rules,
  variables,
  languageName,
  pendingNow,
}: FormFieldsOptions) {
  const problemRules = (
    skipped: ReadonlySet<string>,
  ): FormFieldProblemRules => ({
    locale: editingLocale,
    reserved: rules.reservedRefusal === undefined ? NO_FIELDS : rules.reserved,
    ...(variables !== undefined && {
      hasAttribute: (variableId: string) => variables[variableId] !== undefined,
    }),
    skipped,
  });
  const latest = useLatest({
    content,
    editingLocale,
    rules,
    variables: variables ?? {},
    languageName,
    problemRules,
    pendingNow,
  });

  const validation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => {
          const now = latest();
          const fields = formFieldDraftsOf(value);
          const found = refusedProblem(
            formFieldProblems(
              fields,
              now.content,
              now.problemRules(now.pendingNow()),
            ),
          );
          return found === undefined
            ? undefined
            : refusalFor(found, { ...now, fields });
        },
      ]),
    }),
    [latest],
  );
  const field = useField({
    name: FORM_FIELDS_PATH,
    disabled,
    renderedElements: { error: true },
    ...validation,
  });
  const fieldsValue = field.fieldProps.value;
  const fields = useMemo(() => formFieldDraftsOf(fieldsValue), [fieldsValue]);
  const invalid =
    field.meta.shouldShowError && (field.meta.errors?.length ?? 0) > 0;

  // The refusals name the language being edited, so they are made again in
  // another language.
  const latestInvalid = useLatest(invalid);
  const validatedIn = useRef(editingLocale);
  useEffect(() => {
    if (validatedIn.current === editingLocale) return;
    validatedIn.current = editingLocale;
    if (latestInvalid()) {
      void storeApi.getState().validateField(FORM_FIELDS_PATH);
    }
  });

  const problem = invalid
    ? refusedProblem(
        formFieldProblems(fields, content, problemRules(pendingNow())),
      )
    : undefined;

  const problemFieldId = problem?.fieldId;
  const problemLocale = problem?.locale;
  const target = useMemo(
    () =>
      formProblemTarget(
        problemFieldId === undefined || problemLocale === undefined
          ? undefined
          : { fieldId: problemFieldId, locale: problemLocale },
        editingLocale,
      ),
    [problemFieldId, problemLocale, editingLocale],
  );

  const {
    'data-field-name': fieldName,
    'data-field-path': fieldPath,
    'data-field-form': fieldForm,
  } = field.containerProps;
  const seam = useMemo(
    () => ({
      'data-field-name': fieldName,
      'data-field-path': fieldPath,
      'data-field-form': fieldForm,
    }),
    [fieldName, fieldPath, fieldForm],
  );

  return {
    fields,
    /** Writes the form's fields. */
    setFields: field.fieldProps.onChange,
    /** The id of the refusal's message, for the editor's description. */
    errorId: `${field.id}-error`,
    invalid,
    errors: field.meta.errors,
    showErrors: field.meta.shouldShowError,
    /** Where the problem refused is answered for. */
    target,
    /**
     * What names the form's fields to the list of problems and to a refused
     * save, carried by whatever answers for them.
     */
    seam,
    /**
     * Judges the fields as the researcher leaves the form, as any field is
     * judged when the researcher leaves it.
     */
    validateOnLeave: () => {
      const state = storeApi.getState();
      state.setFieldBlurred(FORM_FIELDS_PATH);
      void state.validateField(FORM_FIELDS_PATH);
    },
  };
}

export { FORM_FIELDS_PATH };
