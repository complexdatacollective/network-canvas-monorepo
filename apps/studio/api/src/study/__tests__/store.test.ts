import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import {
  type TeamAccess,
  TenantScope,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import { readStudyCounts } from '../counts.ts';
import { getStudy, listStudies, type StudyVisibility } from '../store.ts';

const MEMBER = 'user-member';

const asMember: StudyVisibility = {
  actorUserId: MEMBER,
  seesEveryStudy: false,
};
const asAdmin: StudyVisibility = {
  actorUserId: MEMBER,
  seesEveryStudy: true,
};

type Fixture = {
  access: TeamAccess;
  otherAccess: TeamAccess;
  granted: string;
  ungranted: string;
  foreign: string;
  protocolId: string;
  newestDraftId: string;
};

const seed = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  const teamId = `team-${randomUUID().slice(0, 8)}`;
  const otherTeamId = `team-${randomUUID().slice(0, 8)}`;
  const granted = randomUUID();
  const ungranted = randomUUID();
  const foreign = randomUUID();
  const protocolId = randomUUID();
  const versionId = randomUUID();
  const olderDraftId = randomUUID();
  const newestDraftId = randomUUID();
  const waveId = randomUUID();
  const participantId = randomUUID();
  const sessionId = randomUUID();

  yield* harness.onOwner(
    Effect.gen(function* () {
      const { sql } = harness.owner;
      for (const team of [teamId, otherTeamId]) {
        yield* sql`insert into teams (id, name, slug)
                   values (${team}, ${team}, ${team})`;
      }
      yield* sql`insert into protocols (id, team_id, name)
                 values (${protocolId}, ${teamId}, 'A protocol')`;
      // A raw statement, so the jsonb value is a JSON string: through the builder
      // stringifying would double-encode.
      yield* sql`insert into protocol_versions
                   (id, protocol_id, team_id, version_number, version_hash,
                    manifest, schema_version, source_manifest_hash)
                 values (${versionId}, ${protocolId}, ${teamId}, 1, 'hash',
                         ${JSON.stringify({ name: 'A protocol' })}, 8, 'source')`;
      for (const [draftId, createdAt] of [
        [olderDraftId, '2026-01-01T00:00:00Z'],
        [newestDraftId, '2026-02-01T00:00:00Z'],
      ] as const) {
        yield* sql`insert into drafts (id, team_id, head_manifest_hash)
                   values (${draftId}, ${teamId}, 'head')`;
        yield* sql`insert into protocol_drafts
                     (draft_id, team_id, protocol_id, created_at)
                   values (${draftId}, ${teamId}, ${protocolId}, ${createdAt})`;
      }

      yield* sql`insert into studies (id, team_id, name, protocol_id, created_at)
                 values (${ungranted}, ${teamId}, 'Unreachable', ${protocolId},
                         '2026-03-01T00:00:00Z')`;
      yield* sql`insert into studies (id, team_id, name, protocol_id, created_at)
                 values (${granted}, ${teamId}, 'Reachable', ${protocolId},
                         '2026-03-02T00:00:00Z')`;
      yield* sql`insert into studies (id, team_id, name)
                 values (${foreign}, ${otherTeamId}, 'Another team')`;

      yield* sql`insert into study_role_grants
                   (id, team_id, study_id, user_id, role, granted_by_user_id)
                 values (${randomUUID()}, ${teamId}, ${granted}, ${MEMBER},
                         'coordinator', 'user-admin')`;

      yield* sql`insert into study_waves
                   (id, study_id, team_id, wave_number, protocol_version_id)
                 values (${waveId}, ${granted}, ${teamId}, 1, ${versionId})`;
      yield* sql`insert into participants
                   (id, study_id, team_id, participant_code)
                 values (${participantId}, ${granted}, ${teamId}, 'P-0001')`;
      yield* sql`insert into interview_sessions
                   (id, study_id, team_id, wave_id, participant_id,
                    protocol_version_id, ego_uid)
                 values (${sessionId}, ${granted}, ${teamId}, ${waveId},
                         ${participantId}, ${versionId},
                         ${`ego_${sessionId.slice(0, 8)}`})`;
    }),
  );

  const fixture: Fixture = {
    access: unsafeMakeTeamAccess(teamId, 'owner'),
    otherAccess: unsafeMakeTeamAccess(otherTeamId, 'owner'),
    granted,
    ungranted,
    foreign,
    protocolId,
    newestDraftId,
  };
  return fixture;
});

describe.skipIf(!testDb)('the study store', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'under #1257 visibility',
    (it) => {
      it.effect('shows a Member only the studies they hold a grant on', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          const rows = yield* TenantScope.open(
            fixture.access,
            listStudies(asMember),
          );
          expect(rows.map((row) => row.id)).toEqual([fixture.granted]);
        }).pipe(Effect.orDie),
      );

      it.effect('shows an Admin every study the team owns, newest first', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          const rows = yield* TenantScope.open(
            fixture.access,
            listStudies(asAdmin),
          );
          expect(rows.map((row) => row.id)).toEqual([
            fixture.granted,
            fixture.ungranted,
          ]);
        }).pipe(Effect.orDie),
      );

      it.effect('makes the list and the get agree on a boundary row', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          const expected = [
            { who: 'member', study: 'granted', reachable: true },
            { who: 'member', study: 'ungranted', reachable: false },
            { who: 'admin', study: 'granted', reachable: true },
            { who: 'admin', study: 'ungranted', reachable: true },
          ] as const;

          for (const { who, study, reachable } of expected) {
            const visibility = who === 'member' ? asMember : asAdmin;
            const studyId =
              study === 'granted' ? fixture.granted : fixture.ungranted;
            const answers = yield* TenantScope.open(
              fixture.access,
              Effect.gen(function* () {
                const rows = yield* listStudies(visibility);
                const one = yield* getStudy(studyId, visibility);
                return {
                  who,
                  study,
                  listed: rows.some((row) => row.id === studyId),
                  got: one !== null,
                };
              }),
            );
            expect(answers).toEqual({
              who,
              study,
              listed: reachable,
              got: reachable,
            });
          }
        }).pipe(Effect.orDie),
      );

      it.effect('cannot reach another team’s study at all', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          expect(
            yield* TenantScope.open(
              fixture.access,
              getStudy(fixture.foreign, asAdmin),
            ),
          ).toBeNull();
          expect(
            yield* TenantScope.open(
              fixture.otherAccess,
              getStudy(fixture.foreign, asAdmin),
            ),
          ).not.toBeNull();
        }).pipe(Effect.orDie),
      );

      it.effect('carries the newest draft of the study’s protocol line', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          const study = yield* TenantScope.open(
            fixture.access,
            getStudy(fixture.granted, asMember),
          );
          expect(study?.protocolDraftId).toBe(fixture.newestDraftId);
          expect(study?.protocolId).toBe(fixture.protocolId);
        }).pipe(Effect.orDie),
      );

      it.effect('counts waves and participants as numbers, not bigints', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          const rows = yield* TenantScope.open(
            fixture.access,
            listStudies(asAdmin),
          );
          const granted = rows.find((row) => row.id === fixture.granted);
          const ungranted = rows.find((row) => row.id === fixture.ungranted);
          expect(typeof granted?.waveCount).toBe('number');
          expect(typeof granted?.participantCount).toBe('number');
          expect(granted).toMatchObject({ waveCount: 1, participantCount: 1 });
          expect(ungranted).toMatchObject({
            waveCount: 0,
            participantCount: 0,
          });
        }).pipe(Effect.orDie),
      );

      it.effect('reads the four sidebar counts as numbers', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          const counts = yield* TenantScope.open(
            fixture.access,
            readStudyCounts(fixture.granted),
          );
          expect(counts).toEqual({
            versions: 1,
            participants: 1,
            waves: 1,
            sessions: 1,
          });
          for (const value of Object.values(counts ?? {})) {
            expect(typeof value).toBe('number');
          }
        }).pipe(Effect.orDie),
      );

      it.effect('answers nothing for a study this team does not have', () =>
        Effect.gen(function* () {
          const fixture = yield* seed();
          expect(
            yield* TenantScope.open(
              fixture.access,
              readStudyCounts(fixture.foreign),
            ),
          ).toBeUndefined();
          expect(
            yield* TenantScope.open(
              fixture.access,
              readStudyCounts(randomUUID()),
            ),
          ).toBeUndefined();
        }).pipe(Effect.orDie),
      );
    },
  );
});
