import {
  type ComponentType,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import FormErrors from '@codaco/fresco-ui/form/FormErrors';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';
import { duplicateFormFieldIndices } from '@codaco/protocol-validation';

import {
  useCreateCodebookVariable,
  useSetVariableComponent,
  useSubjectStillCollected,
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
import { useDialogFormSubmissionBlock } from '../form/DialogForm.tsx';
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
  needsCodebookEditorToCreate,
  TYPE_OPTIONS,
} from './collectableTypes.ts';
import { createdUnassigned } from './CreatableVariablePicker.tsx';
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
 * looking at the place to say so. It is never written to the protocol:
 * `useCommitFormField` replaces it with the created attribute's own id before
 * the row is committed.
 *
 * Spelled with a `#`, which is the whole of why this value and not another
 * one. An attribute's record key is the researcher's — `VariableNameSchema` is
 * `/^[a-zA-Z0-9._:-]+$/`, and the uuids this section mints are only what IT
 * creates, so an imported or hand-written protocol may key an attribute
 * anything that regex allows. A sentinel inside that alphabet is a name the
 * codebook may legally hold: the picker would then offer the real attribute
 * and this option under one value, choosing the attribute would read as a
 * request to invent one, and saving would create a second attribute beside it.
 * `#` is outside the alphabet, so no attribute can ever be called this.
 */
const NEW_VARIABLE = '#create-new-attribute';

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
  malformedField: {
    id: 'protocolBuilder.formFields.malformedField',
    defaultMessage:
      'This form holds an entry that is not a field, so its fields cannot be shown or changed here. That entry has to be taken out of the protocol before this stage can be saved.',
    description:
      'Refusal shown above a form’s list of fields when the list holds an entry that is not a field at all — which an import, a migration or another session can leave behind. The list cannot render such an entry, so there is no row for the researcher to open and finish, which is why this says the protocol itself has to be repaired.',
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
  createWithSettingsFirst: {
    id: 'protocolBuilder.formFields.createWithSettingsFirst',
    defaultMessage:
      'Create this attribute and what it accepts before adding the field that collects it.',
    description:
      'The same refusal for an attribute whose answer is not chosen from a list but still needs something the researcher has not been asked for — a scale, whose two end labels tell the participant what each end means.',
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
      'Guidance under the new-attribute name field. The codebook is the protocol’s definition of what an interview records; exported data is the file a researcher analyzes afterwards.',
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
  noInputControl: {
    id: 'protocolBuilder.formFields.componentRequired',
    defaultMessage:
      'This field’s attribute gives the participant no way to answer. Choose a different attribute, or remove this field.',
    description:
      'Refusal shown above the fields of a form field’s dialog, and named by its unavailable save control, when the attribute the field collects has no input control to offer — an attribute that records a position rather than an answer, or one that has been deleted from the codebook. There is no control to choose in this dialog, so the way out is a different attribute.',
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

const MALFORMED_FIELD = createMessageError(messages.malformedField);

const DUPLICATE_FIELD = createMessageError(messages.duplicateField);

const CREATE_WITH_VALUES_FIRST = createMessageError(
  messages.createWithValuesFirst,
);

const CREATE_WITH_SETTINGS_FIRST = createMessageError(
  messages.createWithSettingsFirst,
);

const NO_INPUT_CONTROL = createMessageError(messages.noInputControl);

/** Stable identity: `options` is a memo dependency of the picker below. */
const NO_OPTIONS: VariablePickerOption[] = [];

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

/**
 * Said of an entry the list cannot even show.
 *
 * Asked of the RAW array rather than of `rowsOf`, which drops what is not a
 * record: a rule reading the filtered list is a rule about a list the
 * researcher's protocol does not hold, and it answers that a form holding
 * `[null]` is complete. The schema refuses that stage
 * (`FormFieldSchema`), so the save fails either way — the difference is
 * whether the section the researcher is looking at says why.
 *
 * Its own sentence rather than the incomplete one, because there is nothing to
 * open: an entry of the wrong shape leaves the shared list with a value it
 * cannot render, so the rows go with it and no row can be finished.
 *
 * A value that is not a list at all is the same answer, and only `undefined`
 * is absence — which is what `FormFieldArraySchema.optional()` accepts and all
 * it accepts. A string or an object left at an optional form's path would
 * otherwise pass every rule here while the schema refuses the stage, and with
 * no entries to draw rows from the researcher would be looking at an empty
 * form for the reason their save keeps failing.
 */
const everyEntryIsAField = (value: unknown) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return MALFORMED_FIELD;
  return value.every(isRecord) ? undefined : MALFORMED_FIELD;
};

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
    // Before the one that counts it. Only the first rule to fail is shown, and
    // "add at least one field" said of a value that is not a list sends the
    // researcher to add a row to something that cannot hold one.
    everyEntryIsAField,
    atLeastOneField,
    everyFieldComplete,
    noAttributeTwice,
  ]),
});

const OPTIONAL_FIELDS_VALIDATION = Object.freeze({
  custom: messageRuleValidation([
    everyEntryIsAField,
    everyFieldComplete,
    noAttributeTwice,
  ]),
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
  /**
   * The stage `draftUnvalidated` is the whole account of, where there is one.
   * Carried so the picker and the save-time gate build the same role map.
   */
  answeredFor: string | undefined;
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
   * Supplying it at all is what makes it the WHOLE account of this stage's
   * unvalidated writes, and the saved copy of them is then dropped from the
   * role map. That is the other half of the same fact: an account that could
   * only add to the saved one could never say a slot had been UNBOUND, so an
   * attribute the researcher had just freed went on being hidden from the
   * picker and refused at save until they saved the stage and opened it again.
   * A host that supplies nothing has said nothing about its own stage, and the
   * saved protocol stays the only account there is of it.
   *
   * The interface that owns those slots supplies this, because only it knows
   * where its own unvalidated writes live: a name generator reads its prompts'
   * `additionalAttributes`, a Family Pedigree its node configuration — so an
   * interface that supplies this has to name EVERY unvalidated write its stage
   * makes, not only the ones it has changed. Give a stable array — a fresh one
   * each render re-registers the list's validator.
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
   *
   * Formatted with no values, like every named descriptor a shared section
   * takes: one carrying a placeholder renders the pattern on screen, and
   * nothing in the types can refuse it. See `PromptsSection`'s own note and
   * `sections/__tests__/namedDescriptorProps.test.tsx`.
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
  draftUnvalidatedVariables,
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
    () => new Set(draftUnvalidatedVariables ?? []),
    [draftUnvalidatedVariables],
  );
  // The stage whose saved unvalidated writes the draft above replaces, where
  // there is a draft to replace them with. See `draftUnvalidatedVariables`.
  const { identity } = useStageEditorForm();
  const answeredFor =
    draftUnvalidatedVariables === undefined ? undefined : identity.id;
  const onBeforeSave = useCommitFormField(codebookSubject, intl);
  const editorValidate = useFormFieldValidate(
    codebookSubject,
    fieldsPath,
    draftUnvalidated,
    answeredFor,
    intl,
  );
  const scope = useMemo(
    () => ({
      fieldsPath,
      subject: codebookSubject,
      draftUnvalidated,
      answeredFor,
    }),
    [answeredFor, codebookSubject, draftUnvalidated, fieldsPath],
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
  const subjectStillCollected = useSubjectStillCollected(codebookSubject);

  return useCallback(
    async (value: unknown) => {
      if (!isRecord(value)) return value;
      // An attribute the codebook editor has to author is only ever made
      // there, so nothing here can create one from a name and a type. Said in
      // its own words rather than left to the schema, which would answer a
      // list of answers with a count of a list the researcher never saw — and
      // a scale not at all, because a scale with no end labels is a protocol
      // the schema accepts and a participant cannot read.
      const inventedType = asString(value[NEW_VARIABLE_TYPE]) ?? '';
      if (
        value.variable === NEW_VARIABLE &&
        needsCodebookEditorToCreate(inventedType)
      ) {
        return {
          success: false,
          fieldErrors: {
            [NEW_VARIABLE_TYPE]: isOptionType(inventedType)
              ? CREATE_WITH_VALUES_FIRST
              : CREATE_WITH_SETTINGS_FIRST,
          },
        };
      }
      // The belt for a row that reaches a commit with no control on it at all.
      // `InputControlField` is not on screen when there is none to choose, so
      // this cannot be filed against that field: `focusFirstError` would be
      // sent to a control that is not in the document and the researcher would
      // be left with a refused save and nothing on screen. It goes where the
      // dialog reports everything else about a whole draft — above the fields,
      // in the same place `NoInputControlOffered` is already standing on the
      // one route a researcher can take here.
      const component = asString(value[INPUT_CONTROL]) ?? '';
      if (component === '') {
        return { success: false, formErrors: [NO_INPUT_CONTROL] };
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
      // The kind of answer is a `required` field of this dialog (see
      // `FormFieldEditor`), so this is the belt for a row that arrives already
      // broken rather than a rule of its own — and it is what narrows `type`
      // for the create below.
      //
      // ONE key, carrying the one sentence there is. The name is `required`
      // too and used to be named here as well, with an empty string for
      // whichever of the two was actually fine — and an empty string survives
      // the row's own filter, so the first-error walk could land on a control
      // whose error region is blank while the sentence sat on the other one.
      if (!isCollectableType(type)) {
        return {
          success: false,
          fieldErrors: {
            [NEW_VARIABLE_TYPE]: intl.formatMessage(messages.newTypeRequired),
          },
        };
      }

      const outcome = await createVariable({ name, type, component });
      if (outcome.status === 'refused') {
        return {
          success: false,
          fieldErrors: { [NEW_VARIABLE_NAME]: outcome.message },
        };
      }
      // Which codebook the attribute went into was decided when the researcher
      // pressed Add, and a collaborator can repoint the stage at another type
      // while that write is with the host. A record key belongs to exactly one
      // type, so committing the row now would add a field naming an attribute
      // the type this form collects about does not have — a stage the schema
      // refuses, built out of a save the researcher was told succeeded.
      //
      // What is refused is the ROW, and what the researcher is told is not that
      // the create failed: it landed, and pressing Add again would ask the
      // codebook for a name it already holds. So the sentence is the one the
      // picker's own create already uses for this — the write is done, and here
      // is where the attribute went — with the draft left standing so they can
      // point the field at something this stage collects, or leave it.
      if (
        codebookSubject === undefined ||
        !subjectStillCollected(codebookSubject)
      ) {
        return {
          success: false,
          formErrors: [
            createMessageError(createdUnassigned, {
              variableName: name,
            }),
          ],
        };
      }
      return { ...value, variable: outcome.variableId };
    },
    [
      codebookSubject,
      createVariable,
      intl,
      setComponent,
      subjectStillCollected,
    ],
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
  answeredFor: string | undefined,
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
  const roleMap = useUnvalidatedWriterMap(answeredFor);

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
 * Every unvalidated write in the protocol that this section is not already
 * being told about.
 *
 * The open stage is INCLUDED unless a host has taken responsibility for it. A
 * form field is a VALIDATED writer, so a stage's own form contributes nothing
 * this map is read for — but a stage may write the same subject unvalidated
 * somewhere else in itself: a name generator's prompt stamps an attribute onto
 * every node it adds, and a Family Pedigree derives three from the tree the
 * participant draws. Those are exactly the picks the schema's own
 * role-conflict rule refuses, so dropping the open stage from a map nothing
 * replaces it in would offer every one of them and let the researcher author a
 * stage that cannot be saved.
 *
 * `answeredFor` is the stage a host HAS replaced, by supplying
 * `draftUnvalidatedVariables` — the live account of what that stage writes
 * unvalidated, which the saved sections can only contradict: they still hold
 * the slot the researcher unbound a moment ago, and a live list can add to a
 * map but never subtract from it.
 *
 * Each field's committed pick escapes throughout (`committed` below), so a
 * protocol that arrives already conflicting stays editable.
 */
function useUnvalidatedWriterMap(answeredFor: string | undefined) {
  const { protocolContext } = useStageEditorForm();
  return useMemo(
    () => buildVariableRoleMap(protocolContext, answeredFor),
    [answeredFor, protocolContext],
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
  const typeOptions = useMemo(
    () =>
      TYPE_OPTIONS.map(({ value, label }) => ({
        value,
        label: intl.formatMessage(label),
      })),
    [intl],
  );
  // Some attributes cannot be invented from a name: a list of answers IS its
  // values, and a scale IS the two labels that say which end is which. So the
  // name box gives way to the editor that authors the attribute and the part
  // of it a name cannot carry.
  const inventingInTheEditor =
    inventing && needsCodebookEditorToCreate(newType);

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
            options={typeOptions}
            initialValue={asString(item[NEW_VARIABLE_TYPE]) ?? ''}
            required={intl.formatMessage(messages.newTypeRequired)}
          />
        )}
        {inventing && !inventingInTheEditor && (
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
            is still being invented in the codebook editor, there is nothing
            yet for a control to be chosen for. */}
        {!inventingInTheEditor && <InputControlField item={item} />}
        <AttributeCodebookControls
          subject={subject}
          committedVariable={item.variable}
          componentField={INPUT_CONTROL}
          {...(inventingInTheEditor ? { inventingType: newType } : {})}
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
    () =>
      controlsForType(type).map(({ value, label }) => ({
        value,
        label: intl.formatMessage(label),
      })),
    [intl, type],
  );
  const committed =
    variable !== undefined && 'component' in variable
      ? asString(variable.component)
      : undefined;
  const belongsTo =
    chosen === NEW_VARIABLE ? `${NEW_VARIABLE}:${type}` : chosen;
  const seeded = committed ?? options[0]?.value ?? '';
  useControlThatFollowsTheAttribute(
    belongsTo,
    seeded,
    asString(useRowValue(INPUT_CONTROL)),
  );

  // Nothing to choose from — and which of the two reasons it is decides
  // whether the researcher is mid-answer or stuck.
  if (options.length === 0) {
    // Mid-answer: the row names no attribute yet, or is inventing one whose
    // kind of answer is still unsettled. Mounting the control would register
    // an empty value and refuse the save with a question they cannot yet
    // answer, and the field they CAN answer — the attribute, the kind of
    // answer — already carries its own refusal.
    if (chosen === '' || chosen === NEW_VARIABLE) return null;
    return <NoInputControlOffered />;
  }

  return (
    <Field<typeof SelectControl>
      name={INPUT_CONTROL}
      component={SelectControl}
      label={intl.formatMessage(messages.componentLabel)}
      hint={intl.formatMessage(messages.componentHint)}
      options={options}
      // Always one of `options`, so the field cannot register an empty control
      // and has no `required` of its own to state: a native select offers no
      // way back to nothing. What "no control" means here is that this field
      // is not on screen at all, which is `NoInputControlOffered`'s to say.
      initialValue={seeded}
    />
  );
}

/**
 * Keeps the control saying what the CODEBOOK says, until the researcher
 * answers it themselves.
 *
 * The row saves this control TO the codebook, so a control the row goes on
 * showing after the codebook's own answer has moved is not a stale label: the
 * row's next save writes it back, and the change it undoes reaches every form
 * that collects the attribute. Two ways the codebook's answer moves under a
 * row, and both used to be missed.
 *
 * Rebinding is one. `initialValue` cannot follow it: a field keeps its value
 * across a change of initial value by design — that is what stops a re-render
 * from wiping what someone has typed — and the value survives even an unmount,
 * because `useField` unregisters preserving it and `registerField` prefers
 * that dormant value over the initial one it is handed. So a row rebound from
 * an attribute collected in a text AREA to one collected in a text BOX kept
 * the text area, and the row's save wrote it onto the newly chosen attribute.
 *
 * A COLLABORATOR changing how the bound attribute is collected is the other,
 * and it is the same write from the other end: the binding never changes, so
 * nothing about the row is different — only the codebook is — and saving
 * anything else in the row put the collaborator's change back.
 *
 * A write through the store rather than a tombstone: the control is not being
 * discarded, it is being answered again, and the answer is the one the
 * codebook now holds.
 *
 * `binding` is what the control is an answer ABOUT — the chosen attribute, or,
 * while one is being invented, the kind of answer that decides which controls
 * exist at all. `seeded` is the codebook's own answer for it, and `live` is
 * what the row is showing: whatever the row shows that the codebook did not
 * put there is the researcher's, and from then on it is theirs whatever the
 * codebook does next. The first render records all three without writing
 * anything — the field has just registered from the same seed, and a write
 * there would mark a row dirty that nobody has touched.
 */
function useControlThatFollowsTheAttribute(
  binding: string,
  seeded: string,
  live: string | undefined,
): void {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const shown = useRef({ binding, seeded, answered: false });

  useEffect(() => {
    const previous = shown.current;
    if (binding !== previous.binding) {
      // A different question, so the answer starts again from the codebook's.
      shown.current = { binding, seeded, answered: false };
      // Nothing is on screen to answer: the row names no attribute yet, or
      // names one no control can collect. The field is unmounted in both
      // cases, and whatever it left behind is refused by `useCommitFormField`
      // rather than written.
      if (seeded === '') return;
      setFieldValue(INPUT_CONTROL, seeded);
      return;
    }
    // The control has not registered yet, so there is nothing on screen for
    // anyone to have answered.
    if (live === undefined) return;
    const answered = previous.answered || live !== previous.seeded;
    shown.current = { binding, seeded, answered };
    if (answered || seeded === '' || seeded === previous.seeded) return;
    setFieldValue(INPUT_CONTROL, seeded);
  }, [binding, live, seeded, setFieldValue]);
}

/**
 * Said when the attribute this field collects has no input control to offer.
 *
 * An attribute that records a position rather than an answer has none at all,
 * and one deleted from the codebook while the dialog was open has nothing left
 * to ask. Either way there is no control for this dialog to render, so there
 * is no field for the refusal to sit under — and a save refused against a
 * field that is not there reaches the researcher as nothing on screen and a
 * warning in the console.
 *
 * Registered as a submission block instead, which is what this package already
 * says about a part of a dialog that failed in a way no field can express: the
 * reason stands above the fields from the moment the dialog opens rather than
 * after a save that was never going to work, the save control announces that
 * it is unavailable and says why, and the submission is refused for as long as
 * this is mounted. Choosing a different attribute unmounts it, which is the
 * way out the sentence names.
 *
 * Rendered here only when there is no dialog to report it — nothing in this
 * package mounts a field editor outside one, and saying nothing at all would
 * be worse than saying it twice.
 */
function NoInputControlOffered() {
  const reported = useDialogFormSubmissionBlock(NO_INPUT_CONTROL);
  return reported ? null : <FormErrors errors={[NO_INPUT_CONTROL]} />;
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
  const { fieldsPath, subject, draftUnvalidated, answeredFor } =
    useFormFieldsScope();
  const fields = useStageValue(fieldsPath);
  const committed = asString(item.variable) ?? '';

  const roleMap = useUnvalidatedWriterMap(answeredFor);

  const options = useMemo(() => {
    // The ONLY way to an empty list: every other path appends the
    // create-a-new-one sentinel, so a pool with nothing in it still has one
    // option. That is why the picker is left to say what an empty list means —
    // a message written here would describe a state that only exists when the
    // stage has no subject, where the sentence beneath the section
    // (`scopeMissing`) is the one that is true.
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
