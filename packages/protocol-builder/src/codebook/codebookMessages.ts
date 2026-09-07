import { defineMessage, defineMessages } from '@codaco/app-i18n/messages';

/**
 * The codebook copy that more than one module renders.
 *
 * A message id may be declared in exactly one file — `extractMessages` throws
 * on a second declaration — so a sentence two of these modules both say lives
 * here rather than in either of them. All four groups below are genuinely
 * shared, and each is one message read twice rather than two that can drift:
 *
 * - "Saving…" is the same submit button mid-flight in the entity editor and
 *   the validation editor;
 * - the stale-authority alert title is the same warning in both;
 * - the missing-comparison refusal is written once by the validation editor
 *   and again by the surface that mounts it, and the two must not disagree
 *   about what is wrong.
 *
 * The submit copy is filed under `codebookEditing`, which owns the vocabulary
 * of applying a codebook change; the comparison refusal stays under
 * `variableValidation`, whose rules it is about.
 *
 * A blocked save is NOT here: what every auxiliary codebook surface says about
 * a refused change — blocked included — is `codebook/compoundFailureCopy.ts`,
 * which is one reading of the refusal rather than one sentence per editor.
 */
export const codebookEditingMessages = defineMessages({
  saving: {
    id: 'protocolBuilder.codebookEditing.saving',
    defaultMessage: 'Saving…',
    description:
      'The submit button of a codebook editor while the change is in flight, replacing its usual wording.',
  },
  staleAuthoritativeTitle: {
    id: 'protocolBuilder.codebookEditing.staleAuthoritativeTitle',
    defaultMessage: 'Newer codebook data is available',
    description:
      'Heading of the warning shown when the protocol’s codebook changed elsewhere while the researcher had this editor open. The codebook is the protocol’s definition of its entity types and their attributes.',
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
