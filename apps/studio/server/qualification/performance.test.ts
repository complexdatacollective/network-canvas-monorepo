import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type pg from 'pg';
import { expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import { InvitationDeliveryDispatcher } from '../src/team/invitation-delivery-dispatcher.ts';
import { enqueueInvitationDelivery } from '../src/team/invitation-delivery-store.ts';
import { seedAggregateCorpus } from './aggregate-data.ts';
import { localDeployment } from './compose.ts';

// The three served query tiers from #1246 / #1378, adapted only for the
// production team/wave schema. These remain independent of projection writes.
const QUERIES = {
  degree: `SELECT h.degree, sum(h.node_count)::int AS nodes
    FROM session_degree_hist h
    JOIN session_stats st ON st.session_id = h.session_id
    WHERE st.study_id = $1 AND st.wave_number = 2
    GROUP BY h.degree ORDER BY h.degree`,
  ties: `SELECT e.session_id, e.type, count(*)::int AS ties
    FROM edges e JOIN interview_sessions s ON s.id = e.session_id
    JOIN study_waves w ON w.id = s.wave_id
    WHERE s.study_id = $1 AND w.wave_number = 2
    GROUP BY e.session_id, e.type`,
  waves: `WITH deltas AS (
      SELECT wave_number, edge_count AS ties,
        edge_count - lag(edge_count) OVER (PARTITION BY participant_id ORDER BY wave_number) AS delta
      FROM session_stats WHERE study_id = $1
    ) SELECT wave_number, count(*)::int AS participants,
        avg(ties)::float AS mean_ties, avg(delta)::float AS mean_delta
      FROM deltas GROUP BY wave_number ORDER BY wave_number`,
} as const;

async function timed(pool: pg.Pool, team: string, study: string, sql: string) {
  const start = performance.now();
  const result = await createTenantDb(pool, team).transaction((client) =>
    client.query(sql, [study]),
  );
  return {
    rows: result.rows as Record<string, unknown>[],
    ms: performance.now() - start,
  };
}

function summary(samples: readonly number[]) {
  expect(samples).toHaveLength(30);
  const ordered = samples.toSorted((a, b) => a - b);
  return {
    count: ordered.length,
    p50: ordered[15]!,
    p95: ordered[28]!,
    max: ordered.at(-1)!,
  };
}

async function startChurn(
  app: pg.Pool,
  maintenance: pg.Pool,
  teamId: string,
  author: string,
) {
  const stop = new AbortController();
  let completed = 0;
  const first = Promise.withResolvers<void>();
  const dispatcher = new InvitationDeliveryDispatcher({
    pool: maintenance,
    publicBaseUrl: 'https://synthetic-benchmark.invalid',
    // A local synthetic transport: every claim, renewal and completion still
    // uses the real shared outbox and its restricted maintenance connection.
    mailer: { sendTeamInvitation: async () => {} },
  });
  const running = (async () => {
    while (!stop.signal.aborted) {
      const start = performance.now();
      await createTenantDb(app, teamId).transaction(async (client) => {
        for (let index = 0; index < 20; index++) {
          const invitationId = randomUUID();
          const email = `${invitationId}@example.test`;
          const expiresAt = new Date(Date.now() + 3_600_000);
          await client.query(
            "INSERT INTO team_invitations (id, team_id, email, role, status, expires_at, inviter_id) VALUES ($1, $2, $3, 'member', 'pending', $4, $5)",
            [invitationId, teamId, email, expiresAt, author],
          );
          await enqueueInvitationDelivery(client, {
            invitationId,
            teamId,
            email,
            expiresAt,
            role: 'member',
            teamLabel: 'Benchmark',
            inviterLabel: 'Benchmark',
          });
        }
      });
      for (let index = 0; index < 20; index++) {
        const result = await dispatcher.runOnce();
        expect(result).toEqual({
          claimed: 1,
          sent: 1,
          failed: 0,
          suppressed: 0,
        });
        completed += result.sent;
      }
      first.resolve();
      // Workload pacing, not an assertion or a synchronization oracle.
      await delay(Math.max(0, 100 - (performance.now() - start)));
    }
  })();
  // Retain the rejection for stop()/the initial barrier; never replace it
  // with a success-shaped result if queue work fails during measurement.
  running.catch((error: unknown) => first.reject(error));
  await first.promise;
  return {
    completed: () => completed,
    stop: async () => {
      stop.abort();
      await running;
    },
  };
}

it.each([1, 10] as const)(
  'qualifies the shipped baseline at %sx study scale under forced RLS and queue churn',
  async (scale) => {
    const deployment = await localDeployment(`aggregate-${scale}`);
    let pools: Awaited<ReturnType<typeof deployment.pools>> | undefined;
    let churn: Awaited<ReturnType<typeof startChurn>> | undefined;
    try {
      await deployment.configure();
      await deployment.overlay();
      // The sole supported baseline: a four-core/eight-GB host. Bound PG to
      // four cores/six GB, leaving two GB for the web, workers and object store.
      // Tests never quietly qualify against an unconstrained developer DB.
      await writeFile(
        join(deployment.directory, 'performance.yml'),
        'services:\n  postgres:\n    cpus: 4\n    mem_limit: 6g\n',
      );
      await deployment.compose([
        '-f',
        'performance.yml',
        'up',
        '-d',
        '--wait',
        'postgres',
      ]);
      await deployment.compose([
        '-f',
        'deployment/migrate.yml',
        'run',
        '--rm',
        '--no-deps',
        'studio',
        'migrate',
      ]);
      pools = await deployment.pools();
      expect(
        (
          await pools.app.query(
            "SELECT current_user AS role, current_setting('shared_buffers') AS buffers, current_setting('work_mem') AS work",
          )
        ).rows,
      ).toEqual([{ role: 'studio_app', buffers: '1GB', work: '256MB' }]);
      const profile = await deployment.execute(
        'docker',
        [
          'inspect',
          `${deployment.project}-postgres-1`,
          '--format',
          '{{json .HostConfig}}',
        ],
        { privateOutput: true },
      );
      expect(JSON.parse(profile.stdout.toString()) as unknown).toMatchObject({
        NanoCpus: 4_000_000_000,
        Memory: 6 * 1024 ** 3,
      });
      const corpus = await seedAggregateCorpus(pools.admin, scale);
      expect(corpus.truth.sessions).toBe(2500 * scale);
      expect(corpus.truth.nodes).toBeGreaterThan(150_000 * scale);
      expect(corpus.truth.edges).toBeGreaterThan(450_000 * scale);
      const counts = (
        await pools.admin.query(
          'SELECT (SELECT count(*)::int FROM nodes) AS nodes, (SELECT count(*)::int FROM edges) AS edges, (SELECT count(*)::int FROM interview_sessions) AS sessions',
        )
      ).rows[0];
      expect(counts).toEqual({
        nodes: corpus.truth.nodes,
        edges: corpus.truth.edges,
        sessions: corpus.truth.sessions,
      });
      const guarded = (
        await pools.admin.query<{
          relname: string;
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = ANY(ARRAY['nodes'::regclass, 'edges'::regclass, 'interview_sessions'::regclass, 'session_stats'::regclass, 'session_degree_hist'::regclass])",
        )
      ).rows;
      expect(guarded).toHaveLength(5);
      for (const row of guarded)
        expect(row).toMatchObject({
          relrowsecurity: true,
          relforcerowsecurity: true,
        });
      expect(
        (
          await pools.app.query(
            'SELECT count(*)::int AS count FROM interview_sessions',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      for (const sql of Object.values(QUERIES))
        expect(
          (await timed(pools.app, corpus.noiseTeam, corpus.mainStudy, sql))
            .rows,
        ).toEqual([]);
      for (const table of [
        'interview_sessions',
        'study_waves',
        'nodes',
        'edges',
        'session_stats',
        'session_degree_hist',
      ])
        await pools.admin.query(`VACUUM (ANALYZE) ${table}`);

      const histogram = await timed(
        pools.app,
        corpus.mainTeam,
        corpus.mainStudy,
        QUERIES.degree,
      );
      expect(histogram.rows).toEqual(
        [...corpus.truth.degree]
          .toSorted(([a], [b]) => a - b)
          .map(([degree, nodes]) => ({ degree, nodes })),
      );
      const ties = await timed(
        pools.app,
        corpus.mainTeam,
        corpus.mainStudy,
        QUERIES.ties,
      );
      expect(
        new Map(
          ties.rows.map((row) => {
            if (
              typeof row.session_id !== 'string' ||
              typeof row.type !== 'string' ||
              typeof row.ties !== 'number'
            )
              throw new Error('Invalid aggregate tie result.');
            return [`${row.session_id}/${row.type}`, row.ties] as const;
          }),
        ),
      ).toEqual(corpus.truth.ties);
      const waves = await timed(
        pools.app,
        corpus.mainTeam,
        corpus.mainStudy,
        QUERIES.waves,
      );
      expect(waves.rows).toHaveLength(3);
      for (const [index, row] of waves.rows.entries()) {
        const truth = corpus.truth.waves[index]!;
        const mean =
          truth.reduce((total, value) => total + value, 0) / truth.length;
        expect(row.wave_number).toBe(index + 1);
        expect(row.participants).toBe(700 * scale);
        expect(row.mean_ties).toBeCloseTo(mean, 8);
        if (index === 0) expect(row.mean_delta).toBeNull();
        else {
          const previous = corpus.truth.waves[index - 1]!;
          expect(row.mean_delta).toBeCloseTo(
            truth.reduce(
              (total, value, offset) => total + value - previous[offset]!,
              0,
            ) / truth.length,
            8,
          );
        }
      }

      churn = await startChurn(
        pools.app,
        pools.maintenance,
        corpus.mainTeam,
        corpus.author,
      );
      const initial = churn.completed();
      const samples: Record<keyof typeof QUERIES, number[]> = {
        degree: [],
        ties: [],
        waves: [],
      };
      for (let index = 0; index < 30; index++) {
        for (const name of Object.keys(QUERIES) as (keyof typeof QUERIES)[]) {
          const result = await timed(
            pools.app,
            corpus.mainTeam,
            corpus.mainStudy,
            QUERIES[name],
          );
          expect(result.rows.length).toBeGreaterThan(0);
          samples[name].push(result.ms);
        }
        if (index === 14) expect(churn.completed()).toBeGreaterThan(initial);
      }
      await churn.stop();
      const jobs = churn.completed() - initial;
      churn = undefined;
      expect(jobs).toBeGreaterThan(0);
      const measurements = Object.fromEntries(
        Object.entries(samples).map(([name, values]) => [
          name,
          summary(values),
        ]),
      );
      await writeFile(
        join(deployment.root, 'performance.json'),
        JSON.stringify(
          {
            scale,
            profile: { cpus: 4, postgresMemoryBytes: 6 * 1024 ** 3 },
            counts,
            jobs,
            measurements,
          },
          null,
          2,
        ),
      );
      for (const [name, measurement] of Object.entries(measurements))
        expect(
          measurement.p95,
          `${name} p95 must remain below one second; evidence: ${deployment.root}/performance.json`,
        ).toBeLessThan(1_000);
    } finally {
      await churn?.stop();
      await pools?.close();
      await deployment.dispose();
    }
  },
  1_800_000,
);
