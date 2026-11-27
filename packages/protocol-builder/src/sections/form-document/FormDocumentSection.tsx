import { useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import type { StageSection } from '../../editors/defineStageEditor.tsx';
import {
  FORM_CONTENT_PATH,
  FormDocumentField,
  useFormContentValidation,
} from '../../fields/FormDocumentField.tsx';
import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';
import type { SectionKey } from '../sectionKeys.ts';
import { type SubjectEntity, useStageSubject } from '../useStageSubject.ts';
import type { FormAttributeRules } from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';

const NO_FIELDS = createMessageError(messages.noFields);

const NOTHING: readonly string[] = [];

export type FormDocumentSectionProps = Readonly<{
  /** Whose codebook the form's fields collect into. */
  subject: SubjectEntity;
  /**
   * Makes the whole form something that the researcher switches on and off,
   * for a stage whose form is optional (a Family Pedigree's questions about
   * each family member). The confirmation is written in the words of the
   * interface that owns the form.
   */
  capability?: SectionCapability;
  /**
   * The form is shown in a dialog with a heading (a Name Generator's), so the
   * researcher writes the heading too, at `form.title`.
   */
  hasTitle?: boolean;
  /**
   * Attributes that this stage's draft writes without validation elsewhere,
   * which a field may not collect. Supplying it at all makes it the whole
   * account of this stage's unvalidated writes, and the saved copy of them is
   * dropped from the role map. Give a stable array.
   */
  draftUnvalidatedVariables?: readonly string[];
  /** What the attribute list says about one of `draftUnvalidatedVariables`. */
  draftUnvalidatedReason?: (variableId: string) => string;
  /**
   * Attributes that the interface collects through a control of its own, so a
   * field may not collect them too (a Family Pedigree's name and gender
   * identity attributes).
   */
  reservedVariables?: readonly string[];
  /** Said when a save finds a field collecting a reserved attribute. */
  reservedVariableRefusal?: MessageDescriptor;
  /** What the attribute list says about a reserved attribute. */
  reservedVariableReason?: MessageDescriptor;
  /**
   * The section's heading, for a form that is an extra on another interface.
   * Formatted with no values.
   */
  title?: MessageDescriptor;
  /** The section's stable name, which travels with its title. */
  sectionKey?: SectionKey;
  description?: MessageDescriptor;
}>;

/**
 * The form that a stage shows, written as one document in each language,
 * with a block for each question among its paragraphs.
 *
 * Shared by every interface that shows a form: the Ego, Alter and Alter Edge
 * Form stages, a Name Generator's form for each new person, and a Family
 * Pedigree's questions about each family member. The subject arrives as a
 * prop because only the editor that mounts the section knows whose codebook
 * the form collects into.
 */
export default function FormDocumentSection({
  subject: subjectEntity,
  capability,
  hasTitle = false,
  draftUnvalidatedVariables,
  draftUnvalidatedReason,
  reservedVariables,
  reservedVariableRefusal,
  reservedVariableReason,
  title = messages.title,
  sectionKey = 'form-fields',
  description,
}: FormDocumentSectionProps) {
  const intl = useAppIntl();
  const subject = useStageSubject(subjectEntity);
  const waiting = subject === undefined;
  const { identity } = useStageEditorForm();
  const draftUnvalidated = draftUnvalidatedVariables ?? NOTHING;
  const reserved = reservedVariables ?? NOTHING;
  const rules = useMemo(
    (): FormAttributeRules => ({
      draftUnvalidated: new Set(draftUnvalidated),
      draftUnvalidatedReason,
      reserved: new Set(reserved),
      reservedReason: reservedVariableReason,
      reservedRefusal: reservedVariableRefusal,
      // The stage whose saved unvalidated writes the draft replaces, where
      // there is a draft to replace them with.
      answeredFor:
        draftUnvalidatedVariables === undefined ? undefined : identity.id,
    }),
    [
      draftUnvalidated,
      draftUnvalidatedReason,
      draftUnvalidatedVariables,
      identity.id,
      reserved,
      reservedVariableReason,
      reservedVariableRefusal,
    ],
  );
  const contentValidation = useFormContentValidation();

  const shownDescription = waiting
    ? messages.waitingDescription
    : (description ??
      (hasTitle ? messages.nameGeneratorDescription : messages.description));

  return (
    <BuilderSection
      sectionKey={sectionKey}
      title={intl.formatMessage(title)}
      description={intl.formatMessage(shownDescription)}
      disabled={waiting}
      {...(capability === undefined ? {} : { capability })}
    >
      {hasTitle && (
        <Field<typeof LocalizedInputField>
          name="form.title"
          component={LocalizedInputField}
          dynamicValues="stageText"
          label={intl.formatMessage(messages.dialogTitleLabel)}
          hint={intl.formatMessage(messages.dialogTitleHint)}
          required={createMessageError(messages.dialogTitleRequired)}
        />
      )}
      <Field<typeof FormDocumentField>
        name={FORM_CONTENT_PATH}
        component={FormDocumentField}
        subject={subject}
        rules={rules}
        label={intl.formatMessage(messages.contentLabel)}
        placeholder={intl.formatMessage(messages.contentPlaceholder)}
        required={NO_FIELDS}
        {...contentValidation}
      />
    </BuilderSection>
  );
}

/** A stage's form (`FormDocumentSection`). */
export const formDocument =
  (props: FormDocumentSectionProps): StageSection =>
  () => <FormDocumentSection {...props} />;
