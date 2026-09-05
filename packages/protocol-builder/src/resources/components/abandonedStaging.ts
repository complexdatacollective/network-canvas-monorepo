import type {
  ProtocolBuilderResourceGateway,
  ResourceDescriptor,
} from '../gateway.ts';

/**
 * Drops a resource that was staged for a choice nobody is waiting for any
 * more: the researcher chose another file while this one was still being
 * staged, or closed the browser before the host answered.
 *
 * Suppressing the callback is not enough on its own. The host has the bytes
 * and the session's tracker has the descriptor, and the only thing that ever
 * knew its id was the call that has just been disowned — so a resource left
 * here would sit in the session's staged list, be offered back in the browser
 * the researcher reopens, and be counted among what the finish has to decide.
 * It goes through the gateway rather than being forgotten locally, because the
 * session learns what is staged by being the gateway the editors call.
 *
 * A host that refuses the drop leaves the resource staged and still tracked,
 * which is what keeps it nameable: no field references it, so the finish
 * discards it as abandoned and a cancel discards it with everything else.
 * Nothing is said on screen, because the choice this belonged to has already
 * been replaced or abandoned and a message about it could only be about
 * something the researcher has moved on from.
 */
export function discardAbandonedStaging(
  gateway: ProtocolBuilderResourceGateway,
  descriptor: ResourceDescriptor,
): void {
  void gateway.discardStaged(descriptor.id);
}
