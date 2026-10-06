import { type Layer, ManagedRuntime } from 'effect';

import { registerStudioEditorSession } from '../editor/sessionLifecycle.ts';
import { HostClient } from './hostClient.ts';
import { delegatingRuntime } from './runtime.ts';

export type HostRuntime = ManagedRuntime.ManagedRuntime<HostClient, never>;

let sessionLayer: Layer.Layer<HostClient> = HostClient.layer;

let session: HostRuntime | undefined;

const currentSession = (): HostRuntime => {
  session ??= ManagedRuntime.make(sessionLayer);
  return session;
};

export const hostRuntime: HostRuntime = delegatingRuntime(currentSession);

export async function endHostSession(): Promise<void> {
  const ending = session;
  session = undefined;
  await ending?.dispose();
}

// Registered at module scope: sign-out closes sessions only once the editor
// route, and an effect's registration with it, is gone.
registerStudioEditorSession(endHostSession);

export async function setHostClientLayer(
  layer: Layer.Layer<HostClient>,
): Promise<void> {
  await endHostSession();
  sessionLayer = layer;
}
