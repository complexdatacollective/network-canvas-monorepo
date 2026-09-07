import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

import type { CompoundEditFailureReason } from '../session.ts';
import type { AuxiliaryCodebookDraftFailure } from './editing.ts';

/**
 * What each way a save can be refused reads like to the researcher.
 *
 * Written here rather than passed through, because the reasons that reach a
 * codebook editor are carried by a `message` written for whoever is reading a
 * log. A host that could not take the change reports the protocol schema's own
 * words about a path — "expected object, received undefined" — which names
 * neither what the researcher did nor what they can do next, and which is about
 * the stage they were configuring rather than the type they were creating.
 *
 * Every reason is spelled out, so a new one cannot arrive as a blank alert: the
 * compiler asks for it here.
 */
const messages = defineMessages({
  compoundInFlight: {
    id: 'protocolBuilder.compoundFailure.compoundInFlight',
    defaultMessage:
      'Another change to the codebook is still being saved. Wait for it to finish, then save this one.',
    description:
      'Refusal shown in a codebook editor when a previous change to the codebook — the protocol’s definition of what an interview records — has not finished saving.',
  },
  hostError: {
    id: 'protocolBuilder.compoundFailure.hostError',
    defaultMessage:
      'The protocol would not be valid with this change, so nothing was saved. Adjust this type and try again, or close this and come back once the rest of the stage is filled in.',
    description:
      'Refusal shown in a codebook editor when the change would leave the whole protocol invalid — usually because the stage being configured is not finished yet. A stage is one step of an interview.',
  },
  invalidRequest: {
    id: 'protocolBuilder.compoundFailure.invalidRequest',
    defaultMessage:
      'This change could not be sent, and nothing was saved. Close this editor and try again.',
    description:
      'Refusal shown in a codebook editor when the change could not be sent for saving at all.',
  },
  invalidResponse: {
    id: 'protocolBuilder.compoundFailure.invalidResponse',
    defaultMessage:
      'The protocol came back in a state this editor cannot read, so nothing here has been kept. Reload the protocol before making this change.',
    description:
      'Refusal shown in a codebook editor when what came back after saving was not something the editor could read.',
  },
  leaseLost: {
    id: 'protocolBuilder.compoundFailure.leaseLost',
    defaultMessage:
      'You are no longer the editor of this stage, so nothing was saved. Take over editing and try again.',
    description:
      'Refusal shown in a codebook editor when the researcher no longer holds the right to edit this stage. Taking over editing is an action offered elsewhere in the host application.',
  },
  pendingCommands: {
    id: 'protocolBuilder.compoundFailure.pendingCommands',
    defaultMessage:
      'A file you added is still waiting to be saved with this stage. Save the stage first, then make this change.',
    description:
      'Refusal shown in a codebook editor when the stage still holds an imported file that has not been saved, which has to land before the codebook can change.',
  },
  staleBase: {
    id: 'protocolBuilder.compoundFailure.staleBase',
    defaultMessage:
      'Someone else changed this while you were editing it, so nothing was saved. Close and reopen this editor to load their version, then make your change again.',
    description:
      'Refusal shown in a codebook editor when a collaborator changed the same thing while this editor was open.',
  },
  staleEpoch: {
    id: 'protocolBuilder.compoundFailure.staleEpoch',
    defaultMessage:
      'Editing access changed while this was being saved, so nothing was saved. Try again.',
    description:
      'Refusal shown in a codebook editor when who holds the right to edit changed midway through saving.',
  },
  staleResult: {
    id: 'protocolBuilder.compoundFailure.staleResult',
    defaultMessage:
      'A newer version of the protocol is already open, so this change was not applied. Try again.',
    description:
      'Refusal shown in a codebook editor when a newer version of the protocol had already been loaded by the time the change came back.',
  },
  unavailable: {
    id: 'protocolBuilder.compoundFailure.unavailable',
    defaultMessage:
      'This editor cannot change the codebook right now. Reload the protocol and try again.',
    description:
      'Refusal shown in a codebook editor when the host cannot accept codebook changes at all just now.',
  },
  unexplained: {
    id: 'protocolBuilder.compoundFailure.unexplained',
    defaultMessage:
      'This change could not be saved, and nothing was altered. Wait a moment and try again.',
    description:
      'Refusal shown in a codebook editor when saving threw with no explanation a researcher could act on. The last resort.',
  },
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
});

const REFUSAL_MESSAGES: Readonly<
  Record<CompoundEditFailureReason, MessageDescriptor>
> = Object.freeze({
  'compound-in-flight': messages.compoundInFlight,
  // No "see the details above": nothing renders the host's account of what
  // it refused, and this alert is the first thing in the editor.
  'host-error': messages.hostError,
  'invalid-request': messages.invalidRequest,
  'invalid-response': messages.invalidResponse,
  'lease-lost': messages.leaseLost,
  'pending-commands': messages.pendingCommands,
  'stale-base': messages.staleBase,
  'stale-epoch': messages.staleEpoch,
  'stale-result': messages.staleResult,
  'unavailable': messages.unavailable,
});

/**
 * What to tell the researcher about a codebook change that did not happen.
 *
 * One helper for every auxiliary codebook surface — the entity editor, the
 * attribute editor, the validation editor — because a refusal means the same
 * thing to a researcher whichever of them they were looking at, and because the
 * thing they must never be shown is the same in all three: the words the host
 * used.
 */
export function compoundFailureMessage(
  failure: AuxiliaryCodebookDraftFailure,
  intl: IntlShape,
): string {
  switch (failure.kind) {
    // A thrown failure carries whatever the thing that threw had to say — a
    // schema sentence, a transport error — so it is reported as the same
    // "nothing was saved, try again" the reasons above end in.
    case 'error':
      return intl.formatMessage(messages.unexplained);

    // The one failure whose own words are shown. Everything else here is
    // rewritten because it arrives written for whoever reads a log; a
    // contradiction arrives already written for the researcher, naming the
    // rule and the values that cannot both hold, which is more than this
    // module could say about it — it does not know which rule was broken.
    // Rewriting it would be the bug this case exists to prevent.
    // Read back through the same decoder every other string-only contract in
    // this package is read through, so a contradiction encoded by
    // `variableValidation` reaches the researcher in their own language and a
    // plain sentence a host wrote passes through untouched.
    case 'contradiction':
      return formatMessageError(failure.message, intl) ?? failure.message;

    case 'result': {
      if (failure.result.status === 'failed') {
        return intl.formatMessage(REFUSAL_MESSAGES[failure.result.reason]);
      }
      // A section id is an internal address, so a blocked change is reported
      // by who is holding it, or not at all.
      const blocker = failure.result.blockedSections[0];
      return blocker?.holder === undefined
        ? intl.formatMessage(messages.heldBySomeoneUnnamed)
        : intl.formatMessage(messages.heldBy, {
            holder: blocker.holder.displayName,
          });
    }

    // Every kind is spelled out above, so a new one cannot arrive as a blank
    // alert: the compiler asks for it here, exactly as `REFUSAL_MESSAGES`
    // asks for every reason.
    default:
      return unreachable(failure);
  }
}

function unreachable(failure: never): never {
  throw new TypeError(
    `No researcher-facing words are written for this kind of refused codebook save: ${JSON.stringify(failure)}`,
  );
}
