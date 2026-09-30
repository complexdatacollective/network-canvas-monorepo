import { Effect, Layer } from 'effect';

import {
  HostCaller,
  HostSession,
} from '@codaco/protocol-builder-core/contract/session';

const ARCHITECT_CONNECTION = 'architect-local';

/**
 * One researcher, one store: every call this host serves comes from the tab it
 * runs in, so the caller is a constant.
 *
 * The other tab a demoted one reports as a holder is presence, not a caller,
 * and never passes through here.
 */
export const ArchitectHostSession: Layer.Layer<HostSession> = Layer.succeed(
  HostSession,
)((effect) =>
  Effect.provideService(effect, HostCaller, {
    connectionId: ARCHITECT_CONNECTION,
    clientSessionId: ARCHITECT_CONNECTION,
    userId: ARCHITECT_CONNECTION,
    displayName: 'This device',
  }),
);
