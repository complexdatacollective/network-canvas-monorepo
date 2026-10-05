import { Effect, Layer } from 'effect';

import {
  HostCaller,
  HostSession,
} from '@codaco/protocol-builder-core/contract/session';

const ARCHITECT_CONNECTION = 'architect-local';

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
