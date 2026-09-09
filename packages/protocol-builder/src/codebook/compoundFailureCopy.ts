import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';

import type { Presence } from '../contract/schemas.ts';

/**
 * Why a codebook save did not happen, in the terms the contract answers in.
 *
 * `held` covers all three ways a lock stands in the way — the acquire came
 * back read-only, the submit was refused because the lock had gone, a refactor
 * could not take every section it writes — because a researcher is told who is
 * editing rather than which of the three it was. A section id is an internal
 * address and is never shown, so an unnamed holder is all that is left to say.
 */
export type CodebookRefusal =
  | Readonly<{ kind: 'held'; holder?: Presence }>
  | Readonly<{ kind: 'invalidShape' }>
  | Readonly<{ kind: 'sectionGone' }>
  | Readonly<{ kind: 'protocolGone' }>
  | Readonly<{ kind: 'unreachable' }>
  | Readonly<{ kind: 'unexplained' }>;

const messages = defineMessages({
  heldBySomeoneUnnamed: {
    id: 'protocolBuilder.compoundFailure.heldBySomeoneUnnamed',
    defaultMessage:
      'A section needed for this change is currently being edited.',
    description:
      'Refusal shown in a codebook editor when part of the protocol the change needs is being edited by somebody the host would not name.',
  },
  heldBy: {
    id: 'protocolBuilder.compoundFailure.heldBy',
    defaultMessage:
      '{holder} is currently editing a section needed for this change.',
    description:
      'Refusal shown in a codebook editor when a named collaborator is editing part of the protocol the change needs. holder is that person’s display name, which the host supplies.',
  },
  invalidShape: {
    id: 'protocolBuilder.compoundFailure.invalidShape',
    defaultMessage:
      'This change is not something the codebook can hold, so nothing was saved. Check what you entered and try again.',
    description:
      'Refusal shown in a codebook editor when the protocol refused the change because it is not shaped like the part of the codebook it was written to.',
  },
  sectionGone: {
    id: 'protocolBuilder.compoundFailure.sectionGone',
    defaultMessage:
      'This part of the codebook no longer exists, so nothing was saved. Close this editor and start again.',
    description:
      'Refusal shown in a codebook editor when the entity type being edited has been deleted from the protocol, usually by a collaborator, while the editor was open.',
  },
  protocolGone: {
    id: 'protocolBuilder.compoundFailure.protocolGone',
    defaultMessage:
      'This protocol is no longer open, so nothing was saved. Reload it and try again.',
    description:
      'Refusal shown in a codebook editor when the application it is running in no longer holds the protocol the change was written to.',
  },
  unreachable: {
    id: 'protocolBuilder.compoundFailure.unreachable',
    defaultMessage:
      'This change could not be sent, and nothing was saved. Check your connection and try again.',
    description:
      'Refusal shown in a codebook editor when the change never reached the application it is running in.',
  },
  unexplained: {
    id: 'protocolBuilder.compoundFailure.unexplained',
    defaultMessage:
      'This change could not be saved, and nothing was altered. Wait a moment and try again.',
    description:
      'Refusal shown in a codebook editor when saving was refused for a reason there are no words for — it threw with no explanation a researcher could act on. The last resort.',
  },
});

/**
 * What to tell the researcher about a codebook change that did not happen.
 *
 * Encoded rather than formatted: a refusal stands in front of the researcher
 * from one save until the next, which is longer than the language it was
 * raised in is guaranteed to last. Every surface that shows one decodes it
 * with `formatMessageError`, so it follows a change of language while it
 * waits — and so a refusal that arrives already written for a researcher,
 * naming the rule and the values that cannot both hold, passes through
 * untouched instead of being replaced by the copy here.
 */
export function codebookRefusalMessage(refusal: CodebookRefusal): string {
  switch (refusal.kind) {
    case 'held':
      return refusal.holder === undefined
        ? createMessageError(messages.heldBySomeoneUnnamed)
        : createMessageError(messages.heldBy, {
            holder: refusal.holder.displayName,
          });
    case 'invalidShape':
      return createMessageError(messages.invalidShape);
    case 'sectionGone':
      return createMessageError(messages.sectionGone);
    case 'protocolGone':
      return createMessageError(messages.protocolGone);
    case 'unreachable':
      return createMessageError(messages.unreachable);
    case 'unexplained':
      return createMessageError(messages.unexplained);
  }
  // Every kind is spelled out above, so a new one cannot arrive as a blank
  // alert: the compiler asks for its words here.
  return unreachable(refusal);
}

function unreachable(refusal: never): never {
  throw new TypeError(
    `No researcher-facing words are written for this refusal: ${JSON.stringify(refusal)}`,
  );
}
