import {
  type ComponentType,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';
import { duplicateFormFieldIndices } from '@codaco/protocol-validation';

import {
  useCreateCodebookVariable,
  useSetVariableComponent,
} from '../codebook/useCodebookVariableEdits.ts';
import {
  buildVariableRoleMap,
  excludeUnvalidatedUses,
} from '../codebook/variableRoles.ts';
import {
  draftUnvalidatedElsewhereMessage,
  makeFieldEditorValidate,
  unvalidatedElsewhereMessage,
  variableDisplayName,
} from '../codebook/variableValidation.ts';
import RichTextField from '../fields/RichTextField.tsx';
import {
  VariablePickerControl,
  type VariablePickerOption,
} from '../fields/VariablePicker.tsx';
import { withoutAbsentValues } from '../form/absentValues.ts';
import DialogArrayField from '../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { variablesForSubject } from '../protocol-context.ts';
import AttributeCodebookControls, {
  useRowValue,
} from './AttributeCodebookControls.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import {
  controlsForType,
  isCollectableType,
  isOptionType,
  TYPE_OPTIONS,
} from './collectableTypes.ts';
import {
  type RowEditorProps,
  type RowPreviewProps,
  useRowRenderers,
} from './rowRenderers.tsx';
import { type SubjectEntity, useStageSubject } from './useStageSubject.ts';

/**
 * Where an interface that holds a whole form keeps it.
 *
 * The default rather than the rule: FamilyPedigree's family-member form is the
 * same list of the same fields hung off its node configuration
 * (`nodeConfig.form`), which is why the path is a prop.
 */
const DEFAULT_FIELDS_PATH = 'form.fields';
const TITLE = 'form.title';

/**
 * The picker option that stands for an attribute that does not exist yet.
 *
 * A sentinel rather than a second control, because "which attribute does this
 * field collect?" is one question however it is answered — and a researcher
 * who has just looked through the list for a name and not found it is already
 * looking at the place to say so. Spelled so that it cannot be mistaken for a
 * record id: those are minted as uuids, and this is never written to the
 * protocol — `useCommitFormField` replaces it with the created attribute's own
 * id before the row is committed.
 */
const NEW_VARIABLE = '__create_new_attribute__';

/**
 * Row keys that describe the CODEBOOK rather than the field.
 *
 * A form field holds only its attribute, its question and its hints; what that
 * attribute is called, what kind of answer it holds and which control collects
 * it all belong to the codebook. They are authored here because this is where
 * the researcher is looking, written through `useCommitFormField`, and stripped
 * from the row before it reaches the protocol.
 */
const NEW_VARIABLE_NAME = '_newVariableName';
const NEW_VARIABLE_TYPE = '_newVariableType';
const INPUT_CONTROL = '_component';

const messages = defineMessages({
  atLeastOne: {
    id: 'protocolBuilder.formFields.atLeastOne',
    defaultMessage:
      'Add at least one field. A form with no fields collects nothing.',
    description:
      'Refusal shown above a form’s list of fields when a researcher saves a form that asks nothing. A field is one question bound to one attribute of a network member.',
  },
  incompleteField: {
    id: 'protocolBuilder.formFields.incompleteField',
    defaultMessage:
      'Every field needs both an attribute and a question. Open the incomplete field and finish it.',
    description:
      'Refusal shown above a form’s list of fields when one of them names no attribute, or asks no question.',
  },
  duplicateField: {
    id: 'protocolBuilder.formFields.duplicateField',
    defaultMessage:
      'Two fields collect the same attribute. Each attribute may be collected once per form.',
    description:
      'Refusal shown above a form’s list of fields when two of them record their answers under the same attribute, which would leave only one of the answers.',
  },
  createWithValuesFirst: {
    id: 'protocolBuilder.formFields.createWithValuesFirst',
    defaultMessage:
      'Create this attribute and the values it offers before adding the field that collects it.',
    description:
      'Refusal shown under the kind-of-answer control when a researcher tries to invent an attribute whose answers come from a list, which cannot be made from a name and a kind alone.',
  },
  scopeMissing: {
    id: 'protocolBuilder.formFields.scopeMissing',
    defaultMessage:
      'Choose what this stage works with before adding fields to its form.',
    description:
      'Shown inside the field editor when the researcher has not yet chosen which node or edge type the stage (one step of an interview) is about, so there is no codebook to draw attributes from.',
  },
  title: {
    id: 'protocolBuilder.formFields.title',
    defaultMessage: 'Form fields',
    description:
      'Heading of the section holding the questions a form asks and the attributes each answer is recorded under.',
  },
  description: {
    id: 'protocolBuilder.formFields.description',
    defaultMessage:
      'Choose the attributes this form collects, and write the question the participant answers for each.',
    description: 'Description of the form-fields section.',
  },
  waitingDescription: {
    id: 'protocolBuilder.formFields.waitingDescription',
    defaultMessage:
      'Choose what this stage works with before writing its form.',
    description:
      'Shown in place of the form-fields section’s description while the researcher has not yet chosen which node or edge type the stage is about.',
  },
  formTitleLabel: {
    id: 'protocolBuilder.formFields.formTitleLabel',
    defaultMessage: 'Form title',
    description:
      'Label of the field holding the heading shown above the form a participant fills in.',
  },
  formTitleHint: {
    id: 'protocolBuilder.formFields.formTitleHint',
    defaultMessage:
      'Shown above the form. Use a short phrase describing what it collects, such as "Add a person".',
    description:
      'Guidance under the form-title field. The quoted phrase is an example a researcher might write, and should be translated as such.',
  },
  formTitlePlaceholder: {
    id: 'protocolBuilder.formFields.formTitlePlaceholder',
    defaultMessage: 'Add a person',
    description:
      'Example form title shown in the empty field. An example a researcher might write, not a value that is stored.',
  },
  formTitleRequired: {
    id: 'protocolBuilder.formFields.formTitleRequired',
    defaultMessage: 'Give this form a title.',
    description:
      'Refusal shown under the form-title field when it has been left empty.',
  },
  fieldLabel: {
    id: 'protocolBuilder.formFields.fieldLabel',
    defaultMessage: 'Fields',
    description: 'Label of the ordered list of questions a form asks.',
  },
  fieldHint: {
    id: 'protocolBuilder.formFields.fieldHint',
    defaultMessage:
      'The participant answers these one after another, in this order. Add at least one.',
    description: 'Guidance under the list of form fields.',
  },
  addLabel: {
    id: 'protocolBuilder.formFields.addLabel',
    defaultMessage: 'Create new form field',
    description:
      'Button that opens the dialog for adding one more question to a form. Whole rather than a generic "Add", because a stage editor shows several lists at once.',
  },
  addTitle: {
    id: 'protocolBuilder.formFields.addTitle',
    defaultMessage: 'Create form field',
    description:
      'Title of the dialog a researcher fills in to add one more question to a form.',
  },
  editTitle: {
    id: 'protocolBuilder.formFields.editTitle',
    defaultMessage: 'Edit form field',
    description:
      'Title of the dialog a researcher fills in to change a question a form already asks.',
  },
  itemNoun: {
    id: 'protocolBuilder.formFields.itemNoun',
    defaultMessage: 'field',
    description:
      'What one row of a form’s list of questions is called inside things said ABOUT it — "Edit field", "Remove this field?" — so it is lower case and singular.',
  },
  emptyState: {
    id: 'protocolBuilder.formFields.emptyState',
    defaultMessage: 'No fields yet. Create one to say what this form collects.',
    description:
      'Shown in place of the list of form fields while a form asks nothing yet.',
  },
  attributeSectionTitle: {
    id: 'protocolBuilder.formFields.attributeSectionTitle',
    defaultMessage: 'Attribute',
    description:
      'Heading of the half of the field dialog that says which attribute this question’s answer is recorded under.',
  },
  attributeSectionDescription: {
    id: 'protocolBuilder.formFields.attributeSectionDescription',
    defaultMessage:
      'Choose the attribute this field collects, or create one for it.',
    description: 'Description under the Attribute heading.',
  },
  questionSectionTitle: {
    id: 'protocolBuilder.formFields.questionSectionTitle',
    defaultMessage: 'Question',
    description:
      'Heading of the half of the field dialog that says what the participant is asked.',
  },
  questionSectionDescription: {
    id: 'protocolBuilder.formFields.questionSectionDescription',
    defaultMessage:
      'Write what the participant is asked, and how much help they are given.',
    description: 'Description under the Question heading.',
  },
  newTypeLabel: {
    id: 'protocolBuilder.formFields.newTypeLabel',
    defaultMessage: 'Kind of answer',
    description:
      'Label of the control choosing what sort of value a new attribute holds — text, a number, a date, a choice from a list.',
  },
  newTypeHint: {
    id: 'protocolBuilder.formFields.newTypeHint',
    defaultMessage:
      'What this attribute holds. It cannot be changed once answers have been collected.',
    description: 'Guidance under the kind-of-answer control.',
  },
  newTypeRequired: {
    id: 'protocolBuilder.formFields.newTypeRequired',
    defaultMessage: 'Choose what kind of answer this attribute holds.',
    description:
      'Refusal shown under the kind-of-answer control when nothing has been chosen.',
  },
  newNameLabel: {
    id: 'protocolBuilder.formFields.newNameLabel',
    defaultMessage: 'Attribute name',
    description:
      'Label of the field naming an attribute the researcher is inventing.',
  },
  newNameHint: {
    id: 'protocolBuilder.formFields.newNameHint',
    defaultMessage:
      'How this attribute is named in the codebook and in exported data.',
    description:
      'Guidance under the new-attribute name field. The codebook is the protocol’s definition of what an interview records; exported data is the file a researcher analyses afterwards.',
  },
  newNamePlaceholder: {
    id: 'protocolBuilder.formFields.newNamePlaceholder',
    defaultMessage: 'Nickname',
    description:
      'Example attribute name shown in the empty field. An example a researcher might write, not a value that is stored.',
  },
  newNameRequired: {
    id: 'protocolBuilder.formFields.newNameRequired',
    defaultMessage: 'Name the attribute this field collects.',
    description:
      'Refusal shown under the new-attribute name field when it has been left empty.',
  },
  promptLabel: {
    id: 'protocolBuilder.formFields.promptLabel',
    defaultMessage: 'Question text',
    description:
      'Label of the field holding what the participant is asked for this one answer.',
  },
  promptHint: {
    id: 'protocolBuilder.formFields.promptHint',
    defaultMessage:
      'Shown to the participant above the control. Supports markdown formatting.',
    description:
      'Guidance under the question-text field. Markdown is the name of the formatting syntax and is not translated.',
  },
  promptPlaceholder: {
    id: 'protocolBuilder.formFields.promptPlaceholder',
    defaultMessage: 'What is this person\u2019s name?',
    description:
      'Example question shown in the empty question-text field. An example a researcher might write, not a value that is stored.',
  },
  promptRequired: {
    id: 'protocolBuilder.formFields.promptRequired',
    defaultMessage: 'Write the question this field asks.',
    description:
      'Refusal shown under the question-text field when it has been left empty.',
  },
  hintLabel: {
    id: 'protocolBuilder.formFields.hintLabel',
    defaultMessage: 'Hint text',
    description:
      'Label of the optional field holding extra guidance shown to the participant under the question.',
  },
  hintHint: {
    id: 'protocolBuilder.formFields.hintHint',
    defaultMessage:
      'Optional guidance shown below the question, for a field participants may find ambiguous.',
    description: 'Guidance under the hint-text field.',
  },
  hintPlaceholder: {
    id: 'protocolBuilder.formFields.hintPlaceholder',
    defaultMessage: 'Select all that apply',
    description:
      'Example hint shown in the empty hint-text field. An example a researcher might write, not a value that is stored.',
  },
  validationHintsLabel: {
    id: 'protocolBuilder.formFields.validationHintsLabel',
    defaultMessage: 'Show validation hints',
    description:
      'Label of the switch that tells the participant what a valid answer to this question looks like.',
  },
  validationHintsHint: {
    id: 'protocolBuilder.formFields.validationHintsHint',
    defaultMessage:
      'Tells the participant what a valid answer looks like, derived from the attribute’s own rules.',
    description: 'Guidance under the validation-hints switch.',
  },
  componentLabel: {
    id: 'protocolBuilder.formFields.componentLabel',
    defaultMessage: 'Input control',
    description:
      'Label of the control choosing what the participant uses to answer — a text box, a slider, a set of buttons.',
  },
  componentHint: {
    id: 'protocolBuilder.formFields.componentHint',
    defaultMessage:
      'What the participant uses to answer. Changing it changes how this attribute is collected everywhere.',
    description:
      'Guidance under the input-control field, warning that the control belongs to the attribute rather than to this one question.',
  },
  componentRequired: {
    id: 'protocolBuilder.formFields.componentRequired',
    defaultMessage: 'Choose how the participant answers this field.',
    description:
      'Refusal shown under the input-control field when nothing has been chosen.',
  },
  createNewOption: {
    id: 'protocolBuilder.formFields.createNewOption',
    defaultMessage: 'Create a new attribute…',
    description:
      'The last choice in the attribute list, which stands for an attribute that does not exist yet and asks the researcher to name one. The trailing character is an ellipsis.',
  },
  attributeLabel: {
    id: 'protocolBuilder.formFields.attributeLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the control choosing which attribute this question’s answer is recorded under. The same word as the section heading above it, and translated once for each.',
  },
  attributeHint: {
    id: 'protocolBuilder.formFields.attributeHint',
    defaultMessage: 'The codebook attribute this field’s answer is stored in.',
    description:
      'Guidance under the attribute control. The codebook is the protocol’s definition of what an interview records.',
  },
  attributeEmpty: {
    id: 'protocolBuilder.formFields.attributeEmpty',
    defaultMessage:
      'Every attribute of this type is already collected or written elsewhere. Create a new one instead.',
    description:
      'Shown in place of the attribute list when every attribute of this node or edge type is either already collected by another field of the same form, or written somewhere the protocol will not let a form field also write.',
  },
  attributeRequired: {
    id: 'protocolBuilder.formFields.attributeRequired',
    defaultMessage: 'Choose the attribute this field collects.',
    description:
      'Refusal shown under the attribute control when nothing has been chosen.',
  },
  attributeTaken: {
    id: 'protocolBuilder.formFields.attributeTaken',
    defaultMessage:
      'Another field in this form already collects this attribute. Choose a different one, or edit that field instead.',
    description:
      'Refusal shown under the attribute control when a sibling field of the same form already records its answer under the attribute just chosen.',
  },
  previewMissing: {
    id: 'protocolBuilder.formFields.previewMissing',
    defaultMessage: 'This attribute is no longer in the codebook.',
    description:
      'Shown in the collapsed row of a form’s list of questions when the attribute it records into has been deleted from the codebook.',
  },
  previewCollects: {
    id: 'protocolBuilder.formFields.previewCollects',
    defaultMessage: 'Collects "{name}" as {type}.',
    description:
      'Shown in the collapsed row of a form’s list of questions, saying which attribute it records into and what kind of value that holds. name is the attribute’s researcher-facing name; type is a schema token such as text, number or ordinal, which is not translated.',
  },
});

const AT_LEAST_ONE_FIELD = createMessageError(messages.atLeastOne);

const INCOMPLETE_FIELD = createMessageError(messages.incompleteField);

const DUPLICATE_FIELD = createMessageError(messages.duplicateField);

const CREATE_WITH_VALUES_FIRST = createMessageError(
  messages.createWithValuesFirst,
);

/** Stable identity: `options` is a memo dependency of the picker below. */
const NO_OPTIONS: VariablePickerOption[] = [];

/** Stable identity, for the same reason: see `draftUnvalidatedVariables`. */
const NO_DRAFT_UNVALIDATED: readonly string[] = Object.freeze([]);

const VariablePicker = VariablePickerControl as ComponentType<
  Record<string, unknown>
>;
const SelectControl = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const rowsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/**
 * The rules that can actually refuse a save.
 *
 * The whole list is one field value, so a rule about the list belongs here —
 * a row cannot refuse anything (see `RowField`), and the schema's own "Too
 * small: expected array to have >=1 items" arrives against a path rather than
 * against the section the researcher is looking at. Completeness and the
 * one-field-per-attribute rule are the same story: both are schema failures
 * that would otherwise surface long after the researcher has moved on, and the
 * duplicate rule asks the question in exactly the schema's terms
 * (`duplicateFormFieldIndices`) so the two cannot disagree.
 */
const atLeastOneField = (value: unknown) =>
  Array.isArray(value) && value.length > 0 ? undefined : AT_LEAST_ONE_FIELD;

const everyFieldComplete = (value: unknown) =>
  rowsOf(value).every(
    (row) =>
      typeof row.variable === 'string' &&
      row.variable !== '' &&
      typeof row.prompt === 'string' &&
      row.prompt !== '',
  )
    ? undefined
    : INCOMPLETE_FIELD;

const noAttributeTwice = (value: unknown) =>
  duplicateFormFieldIndices(rowsOf(value)).length === 0
    ? undefined
    : DUPLICATE_FIELD;

/**
 * The two shapes the schema allows, as a pair of stable objects.
 *
 * Written out rather than assembled per render because a validation object is
 * part of what a field registers with: a fresh one each time re-registers the
 * rules on every keystroke. Which of the two applies is the `optional` prop —
 * a form that IS the stage must collect something, while a form hung off
 * another section is a capability the researcher may leave switched off, and
 * the schema says exactly that (`FormSchema.fields.min(1)` against
 * `FormFieldArraySchema.optional()`).
 */
const REQUIRED_FIELDS_VALIDATION = Object.freeze({
  custom: messageRuleValidation([
    atLeastOneField,
    everyFieldComplete,
    noAttributeTwice,
  ]),
});

const OPTIONAL_FIELDS_VALIDATION = Object.freeze({
  custom: messageRuleValidation([everyFieldComplete, noAttributeTwice]),
});

/**
 * What a row's own controls need to know about the list they belong to.
 *
 * The rows are mounted by the shared list field, which knows nothing about
 * forms and threads no props of its own through — so the two facts a row needs
 * cannot arrive as props, and neither of them is a fact about the row. Which
 * codebook subject the fields collect into, and where the list itself lives,
 * are decided by the section, so the section is what says them.
 *
 * Read here rather than from the stage document because there is nothing
 * reliable to read: a Family Pedigree names its node type at `nodeConfig.type`
 * and keeps its fields at `nodeConfig.form`, so a row that went looking for
 * `subject` would draw its picker from an empty codebook and refuse every
 * sibling attribute silently.
 */
type FormFieldsScope = Readonly<{
  fieldsPath: string;
  subject: CodebookSubject | undefined;
  /** See `draftUnvalidatedVariables`. Carried for the row's own picker. */
  draftUnvalidated: ReadonlySet<string>;
}>;

const FormFieldsScopeContext = createContext<FormFieldsScope | undefined>(
  undefined,
);

function useFormFieldsScope(): FormFieldsScope {
  const scope = useContext(FormFieldsScopeContext);
  if (scope === undefined) {
    throw new Error(
      'A form field row was mounted outside FormFieldsSection, so it has no way to know which subject it collects into or where its siblings are.',
    );
  }
  return scope;
}

export type FormFieldsSectionProps = Readonly<{
  /** Whose codebook these fields collect into. */
  subject: SubjectEntity;
  /**
   * Where the stage names that subject's TYPE, for a stage that does not hold
   * a `subject` of its own. See `useStageSubject`.
   */
  subjectTypePath?: string;
  /** Where the list of fields lives. See `DEFAULT_FIELDS_PATH`. */
  fieldsPath?: string;
  /**
   * The schema accepts this form with nothing in it, so the section does too.
   *
   * True only for a form hung off another section as an extra — a Family
   * Pedigree may ask nothing at all about each family member. A form that IS
   * the stage collects nothing when it is empty, which is why that is the
   * default.
   */
  optional?: boolean;
  /**
   * Makes the whole form something the researcher switches on and off.
   *
   * For an optional form: switching it off is how the protocol says "this
   * stage does not do this", and the confirmation is written in the words of
   * the interface that owns the form rather than in this section's.
   */
  capability?: SectionCapability;
  /**
   * The interface shows a heading above the form, so the researcher authors
   * one. `false` for the three interfaces whose form IS the whole stage — the
   * stage's own name already does that job, and the schema refuses a title
   * there (`TitlelessFormSchema`).
   */
  hasTitle?: boolean;
  /**
   * Attributes THIS stage's live draft writes without validation, which the
   * authoritative protocol does not know about yet.
   *
   * The role map is built from the protocol's own sections, so it describes
   * the edited stage as it was last SAVED. A researcher who binds an attribute
   * to an unvalidated slot in this same session — a name generator's prompt
   * stamp, a pedigree slot — has made a write no section of the protocol holds,
   * and without this the picker goes on offering that attribute and the row
   * dialog goes on accepting it. The contradiction then surfaces at stage
   * submit, against the slot the researcher was not looking at.
   *
   * The interface that owns those slots supplies this, because only it knows
   * where its own unvalidated writes live: a name generator reads its prompts'
   * `additionalAttributes`, a Family Pedigree its node configuration. Give a
   * stable array — a fresh one each render re-registers the list's validator.
   */
  draftUnvalidatedVariables?: readonly string[];
  /**
   * Words this form needs instead of the shared ones, because it describes
   * something the shared section cannot name.
   *
   * DESCRIPTORS, and named one at a time rather than bundled behind a `copy`
   * object — see `src/__tests__/hostCopyOverrides.test.ts`. Same rule as
   * `SectionCapability.confirmClear` and for the same reason: a string handed
   * across a seam like this is extracted by nothing and translated by nobody,
   * so an interface's own words would be the only words left in English.
   *
   * Only for a form hung off another section as an extra, where "Form fields"
   * is not what the researcher is looking at: a Family Pedigree's is the
   * FAMILY MEMBER form, and every sentence around it — what it asks about,
   * when the participant answers it — is about a relative rather than about a
   * form. A form that IS the stage overrides nothing.
   *
   * `waitingDescription` and the dialog's own titles stay shared: they are
   * said about the CONTROL rather than about what it collects.
   */
  title?: MessageDescriptor;
  description?: MessageDescriptor;
  fieldLabel?: MessageDescriptor;
  fieldHint?: MessageDescriptor;
  addLabel?: MessageDescriptor;
  emptyState?: MessageDescriptor;
}>;

/**
 * What a form collects, and how it asks for it.
 *
 * Owns `form.fields` throughout, and `form.title` where the interface shows
 * one. Each field binds one codebook attribute to the question the participant
 * answers, so it is a VALIDATED writer: the attribute it collects may not also
 * be written unvalidated somewhere else in the protocol, or an export would
 * mix checked and unchecked answers under a single name.
 *
 * Shared by every interface that shows a form — the three form stages, the
 * name generators' node forms and a Family Pedigree's family-member form —
 * which is why the subject arrives as a prop rather than being inferred: an
 * ego form's fields describe the participant, an alter edge form's describe a
 * relationship, and only the editor mounting this knows which.
 */
export default function FormFieldsSection({
  subject,
  subjectTypePath,
  fieldsPath = DEFAULT_FIELDS_PATH,
  optional = false,
  capability,
  hasTitle = false,
  draftUnvalidatedVariables = NO_DRAFT_UNVALIDATED,
  title = messages.title,
  description = messages.description,
  fieldLabel = messages.fieldLabel,
  fieldHint = messages.fieldHint,
  addLabel = messages.addLabel,
  emptyState = messages.emptyState,
}: FormFieldsSectionProps) {
  const intl = useAppIntl();
  const codebookSubject = useStageSubject(subject, subjectTypePath);
  const waiting = codebookSubject === undefined;
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    FormFieldEditor,
    FormFieldPreview,
  );
  const draftUnvalidated = useMemo(
    () => new Set(draftUnvalidatedVariables),
    [draftUnvalidatedVariables],
  );
  const onBeforeSave = useCommitFormField(codebookSubject, intl);
  const editorValidate = useFormFieldValidate(
    codebookSubject,
    fieldsPath,
    draftUnvalidated,
    intl,
  );
  const scope = useMemo(
    () => ({ fieldsPath, subject: codebookSubject, draftUnvalidated }),
    [codebookSubject, draftUnvalidated, fieldsPath],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(title)}
      description={intl.formatMessage(
        waiting ? messages.waitingDescription : description,
      )}
      disabled={waiting}
      {...(capability === undefined ? {} : { capability })}
    >
      {hasTitle && (
        <ProtocolField<typeof InputField>
          name={TITLE}
          component={InputField}
          label={intl.formatMessage(messages.formTitleLabel)}
          hint={intl.formatMessage(messages.formTitleHint)}
          placeholder={intl.formatMessage(messages.formTitlePlaceholder)}
          required={intl.formatMessage(messages.formTitleRequired)}
        />
      )}
      <FormFieldsScopeContext value={scope}>
        <ProtocolArrayField<typeof DialogArrayField>
          name={fieldsPath}
          label={intl.formatMessage(fieldLabel)}
          hint={intl.formatMessage(fieldHint)}
          component={DialogArrayField}
          addButtonLabel={intl.formatMessage(addLabel)}
          addTitle={intl.formatMessage(messages.addTitle)}
          editorTitle={intl.formatMessage(messages.editTitle)}
          itemLabel={messages.itemNoun}
          emptyStateMessage={intl.formatMessage(emptyState)}
          editorFieldsComponent={editorFieldsComponent}
          previewComponent={previewComponent}
          editorDialogSize="editor"
          editorValidate={editorValidate}
          onBeforeSave={onBeforeSave}
          normalizeItem={normalizeFormField}
          sortable
          {...(optional
            ? OPTIONAL_FIELDS_VALIDATION
            : REQUIRED_FIELDS_VALIDATION)}
        />
      </FormFieldsScopeContext>
    </BuilderSection>
  );
}

/**
 * The row as the protocol holds it.
 *
 * Two things the shared "drop what was left empty" rule cannot decide. The
 * keys describing an attribute being invented are working state of the dialog
 * rather than part of a form field, and `useCommitFormField` has already turned
 * them into a real attribute by the time this runs. And a validation hint that
 * is switched off is written by its absence: `false` is an answer in general —
 * which is why the shared rule keeps it — but this toggle's off position is
 * the schema's own default, and stamping it on every field in every form says
 * nothing its absence did not already say.
 */
function normalizeFormField(value: unknown): unknown {
  const cleaned = withoutAbsentValues(value);
  if (!isRecord(cleaned)) return cleaned;
  const {
    [NEW_VARIABLE_NAME]: _name,
    [NEW_VARIABLE_TYPE]: _type,
    [INPUT_CONTROL]: _component,
    ...field
  } = cleaned;
  if (field.showValidationHints === false) delete field.showValidationHints;
  return field;
}

/**
 * Writes the codebook half of a row, before the row that depends on it is
 * committed.
 *
 * Ordered this way on purpose: the codebook write is the one that can be
 * refused — a lost lease, a name a collaborator has just taken, a stage whose
 * own list edits are unsaved — and a row committed first would reference an
 * attribute that was never written, or promise a control the interview cannot
 * render. Returning the refusal keeps the dialog open with the reason on the
 * control that caused it.
 */
function useCommitFormField(
  codebookSubject: CodebookSubject | undefined,
  intl: IntlShape,
): (value: unknown) => Promise<unknown> {
  const createVariable = useCreateCodebookVariable(codebookSubject);
  const setComponent = useSetVariableComponent(codebookSubject);

  return useCallback(
    async (value: unknown) => {
      if (!isRecord(value)) return value;
      // An attribute that IS a list of answers is only ever made by the editor
      // that authors the list, so nothing here can create one from a name and
      // a type. Said in its own words rather than left to the schema, which
      // would answer with a count of a list the researcher never saw.
      if (
        value.variable === NEW_VARIABLE &&
        isOptionType(asString(value[NEW_VARIABLE_TYPE]) ?? '')
      ) {
        return {
          success: false,
          fieldErrors: { [NEW_VARIABLE_TYPE]: CREATE_WITH_VALUES_FIRST },
        };
      }
      const component = asString(value[INPUT_CONTROL]) ?? '';
      if (component === '') {
        return {
          success: false,
          fieldErrors: {
            [INPUT_CONTROL]: intl.formatMessage(messages.componentRequired),
          },
        };
      }

      if (value.variable !== NEW_VARIABLE) {
        const variableId = asString(value.variable) ?? '';
        const outcome = await setComponent(variableId, component);
        return outcome.status === 'refused'
          ? {
              success: false,
              fieldErrors: { [INPUT_CONTROL]: outcome.message },
            }
          : value;
      }

      const name = asString(value[NEW_VARIABLE_NAME])?.trim() ?? '';
      const type = asString(value[NEW_VARIABLE_TYPE]) ?? '';
      if (name === '' || !isCollectableType(type)) {
        return {
          success: false,
          fieldErrors: {
            [NEW_VARIABLE_NAME]:
              name === '' ? intl.formatMessage(messages.newNameRequired) : '',
            [NEW_VARIABLE_TYPE]: isCollectableType(type)
              ? ''
              : intl.formatMessage(messages.newTypeRequired),
          },
        };
      }

      const outcome = await createVariable({ name, type, component });
      return outcome.status === 'refused'
        ? {
            success: false,
            fieldErrors: { [NEW_VARIABLE_NAME]: outcome.message },
          }
        : { ...value, variable: outcome.variableId };
    },
    [createVariable, intl, setComponent],
  );
}

/**
 * The save-time gate: everything a row's own controls can display but not
 * refuse.
 *
 * Two questions, and both of them are about the protocol rather than about the
 * control. One form may not collect an attribute twice — every field renders
 * under its attribute's name, so the second registration silently replaces the
 * first — and a form may not collect an attribute something else writes
 * unvalidated. The picker already hides both, so this catches the draft that
 * was legal when it was authored and the protocol that arrived already broken.
 */
function useFormFieldValidate(
  codebookSubject: CodebookSubject | undefined,
  fieldsPath: string,
  draftUnvalidated: ReadonlySet<string>,
  intl: IntlShape,
) {
  const { protocolContext } = useStageEditorForm();
  const fields = useStageValue(fieldsPath);

  const allVariables = useMemo(
    () =>
      codebookSubject === undefined
        ? {}
        : variablesForSubject(protocolContext, codebookSubject),
    [codebookSubject, protocolContext],
  );
  const roleMap = useUnvalidatedWriterMap();

  return useMemo(() => {
    const validateVariable = makeFieldEditorValidate(
      allVariables,
      undefined,
      undefined,
      (variableId) => {
        if (
          codebookSubject === undefined ||
          !hasUnvalidatedUseFor(
            roleMap,
            codebookSubject,
            variableId,
            draftUnvalidated,
          )
        ) {
          return false;
        }
        const name = variableDisplayName(allVariables, variableId);
        // Where the other writer IS decides what the researcher is told, and
        // it is the only thing they can act on: a slot in this stage is on
        // screen behind the dialog, and a stage elsewhere in the protocol is
        // not.
        return draftUnvalidated.has(variableId)
          ? draftUnvalidatedElsewhereMessage(name)
          : unvalidatedElsewhereMessage(name);
      },
    );

    return (
      values: Record<string, unknown>,
      context?: { editIndex?: number; initialValues?: unknown },
    ): Record<string, unknown> | undefined => {
      const variable = asString(values.variable) ?? '';
      // Read from the LIVE rows: a field added in this editing session is not
      // in the committed list yet, so a committed list would let the same
      // attribute be picked a second time — and one freed by a row just
      // deleted would go on being refused.
      const siblings = rowsOf(fields).filter(
        (_row, index) => index !== context?.editIndex,
      );
      if (
        variable !== '' &&
        variable !== NEW_VARIABLE &&
        siblings.some((row) => row.variable === variable)
      ) {
        return { variable: intl.formatMessage(messages.attributeTaken) };
      }
      // Two refusals this deliberately does NOT make.
      //
      // A row that named an attribute with values and never created one is
      // refused by `useCommitFormField`, beside every other reason a codebook
      // write this row needs cannot happen. Repeating it here would put the
      // same sentence in two places, only one of which can ever run — and a
      // refusal that cannot run is one nothing can prove.
      //
      // An attribute that HAS fewer than two values is never picked, because
      // it is never offered: an entity definition is parsed whole, so a
      // codebook holding a one-value categorical attribute drops that entity
      // type out of the protocol context altogether and the picker has no
      // attributes at all.
      const issues = validateVariable(
        values,
        context?.initialValues === undefined
          ? {}
          : { initialValues: context.initialValues },
      );
      return issues.variable === undefined
        ? undefined
        : { variable: issues.variable };
    };
  }, [allVariables, codebookSubject, draftUnvalidated, fields, intl, roleMap]);
}

/**
 * Every unvalidated write in the protocol, the stage being edited included.
 *
 * Unscoped deliberately. A form field is a VALIDATED writer, so a stage's own
 * form contributes nothing this map is read for — but a stage may write the
 * same subject unvalidated somewhere else in itself: a name generator's prompt
 * stamps an attribute onto every node it adds, and a Family Pedigree derives
 * three from the tree the participant draws. Those are exactly the picks the
 * schema's own role-conflict rule refuses, and excluding the open stage would
 * offer every one of them and let the researcher author a stage that cannot be
 * saved.
 *
 * Each field's committed pick escapes throughout (`committed` below), so a
 * protocol that arrives already conflicting stays editable.
 *
 * Built from the AUTHORITATIVE sections, so it describes the open stage as it
 * was last saved. What this session has bound since is the other half of the
 * question, and arrives as `draftUnvalidatedVariables`.
 */
function useUnvalidatedWriterMap() {
  const { protocolContext } = useStageEditorForm();
  return useMemo(
    () => buildVariableRoleMap(protocolContext),
    [protocolContext],
  );
}

/**
 * Kept as a named helper so the picker's exclusion and the save-time refusal
 * ask the same question of the same two sources.
 *
 * Two sources, because the role map is built from the authoritative protocol
 * and therefore describes the edited stage as it was last SAVED: a slot this
 * session has just bound is a write no section holds yet, and only the draft
 * knows about it.
 */
function hasUnvalidatedUseFor(
  roleMap: ReturnType<typeof buildVariableRoleMap>,
  codebookSubject: Parameters<typeof excludeUnvalidatedUses>[1],
  variableId: string,
  draftUnvalidated: ReadonlySet<string>,
): boolean {
  return (
    draftUnvalidated.has(variableId) ||
    excludeUnvalidatedUses(roleMap, codebookSubject, [{ value: variableId }])
      .length === 0
  );
}

/**
 * One form field: the attribute it collects, and how it asks for it.
 *
 * Rendered inside the shared list's row dialog, so its controls are ordinary
 * connected fields of THAT form — the row is committed whole when the dialog
 * saves, and no cell of it is ever registered on the stage.
 */
function FormFieldEditor({ item, editIndex }: RowEditorProps) {
  const intl = useAppIntl();
  const { subject } = useFormFieldsScope();
  const inventing = useInventingAttribute(item);
  const newType = asString(useRowValue(NEW_VARIABLE_TYPE)) ?? '';
  // An attribute that IS a list of answers cannot be invented from a name: the
  // list is part of it, and the codebook refuses one without at least two
  // values. So the name box gives way to the editor that authors both.
  const inventingWithValues = inventing && isOptionType(newType);

  return (
    <>
      <Section
        title={intl.formatMessage(messages.attributeSectionTitle)}
        description={intl.formatMessage(messages.attributeSectionDescription)}
      >
        <AttributePicker item={item} editIndex={editIndex} />
        {inventing && (
          // Asked before the name, because the answer decides what else this
          // attribute needs before it can exist.
          <Field<typeof SelectControl>
            name={NEW_VARIABLE_TYPE}
            component={SelectControl}
            label={intl.formatMessage(messages.newTypeLabel)}
            hint={intl.formatMessage(messages.newTypeHint)}
            options={TYPE_OPTIONS}
            initialValue={asString(item[NEW_VARIABLE_TYPE]) ?? ''}
            required={intl.formatMessage(messages.newTypeRequired)}
          />
        )}
        {inventing && !inventingWithValues && (
          <Field<typeof InputField>
            name={NEW_VARIABLE_NAME}
            component={InputField}
            label={intl.formatMessage(messages.newNameLabel)}
            hint={intl.formatMessage(messages.newNameHint)}
            placeholder={intl.formatMessage(messages.newNamePlaceholder)}
            initialValue={asString(item[NEW_VARIABLE_NAME]) ?? ''}
            required={intl.formatMessage(messages.newNameRequired)}
          />
        )}
        {/* The input control belongs to an attribute that exists. While one
            is still being invented with its values, there is nothing yet for
            a control to be chosen for. */}
        {!inventingWithValues && <InputControlField item={item} />}
        <AttributeCodebookControls
          subject={subject}
          committedVariable={item.variable}
          componentField={INPUT_CONTROL}
          {...(inventingWithValues ? { inventingType: newType } : {})}
        />
        {subject === undefined && (
          <p className="text-sm text-current/70">
            {intl.formatMessage(messages.scopeMissing)}
          </p>
        )}
      </Section>
      <Section
        title={intl.formatMessage(messages.questionSectionTitle)}
        description={intl.formatMessage(messages.questionSectionDescription)}
      >
        <Field<typeof RichTextField>
          name="prompt"
          component={RichTextField}
          label={intl.formatMessage(messages.promptLabel)}
          hint={intl.formatMessage(messages.promptHint)}
          placeholder={intl.formatMessage(messages.promptPlaceholder)}
          singleLine
          initialValue={asString(item.prompt)}
          required={intl.formatMessage(messages.promptRequired)}
        />
        <Field<typeof RichTextField>
          name="hint"
          component={RichTextField}
          label={intl.formatMessage(messages.hintLabel)}
          hint={intl.formatMessage(messages.hintHint)}
          placeholder={intl.formatMessage(messages.hintPlaceholder)}
          singleLine
          initialValue={asString(item.hint)}
        />
        <Field<typeof ToggleField>
          name="showValidationHints"
          component={ToggleField}
          label={intl.formatMessage(messages.validationHintsLabel)}
          hint={intl.formatMessage(messages.validationHintsHint)}
          inline
          initialValue={item.showValidationHints === true}
        />
      </Section>
    </>
  );
}

/**
 * How the participant answers this field.
 *
 * The control belongs to the codebook attribute rather than to the field —
 * one attribute is collected the same way wherever it is asked for — so it is
 * seeded from the codebook, offered from the list its type allows, and written
 * back through a codebook edit when the dialog saves. It is required: the
 * schema refuses a form field whose attribute defines no control, and an
 * attribute created for its own sake (a number nothing collects yet) has none.
 */
function InputControlField({
  item,
}: Readonly<{ item: RowEditorProps['item'] }>) {
  const intl = useAppIntl();
  const { protocolContext } = useStageEditorForm();
  const { subject } = useFormFieldsScope();
  const chosen = asString(useRowValue('variable') ?? item.variable) ?? '';
  const newType = asString(useRowValue(NEW_VARIABLE_TYPE)) ?? '';

  const variable =
    subject === undefined || chosen === '' || chosen === NEW_VARIABLE
      ? undefined
      : variablesForSubject(protocolContext, subject)[chosen];
  const type = chosen === NEW_VARIABLE ? newType : (variable?.type ?? '');
  const options = useMemo(
    () => controlsForType(type).map((value) => ({ value, label: value })),
    [type],
  );
  const committed =
    variable !== undefined && 'component' in variable
      ? asString(variable.component)
      : undefined;

  // Nothing to choose from until the kind of answer is settled. Mounting the
  // control anyway would register an empty value and refuse the save with a
  // question the researcher cannot yet answer.
  if (options.length === 0) return null;

  return (
    <Field<typeof SelectControl>
      name={INPUT_CONTROL}
      component={SelectControl}
      label={intl.formatMessage(messages.componentLabel)}
      hint={intl.formatMessage(messages.componentHint)}
      options={options}
      initialValue={committed ?? options[0]?.value ?? ''}
      required={intl.formatMessage(messages.componentRequired)}
    />
  );
}
/**
 * The attributes this field may collect.
 *
 * A form field is a VALIDATED writer, so the pool drops every attribute
 * something writes unvalidated — a prompt that stamps a fixed value, a bin
 * that records where a node was dropped — and every attribute a sibling field
 * in this same form already collects. What the row already holds always stays
 * in the list: reselecting a saved pick is never a new contradiction, and
 * dropping it would blank the very reference the researcher has to resolve.
 */
function AttributePicker({
  item,
  editIndex,
}: Readonly<{ item: RowEditorProps['item']; editIndex?: number }>) {
  const intl = useAppIntl();
  const { protocolContext } = useStageEditorForm();
  const { fieldsPath, subject, draftUnvalidated } = useFormFieldsScope();
  const fields = useStageValue(fieldsPath);
  const committed = asString(item.variable) ?? '';

  const roleMap = useUnvalidatedWriterMap();

  const options = useMemo(() => {
    if (subject === undefined) return NO_OPTIONS;
    const siblings = new Set(
      rowsOf(fields)
        .filter((_row, index) => index !== editIndex)
        .flatMap((row) =>
          typeof row.variable === 'string' ? [row.variable] : [],
        ),
    );
    const pool = Object.entries(variablesForSubject(protocolContext, subject))
      // An attribute holding a position rather than an answer has no input
      // control, so no form can ask for it.
      .filter(([, variable]) => isCollectableType(variable.type))
      .map(([value, variable]) => ({
        value,
        label: variable.name,
        type: variable.type,
      }));
    return [
      ...excludeUnvalidatedUses(roleMap, subject, pool, committed).filter(
        ({ value }) =>
          value === committed ||
          // A slot bound in this session writes unvalidated just as a saved one
          // does; the protocol simply does not hold it yet. Asked the same way
          // as the save-time gate, so the picker cannot offer what the dialog
          // is about to refuse.
          (!siblings.has(value) && !draftUnvalidated.has(value)),
      ),
      {
        value: NEW_VARIABLE,
        label: intl.formatMessage(messages.createNewOption),
      },
    ];
  }, [
    committed,
    draftUnvalidated,
    editIndex,
    fields,
    intl,
    protocolContext,
    roleMap,
    subject,
  ]);

  return (
    <Field<typeof VariablePicker>
      name="variable"
      component={VariablePicker}
      label={intl.formatMessage(messages.attributeLabel)}
      hint={intl.formatMessage(messages.attributeHint)}
      options={options}
      emptyMessage={intl.formatMessage(messages.attributeEmpty)}
      initialValue={committed}
      required={intl.formatMessage(messages.attributeRequired)}
    />
  );
}

/** How one field reads in the list when its dialog is closed. */
function FormFieldPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const { protocolContext } = useStageEditorForm();
  const { subject } = useFormFieldsScope();
  const variableId = asString(item.variable) ?? '';
  const variable =
    subject === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];

  return (
    <div className="flex flex-col gap-2.5">
      <RenderMarkdown render={<div />}>
        {asString(item.prompt) ?? ''}
      </RenderMarkdown>
      <div>
        <Badge>
          {variable === undefined
            ? intl.formatMessage(messages.previewMissing)
            : intl.formatMessage(messages.previewCollects, {
                name: variable.name,
                type: variable.type,
              })}
        </Badge>
      </div>
    </div>
  );
}

/**
 * Whether this row is inventing an attribute right now.
 *
 * The live choice, falling back to the committed one for the render before the
 * picker has registered — otherwise a row saved mid-invention would open with
 * its name and type controls missing, and saving it again would drop them.
 */
function useInventingAttribute(item: RowEditorProps['item']): boolean {
  const chosen = useRowValue('variable');
  return (chosen ?? item.variable) === NEW_VARIABLE;
}
