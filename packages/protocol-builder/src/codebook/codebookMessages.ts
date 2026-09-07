import { defineMessage, defineMessages } from '@codaco/app-i18n/messages';

/**
 * The codebook copy that more than one module renders.
 *
 * A message id may be declared in exactly one file — `extractMessages` throws
 * on a second declaration — so a sentence two of these modules both say lives
 * here rather than in either of them. All four groups below are genuinely
 * shared, and each is one message read twice rather than two that can drift:
 *
 * - the blocked-section refusals are what the entity editor and the validation
 *   editor each say when another person holds the part of the protocol the
 *   save needs;
 * - "Saving…" is the same submit button mid-flight in both of those editors;
 * - the stale-authority alert title is the same warning in both;
 * - the missing-comparison refusal is written once by the validation editor
 *   and again by the surface that mounts it, and the two must not disagree
 *   about what is wrong.
 *
 * The blocked-section and submit copy is filed under `codebookEditing`, which
 * owns the vocabulary of applying a codebook change; the comparison refusal
 * stays under `variableValidation`, whose rules it is about.
 */
export const codebookEditingMessages = defineMessages({
  blockedByHolder: {
    id: 'protocolBuilder.codebookEditing.blockedByHolder',
    defaultMessage:
      '{name} is currently editing a section needed for this change.',
    description:
      'Why a researcher’s codebook change could not be saved: another person has the part of the protocol it needs open. name is that person’s display name, as the host reports it.',
  },
  blockedUnknownHolder: {
    id: 'protocolBuilder.codebookEditing.blockedUnknownHolder',
    defaultMessage:
      'A section needed for this change is currently being edited.',
    description:
      'Why a researcher’s codebook change could not be saved: the part of the protocol it needs is held by someone the host did not name.',
  },
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
