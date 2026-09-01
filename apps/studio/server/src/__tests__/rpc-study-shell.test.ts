// The study shell's tenancy resolver end to end (app-shell design §6.3): an
// input carrying no teamId → the caller's own membership ids → a team-pinned
// probe → one snapshot of everything the study chrome renders.
//
// Two of these tests read the statements the resolver actually issued. That is
// the only way to assert the rule the design states, which is about ordering
// rather than about results: before a TenantDb is pinned, nothing but the
// caller's memberships may be read. A resolver that answered correctly while
// reading a study name first would pass every value assertion here.
import { randomUUID } from 'node:crypto';

import { ORPCError, safe } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type contract, STUDY_LIST_CAP } from '@codaco/studio-rpc';

import { createApp } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const db = await reachableDb();

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'shell-user',
  email: 'researcher@example.com',
  emailVerified: true,
  name: 'Researcher',
  sessionId: 'shell-session',
  activeTeamId: null,
};

const OWNER_PERMISSIONS = ['audit.read', 'audit.export'];

/** One statement, tagged with the connection it ran on; 0 is the pool itself. */
type Statement = { connection: number; text: string };

/**
 * A pool that records the statements issued through it, preserving which
 * connection each ran on. Connection identity is what makes the pinning rule
 * checkable: `SET LOCAL app.team_id` is transaction-local, so a statement is
 * pinned exactly when its own connection opened with one.
 */
function recordingPool(pool: pg.Pool, log: Statement[]): pg.Pool {
  let connections = 0;
  const record =
    (
      run: (text: string, values?: unknown[]) => Promise<pg.QueryResult>,
      connection: number,
    ) =>
    (text: unknown, values?: unknown[]) => {
      if (typeof text !== 'string') {
        // Not a limitation to work around: the Studio data layer issues string
        // statements only, and a config-object call would slip past this log.
        throw new Error('recorded pool received a non-string statement');
      }
      log.push({ connection, text });
      return run(text, values);
    };

  const wrap = <T extends object>(
    target: T,
    run: (text: string, values?: unknown[]) => Promise<pg.QueryResult>,
    connection: number,
    onConnect?: () => Promise<pg.PoolClient>,
  ): T =>
    new Proxy(target, {
      get(receiverTarget, property, receiver) {
        if (property === 'query') return record(run, connection);
        if (property === 'connect' && onConnect) return onConnect;
        const value: unknown = Reflect.get(receiverTarget, property, receiver);
        return typeof value === 'function' ? value.bind(receiverTarget) : value;
      },
    });

  return wrap(
    pool,
    (text, values) => pool.query(text, values),
    0,
    async () => {
      const client = await pool.connect();
      connections += 1;
      return wrap(
        client,
        (text, values) => client.query(text, values),
        connections,
      );
    },
  );
}

/** The teams pinned during a recorded call, in the order they were probed. */
function pinnedTeams(log: readonly Statement[]): string[] {
  return log.flatMap(
    (statement) =>
      statement.text.match(/SET LOCAL app\.team_id = '(.+)'/)?.[1] ?? [],
  );
}

/**
 * Everything a caller can observe about a refusal. The HTTP status is not
 * listed because oRPC derives it from the code, which is.
 */
function refusal(error: unknown): Record<string, unknown> {
  if (!(error instanceof ORPCError)) {
    throw new Error(`expected an oRPC refusal, got ${String(error)}`);
  }
  return {
    code: error.code,
    message: error.message,
    data: error.data,
    defined: error.defined,
  };
}

describe.skipIf(!db)('study.shell', () => {
  let dispose: () => Promise<void>;
  let ownerPool: pg.Pool;
  let client: RouterContractClient<typeof contract>;
  let anonymousClient: RouterContractClient<typeof contract>;
  let memberTeamIds: string[] = [];
  let activeTeamId: string | null = null;
  const statements: Statement[] = [];

  async function seedTeamRow(teamId: string, name: string): Promise<void> {
    await ownerPool.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, $2, $1)`,
      [teamId, name],
    );
  }

  /** A team the caller belongs to, and which their membership list names. */
  async function joinTeam(
    teamId: string,
    name: string,
    role: string,
  ): Promise<void> {
    await seedTeamRow(teamId, name);
    await ownerPool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, $4)`,
      [`membership-${teamId}`, teamId, PRINCIPAL.userId, role],
    );
    // Ascending, exactly as the real listMemberTeamIds returns them.
    memberTeamIds = [...memberTeamIds, teamId].toSorted();
  }

  async function seedStudy(
    teamId: string,
    name: string,
    createdAt: string,
  ): Promise<string> {
    const id = randomUUID();
    await ownerPool.query(
      `INSERT INTO protocols (id, team_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [id, teamId, name, createdAt],
    );
    return id;
  }

  async function seedVersion(
    studyId: string,
    teamId: string,
    versionNumber: number,
  ): Promise<void> {
    await ownerPool.query(
      `INSERT INTO protocol_versions
         (id, protocol_id, team_id, version_number, version_hash, manifest,
          schema_version, source_manifest_hash)
       VALUES ($1, $2, $3, $4, $5, $6, 8, $5)`,
      [
        randomUUID(),
        studyId,
        teamId,
        versionNumber,
        `hash-${studyId}-${versionNumber}`,
        JSON.stringify({}),
      ],
    );
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    dispose = scratch.dispose;
    ownerPool = scratch.pool;
    await provisionScratchSchema(scratch.pool);
    await scratch.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
    );
    const auth = stubAuthService({
      getSession: () => Promise.resolve({ ...PRINCIPAL, activeTeamId }),
      listMemberTeamIds: () => Promise.resolve(memberTeamIds),
    });
    client = createRpcClient(
      createApp(readEnv(), {
        auth,
        pool: recordingPool(scratch.app, statements),
      }),
    );
    anonymousClient = createRpcClient(
      createApp(readEnv(), { auth: stubAuthService(), pool: scratch.app }),
    );
  });
  afterAll(async () => {
    await dispose();
  });
  beforeEach(() => {
    activeTeamId = null;
    statements.length = 0;
    // Each test builds its own membership list. Sharing one would make the
    // probe-order assertions depend on which tests ran before them.
    memberTeamIds = [];
  });

  it('resolves a study from an input that names no team', async () => {
    await joinTeam('solo-team', 'Solo Team', 'owner');
    const studyId = await seedStudy(
      'solo-team',
      'Adolescent Networks',
      '2026-01-01T00:00:00Z',
    );

    await expect(client.study.shell({ studyId })).resolves.toEqual({
      study: { id: studyId, name: 'Adolescent Networks' },
      team: { id: 'solo-team', name: 'Solo Team', role: 'owner' },
      permissions: OWNER_PERMISSIONS,
      teamStudies: {
        items: [{ id: studyId, name: 'Adolescent Networks' }],
        hasMore: false,
      },
      // Absent, not zero: an unpublished study reports no version count.
      counts: {},
    });
  });

  it('reads nothing before a team is pinned', async () => {
    await joinTeam('pinning-team', 'Pinning Team', 'owner');
    const studyId = await seedStudy(
      'pinning-team',
      'Pinning',
      '2026-01-01T00:00:00Z',
    );
    await seedVersion(studyId, 'pinning-team', 1);
    statements.length = 0;

    await client.study.shell({ studyId });

    // Nothing ran on the pool itself: every statement took a connection.
    expect(statements.filter((entry) => entry.connection === 0)).toEqual([]);
    // And on every connection, the pin came first.
    const openings = new Map<number, string>();
    for (const entry of statements) {
      if (!openings.has(entry.connection)) {
        openings.set(entry.connection, entry.text);
      }
    }
    expect([...openings.values()]).toEqual(
      [...openings.values()].map(() =>
        expect.stringContaining("SET LOCAL app.team_id = 'pinning-team'"),
      ),
    );
    expect(openings.size).toBeGreaterThan(0);
    // The study, the team, the list and the count were all read after it.
    expect(
      statements.filter((entry) =>
        /\b(protocols|protocol_versions|teams|team_members)\b/.test(entry.text),
      ).length,
    ).toBe(4);
  });

  it('probes the session active team first and stops at the first hit', async () => {
    await joinTeam('probe-a', 'Probe A', 'member');
    await joinTeam('probe-b', 'Probe B', 'member');
    await joinTeam('probe-c', 'Probe C', 'member');
    const studyId = await seedStudy(
      'probe-c',
      'Last Team',
      '2026-01-01T00:00:00Z',
    );

    statements.length = 0;
    activeTeamId = 'probe-c';
    await client.study.shell({ studyId });
    expect(pinnedTeams(statements)).toEqual(['probe-c']);

    statements.length = 0;
    activeTeamId = null;
    await client.study.shell({ studyId });
    // Without an active team the probe walks the memberships in order, and a
    // miss costs exactly one pinned primary-key lookup.
    expect(pinnedTeams(statements)).toEqual(['probe-a', 'probe-b', 'probe-c']);
  });

  it('refuses a study in another team and a study that does not exist identically', async () => {
    await joinTeam('reachable-team', 'Reachable Team', 'owner');
    await seedTeamRow('unreachable-team', 'Unreachable Team');
    const elsewhere = await seedStudy(
      'unreachable-team',
      'Not Yours',
      '2026-01-01T00:00:00Z',
    );

    const otherTeam = await safe(client.study.shell({ studyId: elsewhere }));
    const nonexistent = await safe(
      client.study.shell({ studyId: randomUUID() }),
    );
    expect(refusal(otherTeam.error)).toMatchObject({ code: 'FORBIDDEN' });
    // Identical in every observable field, not merely in the code: the two
    // cases must be indistinguishable, so this is the existence oracle's test.
    expect(refusal(otherTeam.error)).toEqual(refusal(nonexistent.error));
  });

  it('refuses a study in a team the membership list names but the caller is not in', async () => {
    await seedTeamRow('unlisted-team', 'Unlisted Team');
    const studyId = await seedStudy(
      'unlisted-team',
      'Unlisted',
      '2026-01-01T00:00:00Z',
    );
    memberTeamIds = [...memberTeamIds, 'unlisted-team'].toSorted();

    // The team-pinned read is what authorizes, not the list that chose the
    // team to probe: with no membership row there is no team, role or
    // permission to report, so this is refused like any unreachable study.
    const { error } = await safe(client.study.shell({ studyId }));
    expect(refusal(error)).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses every study when the caller is in no team', async () => {
    await joinTeam('lonely-team', 'Lonely Team', 'owner');
    const studyId = await seedStudy(
      'lonely-team',
      'Lonely',
      '2026-01-01T00:00:00Z',
    );
    memberTeamIds = [];

    const { error } = await safe(client.study.shell({ studyId }));
    expect(refusal(error)).toMatchObject({ code: 'FORBIDDEN' });
    // Nothing was pinned, so nothing was read at all.
    expect(pinnedTeams(statements)).toEqual([]);
  });

  it('refuses without a session', async () => {
    const { error } = await safe(
      anonymousClient.study.shell({ studyId: randomUUID() }),
    );
    expect(refusal(error)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('reports the capabilities the role actually grants', async () => {
    await joinTeam('member-team', 'Member Team', 'member');
    const studyId = await seedStudy(
      'member-team',
      'Member View',
      '2026-01-01T00:00:00Z',
    );

    const shell = await client.study.shell({ studyId });
    expect(shell.team.role).toBe('member');
    expect(shell.permissions).toEqual([]);
  });

  it('reads the strongest of a multi-role membership', async () => {
    await joinTeam('multi-team', 'Multi Team', 'member,admin');
    const studyId = await seedStudy(
      'multi-team',
      'Multi',
      '2026-01-01T00:00:00Z',
    );

    const shell = await client.study.shell({ studyId });
    expect(shell.team.role).toBe('admin');
    expect(shell.permissions).toEqual(OWNER_PERMISSIONS);
  });

  it('grants nothing for a role it does not recognise', async () => {
    await joinTeam('unknown-role-team', 'Unknown Role Team', 'auditor');
    const studyId = await seedStudy(
      'unknown-role-team',
      'Unknown Role',
      '2026-01-01T00:00:00Z',
    );

    const shell = await client.study.shell({ studyId });
    expect(shell.team.role).toBe('member');
    expect(shell.permissions).toEqual([]);
  });

  it('counts the study versions and omits the areas that hold nothing', async () => {
    await joinTeam('counted-team', 'Counted Team', 'owner');
    const studyId = await seedStudy(
      'counted-team',
      'Counted',
      '2026-01-01T00:00:00Z',
    );
    await seedVersion(studyId, 'counted-team', 1);
    await seedVersion(studyId, 'counted-team', 2);

    const shell = await client.study.shell({ studyId });
    expect(shell.counts).toEqual({ versions: 2 });
  });

  it('counts only this study versions', async () => {
    await joinTeam('sibling-team', 'Sibling Team', 'owner');
    const studyId = await seedStudy(
      'sibling-team',
      'Counted',
      '2026-01-01T00:00:00Z',
    );
    const sibling = await seedStudy(
      'sibling-team',
      'Sibling',
      '2026-01-02T00:00:00Z',
    );
    await seedVersion(studyId, 'sibling-team', 1);
    await seedVersion(sibling, 'sibling-team', 1);
    await seedVersion(sibling, 'sibling-team', 2);

    const shell = await client.study.shell({ studyId });
    expect(shell.counts).toEqual({ versions: 1 });
  });

  it('keeps this study in the capped list even when it is the oldest', async () => {
    await joinTeam('busy-team', 'Busy Team', 'owner');
    // The target is the oldest of cap + 2, so a list taken by recency alone
    // would not contain the study whose shell this is.
    const target = await seedStudy(
      'busy-team',
      'Oldest',
      '2026-01-01T00:00:00Z',
    );
    for (let index = 1; index <= STUDY_LIST_CAP + 1; index++) {
      await seedStudy(
        'busy-team',
        `Newer ${index}`,
        `2026-02-${String(index).padStart(2, '0')}T00:00:00Z`,
      );
    }

    const { teamStudies } = await client.study.shell({ studyId: target });
    expect(teamStudies.hasMore).toBe(true);
    expect(teamStudies.items).toHaveLength(STUDY_LIST_CAP);
    expect(teamStudies.items.map((study) => study.id)).toContain(target);
    // Still most recent first, with the pinned study taking its own place.
    expect(teamStudies.items.map((study) => study.name)).toEqual([
      ...Array.from(
        { length: STUDY_LIST_CAP - 1 },
        (_, index) => `Newer ${STUDY_LIST_CAP + 1 - index}`,
      ),
      'Oldest',
    ]);
  });

  it('reports hasMore false at exactly the cap', async () => {
    await joinTeam('exact-team', 'Exact Team', 'owner');
    let target = '';
    for (let index = 1; index <= STUDY_LIST_CAP; index++) {
      target = await seedStudy(
        'exact-team',
        `Study ${index}`,
        `2026-03-${String(index).padStart(2, '0')}T00:00:00Z`,
      );
    }

    const { teamStudies } = await client.study.shell({ studyId: target });
    expect(teamStudies.items).toHaveLength(STUDY_LIST_CAP);
    expect(teamStudies.hasMore).toBe(false);
  });

  it('lists only the owning team studies', async () => {
    await joinTeam('scoped-team', 'Scoped Team', 'owner');
    await joinTeam('other-scoped-team', 'Other Scoped Team', 'owner');
    const studyId = await seedStudy(
      'scoped-team',
      'Scoped',
      '2026-01-01T00:00:00Z',
    );
    const foreign = await seedStudy(
      'other-scoped-team',
      'Foreign',
      '2026-06-01T00:00:00Z',
    );

    const { teamStudies } = await client.study.shell({ studyId });
    expect(teamStudies.items.map((study) => study.id)).toEqual([studyId]);
    expect(teamStudies.items.map((study) => study.id)).not.toContain(foreign);
  });

  it('rejects a study id that is not a study id', async () => {
    // Input validation, not an answer about any study: a syntactic refusal
    // that costs no database access and reveals nothing.
    const { error } = await safe(client.study.shell({ studyId: 'not-a-uuid' }));
    expect(refusal(error)).toMatchObject({ code: 'BAD_REQUEST' });
    expect(pinnedTeams(statements)).toEqual([]);
  });
});
