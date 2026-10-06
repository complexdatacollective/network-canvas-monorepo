import { randomUUID } from 'node:crypto';

import { Effect } from 'effect';

import { TestDatabase } from '../../__tests__/support/database.ts';
import { TenantScope, type TeamAccess } from '../../db/tenant.ts';
import { presentedTokenTeamAccess } from '../access.ts';
import { issueSessionToken } from '../store.ts';
import { mintSessionToken } from '../token.ts';

export type InterviewFixture = {
  readonly teamId: string;
  readonly access: TeamAccess;
  readonly studyId: string;
  readonly waveId: string;
  readonly versionId: string;
  readonly participantId: string;
  readonly participantCode: string;
  readonly managedLink: { readonly id: string; readonly token: string };
  readonly anonymousLink: { readonly id: string; readonly token: string };
};

export const seedInterviewFixture = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  const teamId = `team-${randomUUID().slice(0, 8)}`;
  const protocolId = randomUUID();
  const versionId = randomUUID();
  const studyId = randomUUID();
  const waveId = randomUUID();
  const participantId = randomUUID();
  const participantCode = `P-${randomUUID().slice(0, 6)}`;
  const managed = { id: randomUUID(), ...mintSessionToken(teamId) };
  const anonymous = { id: randomUUID(), ...mintSessionToken(teamId) };

  yield* harness.onOwner(
    Effect.gen(function* () {
      const { sql } = harness.owner;
      yield* sql`insert into teams (id, name, slug)
                 values (${teamId}, ${teamId}, ${teamId})`;
      yield* sql`insert into protocols (id, team_id, name)
                 values (${protocolId}, ${teamId}, 'A protocol')`;
      yield* sql`insert into protocol_versions
                   (id, protocol_id, team_id, version_number, version_hash,
                    manifest, schema_version, source_manifest_hash)
                 values (${versionId}, ${protocolId}, ${teamId}, 1, 'hash',
                         ${JSON.stringify({ name: 'A protocol' })}, 8, 'source')`;
      yield* sql`insert into studies
                   (id, team_id, name, protocol_id, state, went_live_at)
                 values (${studyId}, ${teamId}, 'A study', ${protocolId},
                         'live', now())`;
      yield* sql`insert into study_waves
                   (id, study_id, team_id, wave_number, protocol_version_id)
                 values (${waveId}, ${studyId}, ${teamId}, 1, ${versionId})`;
      yield* sql`insert into participants
                   (id, study_id, team_id, participant_code)
                 values (${participantId}, ${studyId}, ${teamId},
                         ${participantCode})`;
      yield* sql`insert into interview_links
                   (id, study_id, team_id, wave_id, participant_id, kind,
                    token_hash)
                 values (${managed.id}, ${studyId}, ${teamId}, ${waveId},
                         ${participantId}, 'participant', ${managed.secretHash})`;
      yield* sql`insert into interview_links
                   (id, study_id, team_id, wave_id, kind, token_hash)
                 values (${anonymous.id}, ${studyId}, ${teamId}, ${waveId},
                         'anonymous', ${anonymous.secretHash})`;
    }),
  );

  const fixture: InterviewFixture = {
    teamId,
    access: presentedTokenTeamAccess(teamId),
    studyId,
    waveId,
    versionId,
    participantId,
    participantCode,
    managedLink: { id: managed.id, token: managed.token },
    anonymousLink: { id: anonymous.id, token: anonymous.token },
  };
  return fixture;
});

export const insertSession = Effect.fnUntraced(function* (
  fixture: InterviewFixture,
  options: { readonly participantId?: string | null } = {},
) {
  const harness = yield* TestDatabase;
  const sessionId = randomUUID();
  const participantId =
    options.participantId === undefined
      ? fixture.participantId
      : options.participantId;
  yield* harness.onOwner(
    harness.owner.sql`insert into interview_sessions
                        (id, study_id, team_id, wave_id, participant_id,
                         protocol_version_id, ego_uid)
                      values (${sessionId}, ${fixture.studyId}, ${fixture.teamId},
                              ${fixture.waveId}, ${participantId},
                              ${fixture.versionId}, ${`ego-${sessionId}`})`,
  );
  return sessionId;
});

export const tokenFor = Effect.fnUntraced(function* (
  fixture: InterviewFixture,
  sessionId: string,
) {
  const minted = mintSessionToken(fixture.teamId);
  const issued = yield* TenantScope.open(
    fixture.access,
    issueSessionToken(sessionId, minted.secretHash),
  );
  if (!issued) {
    return yield* Effect.die(new Error(`session ${sessionId} took no token`));
  }
  return minted.token;
});

export const completeSession = (sessionId: string) =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.onOwner(
      Effect.gen(function* () {
        yield* harness.owner.sql.unsafe(
          `UPDATE interview_sessions
           SET status = 'completed', completed_at = now() WHERE id = $1`,
          [sessionId],
        );
        yield* harness.owner.sql.unsafe(
          `INSERT INTO session_snapshots
             (session_id, team_id, study_id, protocol_version_id,
              schema_version, payload, payload_hash)
           SELECT s.id, s.team_id, s.study_id, s.protocol_version_id,
                  v.schema_version, '{}'::jsonb, 'sha256:finalized'
           FROM interview_sessions s
           JOIN protocol_versions v
             ON v.id = s.protocol_version_id AND v.team_id = s.team_id
           WHERE s.id = $1`,
          [sessionId],
        );
      }),
    ),
  );
