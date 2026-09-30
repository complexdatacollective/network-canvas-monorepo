// The study spine's database-enforced promises: every CHECK, the composite
// foreign keys that prove same-study membership, and the sidecar triggers that
// make a closed study read-only, a live study's participation mode and go-live
// record final, a wave's identity fixed, every version pin a version of the
// study's own protocol line, a finalized session immutable, and a participant
// delete possible only under the audited erasure marker or the maintenance
// purge.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';
import { describe, expect } from 'vitest';

import {
  ownerAffected,
  ownerRows,
  refusalOf,
  TestDatabase,
  TestDatabaseLive,
  testDb,
  erasing,
  maintenanceAffected,
  ownerInsert,
  tenantAffected,
} from '../../__tests__/support/database.ts';
import { MAX_WAVES_PER_STUDY } from '../schema.ts';

const TEAMS = ['team-a', 'team-b'] as const;
type Team = (typeof TEAMS)[number];
const TEAM_A: Team = 'team-a';
const TEAM_B: Team = 'team-b';

type Row = Record<string, unknown>;

/**
 * One rejection case: the label the test title reads, the row override that
 * provokes the rejection, and the constraint Postgres must name.
 *
 * A tuple rather than an object because the title is interpolated with `%s`,
 * which prints the label whole — a `$property` substitution is truncated at
 * forty characters, and several of these labels are longer than that.
 */
type CheckCase = readonly [label: string, overrides: Row, constraint: string];

/**
 * `ownerRows`, decoded. `@effect/sql-pg` rc.115 hands a `timestamptz` back as
 * epoch milliseconds where drizzle's own column mapper hands back a `Date`, so
 * the two cases that read an instant through a raw statement say so rather than
 * trusting the driver to keep doing it.
 */
const ownerDecoded = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  text: string,
  params?: ReadonlyArray<unknown>,
): Effect.Effect<ReadonlyArray<S['Type']>, SqlError.SqlError, TestDatabase> => {
  const decode = Schema.decodeUnknownSync(schema);
  return Effect.map(ownerRows<Row>(text, params), (rows) =>
    rows.map((row) => decode(row)),
  );
};

/**
 * One protocol line per team and one published version of it, named up front so
 * the row builders below can reach them: `study_waves_version_own_line` refuses
 * a pin whose study has no line, and `interview_sessions_version_wave_pin`
 * refuses a session under a wave that pins nothing.
 */
const protocolOf: Record<Team, string> = {
  'team-a': randomUUID(),
  'team-b': randomUUID(),
};
const versionOf: Record<Team, string> = {
  'team-a': randomUUID(),
  'team-b': randomUUID(),
};

const studyRow = (overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  name: 'A study',
  protocol_id: protocolOf[TEAM_A],
  ...overrides,
});

const waveRow = (studyId: string, overrides: Row = {}): Row => ({
  id: randomUUID(),
  study_id: studyId,
  team_id: TEAM_A,
  wave_number: 1,
  protocol_version_id: versionOf[TEAM_A],
  ...overrides,
});

const participantRow = (studyId: string, overrides: Row = {}): Row => ({
  id: randomUUID(),
  study_id: studyId,
  team_id: TEAM_A,
  participant_code: `P-${randomUUID().slice(0, 8)}`,
  ...overrides,
});

const sessionRow = (
  studyId: string,
  waveId: string,
  overrides: Row = {},
): Row => ({
  id: randomUUID(),
  study_id: studyId,
  team_id: TEAM_A,
  wave_id: waveId,
  protocol_version_id: versionOf[TEAM_A],
  ego_uid: `ego_${randomUUID().slice(0, 8)}`,
  ...overrides,
});

const linkRow = (
  studyId: string,
  waveId: string,
  overrides: Row = {},
): Row => ({
  id: randomUUID(),
  study_id: studyId,
  team_id: TEAM_A,
  wave_id: waveId,
  kind: 'anonymous',
  token_hash: randomBytes(32),
  ...overrides,
});

const newStudy = Effect.fnUntraced(function* (overrides: Row = {}) {
  const row = studyRow(overrides);
  yield* ownerInsert('studies', row);
  return row.id as string;
});

const newWave = Effect.fnUntraced(function* (
  studyId: string,
  overrides: Row = {},
) {
  const row = waveRow(studyId, overrides);
  yield* ownerInsert('study_waves', row);
  return row.id as string;
});

const newParticipant = Effect.fnUntraced(function* (
  studyId: string,
  overrides: Row = {},
) {
  const row = participantRow(studyId, overrides);
  yield* ownerInsert('participants', row);
  return row.id as string;
});

const newSession = Effect.fnUntraced(function* (
  studyId: string,
  waveId: string,
  overrides: Row = {},
) {
  const row = sessionRow(studyId, waveId, overrides);
  yield* ownerInsert('interview_sessions', row);
  return row.id as string;
});

/** Another published version of `protocolId`, inside TEAM_A. */
const newVersion = Effect.fnUntraced(function* (
  protocolId: string,
  versionNumber: number,
) {
  const versionId = randomUUID();
  yield* ownerInsert('protocol_versions', {
    id: versionId,
    protocol_id: protocolId,
    team_id: TEAM_A,
    version_number: versionNumber,
    version_hash: `hash-${versionId}`,
    manifest: JSON.stringify({ name: 'another version' }),
    schema_version: 8,
    source_manifest_hash: `source-${versionId}`,
  });
  return versionId;
});

/**
 * A second protocol line in TEAM_A, with one published version. The
 * team-scoped composite keys admit its version anywhere the team's own does,
 * so it is the fixture every "same team, wrong line" case needs.
 */
const newProtocolLine = Effect.fnUntraced(function* () {
  const protocolId = randomUUID();
  yield* ownerInsert('protocols', {
    id: protocolId,
    team_id: TEAM_A,
    name: `Another protocol ${protocolId.slice(0, 8)}`,
  });
  return { protocolId, versionId: yield* newVersion(protocolId, 1) };
});

/** A study with one wave and one participant, all open. */
const newTrio = Effect.fnUntraced(function* () {
  const studyId = yield* newStudy();
  return {
    studyId,
    waveId: yield* newWave(studyId),
    participantId: yield* newParticipant(studyId),
  };
});

const closeStudy = (studyId: string) =>
  ownerAffected(
    `UPDATE studies SET state = 'closed', closed_at = now(),
         went_live_at = COALESCE(went_live_at, now()) WHERE id = $1`,
    [studyId],
  );

/**
 * Finalizes a session the only way the database now admits: the flip to
 * `completed` and the session's snapshot in one transaction. The deferred
 * `interview_sessions_completion_snapshot` weighs the pair at commit, and
 * `session_snapshots_insert_at_finalization` refuses the snapshot in any
 * other transaction — so a study-module fixture that needs a finalized
 * session has to write the network module's row too.
 */
const finalize = (sessionId: string) =>
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

/**
 * The suite's `beforeAll`, as a layer: it runs once when the scratch schema is
 * built, which is what the node-postgres suite's `beforeAll` did.
 */
const seed = Effect.flatMap(TestDatabase, (harness) =>
  harness.onOwner(
    Effect.forEach(TEAMS, (teamId) =>
      Effect.gen(function* () {
        yield* harness.owner.sql`INSERT INTO teams (id, name, slug)
                                 VALUES (${teamId}, ${teamId}, ${teamId})
                                 ON CONFLICT (id) DO NOTHING`;
        yield* harness.owner.sql`INSERT INTO protocols (id, team_id, name)
                                 VALUES (${protocolOf[teamId]}, ${teamId},
                                         ${`${teamId} protocol`})`;
        yield* harness.owner
          .sql`INSERT INTO protocol_versions (id, protocol_id, team_id,
                                              version_number, version_hash,
                                              manifest, schema_version,
                                              source_manifest_hash)
               VALUES (${versionOf[teamId]}, ${protocolOf[teamId]}, ${teamId}, 1,
                       ${`hash-${teamId}`}, ${JSON.stringify({ name: teamId })},
                       8, ${`source-${teamId}`})`;
      }),
    ),
  ),
);

const SeededDatabaseLive = Layer.effectDiscard(seed).pipe(
  Layer.provideMerge(TestDatabaseLive),
);

describe.skipIf(!testDb)('study spine schema', () => {
  layer(SeededDatabaseLive, { excludeTestServices: true })(
    'over a scratch schema',
    (it) => {
      describe('studies', () => {
        it.effect('applies the documented defaults', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();

            const rows = yield* ownerRows<Row>(
              `SELECT state, participation_mode, wave_progression, pause_grace_minutes,
                      settings, deletion_requested_at, purge_after, went_live_at,
                      paused_at, closed_at
               FROM studies WHERE id = $1`,
              [studyId],
            );
            expect(rows[0]).toEqual({
              state: 'draft',
              participation_mode: 'managed',
              wave_progression: 'window',
              pause_grace_minutes: 60,
              settings: {},
              deletion_requested_at: null,
              purge_after: null,
              went_live_at: null,
              paused_at: null,
              closed_at: null,
            });
          }),
        );

        it.effect.each<CheckCase>([
          ['a blank name', { name: '   ' }, 'studies_name_nonblank_check'],
          [
            'a name past 320 characters',
            { name: 'x'.repeat(321) },
            'studies_name_nonblank_check',
          ],
          ['an unknown state', { state: 'archived' }, 'studies_state_check'],
          [
            'an unknown participation mode',
            { participation_mode: 'hybrid' },
            'studies_participation_mode_check',
          ],
          [
            'an unknown wave progression',
            { wave_progression: 'parallel' },
            'studies_wave_progression_check',
          ],
          [
            'a negative pause grace',
            { pause_grace_minutes: -1 },
            'studies_pause_grace_minutes_check',
          ],
          [
            'a pause grace past thirty days',
            { pause_grace_minutes: 43_201 },
            'studies_pause_grace_minutes_check',
          ],
          [
            'scalar settings',
            { settings: JSON.stringify(3) },
            'studies_settings_object_check',
          ],
          [
            'a deletion request with no deadline',
            { deletion_requested_at: new Date() },
            'studies_deletion_marker_check',
          ],
          [
            'a deadline with no deletion request',
            { purge_after: new Date() },
            'studies_deletion_marker_check',
          ],
          [
            'a closed state with no close timestamp',
            { state: 'closed', went_live_at: new Date() },
            'studies_closed_at_check',
          ],
          [
            'a close timestamp without the closed state',
            { closed_at: new Date() },
            'studies_closed_at_check',
          ],
          [
            'a paused state with no pause timestamp',
            { state: 'paused', went_live_at: new Date() },
            'studies_paused_at_check',
          ],
          [
            'a pause timestamp without the paused state',
            { paused_at: new Date() },
            'studies_paused_at_check',
          ],
        ])('rejects %s', ([, overrides, constraint]) =>
          Effect.gen(function* () {
            expect(
              (yield* refusalOf(ownerInsert('studies', studyRow(overrides))))
                .constraint,
            ).toBe(constraint);
          }),
        );

        it.effect('accepts the states the checks exist to admit', () =>
          Effect.gen(function* () {
            expect(
              yield* ownerInsert(
                'studies',
                studyRow({
                  state: 'closed',
                  went_live_at: new Date(),
                  closed_at: new Date(),
                }),
              ),
            ).toBe(1);
            expect(
              yield* ownerInsert(
                'studies',
                studyRow({
                  state: 'paused',
                  went_live_at: new Date(),
                  paused_at: new Date(),
                }),
              ),
            ).toBe(1);
            // Past draft without the go-live record that the mode freeze guards:
            // the evidence cannot be omitted by the transition that creates it.
            expect(
              (yield* refusalOf(
                ownerInsert('studies', studyRow({ state: 'live' })),
              )).constraint,
            ).toBe('studies_went_live_at_check');
            expect(
              yield* ownerInsert(
                'studies',
                studyRow({
                  deletion_requested_at: new Date(),
                  purge_after: new Date(),
                }),
              ),
            ).toBe(1);
          }),
        );

        it.effect('refuses a protocol pin from another team', () =>
          Effect.gen(function* () {
            const refusal = yield* refusalOf(
              ownerInsert(
                'studies',
                studyRow({ team_id: TEAM_A, protocol_id: protocolOf[TEAM_B] }),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "protocols"',
            );
          }),
        );

        it.effect(
          'refuses a protocol retarget while a wave still pins a version',
          () =>
            Effect.gen(function* () {
              const studyId = yield* newStudy();
              const waveId = yield* newWave(studyId);
              const other = yield* newProtocolLine();

              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE studies SET protocol_id = $2 WHERE id = $1`,
                    [studyId, other.protocolId],
                  ),
                )).message,
              ).toContain(
                "a study's protocol line cannot change while a wave still pins a version",
              );

              // The command layer clears every pin before it retargets a Draft;
              // with the pins gone the same write lands.
              yield* ownerAffected(
                `UPDATE study_waves SET protocol_version_id = NULL WHERE id = $1`,
                [waveId],
              );
              expect(
                yield* ownerAffected(
                  `UPDATE studies SET protocol_id = $2 WHERE id = $1`,
                  [studyId, other.protocolId],
                ),
              ).toBe(1);
            }),
        );

        it.effect(
          'freezes the participation mode and go-live record of a live study',
          () =>
            Effect.gen(function* () {
              const wentLiveAt = new Date('2026-04-01T09:00:00Z');
              const studyId = yield* newStudy({
                state: 'live',
                went_live_at: wentLiveAt,
              });

              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
                    [studyId],
                  ),
                )).message,
              ).toContain(
                'a study that has gone live cannot change participation mode',
              );
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE studies SET went_live_at = NULL WHERE id = $1`,
                    [studyId],
                  ),
                )).message,
              ).toContain(
                "a study's first go-live is recorded once and never rewritten",
              );
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE studies SET went_live_at = now() WHERE id = $1`,
                    [studyId],
                  ),
                )).message,
              ).toContain(
                "a study's first go-live is recorded once and never rewritten",
              );

              // The rest of the lifecycle still moves, and leaves both alone.
              expect(
                yield* ownerAffected(
                  `UPDATE studies SET state = 'paused', paused_at = now() WHERE id = $1`,
                  [studyId],
                ),
              ).toBe(1);
              const stored = yield* ownerDecoded(
                Schema.Struct({
                  participation_mode: Schema.String,
                  // Epoch milliseconds through a raw statement; a `Date` only
                  // through the drizzle builder.
                  went_live_at: Schema.Number,
                }),
                `SELECT participation_mode, went_live_at FROM studies WHERE id = $1`,
                [studyId],
              );
              expect(
                stored.map((row) => ({
                  participation_mode: row.participation_mode,
                  went_live_at: new Date(row.went_live_at),
                }))[0],
              ).toEqual({
                participation_mode: 'managed',
                went_live_at: wentLiveAt,
              });
            }),
        );

        it.effect(
          'leaves a study that has never gone live free to choose its mode',
          () =>
            Effect.gen(function* () {
              // The freeze is evidence-driven: without `went_live_at` there is
              // no collected data for a mode change to reinterpret, and setting
              // the timestamp for the first time is how a study goes live at
              // all.
              const studyId = yield* newStudy();

              expect(
                yield* ownerAffected(
                  `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
                  [studyId],
                ),
              ).toBe(1);
              expect(
                yield* ownerAffected(
                  `UPDATE studies SET state = 'live', went_live_at = now() WHERE id = $1`,
                  [studyId],
                ),
              ).toBe(1);
            }),
        );
      });

      describe('deleting a study', () => {
        it.effect('is the maintenance purge’s alone', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            expect(
              (yield* refusalOf(
                ownerAffected(`DELETE FROM studies WHERE id = $1`, [studyId]),
              )).message,
            ).toContain('studies are deleted only by the maintenance purge');
            expect(
              (yield* refusalOf(
                tenantAffected(TEAM_A, `DELETE FROM studies WHERE id = $1`, [
                  studyId,
                ]),
              )).message,
            ).toContain('studies are deleted only by the maintenance purge');
            expect(
              yield* maintenanceAffected(`DELETE FROM studies WHERE id = $1`, [
                studyId,
              ]),
            ).toBe(1);
          }),
        );
      });

      describe('closed studies are read-only', () => {
        it.effect('permits only the allowed columns', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            yield* closeStudy(studyId);

            expect(
              (yield* refusalOf(
                ownerAffected(
                  `UPDATE studies SET name = 'renamed' WHERE id = $1`,
                  [studyId],
                ),
              )).message,
            ).toContain('closed studies are read-only');
            expect(
              (yield* refusalOf(
                ownerAffected(
                  `UPDATE studies SET pause_grace_minutes = 10 WHERE id = $1`,
                  [studyId],
                ),
              )).message,
            ).toContain('closed studies are read-only');

            // `updated_at` is on the allowed list, and the row stays closed.
            expect(
              yield* ownerAffected(
                `UPDATE studies SET updated_at = now() WHERE id = $1`,
                [studyId],
              ),
            ).toBe(1);
            expect(
              yield* ownerAffected(
                `UPDATE studies
                 SET deletion_requested_at = now(), purge_after = now() + interval '30 days'
                 WHERE id = $1`,
                [studyId],
              ),
            ).toBe(1);
          }),
        );

        it.effect.each<readonly [label: string, assignment: string]>([
          ['closed -> draft', `state = 'draft', closed_at = NULL`],
          ['closed -> paused', `state = 'paused'`],
          ['closed -> live keeping the close timestamp', `state = 'live'`],
        ])('refuses the %s exit', ([, assignment]) =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            yield* closeStudy(studyId);

            expect(
              (yield* refusalOf(
                ownerAffected(
                  `UPDATE studies SET ${assignment} WHERE id = $1`,
                  [studyId],
                ),
              )).message,
            ).toContain('closed studies are read-only');
          }),
        );

        it.effect(
          'refuses a rewrite of the close timestamp while the study stays closed',
          () =>
            Effect.gen(function* () {
              // `closed_at` is on the allowlist only so the reopen below can
              // clear it.
              const studyId = yield* newStudy();
              yield* closeStudy(studyId);
              // Epoch milliseconds through a raw statement, on both reads —
              // which is all this case needs, since it compares them to
              // each other.
              const closedAtRow = Schema.Struct({ closed_at: Schema.Number });
              const closedAt = yield* ownerDecoded(
                closedAtRow,
                `SELECT closed_at FROM studies WHERE id = $1`,
                [studyId],
              );

              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE studies SET closed_at = now() - interval '30 days' WHERE id = $1`,
                    [studyId],
                  ),
                )).message,
              ).toContain('closed studies are read-only');
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE studies SET closed_at = NULL WHERE id = $1`,
                    [studyId],
                  ),
                )).message,
              ).toContain('closed studies are read-only');

              const after = yield* ownerDecoded(
                closedAtRow,
                `SELECT closed_at FROM studies WHERE id = $1`,
                [studyId],
              );
              expect(after[0]?.closed_at).toEqual(closedAt[0]?.closed_at);
            }),
        );

        it.effect('admits the single reopen shape', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            yield* closeStudy(studyId);

            expect(
              yield* ownerAffected(
                `UPDATE studies SET state = 'live', closed_at = NULL WHERE id = $1`,
                [studyId],
              ),
            ).toBe(1);
            const after = yield* ownerRows<{ state: string }>(
              `SELECT state FROM studies WHERE id = $1`,
              [studyId],
            );
            expect(after[0]?.state).toBe('live');
          }),
        );

        it.effect('fails closed for a column added after the trigger', () =>
          Effect.gen(function* () {
            const closedId = yield* newStudy();
            yield* closeStudy(closedId);
            const openId = yield* newStudy();

            yield* ownerAffected(`ALTER TABLE studies ADD COLUMN probe text`);
            yield* Effect.ensuring(
              Effect.gen(function* () {
                // The positive control: the same write on an open study
                // succeeds, so the rejection below is the trigger and not the
                // new column itself.
                expect(
                  yield* ownerAffected(
                    `UPDATE studies SET probe = 'x' WHERE id = $1`,
                    [openId],
                  ),
                ).toBe(1);
                expect(
                  (yield* refusalOf(
                    ownerAffected(
                      `UPDATE studies SET probe = 'x' WHERE id = $1`,
                      [closedId],
                    ),
                  )).message,
                ).toContain('closed studies are read-only');
              }),
              Effect.orDie(
                ownerAffected(`ALTER TABLE studies DROP COLUMN probe`),
              ),
            );
          }),
        );
      });

      describe('study_waves', () => {
        it.effect.each<CheckCase>([
          [
            'wave number zero',
            { wave_number: 0 },
            'study_waves_wave_number_check',
          ],
          ['a blank name', { name: ' \t ' }, 'study_waves_name_check'],
          [
            'a window that closes before it opens',
            {
              opens_at: new Date('2026-02-01T00:00:00Z'),
              closes_at: new Date('2026-01-01T00:00:00Z'),
            },
            'study_waves_window_check',
          ],
        ])('rejects %s', ([, overrides, constraint]) =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            expect(
              (yield* refusalOf(
                ownerInsert('study_waves', waveRow(studyId, overrides)),
              )).constraint,
            ).toBe(constraint);
          }),
        );

        it.effect('refuses a second wave with the same number', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            yield* newWave(studyId, { wave_number: 1 });
            expect(
              (yield* refusalOf(
                ownerInsert(
                  'study_waves',
                  waveRow(studyId, { wave_number: 1 }),
                ),
              )).constraint,
            ).toBe('study_waves_study_id_wave_number_unique');
            expect(
              yield* ownerInsert(
                'study_waves',
                waveRow(studyId, { wave_number: 2 }),
              ),
            ).toBe(1);
          }),
        );

        it.effect('leaves the wave cap to the command layer', () =>
          Effect.gen(function* () {
            // MAX_WAVES_PER_STUDY is a domain cap, not a database one. Nothing
            // here refuses the wave past it, so the command that counts is the
            // only thing between a study and its fifty-first wave; a CHECK added
            // later must update this case rather than silently subsume it.
            const studyId = yield* newStudy();
            expect(
              yield* ownerInsert(
                'study_waves',
                waveRow(studyId, { wave_number: MAX_WAVES_PER_STUDY + 1 }),
              ),
            ).toBe(1);
          }),
        );

        it.effect('refuses a wave whose team disagrees with its study', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy({ team_id: TEAM_A });
            // The pin is dropped so the key to `studies` is the only one this
            // row can violate; with team B's wave carrying team A's version,
            // the key to `protocol_versions` would fail too and either could
            // report.
            const refusal = yield* refusalOf(
              ownerInsert(
                'study_waves',
                waveRow(studyId, {
                  team_id: TEAM_B,
                  protocol_version_id: null,
                }),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "studies"',
            );
          }),
        );

        it.effect('refuses a version pin from another team', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const refusal = yield* refusalOf(
              ownerInsert(
                'study_waves',
                waveRow(studyId, { protocol_version_id: versionOf[TEAM_B] }),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "protocol_versions"',
            );
          }),
        );

        it.effect(
          'refuses a version pin from another protocol line in the same team',
          () =>
            Effect.gen(function* () {
              const studyId = yield* newStudy();
              const other = yield* newProtocolLine();
              const refused =
                "a wave's protocol version must belong to its study's protocol line";

              // The team-scoped key admits the version; only the study's own
              // `protocol_id` says it belongs to a different line.
              expect(
                (yield* refusalOf(
                  ownerInsert(
                    'study_waves',
                    waveRow(studyId, { protocol_version_id: other.versionId }),
                  ),
                )).message,
              ).toContain(refused);

              // Re-pinning a wave is proven the same way.
              const waveId = yield* newWave(studyId);
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE study_waves SET protocol_version_id = $2 WHERE id = $1`,
                    [waveId, other.versionId],
                  ),
                )).message,
              ).toContain(refused);

              // A Draft with no line yet pins nothing at all, and a wave that
              // pins nothing is the state every Draft wave starts in.
              const draftId = yield* newStudy({ protocol_id: null });
              expect(
                (yield* refusalOf(ownerInsert('study_waves', waveRow(draftId))))
                  .message,
              ).toContain(refused);
              expect(
                yield* ownerInsert(
                  'study_waves',
                  waveRow(draftId, { protocol_version_id: null }),
                ),
              ).toBe(1);
            }),
        );

        it.effect('holds wave identity immutable', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const otherStudyId = yield* newStudy();
            const waveId = yield* newWave(studyId);

            for (const assignment of [
              `wave_number = 2`,
              `id = '${randomUUID()}'`,
              `study_id = '${otherStudyId}'`,
            ]) {
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE study_waves SET ${assignment} WHERE id = $1`,
                    [waveId],
                  ),
                )).message,
              ).toContain('wave identity is immutable');
            }

            // Everything else about an open study's wave stays editable.
            expect(
              yield* ownerAffected(
                `UPDATE study_waves SET name = 'Baseline' WHERE id = $1`,
                [waveId],
              ),
            ).toBe(1);
          }),
        );

        it.effect(
          'scopes the closed-study exemption to a maintenance DELETE',
          () =>
            Effect.gen(function* () {
              const studyId = yield* newStudy();
              const waveId = yield* newWave(studyId);
              const secondWaveId = yield* newWave(studyId, { wave_number: 2 });
              yield* closeStudy(studyId);

              expect(
                (yield* refusalOf(
                  maintenanceAffected(
                    `INSERT INTO study_waves (id, study_id, team_id, wave_number)
                     VALUES ($1, $2, $3, 3)`,
                    [randomUUID(), studyId, TEAM_A],
                  ),
                )).message,
              ).toContain('closed studies are read-only');
              expect(
                (yield* refusalOf(
                  maintenanceAffected(
                    `UPDATE study_waves SET name = 'renamed' WHERE id = $1`,
                    [waveId],
                  ),
                )).message,
              ).toContain('closed studies are read-only');
              expect(
                (yield* refusalOf(
                  tenantAffected(
                    TEAM_A,
                    `DELETE FROM study_waves WHERE id = $1`,
                    [waveId],
                  ),
                )).message,
              ).toContain('closed studies are read-only');

              // The purge itself is the one write the guard lets through.
              expect(
                yield* maintenanceAffected(
                  `DELETE FROM study_waves WHERE id = $1`,
                  [waveId],
                ),
              ).toBe(1);

              // And an open study's wave is still the application role's to
              // delete.
              const openStudyId = yield* newStudy();
              const openWaveId = yield* newWave(openStudyId);
              expect(
                yield* tenantAffected(
                  TEAM_A,
                  `DELETE FROM study_waves WHERE id = $1`,
                  [openWaveId],
                ),
              ).toBe(1);

              expect(secondWaveId).toBeTruthy();
            }),
        );
      });

      describe('participants_study_managed', () => {
        it.effect('refuses a participant in an anonymous study', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy({
              participation_mode: 'anonymous',
            });
            expect(
              (yield* refusalOf(newParticipant(studyId))).message,
            ).toContain('anonymous studies hold no participants');
          }),
        );

        it.effect(
          'refuses a draft becoming anonymous over the participants it holds',
          () =>
            Effect.gen(function* () {
              const studyId = yield* newStudy();
              yield* newParticipant(studyId);
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
                    [studyId],
                  ),
                )).message,
              ).toContain(
                'a study holding participants cannot become anonymous',
              );

              // Without a cohort the draft is still free to choose.
              const emptyId = yield* newStudy();
              expect(
                yield* ownerAffected(
                  `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
                  [emptyId],
                ),
              ).toBe(1);
            }),
        );
      });

      describe('participants', () => {
        it.effect('applies the documented defaults', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const participantId = yield* newParticipant(studyId);

            const rows = yield* ownerRows<Row>(
              `SELECT timezone, enrolled_at, email, phone, name, attributes
               FROM participants WHERE id = $1`,
              [participantId],
            );
            expect(rows[0]).toEqual({
              timezone: 'UTC',
              enrolled_at: null,
              // A managed study need not hold a contact detail, so every one of
              // them is nullable; the attribute bag is not, because a reader
              // indexes into it and an absent bag and an empty one are the same
              // thing.
              email: null,
              phone: null,
              name: null,
              attributes: {},
            });
          }),
        );

        it.effect.each<CheckCase>([
          [
            'a blank participant code',
            { participant_code: '  ' },
            'participants_participant_code_check',
          ],
          [
            'a participant code past 128 characters',
            { participant_code: 'p'.repeat(129) },
            'participants_participant_code_check',
          ],
          [
            'a malformed time zone',
            { timezone: 'Not/A/Zone!' },
            'participants_timezone_check',
          ],
          [
            'a time zone past 64 characters',
            { timezone: `Europe/${'a'.repeat(64)}` },
            'participants_timezone_check',
          ],
          [
            'a source participant with no source study',
            { source_participant_id: randomUUID() },
            'participants_source_check',
          ],
          [
            'a source study with no source participant',
            { source_study_id: randomUUID() },
            'participants_source_check',
          ],
        ])('rejects %s', ([, overrides, constraint]) =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            expect(
              (yield* refusalOf(
                ownerInsert('participants', participantRow(studyId, overrides)),
              )).constraint,
            ).toBe(constraint);
          }),
        );

        it.effect('accepts a full IANA zone name', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            expect(
              yield* ownerInsert(
                'participants',
                participantRow(studyId, {
                  timezone: 'America/Argentina/Buenos_Aires',
                }),
              ),
            ).toBe(1);
          }),
        );

        // The contact columns are plain since #1900, and what the database still
        // holds is the shape every reader depends on: one normalised spelling of
        // an address, so an equality lookup finds the row it should.
        it.effect.each<CheckCase>([
          [
            'an email that is not lower-cased',
            { email: 'Someone@Example.org' },
            'participants_email_check',
          ],
          [
            'an email with surrounding whitespace',
            { email: ' someone@example.org ' },
            'participants_email_check',
          ],
          [
            'an email too short to be one',
            { email: 'a@' },
            'participants_email_check',
          ],
          [
            'an email past 320 characters',
            { email: `${'a'.repeat(315)}@e.org` },
            'participants_email_check',
          ],
          [
            'a phone that is not E.164',
            { phone: '(555) 015 0100' },
            'participants_phone_check',
          ],
          [
            'a phone with no country code',
            { phone: '5550150100' },
            'participants_phone_check',
          ],
          [
            'a phone whose country code starts with a zero',
            { phone: '+05550150100' },
            'participants_phone_check',
          ],
          ['a blank name', { name: ' \t ' }, 'participants_name_check'],
          [
            'a name past 320 characters',
            { name: 'n'.repeat(321) },
            'participants_name_check',
          ],
          [
            'scalar attributes',
            { attributes: JSON.stringify(1) },
            'participants_attributes_check',
          ],
          [
            'array attributes',
            { attributes: JSON.stringify([]) },
            'participants_attributes_check',
          ],
        ])('rejects %s', ([, overrides, constraint]) =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            expect(
              (yield* refusalOf(
                ownerInsert('participants', participantRow(studyId, overrides)),
              )).constraint,
            ).toBe(constraint);
          }),
        );

        it.effect('accepts a full contact record and round-trips it', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const row = participantRow(studyId, {
              email: 'someone@example.org',
              phone: '+15550150100',
              name: 'Someone Else',
              attributes: JSON.stringify({
                cohort: 'spring',
                referral: 'clinic',
              }),
            });
            yield* ownerInsert('participants', row);

            const stored = yield* ownerRows<{
              email: string;
              phone: string;
              name: string;
              attributes: Record<string, unknown>;
            }>(
              `SELECT email, phone, name, attributes FROM participants WHERE id = $1`,
              [row.id],
            );
            expect(stored[0]).toEqual({
              email: 'someone@example.org',
              phone: '+15550150100',
              name: 'Someone Else',
              attributes: { cohort: 'spring', referral: 'clinic' },
            });
          }),
        );

        // Partial, so the anonymous studies that hold no participants and the
        // managed ones that hold no address cost nothing to carry.
        it.effect.each<readonly [name: string, column: string]>([
          ['participants_team_id_study_id_email_idx', 'email'],
          ['participants_team_id_study_id_phone_idx', 'phone'],
        ])('indexes %s on the rows that have one', ([name, column]) =>
          Effect.gen(function* () {
            const indexes = yield* ownerRows<{ indexdef: string }>(
              `SELECT indexdef FROM pg_indexes
               WHERE schemaname = current_schema()
                 AND tablename = 'participants' AND indexname = $1`,
              [name],
            );
            expect(indexes).toHaveLength(1);
            expect(indexes[0]?.indexdef).toContain(
              `WHERE (${column} IS NOT NULL)`,
            );
          }),
        );

        it.effect(
          'refuses a participant whose team disagrees with its study',
          () =>
            Effect.gen(function* () {
              const studyId = yield* newStudy({ team_id: TEAM_A });
              const refusal = yield* refusalOf(
                ownerInsert(
                  'participants',
                  participantRow(studyId, { team_id: TEAM_B }),
                ),
              );
              expect(refusal.state).toBe('23503');
              expect(refusal.detail).toContain(
                'is not present in table "studies"',
              );
            }),
        );

        it.effect(
          'holds participant identity immutable and refuses unmarked deletes',
          () =>
            Effect.gen(function* () {
              const { studyId, participantId } = yield* newTrio();
              const otherStudyId = yield* newStudy();

              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE participants SET study_id = $2 WHERE id = $1`,
                    [participantId, otherStudyId],
                  ),
                )).message,
              ).toContain('participant identity is immutable');
              expect(
                yield* ownerAffected(
                  `UPDATE participants SET timezone = 'Europe/Paris' WHERE id = $1`,
                  [participantId],
                ),
              ).toBe(1);

              expect(
                (yield* refusalOf(
                  tenantAffected(
                    TEAM_A,
                    `DELETE FROM participants WHERE id = $1`,
                    [participantId],
                  ),
                )).message,
              ).toContain(
                'participant rows are deleted only by an audited erasure or the maintenance purge',
              );
              expect(studyId).toBeTruthy();
            }),
        );

        it.effect('proves the erasure marker against the row it deletes', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const target = yield* newParticipant(studyId);
            const bystander = yield* newParticipant(studyId);

            expect(
              (yield* refusalOf(
                erasing(
                  TEAM_A,
                  bystander,
                  `DELETE FROM participants WHERE id = $1`,
                  [target],
                ),
              )).message,
            ).toContain(
              'participant rows are deleted only by an audited erasure or the maintenance purge',
            );
            expect(
              yield* erasing(
                TEAM_A,
                target,
                `DELETE FROM participants WHERE id = $1`,
                [target],
              ),
            ).toBe(1);

            const survivors = yield* ownerRows<{ id: string }>(
              `SELECT id FROM participants WHERE study_id = $1`,
              [studyId],
            );
            expect([...survivors]).toEqual([{ id: bystander }]);
          }),
        );
      });

      describe('interview_sessions', () => {
        it.effect('applies the documented defaults', () =>
          Effect.gen(function* () {
            const { studyId, waveId } = yield* newTrio();
            const sessionId = yield* newSession(studyId, waveId);

            // `holder_epoch` is a bigint, which this driver decodes as a
            // JavaScript `bigint`; rendered as text it reads the way the
            // node-postgres suite read it.
            const rows = yield* ownerRows<Row>(
              `SELECT status, delivery_mode, current_stage_index, current_stage_id,
                      stage_metadata, ego_attributes, ego_secure_attributes,
                      holder_id, holder_epoch::text AS holder_epoch, completed_at,
                      abandoned_at
               FROM interview_sessions WHERE id = $1`,
              [sessionId],
            );
            expect(rows[0]).toEqual({
              status: 'in_progress',
              delivery_mode: 'self_administered',
              current_stage_index: 0,
              current_stage_id: null,
              stage_metadata: {},
              ego_attributes: {},
              ego_secure_attributes: null,
              holder_id: null,
              holder_epoch: '0',
              completed_at: null,
              abandoned_at: null,
            });
          }),
        );

        it.effect.each<CheckCase>([
          [
            'an unknown status',
            { status: 'paused' },
            'interview_sessions_status_check',
          ],
          [
            'a researcher-led session with no initiator',
            { delivery_mode: 'researcher_led' },
            'interview_sessions_delivery_mode_check',
          ],
          [
            'a self-administered session with an initiator',
            { initiated_by_user_id: 'user-1' },
            'interview_sessions_delivery_mode_check',
          ],
          [
            'a completed status with no completion timestamp',
            { status: 'completed' },
            'interview_sessions_terminal_state_check',
          ],
          [
            'a completion timestamp without the completed status',
            { completed_at: new Date() },
            'interview_sessions_terminal_state_check',
          ],
          [
            'an abandoned status with no abandonment timestamp',
            { status: 'abandoned' },
            'interview_sessions_terminal_state_check',
          ],
          [
            'a negative stage index',
            { current_stage_index: -1 },
            'interview_sessions_stage_check',
          ],
          [
            'an empty stage id',
            { current_stage_id: '' },
            'interview_sessions_stage_check',
          ],
          [
            'a negative holder epoch',
            { holder_epoch: '-1' },
            'interview_sessions_holder_check',
          ],
          ['an empty ego uid', { ego_uid: '' }, 'interview_sessions_ego_check'],
          [
            'scalar ego attributes',
            { ego_attributes: JSON.stringify(1) },
            'interview_sessions_ego_check',
          ],
          [
            'scalar stage metadata',
            { stage_metadata: JSON.stringify('x') },
            'interview_sessions_ego_check',
          ],
        ])('rejects %s', ([, overrides, constraint]) =>
          Effect.gen(function* () {
            const { studyId, waveId } = yield* newTrio();
            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_sessions',
                  sessionRow(studyId, waveId, overrides),
                ),
              )).constraint,
            ).toBe(constraint);
          }),
        );

        it.effect(
          'accepts a researcher-led session that names its initiator',
          () =>
            Effect.gen(function* () {
              const { studyId, waveId } = yield* newTrio();
              expect(
                yield* ownerInsert(
                  'interview_sessions',
                  sessionRow(studyId, waveId, {
                    delivery_mode: 'researcher_led',
                    initiated_by_user_id: 'user-1',
                  }),
                ),
              ).toBe(1);
            }),
        );

        it.effect(
          'refuses a wave from one study and a participant from another',
          () =>
            Effect.gen(function* () {
              const studyA = yield* newStudy();
              const waveA = yield* newWave(studyA);
              const studyB = yield* newStudy();
              const participantB = yield* newParticipant(studyB);

              // Naming study A leaves the participant unfindable...
              const namingA = yield* refusalOf(
                ownerInsert(
                  'interview_sessions',
                  sessionRow(studyA, waveA, { participant_id: participantB }),
                ),
              );
              expect(namingA.state).toBe('23503');
              expect(namingA.detail).toContain(
                'is not present in table "participants"',
              );
              // ...and naming study B leaves the wave unfindable.
              const namingB = yield* refusalOf(
                ownerInsert(
                  'interview_sessions',
                  sessionRow(studyB, waveA, { participant_id: participantB }),
                ),
              );
              expect(namingB.state).toBe('23503');
              expect(namingB.detail).toContain(
                'is not present in table "study_waves"',
              );

              const participantA = yield* newParticipant(studyA);
              expect(
                yield* ownerInsert(
                  'interview_sessions',
                  sessionRow(studyA, waveA, { participant_id: participantA }),
                ),
              ).toBe(1);
            }),
        );

        it.effect('refuses a session pinning a version its wave does not', () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const waveId = yield* newWave(studyId);
            // A second version of the study's OWN line: the team-scoped key
            // admits it, and only the wave's pin says the session never ran it.
            const secondVersionId = yield* newVersion(protocolOf[TEAM_A], 2);
            const refused =
              'an interview session must pin the protocol version its wave pins';

            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_sessions',
                  sessionRow(studyId, waveId, {
                    protocol_version_id: secondVersionId,
                  }),
                ),
              )).message,
            ).toContain(refused);

            // A wave that pins nothing takes no sessions at all.
            const unpinnedWaveId = yield* newWave(studyId, {
              wave_number: 2,
              protocol_version_id: null,
            });
            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_sessions',
                  sessionRow(studyId, unpinnedWaveId),
                ),
              )).message,
            ).toContain(refused);

            // The session copies the wave's pin, and keeps its copy when the
            // wave moves on: that is the whole reason it carries one.
            const sessionId = yield* newSession(studyId, waveId);
            expect(
              yield* ownerAffected(
                `UPDATE study_waves SET protocol_version_id = $2 WHERE id = $1`,
                [waveId, secondVersionId],
              ),
            ).toBe(1);
            const stored = yield* ownerRows<{ protocol_version_id: string }>(
              `SELECT protocol_version_id FROM interview_sessions WHERE id = $1`,
              [sessionId],
            );
            expect(stored[0]?.protocol_version_id).toBe(versionOf[TEAM_A]);
          }),
        );

        it.effect(
          'refuses a link that opens another wave or another participant',
          () =>
            Effect.gen(function* () {
              const { studyId, waveId, participantId } = yield* newTrio();
              const otherWaveId = yield* newWave(studyId, { wave_number: 2 });
              const otherParticipantId = yield* newParticipant(studyId);
              const link = Effect.fnUntraced(function* (overrides: Row) {
                const row = linkRow(studyId, waveId, overrides);
                yield* ownerInsert('interview_links', row);
                return row.id as string;
              });
              const ownLink = yield* link({
                kind: 'participant',
                participant_id: participantId,
              });
              const otherWaveLink = yield* link({
                wave_id: otherWaveId,
                kind: 'participant',
                participant_id: participantId,
              });
              const otherParticipantLink = yield* link({
                kind: 'participant',
                participant_id: otherParticipantId,
              });
              const openLink = yield* link({});
              const refused =
                "an interview session's link must open its own wave for its own participant";

              // All four links are the team's, so the key admits them; the
              // session must open this wave for this participant, or for any
              // visitor.
              expect(
                (yield* refusalOf(
                  newSession(studyId, waveId, {
                    participant_id: participantId,
                    link_id: otherWaveLink,
                  }),
                )).message,
              ).toContain(refused);
              expect(
                (yield* refusalOf(
                  newSession(studyId, waveId, {
                    participant_id: participantId,
                    link_id: otherParticipantLink,
                  }),
                )).message,
              ).toContain(refused);
              expect(
                (yield* refusalOf(
                  newSession(studyId, waveId, {
                    participant_id: participantId,
                    link_id: openLink,
                  }),
                )).message,
              ).toContain(refused);
              expect(
                (yield* refusalOf(
                  newSession(studyId, waveId, { link_id: ownLink }),
                )).message,
              ).toContain(refused);
              const sessionId = yield* newSession(studyId, waveId, {
                participant_id: participantId,
                link_id: ownLink,
              });
              // A live session is never rebound to another link, nor cut loose
              // from its own: the originating link is part of the session's
              // identity.
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE interview_sessions SET link_id = $2 WHERE id = $1`,
                    [sessionId, otherWaveLink],
                  ),
                )).message,
              ).toContain(
                'interview session identity and version pin are immutable',
              );
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE interview_sessions SET link_id = NULL WHERE id = $1`,
                    [sessionId],
                  ),
                )).message,
              ).toContain(
                'interview session identity and version pin are immutable',
              );
              // An anonymous visitor through the open link.
              expect(
                yield* newSession(studyId, waveId, { link_id: openLink }),
              ).toMatch(/^[0-9a-f-]{36}$/);
            }),
        );

        it.effect('refuses a session whose team disagrees with its wave', () =>
          Effect.gen(function* () {
            const { studyId, waveId } = yield* newTrio();
            const refusal = yield* refusalOf(
              ownerInsert(
                'interview_sessions',
                sessionRow(studyId, waveId, {
                  team_id: TEAM_B,
                  protocol_version_id: versionOf[TEAM_B],
                }),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "study_waves"',
            );
          }),
        );

        it.effect('allows one live session per participant per wave', () =>
          Effect.gen(function* () {
            const { studyId, waveId, participantId } = yield* newTrio();
            yield* newSession(studyId, waveId, {
              participant_id: participantId,
            });

            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_sessions',
                  sessionRow(studyId, waveId, {
                    participant_id: participantId,
                  }),
                ),
              )).constraint,
            ).toBe('interview_sessions_wave_id_participant_id_idx');

            // The index is partial, so anonymous sessions are unlimited.
            expect(
              yield* ownerInsert(
                'interview_sessions',
                sessionRow(studyId, waveId),
              ),
            ).toBe(1);
            expect(
              yield* ownerInsert(
                'interview_sessions',
                sessionRow(studyId, waveId),
              ),
            ).toBe(1);
          }),
        );

        it.effect(
          'freezes a finalized session and erases it only under its own marker',
          () =>
            Effect.gen(function* () {
              const { studyId, waveId, participantId } = yield* newTrio();
              const sessionId = yield* newSession(studyId, waveId, {
                participant_id: participantId,
              });
              const bystander = yield* newParticipant(studyId);

              // Finalizing is itself an ordinary update — paired with the
              // snapshot the deferred completion guard requires of it.
              yield* finalize(sessionId);

              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE interview_sessions SET last_activity_at = now() WHERE id = $1`,
                    [sessionId],
                  ),
                )).message,
              ).toContain('finalized interview sessions are immutable');
              expect(
                (yield* refusalOf(
                  tenantAffected(
                    TEAM_A,
                    `DELETE FROM interview_sessions WHERE id = $1`,
                    [sessionId],
                  ),
                )).message,
              ).toContain(
                'interview sessions are deleted only by an audited erasure or the maintenance purge',
              );
              expect(
                (yield* refusalOf(
                  erasing(
                    TEAM_A,
                    bystander,
                    `DELETE FROM interview_sessions WHERE id = $1`,
                    [sessionId],
                  ),
                )).message,
              ).toContain(
                'interview sessions are deleted only by an audited erasure or the maintenance purge',
              );
              // Bottom-up, the order every delete path follows: the snapshot the
              // finalization had to write is the session's child, and no key
              // cascades.
              yield* erasing(
                TEAM_A,
                participantId,
                `DELETE FROM session_snapshots WHERE session_id = $1`,
                [sessionId],
              );
              expect(
                yield* erasing(
                  TEAM_A,
                  participantId,
                  `DELETE FROM interview_sessions WHERE id = $1`,
                  [sessionId],
                ),
              ).toBe(1);
            }),
        );

        it.effect(
          'holds the identity and version pin of a live session immutable',
          () =>
            Effect.gen(function* () {
              const { studyId, waveId } = yield* newTrio();
              const otherWaveId = yield* newWave(studyId, { wave_number: 2 });
              const sessionId = yield* newSession(studyId, waveId);

              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE interview_sessions SET wave_id = $2 WHERE id = $1`,
                    [sessionId, otherWaveId],
                  ),
                )).message,
              ).toContain(
                'interview session identity and version pin are immutable',
              );
              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE interview_sessions SET started_at = now() WHERE id = $1`,
                    [sessionId],
                  ),
                )).message,
              ).toContain(
                'interview session identity and version pin are immutable',
              );
              expect(
                yield* ownerAffected(
                  `UPDATE interview_sessions SET current_stage_index = 3 WHERE id = $1`,
                  [sessionId],
                ),
              ).toBe(1);
            }),
        );

        it.effect('refuses writes under a closed study', () =>
          Effect.gen(function* () {
            const { studyId, waveId } = yield* newTrio();
            const sessionId = yield* newSession(studyId, waveId);
            yield* closeStudy(studyId);

            expect(
              (yield* refusalOf(
                ownerInsert('interview_sessions', sessionRow(studyId, waveId)),
              )).message,
            ).toContain('closed studies are read-only');
            expect(
              (yield* refusalOf(
                ownerAffected(
                  `UPDATE interview_sessions SET current_stage_index = 1 WHERE id = $1`,
                  [sessionId],
                ),
              )).message,
            ).toContain('closed studies are read-only');
          }),
        );
      });

      describe('interview_links', () => {
        it.effect('applies the documented defaults', () =>
          Effect.gen(function* () {
            const { studyId, waveId } = yield* newTrio();
            const row = linkRow(studyId, waveId);
            yield* ownerInsert('interview_links', row);

            const stored = yield* ownerRows<Row>(
              `SELECT kind, participant_id, expires_at, revoked_at, redemption_count,
                      last_redeemed_at, created_by_user_id
               FROM interview_links WHERE id = $1`,
              [row.id],
            );
            expect(stored[0]).toEqual({
              kind: 'anonymous',
              participant_id: null,
              expires_at: null,
              revoked_at: null,
              redemption_count: 0,
              last_redeemed_at: null,
              created_by_user_id: null,
            });
          }),
        );

        it.effect.each<CheckCase>([
          ['an unknown kind', { kind: 'magic' }, 'interview_links_kind_check'],
          [
            'a negative redemption count',
            { redemption_count: -1 },
            'interview_links_redemption_count_check',
          ],
          [
            'a redemption count with no redemption timestamp',
            { redemption_count: 1 },
            'interview_links_redemption_count_check',
          ],
          [
            'a redemption timestamp with no count',
            { last_redeemed_at: new Date() },
            'interview_links_redemption_count_check',
          ],
          [
            'a token hash that is not 32 bytes',
            { token_hash: randomBytes(31) },
            'interview_links_token_hash_check',
          ],
        ])('rejects %s', ([, overrides, constraint]) =>
          Effect.gen(function* () {
            const { studyId, waveId } = yield* newTrio();
            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_links',
                  linkRow(studyId, waveId, overrides),
                ),
              )).constraint,
            ).toBe(constraint);
          }),
        );

        it.effect('binds the link kind to the presence of a participant', () =>
          Effect.gen(function* () {
            const { studyId, waveId, participantId } = yield* newTrio();

            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_links',
                  linkRow(studyId, waveId, { kind: 'participant' }),
                ),
              )).constraint,
            ).toBe('interview_links_kind_check');
            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_links',
                  linkRow(studyId, waveId, {
                    kind: 'anonymous',
                    participant_id: participantId,
                  }),
                ),
              )).constraint,
            ).toBe('interview_links_kind_check');
            expect(
              yield* ownerInsert(
                'interview_links',
                linkRow(studyId, waveId, {
                  kind: 'participant',
                  participant_id: participantId,
                }),
              ),
            ).toBe(1);
          }),
        );

        it.effect(
          'allows one live participant link per wave, and a reissue after revocation',
          () =>
            Effect.gen(function* () {
              const { studyId, waveId, participantId } = yield* newTrio();
              const first = linkRow(studyId, waveId, {
                kind: 'participant',
                participant_id: participantId,
              });
              yield* ownerInsert('interview_links', first);

              expect(
                (yield* refusalOf(
                  ownerInsert(
                    'interview_links',
                    linkRow(studyId, waveId, {
                      kind: 'participant',
                      participant_id: participantId,
                    }),
                  ),
                )).constraint,
              ).toBe('interview_links_live_participant_idx');

              yield* ownerAffected(
                `UPDATE interview_links SET revoked_at = now() WHERE id = $1`,
                [first.id],
              );
              expect(
                yield* ownerInsert(
                  'interview_links',
                  linkRow(studyId, waveId, {
                    kind: 'participant',
                    participant_id: participantId,
                  }),
                ),
              ).toBe(1);
            }),
        );

        it.effect('refuses a duplicate token hash inside a team', () =>
          Effect.gen(function* () {
            const { studyId, waveId } = yield* newTrio();
            const tokenHash = randomBytes(32);
            yield* ownerInsert(
              'interview_links',
              linkRow(studyId, waveId, { token_hash: tokenHash }),
            );

            expect(
              (yield* refusalOf(
                ownerInsert(
                  'interview_links',
                  linkRow(studyId, waveId, { token_hash: tokenHash }),
                ),
              )).constraint,
            ).toBe('interview_links_team_id_token_hash_idx');
          }),
        );

        it.effect('refuses a link whose wave belongs to another study', () =>
          Effect.gen(function* () {
            const studyA = yield* newStudy();
            const waveA = yield* newWave(studyA);
            const studyB = yield* newStudy();

            const refusal = yield* refusalOf(
              ownerInsert('interview_links', linkRow(studyB, waveA)),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "study_waves"',
            );
          }),
        );

        it.effect(
          'holds the token and identity immutable, and erases with its participant',
          () =>
            Effect.gen(function* () {
              const { studyId, waveId, participantId } = yield* newTrio();
              const row = linkRow(studyId, waveId, {
                kind: 'participant',
                participant_id: participantId,
              });
              yield* ownerInsert('interview_links', row);
              const bystander = yield* newParticipant(studyId);

              expect(
                (yield* refusalOf(
                  ownerAffected(
                    `UPDATE interview_links SET token_hash = $2 WHERE id = $1`,
                    [row.id, randomBytes(32)],
                  ),
                )).message,
              ).toContain('interview link identity and token are immutable');
              expect(
                yield* ownerAffected(
                  `UPDATE interview_links SET expires_at = now() WHERE id = $1`,
                  [row.id],
                ),
              ).toBe(1);

              expect(
                (yield* refusalOf(
                  tenantAffected(
                    TEAM_A,
                    `DELETE FROM interview_links WHERE id = $1`,
                    [row.id],
                  ),
                )).message,
              ).toContain(
                'interview links are deleted only by an audited erasure or the maintenance purge',
              );
              expect(
                (yield* refusalOf(
                  erasing(
                    TEAM_A,
                    bystander,
                    `DELETE FROM interview_links WHERE id = $1`,
                    [row.id],
                  ),
                )).message,
              ).toContain(
                'interview links are deleted only by an audited erasure or the maintenance purge',
              );
              expect(
                yield* erasing(
                  TEAM_A,
                  participantId,
                  `DELETE FROM interview_links WHERE id = $1`,
                  [row.id],
                ),
              ).toBe(1);
            }),
        );
      });
    },
  );
});
