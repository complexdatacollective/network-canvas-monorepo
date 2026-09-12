import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What a network composer's form fields are called.
 *
 * Declared apart from the shared form-fields section's own copy because the
 * questions differ: that section asks what a field COLLECTS and writes the
 * control onto the codebook attribute, while a composer field carries its own
 * control and its own settings, and captions itself with an optional label
 * rather than a required question. A translator reading these needs the
 * composer's account of a form field in front of them, not the shared one.
 */
export const composerFormFieldMessages = defineMessages({
  variableLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldVariableLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the control choosing which codebook attribute one field of a network composer form records the answer in. An attribute is one piece of information recorded about a member of the network.',
  },
  variableHint: {
    id: 'protocolBuilder.networkCanvas.formFieldVariableHint',
    defaultMessage:
      'The attribute each answer is recorded in. Only attributes a form can collect are listed: a position or a location is written by the canvas rather than answered.',
    description:
      'Guidance under the attribute control of a network composer form field. A position is where a node sits on the canvas; a location is a point on a map. Both are written by the participant moving something rather than by answering a question, so no control can collect them.',
  },
  variableRequired: {
    id: 'protocolBuilder.networkCanvas.formFieldVariableRequired',
    defaultMessage: 'Choose the attribute this field records.',
    description:
      'Refusal shown when a network composer form field is saved without naming the attribute its answer is recorded in.',
  },
  controlLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldControlLabel',
    defaultMessage: 'Input control',
    description:
      'Label of the control choosing how the participant answers one field of a network composer form — a text box, a slider, a set of buttons.',
  },
  controlHint: {
    id: 'protocolBuilder.networkCanvas.formFieldControlHint',
    defaultMessage:
      'How the participant answers. Only controls that can render this attribute are listed, and the choice belongs to this field alone — the same attribute can be asked for differently on another stage.',
    description:
      'Guidance under the input-control chooser of a network composer form field. A stage is one step of an interview. Says both which controls are offered and that the choice is not written back to the codebook, which is what makes this interface different from every other form in the protocol.',
  },
  controlInventsHint: {
    id: 'protocolBuilder.networkCanvas.formFieldControlInventsHint',
    defaultMessage:
      'How the participant answers, and what kind of answer the new attribute will hold. Every control a form can offer is listed, because the attribute does not exist yet — the one chosen here decides what kind of answer it records.',
    description:
      'Guidance under the input-control chooser of a network composer form field while the field is inventing the attribute it records into. Replaces the ordinary guidance, which says the list is narrowed to the attribute’s kind: there is no attribute yet to narrow it by, and the choice made here is what decides the kind.',
  },
  controlRequired: {
    id: 'protocolBuilder.networkCanvas.formFieldControlRequired',
    defaultMessage: 'Choose how the participant answers this field.',
    description:
      'Refusal shown when a network composer form field is saved without an input control.',
  },
  questionLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldQuestionLabel',
    defaultMessage: 'Question',
    description:
      'Label of the box holding what the participant is asked for one field of a network composer form.',
  },
  questionHint: {
    id: 'protocolBuilder.networkCanvas.formFieldQuestionHint',
    defaultMessage:
      'What the participant is asked. Leave it empty to use the attribute’s own name.',
    description:
      'Guidance under the question box of a network composer form field. The attribute’s name is the researcher-facing name the codebook records it under.',
  },
  questionPlaceholder: {
    id: 'protocolBuilder.networkCanvas.formFieldQuestionPlaceholder',
    defaultMessage: 'Enter your question…',
    description:
      'Placeholder inside the empty question box of a network composer form field.',
  },
  helpLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldHelpLabel',
    defaultMessage: 'Help text',
    description:
      'Label of the box holding the explanation shown under one field of a network composer form.',
  },
  helpHint: {
    id: 'protocolBuilder.networkCanvas.formFieldHelpHint',
    defaultMessage:
      'Shown under the question, for anything the participant might need explained. Optional.',
    description:
      'Guidance under the help-text box of a network composer form field.',
  },
  helpPlaceholder: {
    id: 'protocolBuilder.networkCanvas.formFieldHelpPlaceholder',
    defaultMessage: 'Enter help text…',
    description:
      'Placeholder inside the empty help-text box of a network composer form field.',
  },
  validationHintsLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldValidationHintsLabel',
    defaultMessage: 'Show validation hints',
    description:
      'Label of the switch that tells the participant what a valid answer to one field of a network composer form looks like.',
  },
  validationHintsHint: {
    id: 'protocolBuilder.networkCanvas.formFieldValidationHintsHint',
    defaultMessage:
      'Tells the participant what a valid answer looks like, derived from the attribute’s own rules.',
    description:
      'Guidance under the validation-hints switch of a network composer form field. The rules belong to the codebook attribute rather than to this field.',
  },
  parametersLabel: {
    id: 'protocolBuilder.networkCanvas.fieldParametersLabel',
    defaultMessage: 'What this field accepts',
    description:
      'Label of the group of settings the chosen input control takes — the two ends of a scale, the window a date must fall in.',
  },
  parametersHint: {
    id: 'protocolBuilder.networkCanvas.fieldParametersHint',
    defaultMessage:
      'These settings belong to this field rather than to the attribute, so the same attribute can be asked for differently on another stage.',
    description:
      'Guidance under the settings group of a network composer form field. A stage is one step of an interview.',
  },
  parametersInherited: {
    id: 'protocolBuilder.networkCanvas.fieldParametersInherited',
    defaultMessage:
      'These come from the “{attributeName}” attribute, and this field follows them. Change any of them and this field keeps a set of its own.',
    description:
      'Said above the settings group when this field has none of its own and is showing the codebook attribute’s. attributeName is the researcher-facing name of that attribute.',
  },
  duplicateVariableRefusal: {
    id: 'protocolBuilder.networkCanvas.duplicateVariableRefusal',
    defaultMessage:
      'Another field on this form already records this attribute. Choose a different one, or edit the existing field instead.',
    description:
      'Refusal shown when two fields of one network composer form would record their answers in the same attribute.',
  },
  staleControlRefusal: {
    id: 'protocolBuilder.networkCanvas.staleControlRefusal',
    defaultMessage:
      'The “{attributeName}” attribute cannot be asked for with this input control. Choose another control, or record this field in a different attribute.',
    description:
      'Refusal shown when a network composer form field is saved with an input control that cannot collect the kind of answer its attribute holds — because a collaborator changed that attribute while this field was open. attributeName is the researcher-facing name of the codebook attribute. Both ways out are offered because an attribute can be changed to a kind no control at all can ask for.',
  },
  emptyPreview: {
    id: 'protocolBuilder.networkCanvas.formFieldEmptyPreview',
    defaultMessage: 'Empty field',
    description:
      'How a network composer form field with no question and no attribute reads in the list when its dialog is closed.',
  },
  recordsAttribute: {
    id: 'protocolBuilder.networkCanvas.formFieldRecordsAttribute',
    defaultMessage: 'Records the attribute “{attributeName}”',
    description:
      'Badge under one network composer form field in the list, naming what its answer is recorded in. attributeName is the researcher-facing name of the codebook attribute.',
  },
  fieldNoun: {
    id: 'protocolBuilder.networkCanvas.formFieldNoun',
    defaultMessage: 'form field',
    description:
      'What one row of a network composer’s form list is called, used in the accessible names of its edit, delete and reorder controls and in the confirmation that deletes it.',
  },
  addSubmitTitle: {
    id: 'protocolBuilder.networkCanvas.formFieldAddTitle',
    defaultMessage: 'Add a form field',
    description:
      'Title of the dialog a researcher fills in for a NEW field of a network composer form.',
  },
  editTitle: {
    id: 'protocolBuilder.networkCanvas.formFieldEditTitle',
    defaultMessage: 'Edit form field',
    description:
      'Title of the dialog a researcher fills in when changing an existing field of a network composer form.',
  },
});
