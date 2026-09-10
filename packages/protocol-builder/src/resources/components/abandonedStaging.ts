import type { ResourceClient } from '../client.tsx';
import type { ResourceDescriptor } from '../types.ts';

/**
 * Drops a resource that was staged for a choice nobody is waiting for any
 * more: the researcher chose another file while this one was still being
 * staged, or closed the browser before the host answered.
 *
 * Suppressing the callback is not enough on its own. The host has the bytes
 * and the edit has the descriptor, and the only thing that ever knew its id
 * was the call that has just been disowned — so a resource left here would sit
 * in the edit's staged list, be offered back in the browser the researcher
 * reopens, and be promoted by the stage's own save. It goes through the client
 * rather than being forgotten locally, because the edit learns what is staged
 * by being the client the editors call.
 *
 * A host that refuses the drop leaves the resource staged and still tracked,
 * which is what keeps it nameable: no field references it, and a cancel
 * discards it with everything else. Nothing is said on screen, because the
 * choice this belonged to has already been replaced or abandoned and a message
 * about it could only be about something the researcher has moved on from.
 *
 * Nothing escapes either. This runs from inside an attempt's own settling,
 * which nobody observes, so a rejection here would take the rest of that
 * settling with it and surface as an exception about a choice the researcher
 * has already left behind. `ResourceClient` answers a host that throws with a
 * failure rather than a rejection, which is what makes the bare `void` safe.
 */
export function discardAbandonedStaging(
  resources: ResourceClient,
  descriptor: ResourceDescriptor,
): void {
  void resources.discardStaged(descriptor.id);
}
