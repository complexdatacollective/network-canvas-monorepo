import { Effect, Layer } from 'effect';
import type { RpcGroup } from 'effect/rpc';
import { RpcTest } from 'effect/rpc';
import { onTestFinished } from 'vitest';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import {
  ParticipantSession,
  RequireSession,
} from '@codaco/studio-contract/middleware/session';
import { ParticipantRpcs } from '@codaco/studio-contract/rpc/participant';
import { Unauthorized } from '@codaco/studio-contract/schema/errors';
import {
  SessionToken,
  StudyId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';
import { unsafeMakeTeamAccess } from '@codaco/studio-sync/tenant';

import {
  getParticipantRuntime,
  makeParticipantRuntime,
  type ParticipantRpcClient,
  type ParticipantRuntime,
  type ParticipantRpcsType,
  setParticipantRuntime,
} from '../runtime/participantRuntime.ts';
import type { RpcCall, RpcHarness } from './rpcHarness.ts';

export type ParticipantHandlers = RpcGroup.HandlersFrom<ParticipantRpcsType>;

const unimplemented = (tag: string) => () =>
  Effect.die(new Error(`the participant harness has no handler for "${tag}"`));

const unimplementedHandlers: ParticipantHandlers = {
  'participant.finish': unimplemented('participant.finish'),
  'participant.redeem': unimplemented('participant.redeem'),
  'participant.session': unimplemented('participant.session'),
  'participant.sync': unimplemented('participant.sync'),
};

const HARNESS_TEAM = '00000000-0000-4000-8000-000000000001';
const HARNESS_STUDY = '00000000-0000-4000-8000-000000000002';

const requireSessionLayer = (
  refuseSession: () => boolean,
): Layer.Layer<RequireSession> =>
  Layer.succeed(RequireSession)(
    RequireSession.of((effect) =>
      refuseSession()
        ? Effect.fail(new Unauthorized({}))
        : effect.pipe(
            Effect.provideService(
              ParticipantSession,
              ParticipantSession.of({
                sessionId: 'harness-session',
                sessionToken: SessionToken.make('s'.repeat(32)),
                studyId: StudyId.make(HARNESS_STUDY),
                teamId: TeamId.make(HARNESS_TEAM),
                holderEpoch: 1,
                status: 'in_progress',
                access: unsafeMakeTeamAccess(HARNESS_TEAM, 'participant'),
              }),
            ),
            Effect.provideService(
              AuditActor,
              AuditActor.of({
                kind: 'participant',
                id: 'harness-session',
                label: 'harness-participant',
              }),
            ),
          ),
    ),
  );

const recording =
  (client: ParticipantRpcClient, calls: RpcCall[]): ParticipantRpcClient =>
  (tag, payload, options) => {
    calls.push({ tag, payload });
    return client(tag, payload, options);
  };

export function installParticipantHarness(
  handlers: Partial<ParticipantHandlers>,
  options?: { readonly refuseSession?: () => boolean },
): RpcHarness {
  const calls: RpcCall[] = [];

  const client = RpcTest.makeClient(ParticipantRpcs, { flatten: true }).pipe(
    Effect.provide(
      Layer.merge(
        ParticipantRpcs.toLayer({ ...unimplementedHandlers, ...handlers }),
        requireSessionLayer(options?.refuseSession ?? (() => false)),
      ),
    ),
    Effect.map((flat) => recording(flat, calls)),
  );

  const previous: ParticipantRuntime = getParticipantRuntime();
  const runtime = makeParticipantRuntime(client);
  setParticipantRuntime(runtime);

  let disposed = false;
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    setParticipantRuntime(previous);
    await runtime.dispose();
  };

  onTestFinished(dispose);

  return { calls, dispose };
}
