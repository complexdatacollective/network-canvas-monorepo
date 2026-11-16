import { Effect, type Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expectTypeOf, it } from 'vitest';

import { AuditActor } from '../middleware/auditActor.ts';
import { Authenticated, Principal } from '../middleware/authenticated.ts';
import { ParticipantSession } from '../middleware/session.ts';
import { ParticipantRpcs } from '../rpc/participant.ts';

// A type test: `tsc` checks each `expectTypeOf`; vitest only runs the file.
// A handler that reads a service its procedure's middleware does not provide
// leaves that service as a requirement of the handlers layer.

const unreachable = Effect.die('a type probe; never run');

const participantHandlers = <R>(reads: Effect.Effect<unknown, never, R>) => ({
  'participant.redeem': () => unreachable,
  'participant.session': () => Effect.andThen(reads, unreachable),
  'participant.sync': () => unreachable,
  'participant.finish': () => unreachable,
  'participant.analytics': () => unreachable,
});

const ResearcherProbeRpcs = RpcGroup.make(
  Rpc.make('probe.researcher', { success: Schema.String }),
).middleware(Authenticated);

describe('what a participant handler can read', () => {
  it('reads the participant session and the audit actor', () => {
    const handlers = ParticipantRpcs.toLayer(
      participantHandlers(Effect.all([ParticipantSession, AuditActor])),
    );
    expectTypeOf<Layer.Services<typeof handlers>>().toBeNever();
  });

  it('cannot read the researcher Principal', () => {
    const handlers = ParticipantRpcs.toLayer(participantHandlers(Principal));
    expectTypeOf<Layer.Services<typeof handlers>>().toEqualTypeOf<Principal>();
  });

  it('gives participant.redeem neither credential', () => {
    const readsSession = ParticipantRpcs.toLayer({
      ...participantHandlers(Effect.void),
      'participant.redeem': () =>
        Effect.andThen(ParticipantSession, unreachable),
    });
    expectTypeOf<
      Layer.Services<typeof readsSession>
    >().toEqualTypeOf<ParticipantSession>();

    const readsPrincipal = ParticipantRpcs.toLayer({
      ...participantHandlers(Effect.void),
      'participant.redeem': () => Effect.andThen(Principal, unreachable),
    });
    expectTypeOf<
      Layer.Services<typeof readsPrincipal>
    >().toEqualTypeOf<Principal>();
  });
});

describe('what a researcher handler can read', () => {
  it('reads the Principal and the audit actor', () => {
    const handlers = ResearcherProbeRpcs.toLayer({
      'probe.researcher': () =>
        Effect.andThen(Effect.all([Principal, AuditActor]), unreachable),
    });
    expectTypeOf<Layer.Services<typeof handlers>>().toBeNever();
  });

  it('cannot read the participant session', () => {
    const handlers = ResearcherProbeRpcs.toLayer({
      'probe.researcher': () => Effect.andThen(ParticipantSession, unreachable),
    });
    expectTypeOf<
      Layer.Services<typeof handlers>
    >().toEqualTypeOf<ParticipantSession>();
  });
});
