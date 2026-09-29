import { type Layer, ManagedRuntime } from 'effect';

import { registerStudioEditorSession } from '../editor/sessionLifecycle.ts';
import { delegatingRuntime, HostClient } from './runtime.ts';

// One authenticated session's way of reaching the protocol builder's host.
//
// A session rather than a socket, because closing the socket does not end
// either of the things that outlive a sign-out. The server reads the principal
// once, at the upgrade, and authorises and audits every message on that socket
// as them — so a socket still open when the next account signs in on this tab
// is one they would be editing, and be logged, as the previous researcher
// through. And the transport reconnects on its own schedule, so refusing to
// reconnect after the fact does not settle a call that was already waiting on
// it.
//
// So each session is a runtime of its own over `HostClient.layer`. Ending one
// disposes that runtime: its scope interrupts every call and stream that ran
// on it and closes the socket with its reconnection loop, so nothing that
// session started can wake onto a socket the next account opens. Nothing
// reopens a session; the next call opens another, whose handshake carries
// whatever cookie the browser holds by then.

export type HostRuntime = ManagedRuntime.ManagedRuntime<HostClient, never>;

let sessionLayer: Layer.Layer<HostClient> = HostClient.layer;

/** The session in force, or none because nothing has needed one yet. */
let session: HostRuntime | undefined;

/** Builds nothing: the socket is dialled by the first call that needs it. */
const currentSession = (): HostRuntime => {
  session ??= ManagedRuntime.make(sessionLayer);
  return session;
};

/**
 * The runtime every host call runs on, resolved per call to the session in
 * force, so an adapter bound to it once keeps one identity across sessions.
 */
export const hostRuntime: HostRuntime = delegatingRuntime(currentSession);

/** Ends this tab's host session, if it has one. Idempotent. */
export async function endHostSession(): Promise<void> {
  const ending = session;
  session = undefined;
  await ending?.dispose();
}

/**
 * Registered at module scope rather than from the editor's own effect because
 * of when it is called: sign-out leaves the editor by an ordinary navigation
 * first, so the unsaved-changes blocker runs while the session is still valid,
 * and only then closes the editor's sessions — by which time the route is
 * unmounted and an effect's registration is gone with it.
 *
 * `closeStudioEditorSessions` is the one place this happens, and every way out
 * of an authenticated session calls it: `shell/useSignOut.ts`, the "use a
 * different account" sign-out on an invitation, and the app shell's guard,
 * which is where an expired session and a sign-out in another tab are learnt.
 * Closing is also what gives the sections this tab was holding back to its
 * collaborators.
 */
registerStudioEditorSession(endHostSession);

/**
 * The test seam: sessions opened from now on are built from `layer`. The
 * session in force is ended first, so no call can straddle the two.
 */
export async function setHostClientLayer(
  layer: Layer.Layer<HostClient>,
): Promise<void> {
  await endHostSession();
  sessionLayer = layer;
}
