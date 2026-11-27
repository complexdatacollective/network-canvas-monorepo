import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The words of the form editor: the section that edits a form as one
 * document, its field blocks, the settings of a field and the attribute
 * picker of a new field. English only for now: Architect's new wording is
 * translated once its interface is final.
 */
export const formDocumentMessages = defineMessages({
  title: {
    id: 'protocolBuilder.formDocument.title',
    defaultMessage: 'Form',
    description:
      'Heading of the section of a stage editor where a researcher writes a form: the text that participants read, with a field for each question that they answer.',
  },
  description: {
    id: 'protocolBuilder.formDocument.description',
    defaultMessage:
      'Write the text that participants read, and add a field for each question that they answer.',
    description: 'Description of the form section of a stage editor.',
  },
  nameGeneratorDescription: {
    id: 'protocolBuilder.formDocument.nameGeneratorDescription',
    defaultMessage:
      'Participants fill in this form each time that they add a person.',
    description:
      'Description of the form section of a name generator stage, whose form the participant fills in for each person that they name.',
  },
  waitingDescription: {
    id: 'protocolBuilder.formDocument.waitingDescription',
    defaultMessage:
      'Choose what this stage works with before writing its form.',
    description:
      'Shown in place of the description of the form section while the researcher has not yet chosen which node or edge type the stage is about.',
  },
  dialogTitleLabel: {
    id: 'protocolBuilder.formDocument.dialogTitleLabel',
    defaultMessage: 'Dialog title',
    description:
      'Label of the field holding the heading of the dialog in which the participant fills in the form of a name generator.',
  },
  dialogTitleHint: {
    id: 'protocolBuilder.formDocument.dialogTitleHint',
    defaultMessage:
      'Shown as the heading of the dialog in which the participant adds a person.',
    description: 'Guidance under the Dialog title field of a name generator.',
  },
  dialogTitleRequired: {
    id: 'protocolBuilder.formDocument.dialogTitleRequired',
    defaultMessage: 'Give this dialog a title.',
    description:
      'Refusal shown under the Dialog title field of a name generator when it has been left empty.',
  },
  contentLabel: {
    id: 'protocolBuilder.formDocument.contentLabel',
    defaultMessage: 'Form content',
    description:
      'Label of the editor where a researcher writes a form: its text and its fields.',
  },
  contentPlaceholder: {
    id: 'protocolBuilder.formDocument.contentPlaceholder',
    defaultMessage: 'Type the text of the form, or add a field…',
    description:
      'Placeholder shown in the empty editor of a form. The ellipsis is one character.',
  },
  questionName: {
    id: 'protocolBuilder.formDocument.questionName',
    defaultMessage: 'Question',
    description:
      'Names the question of one field of a form, in a list of translatable strings that have no translation in a language. Follows the name of the field.',
  },
  hintName: {
    id: 'protocolBuilder.formDocument.hintName',
    defaultMessage: 'Hint',
    description:
      'Names the hint of one field of a form, in a list of translatable strings that have no translation in a language. The hint is extra guidance shown under the question. Follows the name of the field.',
  },
  questionPlaceholder: {
    id: 'protocolBuilder.formDocument.labelPlaceholder',
    defaultMessage: 'Type the question',
    description:
      'Placeholder shown in the empty question of a field in a form that a researcher is writing.',
  },
  hintPlaceholder: {
    id: 'protocolBuilder.formDocument.hintPlaceholder',
    defaultMessage: 'Add a hint (optional)',
    description:
      'Placeholder shown in the empty hint under the question of a field in a form that a researcher is writing.',
  },
  fieldButton: {
    id: 'protocolBuilder.formDocument.fieldButton',
    defaultMessage: 'Field',
    description:
      'Button in the toolbar of the form editor that adds a field: one question that the participant answers, saved to an attribute.',
  },
  chooseAttribute: {
    id: 'protocolBuilder.formDocument.chooseAttribute',
    defaultMessage: 'Choose an attribute',
    description:
      'Shown on a field of a form whose attribute has not been chosen yet. Choosing it opens the list of attributes.',
  },

  attributeLabel: {
    id: 'protocolBuilder.formDocument.attributeLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the control in the settings of a field that chooses the attribute to which the answers are saved.',
  },
  attributeHint: {
    id: 'protocolBuilder.formDocument.attributeHint',
    defaultMessage: 'Answers to this field are saved to this attribute.',
    description: 'Guidance under the Attribute control of a field.',
  },
  inputControlLabel: {
    id: 'protocolBuilder.formDocument.inputControlLabel',
    defaultMessage: 'Input control',
    description:
      'Label of the control in the settings of a field that chooses what the participant answers with, such as a text box, a slider or a set of buttons.',
  },
  inputControlHint: {
    id: 'protocolBuilder.formDocument.inputControlHint',
    defaultMessage: 'How the participant answers this question.',
    description: 'Guidance under the Input control of a field.',
  },
  optionsLabel: {
    id: 'protocolBuilder.formDocument.optionsLabel',
    defaultMessage: 'Options',
    description:
      'Heading in the settings of a field above the answers that the participant can choose from.',
  },
  controlSettingsLabel: {
    id: 'protocolBuilder.formDocument.controlSettingsLabel',
    defaultMessage: 'Control settings',
    description:
      'Heading in the settings of a field whose attribute has no options, above the button that opens the settings of its input control, such as the earliest and latest dates of a date picker.',
  },
  optionsHint: {
    id: 'protocolBuilder.formDocument.optionsHint',
    defaultMessage: 'The participant can choose from these options.',
    description: 'Guidance under the Options heading of a field.',
  },
  editOptions: {
    id: 'protocolBuilder.formDocument.editOptions',
    defaultMessage: 'Edit options',
    description:
      'Button in the settings of a field that opens a dialog for changing the options that the participant can choose from.',
  },
  editControlSettings: {
    id: 'protocolBuilder.formDocument.editControlSettings',
    defaultMessage: 'Edit control settings',
    description:
      'Button in the settings of a field that opens a dialog for changing the settings of its input control, such as the labels at the ends of a scale.',
  },
  optionsDialogTitle: {
    id: 'protocolBuilder.formDocument.optionsDialogTitle',
    defaultMessage: 'Options and settings of {attribute}',
    description:
      'Title of the dialog for changing the options and the settings of the input control of an attribute. attribute is the attribute’s name, which is not translated.',
  },
  validationHintsLabel: {
    id: 'protocolBuilder.formDocument.validationHintsLabel',
    defaultMessage: 'Show validation hints',
    description:
      'Label of the switch in the settings of a field that shows the participant the rules that their answer must follow.',
  },
  validationHintsHint: {
    id: 'protocolBuilder.formDocument.validationHintsHint',
    defaultMessage:
      'Shows the rules under the question before the participant answers, for example “Must choose at least 1 option.”',
    description: 'Guidance under the Show validation hints switch of a field.',
  },
  sharedNote: {
    id: 'protocolBuilder.formDocument.sharedNote',
    defaultMessage:
      'The input control, options and validation are part of the attribute {attribute}. Changes here apply to every form that uses it.',
    description:
      'Note in the settings of a field. attribute is the attribute, shown as a pill with its name.',
  },
  usedOnStages: {
    id: 'protocolBuilder.formDocument.usedOnStages',
    defaultMessage:
      '{count, plural, one {This attribute is also used on the stage {stages}.} other {This attribute is also used on the stages {stages}.}}',
    description:
      'Second sentence of the note in the settings of a field, naming the other stages that use the attribute. stages is the names of those stages, each in quotation marks, as a list. count is how many there are.',
  },
  otherLanguages: {
    id: 'protocolBuilder.formDocument.otherLanguages',
    defaultMessage:
      'This field is also in the {languages} form. Its settings are the same in every language.',
    description:
      'Last sentence of the note in the settings of a field, when the forms of other languages also contain this field. languages is the names of those languages, as a list.',
  },
  deleteField: {
    id: 'protocolBuilder.formDocument.deleteField',
    defaultMessage: 'Delete field',
    description:
      'Button in the settings of a field that removes the field from the form.',
  },
  noFields: {
    id: 'protocolBuilder.formDocument.noFields',
    defaultMessage: 'Add at least one field to this form.',
    description:
      'Refusal shown under the form editor when the form in the language being edited contains no fields. A field is a question that the participant answers.',
  },
  noFieldsInLanguages: {
    id: 'protocolBuilder.formDocument.noFieldsInLanguages',
    defaultMessage: 'Add at least one field to the form in {languages}.',
    description:
      'Refusal shown under the form editor when the form in other languages than the one being edited contains no fields. languages is a list of names of languages, such as "Spanish and French".',
  },
  attributeRequired: {
    id: 'protocolBuilder.formDocument.attributeRequired',
    defaultMessage: 'Choose an attribute for this field.',
    description:
      'Refusal shown when the researcher saves a form that has a field whose attribute has not been chosen.',
  },
  questionRequired: {
    id: 'protocolBuilder.formDocument.questionRequired',
    defaultMessage: 'Type the question of each field.',
    description:
      'Refusal shown when the researcher saves a form in which a field has no question in a language whose form contains that field, while that language is being edited.',
  },
  attributeRequiredElsewhere: {
    id: 'protocolBuilder.formDocument.attributeRequiredElsewhere',
    defaultMessage:
      'Choose an attribute for the field “{question}” in the form in {language}.',
    description:
      'Refusal shown when the researcher saves a form in which a field of the form in another language than the one being edited has no attribute. question is the question of the field in that language. language is the name of that language, such as "Spanish".',
  },
  attributeRequiredElsewhereUnnamed: {
    id: 'protocolBuilder.formDocument.attributeRequiredElsewhereUnnamed',
    defaultMessage:
      'Choose an attribute for a field in the form in {language}.',
    description:
      'Refusal shown when the researcher saves a form in which a field of the form in another language than the one being edited has neither an attribute nor a question. language is the name of that language, such as "Spanish".',
  },
  questionRequiredElsewhere: {
    id: 'protocolBuilder.formDocument.questionRequiredElsewhere',
    defaultMessage:
      'Type the question of the field “{attribute}” in {language}.',
    description:
      'Refusal shown when the researcher saves a form in which a field of the form in another language than the one being edited has no question in that language. attribute is the name of the attribute that the field collects. language is the name of that language, such as "Spanish".',
  },
  formInLanguage: {
    id: 'protocolBuilder.formDocument.formInLanguage',
    defaultMessage: 'Form in {language}',
    description:
      'Names the form in one language in the list of problems that stop a stage from being saved, before a problem with a field of that form. Choosing the problem switches the editor to that language. language is the name of a language, such as "Spanish".',
  },
  noInputControl: {
    id: 'protocolBuilder.formDocument.noInputControl',
    defaultMessage:
      'This attribute gives the participant no way to answer. Choose a different attribute.',
    description:
      'Shown in the settings of a field whose attribute cannot be collected by any input control, such as one deleted from the codebook.',
  },
  missingAttribute: {
    id: 'protocolBuilder.formDocument.missingAttribute',
    defaultMessage: 'Deleted attribute',
    description:
      'Shown on a field of a form in place of the name of its attribute, when that attribute has been deleted from the codebook.',
  },
  attributeTaken: {
    id: 'protocolBuilder.formDocument.attributeTaken',
    defaultMessage:
      'Another field of this form already collects this attribute. Each attribute can be collected once in a form.',
    description:
      'Refusal shown when the researcher saves a form in which two fields collect the same attribute.',
  },
  newAttributeTitle: {
    id: 'protocolBuilder.formDocument.newAttributeTitle',
    defaultMessage: 'New attribute: {name}',
    description:
      'Heading of the step of the attribute list in which the researcher chooses the type of a new attribute. name is the name that they typed, which is not translated.',
  },
  newAttributeDescription: {
    id: 'protocolBuilder.formDocument.newAttributeDescription',
    defaultMessage: 'Choose the type of answer that it records.',
    description:
      'Guidance under the heading of the step in which the researcher chooses the type of a new attribute.',
  },

  textType: {
    id: 'protocolBuilder.formDocument.textType',
    defaultMessage: 'Words or sentences that the participant types.',
    description: 'Explains the Text type of attribute, in the list of types.',
  },
  numberType: {
    id: 'protocolBuilder.formDocument.numberType',
    defaultMessage: 'A whole number or a decimal number.',
    description: 'Explains the Number type of attribute, in the list of types.',
  },
  datetimeType: {
    id: 'protocolBuilder.formDocument.datetimeType',
    defaultMessage: 'A date on the calendar.',
    description: 'Explains the Date type of attribute, in the list of types.',
  },
  booleanType: {
    id: 'protocolBuilder.formDocument.booleanType',
    defaultMessage: 'Yes or no.',
    description:
      'Explains the Boolean type of attribute, in the list of types.',
  },
  categoricalType: {
    id: 'protocolBuilder.formDocument.categoricalType',
    defaultMessage: 'One or more options from a list.',
    description:
      'Explains the Categorical type of attribute, in the list of types.',
  },
  ordinalType: {
    id: 'protocolBuilder.formDocument.ordinalType',
    defaultMessage: 'One option from a list in a fixed order.',
    description:
      'Explains the Ordinal type of attribute, in the list of types.',
  },
  scalarType: {
    id: 'protocolBuilder.formDocument.scalarType',
    defaultMessage: 'A point on a scale between two labels.',
    description: 'Explains the Scalar type of attribute, in the list of types.',
  },
  languageFieldsMissing: {
    id: 'protocolBuilder.formDocument.languageFieldsMissing',
    defaultMessage:
      '{count, plural, one {The {language} form does not include # field that the {defaultLanguage} form contains:} other {The {language} form does not include # fields that the {defaultLanguage} form contains:}} {attributes}.',
    description:
      'Note above the form editor when the form in the language being edited leaves out fields that the form in the default language contains. language and defaultLanguage are names of languages. attributes is the attributes of those fields, shown as pills. count is how many there are.',
  },
  languageFieldsExtra: {
    id: 'protocolBuilder.formDocument.languageFieldsExtra',
    defaultMessage:
      '{count, plural, one {The {language} form contains # field that the {defaultLanguage} form does not include:} other {The {language} form contains # fields that the {defaultLanguage} form does not include:}} {attributes}.',
    description:
      'Note above the form editor when the form in the language being edited contains fields that the form in the default language does not include. language and defaultLanguage are names of languages. attributes is the attributes of those fields, shown as pills. count is how many there are.',
  },
  languageFieldsAllowed: {
    id: 'protocolBuilder.formDocument.languageFieldsAllowed',
    defaultMessage:
      'Forms in different languages can contain different fields.',
    description:
      'Last sentence of the note above the form editor when the forms in two languages contain different fields.',
  },
  namedField: {
    id: 'protocolBuilder.formDocument.namedField',
    defaultMessage: 'Field “{name}”',
    description:
      'Names one field of a form in the list of problems that stop a stage from being saved, before the problem itself. name is the question of the field, or the name of its attribute when it has no question yet.',
  },
  newField: {
    id: 'protocolBuilder.formDocument.newField',
    defaultMessage: 'New field',
    description:
      'Names a field of a form that has neither a question nor an attribute yet, in the list of problems that stop a stage from being saved.',
  },
  tableLabelPlaceholder: {
    id: 'protocolBuilder.formDocument.tableLabelPlaceholder',
    defaultMessage: 'No question in this language yet',
    description:
      'Shown in place of the question of a field in the text of a form in the translation table, when the field has no question in the language of the column. The question is translated in its own row of the table.',
  },
  tableAttributeTitle: {
    id: 'protocolBuilder.formDocument.tableAttributeTitle',
    defaultMessage: 'Fields of this form',
    description:
      'Heading of the list of fields that can be added to the text of a form in the translation table. Only the fields that the form already has in another language can be added there.',
  },
  inThisDocument: {
    id: 'protocolBuilder.formDocument.inThisDocument',
    defaultMessage: 'This field is already in the form in this language.',
    description:
      'Shown under a field that cannot be chosen, in the list of fields that can be added to the text of a form in the translation table, because the text in this language already contains it.',
  },
});
