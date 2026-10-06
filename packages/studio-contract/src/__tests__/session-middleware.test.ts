import { Effect, type Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';

import { AuditActor } from '../middleware/auditActor.ts';
import { Authenticated, Principal } from '../middleware/authenticated.ts';
import { ParticipantSession } from '../middleware/session.ts';
import { ParticipantRpcs } from '../rpc/participant.ts';

// A type test: each consumed `@ts-expect-error` fails `tsc` when the
// requirement it guards stops being enforced.

const requiresNothing = <ROut, E>(layer: Layer.Layer<ROut, E>) => layer;

const unreachable = Effect.die('a type probe; never run');

const participantHandlers = <R>(reads: Effect.Effect<unknown, never, R>) => ({
  'participant.redeem': () => unreachable,
  'participant.session': () => Effect.andThen(reads, unreachable),
  'participant.sync': () => unreachable,
  'participant.finish': () => unreachable,
});

const ResearcherProbeRpcs = RpcGroup.make(
  Rpc.make('probe.researcher', { success: Schema.String }),
).middleware(Authenticated);

describe('what a participant handler can read', () => {
  it('reads the participant session and the audit actor', () => {
    requiresNothing(
      ParticipantRpcs.toLayer(
        participantHandlers(Effect.all([ParticipantSession, AuditActor])),
      ),
    );
    expect(true).toBe(true);
  });

  it('cannot read the researcher Principal', () => {
    requiresNothing(
      // @ts-expect-error Principal is not provided to participant procedures
      ParticipantRpcs.toLayer(participantHandlers(Principal)),
    );
    expect(true).toBe(true);
  });

  it('gives participant.redeem neither credential', () => {
    requiresNothing(
      // @ts-expect-error redeem carries no RequireSession
      ParticipantRpcs.toLayer({
        ...participantHandlers(Effect.void),
        'participant.redeem': () =>
          Effect.andThen(ParticipantSession, unreachable),
      }),
    );
    requiresNothing(
      // @ts-expect-error redeem carries no Authenticated
      ParticipantRpcs.toLayer({
        ...participantHandlers(Effect.void),
        'participant.redeem': () => Effect.andThen(Principal, unreachable),
      }),
    );
    expect(true).toBe(true);
  });
});

describe('what a researcher handler can read', () => {
  it('reads the Principal and the audit actor', () => {
    requiresNothing(
      ResearcherProbeRpcs.toLayer({
        'probe.researcher': () =>
          Effect.andThen(Effect.all([Principal, AuditActor]), unreachable),
      }),
    );
    expect(true).toBe(true);
  });

  it('cannot read the participant session', () => {
    requiresNothing(
      // @ts-expect-error ParticipantSession is not provided to researcher procedures
      ResearcherProbeRpcs.toLayer({
        'probe.researcher': () =>
          Effect.andThen(ParticipantSession, unreachable),
      }),
    );
    expect(true).toBe(true);
  });
});
