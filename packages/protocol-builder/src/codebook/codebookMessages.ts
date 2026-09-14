import { defineMessage, defineMessages } from '@codaco/app-i18n/messages';

/**
 * The codebook copy that more than one module renders.
 *
 * A message id may be declared in exactly one file — `extractMessages` throws
 * on a second declaration — so a sentence two of these modules both say lives
 * here rather than in either of them:
 *
 * - "Saving…" is the same submit button mid-flight in the entity editor and
 *   the validation editor;
 * - the missing-comparison refusal is written once by the validation editor
 *   and again by the surface that mounts it, and the two must not disagree
 *   about what is wrong.
 *
 * What every codebook surface says about a refused save is
 * `codebook/compoundFailureCopy.ts` rather than one sentence per editor.
 */
export const codebookEditingMessages = defineMessages({
  saving: {
    id: 'protocolBuilder.codebookEditing.saving',
    defaultMessage: 'Saving…',
    description:
      'The submit button of a codebook editor while the change is in flight, replacing its usual wording.',
  },
});

/**
 * The refusal a comparison rule earns when the attribute it points at is gone.
 *
 * Written by the validation editor for its own error region and again by the
 * surface that mounts it, which uses the same verdict to refuse the save.
 */
export const missingComparisonTargetMessage = defineMessage({
  id: 'protocolBuilder.variableValidation.missingComparisonTarget',
  defaultMessage: 'The selected comparison attribute no longer exists.',
  description:
    'Why a validation rule cannot be saved: it compares this attribute against another one that has since been deleted from the codebook. "Attribute" is a codebook variable.',
});

/**
 * The nested Validation section's own words.
 *
 * Two sections say them: the one beside an attribute the codebook already
 * holds, and the one beside an attribute a row is still inventing. They are
 * the same section to a researcher — only where the rules are written differs
 * — so the wording is declared once.
 */
export const validationSectionMessages = defineMessages({
  sectionTitle: {
    id: 'protocolBuilder.variableValidation.sectionTitle',
    defaultMessage: 'Validation',
    description:
      'Heading of the nested section holding the rules an answer to one attribute has to satisfy. An attribute is one field the protocol records about a network member or about the participant.',
  },
  sectionDescription: {
    id: 'protocolBuilder.variableValidation.sectionDescription',
    defaultMessage: 'Enable to add validation rules to the attribute.',
    description:
      'Description under the heading of the nested validation section, saying what switching it on does. Shown beside a switch, so it is written as an instruction about the switch.',
  },
  rulesLabel: {
    id: 'protocolBuilder.variableValidation.rulesLabel',
    defaultMessage: 'Validation rules',
    description:
      'Label of the control holding every rule an answer to one attribute has to satisfy.',
  },
  rulesHint: {
    id: 'protocolBuilder.variableValidation.rulesHint',
    defaultMessage:
      'Enable one or more validation rules to apply to this attribute.',
    description:
      'Hint under the label of the control holding the validation rules, saying what the switches beneath it do.',
  },
});
