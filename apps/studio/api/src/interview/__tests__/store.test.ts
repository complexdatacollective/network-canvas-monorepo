import { randomBytes, randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Option, Redacted, Schema } from 'effect';
import { describe, expect, test } from 'vitest';

import {
  LinkToken,
  SessionToken,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

import {
  ownerRows,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { TenantScope } from '../../db/tenant.ts';
import { presentedTokenTeamAccess } from '../access.ts';
import {
  advanceRevision,
  claimHolder,
  findLinkByTokenHash,
  findOrCreateSession,
  findSessionByTokenHash,
  issueSessionToken,
  recordRedemption,
} from '../store.ts';
import { mintSessionToken, parsePresentedToken } from '../token.ts';
import {
  completeSession,
  insertSession,
  type InterviewFixture,
  seedInterviewFixture,
  tokenFor,
} from './fixture.ts';

const secretHashOf = (token: Redacted.Redacted) =>
  Option.getOrThrow(parsePresentedToken(token)).secretHash;

describe('a presented token', () => {
  test('parses back to the team and the hash it was minted with', () => {
    const minted = mintSessionToken('team.with.dots');
    expect(parsePresentedToken(minted.token)).toEqual(
      Option.some({ teamId: 'team.with.dots', secretHash: minted.secretHash }),
    );
  });

  test('fits the token schemas for the longest valid team id', () => {
    const teamId = Schema.decodeUnknownSync(TeamId)('t'.repeat(255));
    const minted = mintSessionToken(teamId);
    expect(Schema.is(SessionToken)(minted.token)).toBe(true);
    expect(Schema.is(LinkToken)(minted.token)).toBe(true);
    expect(parsePresentedToken(minted.token)).toEqual(
      Option.some({ teamId, secretHash: minted.secretHash }),
    );
  });

  test.each([
    ['no separator', randomBytes(32).toString('base64url')],
    ['no team', `.${randomBytes(32).toString('base64url')}`],
    ['a short secret', `team.${randomBytes(31).toString('base64url')}`],
    ['a secret that is not base64url', `team.${'+'.repeat(43)}`],
  ])('refuses %s', (_label, token) => {
    expect(parsePresentedToken(Redacted.make(token))).toEqual(Option.none());
  });
});

const sessionRow = (sessionId: string) =>
  Effect.map(
    ownerRows<{
      holder_id: string | null;
      holder_epoch: string;
      client_revision: string;
      last_activity_at: Date;
    }>(
      `SELECT holder_id, holder_epoch::text AS holder_epoch,
              client_revision::text AS client_revision, last_activity_at
       FROM interview_sessions WHERE id = $1`,
      [sessionId],
    ),
    (rows) => rows[0],
  );

const openFor = (fixture: InterviewFixture, participantId: string | null) => ({
  linkId:
    participantId === null ? fixture.anonymousLink.id : fixture.managedLink.id,
  studyId: fixture.studyId,
  waveId: fixture.waveId,
  participantId,
  protocolVersionId: fixture.versionId,
});

describe.skipIf(!testDb)('the interview store', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })('', (it) => {
    describe('link lookup', () => {
      it.effect('finds a link by its token hash, with its study and wave', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const link = yield* TenantScope.open(
            fixture.access,
            findLinkByTokenHash(secretHashOf(fixture.managedLink.token)),
          );
          expect(
            link?.participantCode && Redacted.value(link.participantCode),
          ).toBe(fixture.participantCode);
          expect(link).toEqual({
            linkId: fixture.managedLink.id,
            studyId: fixture.studyId,
            waveId: fixture.waveId,
            participantId: fixture.participantId,
            expiresAt: null,
            revokedAt: null,
            studyState: 'live',
            studyPausedAt: null,
            pauseGraceMinutes: 60,
            participationMode: 'managed',
            protocolVersionId: fixture.versionId,
            waveOpensAt: null,
            waveClosesAt: null,
            participantCode: expect.anything(),
          });
        }).pipe(Effect.orDie),
      );

      it.effect('finds nothing for an unknown hash or another team', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const other = yield* seedInterviewFixture();
          expect(
            yield* TenantScope.open(
              fixture.access,
              findLinkByTokenHash(randomBytes(32)),
            ),
          ).toBeNull();
          expect(
            yield* TenantScope.open(
              other.access,
              findLinkByTokenHash(secretHashOf(fixture.managedLink.token)),
            ),
          ).toBeNull();
        }).pipe(Effect.orDie),
      );

      it.effect('counts each redemption', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const record = TenantScope.open(
            fixture.access,
            recordRedemption(fixture.managedLink.id),
          );
          expect(yield* record).toBe(1);
          expect(yield* record).toBe(2);
          const rows = yield* ownerRows<{ last_redeemed_at: Date | null }>(
            'SELECT last_redeemed_at FROM interview_links WHERE id = $1',
            [fixture.managedLink.id],
          );
          expect(rows[0]?.last_redeemed_at).toBeInstanceOf(Date);
        }).pipe(Effect.orDie),
      );
    });

    describe('opening a session', () => {
      it.effect('gives a managed participant one session however often', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const open = TenantScope.open(
            fixture.access,
            findOrCreateSession(openFor(fixture, fixture.participantId)),
          );
          const first = yield* open;
          const second = yield* open;
          expect(first).toEqual({
            sessionId: first.sessionId,
            status: 'in_progress',
            created: true,
          });
          expect(second).toEqual({ ...first, created: false });
          const rows = yield* ownerRows(
            'SELECT id FROM interview_sessions WHERE wave_id = $1',
            [fixture.waveId],
          );
          expect(rows).toHaveLength(1);
        }).pipe(Effect.orDie),
      );

      it.effect('gives each anonymous redemption its own session', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const open = TenantScope.open(
            fixture.access,
            findOrCreateSession(openFor(fixture, null)),
          );
          const first = yield* open;
          const second = yield* open;
          expect(first.created && second.created).toBe(true);
          expect(second.sessionId).not.toBe(first.sessionId);
        }).pipe(Effect.orDie),
      );
    });

    describe('the session token', () => {
      it.effect('resolves to its session, with the participant code', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          const token = yield* tokenFor(fixture, sessionId);
          const found = yield* TenantScope.open(
            fixture.access,
            findSessionByTokenHash(secretHashOf(token)),
          );
          expect(
            found?.participantCode && Redacted.value(found.participantCode),
          ).toBe(fixture.participantCode);
          expect(found).toEqual({
            sessionId,
            studyId: fixture.studyId,
            holderEpoch: 0,
            status: 'in_progress',
            participantCode: expect.anything(),
          });
        }).pipe(Effect.orDie),
      );

      it.effect('still resolves once the session is completed', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          const token = yield* tokenFor(fixture, sessionId);
          yield* completeSession(sessionId);
          const found = yield* TenantScope.open(
            fixture.access,
            findSessionByTokenHash(secretHashOf(token)),
          );
          expect(found?.status).toBe('completed');
        }).pipe(Effect.orDie),
      );

      it.effect('is not issued to a completed session', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          yield* completeSession(sessionId);
          expect(
            yield* TenantScope.open(
              fixture.access,
              issueSessionToken(sessionId, randomBytes(32)),
            ),
          ).toBe(false);
        }).pipe(Effect.orDie),
      );

      it.effect('replaces the previous token when reissued', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          const first = yield* tokenFor(fixture, sessionId);
          const second = yield* tokenFor(fixture, sessionId);
          const find = (token: Redacted.Redacted) =>
            TenantScope.open(
              fixture.access,
              findSessionByTokenHash(secretHashOf(token)),
            );
          expect(yield* find(first)).toBeNull();
          expect((yield* find(second))?.sessionId).toBe(sessionId);
        }).pipe(Effect.orDie),
      );

      it.effect('finds nothing under another team', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const other = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          const token = yield* tokenFor(fixture, sessionId);
          expect(
            yield* TenantScope.open(
              presentedTokenTeamAccess(other.teamId),
              findSessionByTokenHash(secretHashOf(token)),
            ),
          ).toBeNull();
        }).pipe(Effect.orDie),
      );
    });

    describe('takeover', () => {
      it.effect('bumps the epoch for a new holder and not for a refetch', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          const claim = (holderId: string) =>
            TenantScope.open(fixture.access, claimHolder(sessionId, holderId));

          expect(yield* claim('page-a')).toEqual({
            holderEpoch: 1,
            claimed: true,
          });
          expect(yield* claim('page-a')).toEqual({
            holderEpoch: 1,
            claimed: false,
          });
          expect(yield* claim('page-b')).toEqual({
            holderEpoch: 2,
            claimed: true,
          });
          expect((yield* sessionRow(sessionId))?.holder_id).toBe('page-b');
        }).pipe(Effect.orDie),
      );

      it.effect('does not claim a completed session', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          yield* completeSession(sessionId);
          expect(
            yield* TenantScope.open(
              fixture.access,
              claimHolder(sessionId, 'page-a'),
            ),
          ).toEqual({ holderEpoch: 0, claimed: false });
        }).pipe(Effect.orDie),
      );

      it.effect('reports no session for an unknown id', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          expect(
            yield* TenantScope.open(
              fixture.access,
              claimHolder(randomUUID(), 'page-a'),
            ),
          ).toBeNull();
        }).pipe(Effect.orDie),
      );
    });

    describe('the revision compare-and-set', () => {
      it.effect('applies a newer revision under the current epoch', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          expect(
            yield* TenantScope.open(
              fixture.access,
              advanceRevision(sessionId, { holderEpoch: 0, revision: 3n }),
            ),
          ).toEqual({ _tag: 'Applied', revision: 3n });
          expect((yield* sessionRow(sessionId))?.client_revision).toBe('3');
        }).pipe(Effect.orDie),
      );

      it.effect('leaves the row untouched for a replayed revision', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          const advance = (revision: bigint) =>
            TenantScope.open(
              fixture.access,
              advanceRevision(sessionId, { holderEpoch: 0, revision }),
            );
          yield* advance(3n);
          const before = yield* sessionRow(sessionId);
          expect(yield* advance(3n)).toEqual({
            _tag: 'Replayed',
            revision: 3n,
          });
          expect(yield* advance(2n)).toEqual({
            _tag: 'Replayed',
            revision: 3n,
          });
          expect(yield* sessionRow(sessionId)).toEqual(before);
        }).pipe(Effect.orDie),
      );

      it.effect('refuses a stale epoch and writes nothing', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          yield* TenantScope.open(
            fixture.access,
            claimHolder(sessionId, 'page-b'),
          );
          const before = yield* sessionRow(sessionId);
          expect(
            yield* TenantScope.open(
              fixture.access,
              advanceRevision(sessionId, { holderEpoch: 0, revision: 5n }),
            ),
          ).toEqual({ _tag: 'TakenOver', holderEpoch: 1 });
          expect(yield* sessionRow(sessionId)).toEqual(before);
        }).pipe(Effect.orDie),
      );

      it.effect('reports a completed session as ended', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          yield* completeSession(sessionId);
          expect(
            yield* TenantScope.open(
              fixture.access,
              advanceRevision(sessionId, { holderEpoch: 0, revision: 1n }),
            ),
          ).toEqual({ _tag: 'Ended', status: 'completed' });
        }).pipe(Effect.orDie),
      );

      it.effect('reports an unknown session as missing', () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          expect(
            yield* TenantScope.open(
              fixture.access,
              advanceRevision(randomUUID(), { holderEpoch: 0, revision: 1n }),
            ),
          ).toEqual({ _tag: 'Missing' });
        }).pipe(Effect.orDie),
      );
    });
  });
});
