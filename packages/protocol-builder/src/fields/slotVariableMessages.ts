import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The words a slot attribute picker says about the attribute it binds, in any
 * interface that binds codebook attributes to slots of its own.
 */
export const slotVariableMessages = defineMessages({
  emptyState: {
    id: 'protocolBuilder.slotVariable.emptyState',
    defaultMessage:
      'No attributes of this type can be used here yet. Create one to continue.',
    description:
      'Shown in place of an attribute list when the codebook offers nothing this control can take, usually because every candidate is already written by something else. "Of this type" means of the attribute type the control needs, such as text or true/false.',
  },
  unvalidatedElsewhereRefusal: {
    id: 'protocolBuilder.slotVariable.unvalidatedElsewhereRefusal',
    defaultMessage:
      '"{attributeName}" is written without validation by another stage, so it cannot also be collected here (the values that stage writes bypass this attribute’s validation)',
    description:
      'Refusal shown under an attribute control that collects an answer from the participant when the attribute picked is already written directly, without validation, by another stage of the protocol. attributeName is the codebook name of the attribute, which is not translated.',
  },
  draftFormCollectsRefusal: {
    id: 'protocolBuilder.slotVariable.draftFormCollectsRefusal',
    defaultMessage:
      '"{attributeName}" is collected by another field of this stage, so it cannot also be written by this control (values written here would bypass its validation)',
    description:
      'Refusal shown under an attribute control the interface writes directly, when the attribute picked is already collected, with validation, by another field of the stage the researcher has open. attributeName is the codebook name of the attribute, which is not translated.',
  },
  draftSlotWritesRefusal: {
    id: 'protocolBuilder.slotVariable.draftSlotWritesRefusal',
    defaultMessage:
      '"{attributeName}" is written without validation by another control of this stage, so it cannot also be collected here (the values that control writes bypass this attribute’s validation)',
    description:
      'Refusal shown under an attribute control that collects an answer from the participant, when the attribute picked is already written directly by another control of the stage the researcher has open. attributeName is the codebook name of the attribute, which is not translated.',
  },
  draftBoundElsewhereRefusal: {
    id: 'protocolBuilder.slotVariable.draftBoundElsewhereRefusal',
    defaultMessage:
      '"{attributeName}" already records another of this stage’s answers, so it cannot record this one as well. Choose another attribute.',
    description:
      'Refusal shown under an attribute control when the attribute picked is already chosen for a different answer the same stage records, such as gender identity and sex assigned at birth, so one answer would overwrite the other. attributeName is the codebook name of the attribute, which is not translated.',
  },
  variableGoneRefusal: {
    id: 'protocolBuilder.slotVariable.variableGoneRefusal',
    defaultMessage:
      'This attribute is no longer in the codebook, so nothing can be recorded under it. Choose another attribute.',
    description:
      'Refusal shown under an attribute control when the attribute it holds has been deleted from the codebook while this editor was open. The attribute is not named, because once it is deleted only its internal identifier is left.',
  },
  variableTypeChangedRefusal: {
    id: 'protocolBuilder.slotVariable.variableTypeChangedRefusal',
    defaultMessage:
      '"{attributeName}" is no longer the kind of attribute this control can use, because its type was changed somewhere else. Choose another attribute.',
    description:
      'Refusal shown under an attribute control when the attribute it holds still exists but has been given a different type, so the interface can no longer write or read it. attributeName is the codebook name of the attribute, which is not translated.',
  },
  variableOptionsChangedRefusal: {
    id: 'protocolBuilder.slotVariable.variableOptionsChangedRefusal',
    defaultMessage:
      '"{attributeName}" no longer offers the exact values this control needs, because they were changed somewhere else. Choose another attribute.',
    description:
      'Refusal shown under an attribute control that needs a fixed set of values the interface owns, when the attribute it holds is still a list of answers but its values have been edited elsewhere and no longer match that set. attributeName is the codebook name of the attribute, which is not translated.',
  },
  managedElsewhereRefusal: {
    id: 'protocolBuilder.slotVariable.managedElsewhereRefusal',
    defaultMessage:
      '"{attributeName}" cannot be used here, because only one stage may manage an attribute’s options. Choose another attribute.',
    description:
      'Refusal shown under an attribute control whose stage manages the attribute’s list of answers (a Family Pedigree’s gender identity, whose answers each take kinship words), when the attribute picked already has its answers managed by another stage. attributeName is the codebook name of the attribute, which is not translated.',
  },
  managedElsewhereOptionLabel: {
    id: 'protocolBuilder.slotVariable.managedElsewhereOptionLabel',
    defaultMessage:
      '{attributeName} — its options are managed by another stage',
    description:
      'Name of the option standing for the attribute a control already holds, when that attribute’s list of answers is managed by another stage, so this stage cannot use it. Shown in the list beside the attributes that can still be chosen. attributeName is the codebook name of the attribute, which is not translated.',
  },
  managedElsewhereNote: {
    id: 'protocolBuilder.slotVariable.managedElsewhereNote',
    defaultMessage:
      '{count, plural, one {Its options are managed by the {stageLabels} stage, which decides the kinship words each one takes, and only one stage may manage them. Choose another attribute, or stop asking about gender identity here.} other {Its options are managed by the stages {stageLabels}, which decide the kinship words each one takes, and only one stage may manage them. Choose another attribute, or stop asking about gender identity here.}}',
    description:
      'Shown under the gender identity attribute control of a Family Pedigree stage when the attribute it holds already has its list of answers managed by another stage. A stage is one step of an interview. stageLabels is the researcher’s own name for each of those steps, already in quotation marks and separated by commas, and is not translated here. count is how many steps manage the answers. The kinship words are the family words (mother, brother, parent) a family-tree step uses for each answer.',
  },
  valuesChangedOptionLabel: {
    id: 'protocolBuilder.slotVariable.valuesChangedOptionLabel',
    defaultMessage:
      '{attributeName} — no longer offers the values this control needs',
    description:
      'Name of the option standing for the attribute a control already holds, in a control that needs a fixed set of values the interface owns, when that attribute’s values have been edited elsewhere and no longer match the set. Shown in the list beside the attributes that can still be chosen. attributeName is the codebook name of the attribute, which is not translated.',
  },
  valuesChangedNote: {
    id: 'protocolBuilder.slotVariable.valuesChangedNote',
    defaultMessage:
      'This attribute no longer offers the exact values this control needs, because they were changed somewhere else. Choose another one.',
    description:
      'Shown under an attribute control when the attribute it holds is still a list of answers but its values have been edited elsewhere and no longer match the fixed set the interface owns.',
  },
});
