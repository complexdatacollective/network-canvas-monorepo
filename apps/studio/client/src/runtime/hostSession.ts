import { type Layer, ManagedRuntime } from 'effect';

import { registerStudioEditorSession } from '../editor/sessionLifecycle.ts';
import { delegatingRuntime, HostClient } from './runtime.ts';

// One authenticated session's way of reaching the protocol builder's host: a
// runtime of its own over `HostClient.layer`. Ending it on sign-out interrupts
// every call and stream that ran on it and closes the socket with its
// reconnection loop, so nothing the previous account started, or was waiting
// on, carries over onto the socket the next account opens.

export type HostRuntime = ManagedRuntime.ManagedRuntime<HostClient, never>;

let sessionLayer: Layer.Layer<HostClient> = HostClient.layer;

let session: HostRuntime | undefined;

/** Builds nothing: the socket is dialled by the first call that needs it. */
const currentSession = (): HostRuntime => {
  session ??= ManagedRuntime.make(sessionLayer);
  return session;
};

/** Resolved per call, so an adapter bound to it keeps one identity across sessions. */
export const hostRuntime: HostRuntime = delegatingRuntime(currentSession);

/** Ends this tab's host session, if it has one. Idempotent. */
export async function endHostSession(): Promise<void> {
  const ending = session;
  session = undefined;
  await ending?.dispose();
}

// Registered at module scope rather than from the editor's own effect: sign-out
// navigates out of the editor first and closes its sessions only once the
// route, and an effect's registration with it, is gone.
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
