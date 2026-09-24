// The study sidebar's counts end to end: study id → the team resolved from the
// caller's memberships (`requireStudy`) → TenantScope → one statement over the
// study's own rows.
//
// It runs against the seeded corpus rather than hand-built fixtures because
// the numbers only mean something in a database that holds several teams,
// several studies per team, and a protocol line shared between them: every
// case below would pass on a single-study fixture even if the query forgot its
// `study_id` predicate entirely.
import { randomUUID } from 'node:crypto';

import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StudyId } from '@codaco/studio-contract/schema/ids';

import { seed } from '../../scripts/seed/seed.ts';
import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import {
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import { readEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import {
  openTestDatabase,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { testKeyring } from './support/secrets.ts';

// Seeding the whole model takes seconds; this file seeds once, in beforeAll.
const SEEDING_TIMEOUT_MS = 180_000;

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'counts-user',
  email: 'counts@example.com',
  emailVerified: true,
  name: 'Counting Researcher',
  locale: null,
  sessionId: 'counts-session',
};

type SeededStudy = { id: string; teamId: string; protocolId: string | null };

describe.skipIf(!testDb)('studies.counts', () => {
  /**
   * The scratch schema and the Effect data layer over it, which is what every
   * `/rpc` handler runs its reads and writes on. Shared by every Studio rather
   * than built per Studio: the clients underneath it are connection pools.
   */
  let database: TestDatabaseRuntime;
  /** An Admin of the study's team: sees every study the team owns. */
  let client: RpcTestClient;
  /** A plain Member of the same team holding no study-role grant. */
  let ungrantedClient: RpcTestClient;
  let anonymousClient: RpcTestClient;
  /** The team the caller is a member of. */
  let memberTeamId: string;
  let collectingStudy: SeededStudy;
  let otherTeamStudy: SeededStudy;

  /** One scalar, as its own statement: the oracle never reuses the handler's SQL. */
  const count = async (sql: string, values: unknown[]): Promise<number> => {
    const rows = await database.run(ownerRows<{ n: number }>(sql, values));
    return rows[0]?.n ?? -1;
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(seed({ secrets: testKeyring() }));

    // The managed study with the most collected sessions, so every count under
    // test is non-zero: an assertion that 0 equals 0 would hold however wrong
    // the query is, and only a managed study enrols participants at all. Its
    // team is the one the caller belongs to.
    const busiest = await database.run(
      ownerRows<SeededStudy>(
        `select s.id, s.team_id as "teamId", s.protocol_id as "protocolId"
       from studies s
       where s.participation_mode = 'managed'
       order by (select count(*) from interview_sessions i
                  where i.study_id = s.id) desc, s.id
       limit 1`,
      ),
    );
    collectingStudy = busiest[0]!;
    memberTeamId = collectingStudy.teamId;

    const other = await database.run(
      ownerRows<SeededStudy>(
        `select s.id, s.team_id as "teamId", s.protocol_id as "protocolId"
         from studies s where s.team_id <> $1 order by s.id limit 1`,
        [memberTeamId],
      ),
    );
    otherTeamStudy = other[0]!;

    // The same person under two team roles: the visibility rule (#1257) is a
    // property of the role, and it is the role that decides whether a count
    // exists for them at all.
    const memberOf = (role: string) =>
      stubAuthService({
        getSession: () => Promise.resolve(PRINCIPAL),
        getMembership: (_userId, teamId) =>
          Promise.resolve(teamId === memberTeamId ? { role } : null),
        listMemberships: () =>
          Promise.resolve([{ teamId: memberTeamId, role }]),
      });
    client = await createRpcClient(
      createStudio(readEnv(), {
        auth: memberOf('admin'),
        pool: database.appPool,
        services: database.services,
      }),
    );
    ungrantedClient = await createRpcClient(
      createStudio(readEnv(), {
        auth: memberOf('member'),
        pool: database.appPool,
        services: database.services,
      }),
    );
    anonymousClient = await createRpcClient(
      createStudio(readEnv(), {
        auth: stubAuthService(),
        pool: database.appPool,
        services: database.services,
      }),
    );
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    await client.dispose();
    await ungrantedClient.dispose();
    await anonymousClient.dispose();
    await database.dispose();
  });

  it('counts the rows of that study, recomputed one table at a time', async () => {
    const counts = await client.call(
      client.rpc('studies.counts', {
        studyId: StudyId.make(collectingStudy.id),
      }),
    );

    // Four separate statements, each the plain definition of its destination —
    // a second expression of the answer rather than the handler's own query
    // run twice.
    expect(counts).toEqual({
      versions: await count(
        `select count(*)::int as n from protocol_versions
         where protocol_id = $1 and team_id = $2`,
        [collectingStudy.protocolId, memberTeamId],
      ),
      participants: await count(
        `select count(*)::int as n from participants where study_id = $1`,
        [collectingStudy.id],
      ),
      waves: await count(
        `select count(*)::int as n from study_waves where study_id = $1`,
        [collectingStudy.id],
      ),
      sessions: await count(
        `select count(*)::int as n from interview_sessions where study_id = $1`,
        [collectingStudy.id],
      ),
    });
    // The equality above is only worth having if all four are real numbers.
    expect(counts.versions).toBeGreaterThan(0);
    expect(counts.participants).toBeGreaterThan(0);
    expect(counts.waves).toBeGreaterThan(0);
    expect(counts.sessions).toBeGreaterThan(0);
  });

  it('counts one study rather than the team, which shares a protocol line', async () => {
    const counts = await client.call(
      client.rpc('studies.counts', {
        studyId: StudyId.make(collectingStudy.id),
      }),
    );

    // The seed gives every study of a team the same protocol line, so a query
    // that dropped its `study_id` predicate would still agree with the oracle
    // on `versions` while silently reporting the team's totals for the other
    // three. These are the totals it must NOT return.
    const teamParticipants = await count(
      `select count(*)::int as n from participants where team_id = $1`,
      [memberTeamId],
    );
    const teamSessions = await count(
      `select count(*)::int as n from interview_sessions where team_id = $1`,
      [memberTeamId],
    );
    const teamWaves = await count(
      `select count(*)::int as n from study_waves where team_id = $1`,
      [memberTeamId],
    );
    expect(counts.participants).toBeLessThan(teamParticipants);
    expect(counts.sessions).toBeLessThan(teamSessions);
    expect(counts.waves).toBeLessThan(teamWaves);
  });

  it('reports no versions for a study with no protocol line yet', async () => {
    // A Draft study before a protocol is chosen: `protocol_id` is null, so
    // nothing is published against it. Zero is the true answer, and the row
    // must still be found — an absent study and an empty one are different.
    const studyId = StudyId.make(randomUUID());
    await database.run(
      TenantScope.open(
        unsafeMakeTeamAccess(memberTeamId, 'owner'),
        Effect.flatMap(Transaction, ({ sql }) =>
          sql.unsafe(
            `insert into studies (id, team_id, name) values ($1, $2, $3)`,
            [studyId, memberTeamId, 'Study without a protocol line'],
          ),
        ),
      ),
    );

    await expect(
      client.call(client.rpc('studies.counts', { studyId })),
    ).resolves.toEqual({
      versions: 0,
      participants: 0,
      waves: 0,
      sessions: 0,
    });
  });

  it('refuses a study of another team and an unknown study alike', async () => {
    // The tenancy claim: a real study of a team the caller is not in reads
    // exactly like a study that never existed — the refusal `studies.get`
    // gives, so a count is never an existence oracle. That the study is real
    // is asserted first, so the refusal below is about tenancy rather than a
    // mistyped fixture.
    await expect(
      count(`select count(*)::int as n from studies where id = $1`, [
        otherTeamStudy.id,
      ]),
    ).resolves.toBe(1);

    await expectRpcFailure(
      client.callExit(
        client.rpc('studies.counts', {
          studyId: StudyId.make(otherTeamStudy.id),
        }),
      ),
      'Forbidden',
    );

    await expectRpcFailure(
      client.callExit(
        client.rpc('studies.counts', { studyId: StudyId.make(randomUUID()) }),
      ),
      'Forbidden',
    );
  });

  it('refuses a team member the study is not shown to', async () => {
    // A Member sees only the studies they hold a study-role grant on (#1257),
    // and this one holds none: the numbers must not exist for them either,
    // or the sidebar would describe a study they cannot open.
    await expectRpcFailure(
      ungrantedClient.callExit(
        ungrantedClient.rpc('studies.counts', {
          studyId: StudyId.make(collectingStudy.id),
        }),
      ),
      'Forbidden',
    );
  });

  it('refuses without a session', async () => {
    await expectRpcFailure(
      anonymousClient.callExit(
        anonymousClient.rpc('studies.counts', {
          studyId: StudyId.make(collectingStudy.id),
        }),
      ),
      'Unauthorized',
    );
  });
});
