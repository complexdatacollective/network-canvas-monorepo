import { faker } from '@faker-js/faker';
import type pg from 'pg';

import { TEAM_GUC } from '@codaco/studio-sync/rls';

import { refreshProjectionsForSessions } from '../network/projections.ts';
import { seedAssets, seedTemplates } from './seed/assets.ts';
import { seedAuditEvents } from './seed/audit.ts';
import {
  seedApiTokens,
  seedExperiments,
  seedFeedback,
  seedWebhooks,
} from './seed/integrations.ts';
import { seedScheduling } from './seed/messaging.ts';
import { seedMonitoringRollups } from './seed/monitoring.ts';
import {
  earliestSessionByParticipant,
  seedSessionsAndNetworks,
} from './seed/network.ts';
import { seedProtocolLine, type SeededVersion } from './seed/protocols.ts';
import { seedTime } from './seed/rng.ts';
import {
  closeStudy,
  recordLinkRedemptions,
  seedConsentDocuments,
  seedParticipantConsents,
  seedStudies,
} from './seed/studies.ts';
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_NAME,
  SEED_ADMIN_PASSWORD,
  seedTeams,
} from './seed/teams.ts';

// The deploy-time and dev-boot seed (#1256 tracks real onboarding — until
// then, this is how a fresh instance gets something to look at): wipes every
// table's data, then repopulates reproducible synthetic content across the
// whole model — protocol lines and published versions, studies through their
// lifecycle, waves, participants, tokenized links, interview sessions with
// real collected networks, consent, scheduling and messaging, tokens,
// templates, webhooks, experiments, feedback, monitoring rollups and audit
// history. Every call pins the faker PRNG below, so two runs produce
// byte-identical data. The wipe and every insert share one transaction, so a
// failure part-way leaves the previous dataset in place rather than an emptied
// or half-filled one.
//
// Never point this at a database carrying real data: it deletes everything
// first. SEED_ADMIN_PASSWORD is published here and in the README, so it is a
// working credential on any reachable instance that keeps it; the scripts
// refuse it for a non-local database and take STUDIO_SEED_ADMIN_PASSWORD
// instead.

// Defined beside the auth-tier seeding that writes them, and re-exported here
// because this module is the seed's documented surface.
export { SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD };

/** `demo` is what dev boot and the suites run; `large` is the load shape. */
export type SeedScale = 'demo' | 'large';

export type SeedOptions = {
  /** Defaults to SEED_ADMIN_PASSWORD. */
  adminPassword?: string;
  /** Defaults to `demo`. */
  scale?: SeedScale;
};

const FAKER_SEED = 20260902;

/**
 * `large` multiplies the per-study participant and session counts and widens
 * the generated networks to the #1246 spike's node window, so the raw-tier
 * numbers can be re-measured. Nothing else changes: the same studies, the same
 * lifecycle states, the same periphery.
 *
 * The two windows are what the bundled sample protocol needs to land on the
 * intended totals, because its name-generator stages carry their own
 * `behaviours` bounds and the per-pair edge probabilities compound
 * quadratically as a network grows. Measured on that protocol: `demo`'s window
 * yields around 23 nodes and 14 edges per session (~18 k nodes and ~11 k edges
 * across the corpus, in a seed that runs in a few seconds), and the spike's
 * `{70, 95}` yields around 410 nodes and 4 800 edges — roughly twenty times the
 * edges per session the spike's own protocol produced. The session multiplier
 * is therefore twofold rather than the spike's tenfold, which lands on
 * comparable raw-tier totals in minutes instead of hours: measured at 1 520
 * sessions, 594 845 nodes and 6 423 695 edges in six minutes, against the
 * spike's 2.1 M nodes and 5.9 M edges.
 */
const SCALES: Record<
  SeedScale,
  { participantMultiplier: number; nodeCount: { min: number; max: number } }
> = {
  demo: { participantMultiplier: 1, nodeCount: { min: 2, max: 8 } },
  large: { participantMultiplier: 2, nodeCount: { min: 70, max: 95 } },
};

/**
 * Driven off `pg_tables` rather than a hardcoded list, so a table added to
 * the schema later is wiped too instead of silently accumulating stale rows
 * that the rest of this function never touches.
 *
 * Only tables holding rows are truncated: TRUNCATE rebuilds every relation
 * file of the table and its indexes whether or not there is anything in them,
 * around half a second for the whole schema — on the freshly applied schema
 * every `pnpm dev` boot and every test seed starts from, that is half a second
 * for nothing.
 */
async function wipe(client: pg.ClientBase): Promise<void> {
  await client.query(`
    do $$
    declare
      r record;
      populated boolean;
    begin
      for r in
        select tablename from pg_tables
        where schemaname = current_schema() and tablename <> 'schemaFingerprint'
      loop
        execute format('select exists (select 1 from %I)', r.tablename)
          into populated;
        if populated then
          execute format('truncate table %I restart identity cascade', r.tablename);
        end if;
      end loop;
    end $$;
  `);
}

/**
 * Every tenant table is FORCE ROW LEVEL SECURITY, which binds the schema owner
 * the seed connects as. Re-stamping the transaction-local team GUC before each
 * team's rows keeps the seed inside the real policy — a forgotten `team_id`
 * fails here rather than in production — while staying in one transaction,
 * which `SET ROLE studio_maintenance` would also allow but a `TenantDb` per
 * team would not.
 */
async function scopeToTeam(
  client: pg.ClientBase,
  teamId: string,
): Promise<void> {
  await client.query(`select set_config('${TEAM_GUC}', $1, true)`, [teamId]);
}

/**
 * Fires every pending deferred constraint check now, under the team GUC that
 * wrote the rows it reads, then restores deferral for the next team.
 *
 * The commit-time checks (a completed session must carry its snapshot, a
 * consent grant must carry every required affirmation) read child tables
 * under the same row-level security the seed writes under. Left to commit,
 * they would run once, under whichever team was stamped LAST, and for an
 * owner that is not a superuser — every managed Postgres — see none of the
 * earlier teams' children. The development superuser bypasses the policy,
 * which is exactly why that failure would surface first in a deployment.
 */
async function settleDeferredChecks(client: pg.ClientBase): Promise<void> {
  await client.query('set constraints all immediate');
  await client.query('set constraints all deferred');
}

type SeedTotals = {
  teams: number;
  studies: number;
  waves: number;
  participants: number;
  sessions: number;
  auditEvents: number;
  anonymousLinks: string[];
};

async function populate(
  client: pg.PoolClient,
  adminPassword: string,
  scale: (typeof SCALES)[SeedScale],
): Promise<SeedTotals> {
  await wipe(client);

  const teams = await seedTeams(client, adminPassword);
  const totals: SeedTotals = {
    teams: teams.length,
    studies: 0,
    waves: 0,
    participants: 0,
    sessions: 0,
    auditEvents: 0,
    anonymousLinks: [],
  };

  for (const team of teams) {
    await scopeToTeam(client, team.id);

    const line = await seedProtocolLine(client, team.id);
    const versionsById = new Map<string, SeededVersion>(
      line.versions.map((version) => [version.versionId, version]),
    );

    const studies = await seedStudies(client, team, line, scale);
    const consentDocuments = await seedConsentDocuments(client, team, studies);
    const templates = await seedTemplates(client, team, line);
    await seedAssets(
      client,
      team,
      line.versions,
      templates,
      [...consentDocuments.values()].flat(),
      studies,
    );

    const sessions = await seedSessionsAndNetworks(
      client,
      team,
      studies,
      versionsById,
      refreshProjectionsForSessions,
      scale,
    );
    await recordLinkRedemptions(client, team.id);
    await seedParticipantConsents(
      client,
      team,
      studies,
      consentDocuments,
      earliestSessionByParticipant(sessions),
    );

    await seedScheduling(client, team, studies);
    await seedApiTokens(client, team, studies);
    await seedWebhooks(client, team, studies);
    await seedExperiments(client, team, studies, sessions);
    await seedFeedback(client, team, studies);
    await seedMonitoringRollups(client, team.id, seedTime(0));
    totals.auditEvents += await seedAuditEvents(client, team, line);

    // Last for this team: every closed guard refuses writes to an archived
    // study's waves, participants, sessions and networks, so the archive is
    // only sealed once all of them are written.
    for (const study of studies) {
      if (study.state === 'closed') await closeStudy(client, team.id, study);
    }
    await settleDeferredChecks(client);

    totals.studies += studies.length;
    for (const study of studies) {
      totals.waves += study.waves.length;
      totals.participants += study.participants.length;
      for (const link of study.links) {
        if (link.kind === 'anonymous') totals.anonymousLinks.push(link.token);
      }
    }
    totals.sessions += sessions.length;
  }

  return totals;
}

export async function seed(
  pool: pg.Pool,
  options: SeedOptions = {},
): Promise<void> {
  const adminPassword = options.adminPassword ?? SEED_ADMIN_PASSWORD;
  const scale = SCALES[options.scale ?? 'demo'];
  faker.seed(FAKER_SEED);

  const client = await pool.connect();
  let totals: SeedTotals;
  try {
    await client.query('begin');
    totals = await populate(client, adminPassword, scale);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const credentials =
    adminPassword === SEED_ADMIN_PASSWORD
      ? `${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`
      : `${SEED_ADMIN_EMAIL} with the password from STUDIO_SEED_ADMIN_PASSWORD`;
  const lines = [
    `Seeded ${totals.teams} teams · ${totals.studies} studies · ${totals.waves} waves · ` +
      `${totals.participants} participants · ${totals.sessions} interview sessions · ` +
      `${totals.auditEvents} audit events.`,
    'Seeded assets are metadata only: no bytes were uploaded, so /storage/:hash 404s in development.',
    `Sign in as the admin: ${credentials}`,
    'Anonymous interview links:',
    ...totals.anonymousLinks.map((token) => `  ${token}`),
  ];
  // oxlint-disable-next-line no-console -- the deploy-time and dev-boot seed's own progress output
  console.log(lines.join('\n'));
}
