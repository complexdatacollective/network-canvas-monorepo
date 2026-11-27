import { type FocusEvent, useContext, useMemo, useState } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { useFocusWithin } from '@codaco/fresco-ui/hooks/useFocusWithin';
import {
  dynamicValueNameFor,
  fieldIdsInDocument,
  type LocalizedString,
} from '@codaco/protocol-validation';

import {
  StageEditorFormContext,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import { useLanguageNaming } from '../localization/LanguageNaming.tsx';
import { LocalizedStringField } from '../localization/LocalizedStringControl.tsx';
import {
  asLocalizedString,
  localeDirection,
} from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import { useDynamicValueSite } from '../localization/useDynamicValueSite.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { variablesForSubject } from '../protocol-context.ts';
import { useFieldCodebookWrites } from '../sections/form-document/fieldCodebookWrites.ts';
import { FormDocumentEditor } from '../sections/form-document/FormDocumentEditor.tsx';
import {
  FORM_DOCUMENT_POPUP,
  type FormAttributeRules,
} from '../sections/form-document/formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from '../sections/form-document/formDocumentMessages.ts';
import { fieldsAfterEdit } from '../sections/form-document/formDocumentValue.ts';
import { LanguageFieldsAlert } from '../sections/form-document/LanguageFieldsAlert.tsx';
import {
  FORM_FIELDS_PATH,
  useFormFields,
} from '../sections/form-document/useFormFields.ts';
import { usePendingFields } from '../sections/form-document/usePendingFields.ts';
import { stageFieldsOf } from '../stageDocument.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { useLatest } from '../state/useLatest.ts';
import { StageAssetBlocks } from './assetBlocks/StageAssetBlocks.tsx';
import type { DynamicMessageSite } from './dynamicText/messageSite.ts';
import { translatableStringsUsing } from './DynamicTextField.tsx';

/** Where the form's documents are kept in the stage. */
export const FORM_CONTENT_PATH = 'form.content';

export type FormDocumentFieldProps = CreateFormFieldProps<
  LocalizedString,
  'div',
  {
    'id': string;
    'name': string;
    'aria-describedby': string;
    /** Whose codebook the form's fields collect into; undefined until chosen. */
    'subject': CodebookSubject | undefined;
    'rules': FormAttributeRules;
    'placeholder'?: string;
  }
>;

/**
 * A form, written as the participant reads it: one document in each
 * language, with the form's fields among its paragraphs. Each field is a
 * block that the researcher types the question and the hint into, with the
 * control that the participant answers with drawn beneath them.
 *
 * Kept at `form.content`. The fields themselves (`form.fields`) are written
 * as the document changes: each block writes its field's attribute, and its
 * question and hint in the editing language. A field that leaves the
 * document keeps its entry until the stage is saved (see
 * `withoutUnusedTextDefinitions`).
 *
 * The problems of the fields are shown as those of the stage's other fields
 * are: once the researcher leaves the form, and when a save is refused. A
 * field that is still being put in is not refused while the researcher
 * chooses its attribute and types its question.
 */
export function FormDocumentField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  subject,
  rules,
  placeholder,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: FormDocumentFieldProps) {
  const stageForm = useContext(StageEditorFormContext);
  const { identity, readOnly: stageReadOnly, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const intl = useAppIntl();
  const { name: languageName } = useLanguageNaming();
  const { localization, editingLocale, setLocale } = useEditingLanguage();
  const content = useMemo(() => asLocalizedString(value) ?? {}, [value]);

  const variables = useMemo(
    () =>
      subject === undefined
        ? undefined
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const pendingFields = usePendingFields(storeApi);
  const formFields = useFormFields({
    storeApi,
    disabled: stageReadOnly,
    content,
    editingLocale,
    rules,
    variables,
    languageName,
    pendingNow: pendingFields.pendingNow,
  });
  const { fields, target, seam } = formFields;
  const latestFields = useLatest(fields);
  const setFields = useLatest(formFields.setFields);

  // While a problem with the fields is shown, the field that has it answers
  // for the form's fields: its block, rather than the whole editor, carries
  // what names them (`seam`), so the list of problems names that field and a
  // refused save takes the researcher to it. A field that only another
  // language's document places is answered for beside the refusal, which
  // names its language, and going there switches the editor to that
  // language and selects the field.
  const fieldsIssue = useMemo(
    () =>
      target.kind === 'field' ? { fieldId: target.fieldId, seam } : undefined,
    [target, seam],
  );

  // The field to select once the document of its language is drawn.
  const [reveal, setReveal] = useState<string | undefined>(undefined);
  const goToProblem = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || target.kind !== 'elsewhere')
      return;
    setReveal(target.fieldId);
    setLocale(target.locale);
  };

  // Focus that leaves the form for the rest of the page finishes the fields
  // being put in, and the form's fields are judged, as any field is when the
  // researcher leaves it. Focus that moves into what the form opened over
  // the page (a field's attribute list or settings, a menu) has not left
  // the form: React's focus events reach the form from those. A dialog that
  // the form opens through `useDialog` is drawn elsewhere, and is known by
  // `FORM_DOCUMENT_POPUP`.
  const focus = useFocusWithin((next) => {
    if (next?.closest(FORM_DOCUMENT_POPUP.selector) != null) return;
    pendingFields.finishAll();
    formFields.validateOnLeave();
  });

  const writes = useFieldCodebookWrites(subject);

  const editable = !(readOnly === true || disabled === true || stageReadOnly);

  const siteState = useDynamicValueSite('formField');
  const site = useMemo(
    (): DynamicMessageSite => ({
      context: siteState.context,
      conditions: siteState.conditions,
      dynamicAttributes: siteState.dynamicAttributes,
      owner: 'stage',
      dynamicAttributeUsage: (dynamicAttributeId) =>
        stageForm === null
          ? 1
          : translatableStringsUsing(
              stageFieldsOf(stageForm.liveDraft()),
              dynamicValueNameFor({
                kind: 'dynamicAttribute',
                id: dynamicAttributeId,
              }),
            ),
    }),
    [
      siteState.context,
      siteState.conditions,
      siteState.dynamicAttributes,
      stageForm,
    ],
  );

  return (
    <div
      className="flex flex-col gap-2"
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      {...(target.kind === 'none' && seam)}
      data-form-document=""
    >
      <StageAssetBlocks enabled>
        {(assetBlocks) => (
          <LocalizedStringField value={value} onChange={onChange}>
            {(translation) => (
              <div className="flex flex-col gap-2">
                {localization !== undefined && (
                  // About the form, in the words of the interface, under
                  // the menu of the language that it compares.
                  <div lang={intl.locale} dir={localeDirection(intl.locale)}>
                    <LanguageFieldsAlert
                      fields={fields}
                      content={content}
                      locale={editingLocale}
                      localization={localization}
                      variables={variables ?? {}}
                    />
                  </div>
                )}
                <FormDocumentEditor
                  id={id}
                  name={name}
                  ariaDescribedBy={`${ariaDescribedBy} ${formFields.errorId}`}
                  ariaLabelledBy={ariaLabelledBy}
                  ariaInvalid={ariaInvalid === true || formFields.invalid}
                  ariaRequired={ariaRequired === true}
                  placeholder={placeholder}
                  editable={editable && !translation.readOnly}
                  message={translation.message}
                  onMessageChange={translation.onMessageChange}
                  content={content}
                  fields={fields}
                  locale={editingLocale}
                  localization={localization}
                  interfaceText={protocolContext.interfaceText}
                  site={site}
                  showsProblems={siteState.codebookRead}
                  {...(assetBlocks !== undefined && { assetBlocks })}
                  variables={variables ?? {}}
                  editing={{
                    kind: 'stage',
                    onFieldTextsChange: (fieldTexts) =>
                      setFields()(
                        fieldsAfterEdit(
                          latestFields(),
                          editingLocale,
                          fieldTexts,
                        ),
                      ),
                    onFieldStarted: pendingFields.start,
                    subject,
                    protocolContext,
                    stageId: identity.id,
                    rules,
                    writes,
                    ...(fieldsIssue !== undefined && { fieldsIssue }),
                    ...(reveal !== undefined && {
                      reveal: {
                        fieldId: reveal,
                        done: () => setReveal(undefined),
                      },
                    }),
                  }}
                />
              </div>
            )}
          </LocalizedStringField>
        )}
      </StageAssetBlocks>
      <div
        {...(target.kind === 'elsewhere' && {
          ...seam,
          onFocus: goToProblem,
        })}
      >
        {target.kind === 'elsewhere' && (
          // Read by the list of problems, which names the form in that
          // language before the problem.
          // oxlint-disable-next-line jsx-a11y/label-has-associated-control
          <label hidden>
            {intl.formatMessage(messages.formInLanguage, {
              language: languageName(target.locale),
            })}
          </label>
        )}
        <FieldErrors
          id={formFields.errorId}
          name={FORM_FIELDS_PATH}
          errors={formFields.errors}
          show={formFields.showErrors}
        />
      </div>
    </div>
  );
}

/**
 * The rule for the form's documents: each language's document places at
 * least one field. The editing language's is said plainly; the others are
 * named.
 */
export function useFormContentValidation() {
  const intl = useAppIntl();
  const { name: languageName } = useLanguageNaming();
  // Undefined until the protocol's languages are read.
  const { locale } = useEditingLanguage();
  const latest = useLatest({ intl, languageName, locale });
  return useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => {
          const content = asLocalizedString(value) ?? {};
          const empty = Object.entries(content)
            .filter(([, message]) => fieldIdsInDocument(message).length === 0)
            .map(([language]) => language);
          if (empty.length === 0) return undefined;
          const {
            locale: editing,
            languageName: nameOf,
            intl: format,
          } = latest();
          if (editing === undefined || empty.includes(editing)) {
            return createMessageError(messages.noFields);
          }
          return createMessageError(messages.noFieldsInLanguages, {
            languages: format.formatList(empty.map(nameOf), {
              type: 'conjunction',
            }),
          });
        },
      ]),
    }),
    [latest],
  );
}
