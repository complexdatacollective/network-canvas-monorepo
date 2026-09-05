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
const REFUSAL_MESSAGES: Readonly<Record<CompoundEditFailureReason, string>> =
  Object.freeze({
    'compound-in-flight':
      'Another change to the codebook is still being saved. Wait for it to finish, then save this one.',
    // No "see the details above": nothing renders the host's account of what
    // it refused, and this alert is the first thing in the editor.
    'host-error':
      'The protocol would not be valid with this change, so nothing was saved. Adjust this type and try again, or close this and come back once the rest of the stage is filled in.',
    'invalid-request':
      'This change could not be sent, and nothing was saved. Close this editor and try again.',
    'invalid-response':
      'The protocol came back in a state this editor cannot read, so nothing here has been kept. Reload the protocol before making this change.',
    'lease-lost':
      'You are no longer the editor of this stage, so nothing was saved. Take over editing and try again.',
    'pending-commands':
      'A file you added is still waiting to be saved with this stage. Save the stage first, then make this change.',
    'stale-base':
      'Someone else changed this while you were editing it, so nothing was saved. Close and reopen this editor to load their version, then make your change again.',
    'stale-epoch':
      'Editing access changed while this was being saved, so nothing was saved. Try again.',
    'stale-result':
      'A newer version of the protocol is already open, so this change was not applied. Try again.',
    'unavailable':
      'This editor cannot change the codebook right now. Reload the protocol and try again.',
  });

const UNEXPLAINED_FAILURE =
  'This change could not be saved, and nothing was altered. Wait a moment and try again.';

const HELD_BY_SOMEONE_UNNAMED =
  'A section needed for this change is currently being edited.';

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
): string {
  switch (failure.kind) {
    // A thrown failure carries whatever the thing that threw had to say — a
    // schema sentence, a transport error — so it is reported as the same
    // "nothing was saved, try again" the reasons above end in.
    case 'error':
      return UNEXPLAINED_FAILURE;

    // The one failure whose own words are shown. Everything else here is
    // rewritten because it arrives written for whoever reads a log; a
    // contradiction arrives already written for the researcher, naming the
    // rule and the values that cannot both hold, which is more than this
    // module could say about it — it does not know which rule was broken.
    // Rewriting it would be the bug this case exists to prevent.
    case 'contradiction':
      return failure.message;

    case 'result': {
      if (failure.result.status === 'failed') {
        return REFUSAL_MESSAGES[failure.result.reason];
      }
      // A section id is an internal address, so a blocked change is reported
      // by who is holding it, or not at all.
      const blocker = failure.result.blockedSections[0];
      return blocker?.holder === undefined
        ? HELD_BY_SOMEONE_UNNAMED
        : `${blocker.holder.displayName} is currently editing a section needed for this change.`;
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
