import { faker } from '@faker-js/faker';
import { Effect } from 'effect';

import { TEAM_GUC } from '@codaco/studio-sync/rls';

import { OwnerScope, Transaction } from '../../src/db/tenant.ts';
import { refreshProjectionsForSessions } from '../../src/network/projections.ts';
import {
  createSecretsCipher,
  type SecretsCipherApi,
} from '../../src/secrets/cipher.ts';
import type { KeyringApi } from '../../src/secrets/keyring.ts';
import { seedAssets, seedTemplates } from './assets.ts';
import { seedAuditEvents } from './audit.ts';
import {
  seedApiTokens,
  seedExperiments,
  seedFeedback,
  seedWebhooks,
} from './integrations.ts';
import { seedScheduling } from './messaging.ts';
import { seedMonitoringRollups } from './monitoring.ts';
import {
  earliestSessionByParticipant,
  seedSessionsAndNetworks,
} from './network.ts';
import { seedProtocolLine, type SeededVersion } from './protocols.ts';
import { seedBytes, seedTime } from './rng.ts';
import {
  closeStudy,
  publishConsentDocuments,
  recordLinkRedemptions,
  seedConsentDocuments,
  seedParticipantConsents,
  seedStudies,
} from './studies.ts';
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD,
  seedAdminOAuthAccount,
  seedTeams,
} from './teams.ts';

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
export { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD };

/**
 * `demo` is what dev boot and most suites run; `large` is the load shape;
 * `tiny` is the same corpus thinned, for the suites that exercise seeding
 * itself rather than the data it produces.
 */
export type SeedScale = 'tiny' | 'demo' | 'large';

export type SeedOptions = {
  /**
   * The deployment's keyring. Required, and required of every caller rather
   * than defaulted: the seed writes real sealed webhook secrets, and a seed
   * that quietly invented key material of its own would leave rows the running
   * instance cannot open — which the boot check would then refuse to serve
   * behind.
   */
  secrets: KeyringApi;
  /** Defaults to SEED_ADMIN_PASSWORD. */
  adminPassword?: string;
  /** Defaults to `demo`. */
  scale?: SeedScale;
  /**
   * Draw the secret envelopes' nonces from the pinned PRNG instead of
   * `crypto.randomBytes`, so two runs write byte-identical rows. Default
   * false, and set only by the local development paths and by the tests that
   * compare two dumps.
   *
   * Opt-in because the same command can be pointed at a real deployment:
   * `scripts/seed.ts --force` seals with THAT deployment's keyring, and a
   * predictable nonce is a broken nonce whatever the plaintext is worth. The
   * determinism is a convenience for a local dump comparison, so it is asked
   * for where the target is known to be local rather than taken by default.
   */
  reproducible?: boolean;
};

export type SeedResult = {
  /**
   * Every secret this seed wrote, in plaintext: the webhook signing secrets,
   * the admin's three OAuth tokens, and each team's protocol API key.
   * Returned so the dump-and-search test knows what to search the database
   * for; nothing else needs them, and they are never printed.
   */
  plaintextSecrets: string[];
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
 *
 * `tiny` goes the other way, and thins rather than narrows: the same five
 * teams, twenty-six studies, forty-six waves and every table they populate,
 * with a tenth of the participants and sessions inside them. That is the knob
 * that matters, because `seedSessionsAndNetworks` is around 90% of a seed and
 * it is the number of sessions rather than the width of each network that
 * drives it — measured, 6.8s to 1.0s, where collapsing the node window alone
 * only reached 5.8s.
 */
const SCALES: Record<
  SeedScale,
  { participantMultiplier: number; nodeCount: { min: number; max: number } }
> = {
  tiny: { participantMultiplier: 0.1, nodeCount: { min: 1, max: 2 } },
  demo: { participantMultiplier: 1, nodeCount: { min: 2, max: 8 } },
  large: { participantMultiplier: 2, nodeCount: { min: 70, max: 95 } },
};

/**
 * `schemaFingerprint` and `deployment_state` are kept: both describe the
 * deployment rather than hold its data, and both rows are written only by the
 * schema step — `deployment_state`'s singleton cannot be re-inserted by either
 * application role, so truncating it here would leave `maintenance on|off`
 * failing on a missing row until the schema step ran again.
 *
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
const wipe = Effect.fnUntraced(function* () {
  const { sql } = yield* Transaction;
  yield* sql.unsafe(`
    do $$
    declare
      r record;
      populated boolean;
    begin
      for r in
        select tablename from pg_tables
        where schemaname = current_schema()
          and tablename not in ('schemaFingerprint', 'deployment_state')
      loop
        execute format('select exists (select 1 from %I)', r.tablename)
          into populated;
        if populated then
          execute format('truncate table %I restart identity cascade', r.tablename);
        end if;
      end loop;
    end $$;
  `);
});

/**
 * Every tenant table is FORCE ROW LEVEL SECURITY, which binds the schema owner
 * the seed connects as. Re-stamping the transaction-local team GUC before each
 * team's rows keeps the seed inside the real policy — a forgotten `team_id`
 * fails here rather than in production — while staying in one transaction,
 * which `SET ROLE studio_maintenance` would also allow but a `TenantScope` per
 * team would not.
 */
const scopeToTeam = Effect.fnUntraced(function* (teamId: string) {
  const { sql } = yield* Transaction;
  yield* sql`select set_config(${TEAM_GUC}, ${teamId}, true)`;
});

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
const settleDeferredChecks = Effect.fnUntraced(function* () {
  const { sql } = yield* Transaction;
  yield* sql.unsafe('set constraints all immediate');
  yield* sql.unsafe('set constraints all deferred');
});

type SeedTotals = {
  teams: number;
  studies: number;
  waves: number;
  participants: number;
  sessions: number;
  auditEvents: number;
  anonymousLinks: string[];
  plaintextSecrets: string[];
};

const populate = Effect.fnUntraced(function* (
  adminPassword: string,
  scale: (typeof SCALES)[SeedScale],
  cipher: SecretsCipherApi,
) {
  yield* wipe();

  const teams = yield* seedTeams(adminPassword);
  // One linked Google account for the admin, so every one of the three secret
  // stores has rows in a seeded database. Beside the team seeding rather than
  // inside it: the tokens are sealed, and `seedTeams` has no business knowing
  // about the cipher.
  const oauthTokens = yield* seedAdminOAuthAccount(cipher, {
    userId: teams[0]!.adminUserId,
    createdAt: seedTime(-399),
  });
  const totals: SeedTotals = {
    teams: teams.length,
    studies: 0,
    waves: 0,
    participants: 0,
    sessions: 0,
    auditEvents: 0,
    anonymousLinks: [],
    plaintextSecrets: [...oauthTokens],
  };

  for (const team of teams) {
    yield* scopeToTeam(team.id);

    const line = yield* seedProtocolLine(team.id, cipher);
    totals.plaintextSecrets.push(line.plaintextAssetKey);
    const versionsById = new Map<string, SeededVersion>(
      line.versions.map((version) => [version.versionId, version]),
    );

    const studies = yield* seedStudies(team, line, scale);
    const consent = yield* seedConsentDocuments(team, studies);
    const consentDocuments = consent.byStudy;
    const templates = yield* seedTemplates(team, line);
    yield* seedAssets(
      team,
      line.versions,
      templates,
      [...consentDocuments.values()].flat(),
      studies,
    );
    // After the pins: a consent document takes pins only while it is a draft.
    yield* publishConsentDocuments(team, consent.publications);

    const sessions = yield* seedSessionsAndNetworks(
      team,
      studies,
      versionsById,
      refreshProjectionsForSessions,
      scale,
    );
    yield* recordLinkRedemptions(team.id);
    const withdrawals = yield* seedParticipantConsents(
      team,
      studies,
      consentDocuments,
      earliestSessionByParticipant(sessions),
    );

    yield* seedScheduling(team, studies);
    yield* seedApiTokens(team, studies);
    totals.plaintextSecrets.push(
      ...(yield* seedWebhooks(team, studies, sessions, withdrawals, cipher)),
    );
    yield* seedExperiments(team, studies, sessions);
    yield* seedFeedback(team, studies);
    yield* seedMonitoringRollups(team.id, seedTime(0));
    totals.auditEvents += yield* seedAuditEvents(team, line);

    // Last for this team: every closed guard refuses writes to an archived
    // study's waves, participants, sessions and networks, so the archive is
    // only sealed once all of them are written.
    for (const study of studies) {
      if (study.state === 'closed') yield* closeStudy(team.id, study);
    }
    yield* settleDeferredChecks();

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
});

export const seed = Effect.fn('db.seed')(function* (options: SeedOptions) {
  const adminPassword = options.adminPassword ?? SEED_ADMIN_PASSWORD;
  const scale = SCALES[options.scale ?? 'demo'];
  faker.seed(FAKER_SEED);

  // The one place in the application that can hand the cipher its randomness,
  // and only when the caller asks: every other caller takes `crypto.randomBytes`,
  // because a nonce that is not unpredictable is a broken nonce. With
  // `reproducible`, the whole corpus is synthetic and local, and `seed.test.ts`
  // seeds two scratch schemas and compares ordered dumps of every table (all
  // but better-auth's scrypt password hash, which no PRNG seed reaches) — so
  // the seed draws its nonces from the same pinned PRNG as everything else it
  // writes. Nothing outside this module may pass `random`.
  const cipher = createSecretsCipher(
    options.secrets,
    options.reproducible === true ? { random: seedBytes } : {},
  );

  const totals = yield* OwnerScope.open(populate(adminPassword, scale, cipher));

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

  return { plaintextSecrets: totals.plaintextSecrets } satisfies SeedResult;
});
