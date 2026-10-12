// `studio-api migrate` run as a deployment runs it: a process of its own, with
// a deployment's environment, against a database owned by a NOSUPERUSER login.
// What the operator reads when an upgrade fails is the subject here (#1901
// E-6), and so is the database a refusal leaves behind (E-7).
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Redacted } from 'effect';
import type pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  freePort,
  startEntrypoint,
} from '../../__tests__/support/entrypoint.ts';
import {
  committedDocument,
  ownedScratchDatabaseForTest,
  type OwnedScratchDatabase,
  type SyntheticMigration,
  withMigrations,
} from '../../__tests__/support/migrations.ts';
import { reachableDb, seedTeam } from '../../__tests__/support/postgres.ts';
import {
  testCipher,
  testKeyring,
  testKeyringEntry,
} from '../../__tests__/support/secrets.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import type { MigrationsDocument } from '../migrations-document.ts';

const db = await reachableDb();

const CASE_TIMEOUT_MS = 180_000;

const ENTRY = 'src/__tests__/support/migrate-entry.ts';

const NOTHING_APPLIED =
  'Nothing was applied: the transaction rolled back, and the database is as it was before migrate ran.';

const STACK_FRAME = /^\s+at /m;

const committed = committedDocument();

/** A second release of this build: its fingerprint is the build's. */
const release = (migration: Omit<SyntheticMigration, 'fingerprint'>) =>
  withMigrations(committed, { ...migration, fingerprint: SCHEMA_FINGERPRINT });

const files = mkdtempSync(join(tmpdir(), 'studio-migrate-program-'));

function documentFile(document: MigrationsDocument): string {
  const path = join(files, `${randomUUID()}.json`);
  writeFileSync(path, JSON.stringify(document));
  return path;
}

async function migrate(
  scratch: OwnedScratchDatabase,
  document: MigrationsDocument,
  keyring = testKeyringEntry('boot-1'),
): Promise<{ code: number | null; output: string }> {
  const child = startEntrypoint(
    ENTRY,
    {
      NODE_ENV: 'production',
      STUDIO_DEV_DEFAULTS: '',
      SMTP_URL: '',
      EMAIL_FROM: '',
      PORT: String(await freePort()),
      DATABASE_URL: scratch.db.url,
      STUDIO_SECRETS_KEY: keyring,
    },
    [documentFile(document)],
  );
  try {
    const { code } = await child.exited;
    return { code, output: child.output() };
  } finally {
    child.child.kill('SIGKILL');
  }
}

const history = async (pool: pg.Pool) =>
  (
    await pool.query<{ version: string }>(
      'select version from studio_migrations order by ordinal',
    )
  ).rows.map((row) => row.version);

const hasProbeColumn = async (pool: pg.Pool) =>
  (
    await pool.query(
      `select 1 from information_schema.columns
        where table_name = 'deployment_state' and column_name = 'probe'`,
    )
  ).rowCount === 1;

describe.skipIf(!db)('the migrate command', () => {
  afterAll(async () => {
    rmSync(files, { recursive: true, force: true });
  }, 120_000);

  async function releasedDatabase(): Promise<OwnedScratchDatabase> {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await ownedScratchDatabaseForTest(db);
    const first = await migrate(scratch, committed);
    expect(first.output).toContain(
      `Applied ${committed.migrations.map(({ version }) => version).join(', ')}.`,
    );
    expect(first.output).toContain(
      'Stored secrets are readable with the configured keyring.',
    );
    expect(first.code).toBe(0);
    return scratch;
  }

  it(
    'names the migration, file, statement and Postgres reason of a failure, and says nothing was applied',
    async () => {
      const scratch = await releasedDatabase();
      const before = await history(scratch.pool);

      const broken = release({
        slug: 'broken',
        delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
        backfill: [
          '-- Fill the new column.',
          'SET LOCAL ROLE studio_maintenance;',
          'UPDATE studies SET no_such_column = 1;',
          'RESET ROLE;',
        ].join('\n'),
      });
      const version = broken.migrations.at(-1)?.version;
      const { code, output } = await migrate(scratch, broken);

      expect(code).toBe(1);
      expect(output).toContain(
        [
          `Migration ${version} failed in backfill.sql, statement 2 of 3: UPDATE studies SET no_such_column = 1`,
          'Postgres refused it (42703): column "no_such_column" of relation "studies" does not exist',
          NOTHING_APPLIED,
        ].join('\n'),
      );
      expect(output).not.toContain('PgConnection: Query failed');
      expect(output).not.toMatch(STACK_FRAME);
      expect(output).not.toContain('FIRST-RUN SETUP TOKEN');
      // And it is true.
      expect(await history(scratch.pool)).toEqual(before);
      expect(await hasProbeColumn(scratch.pool)).toBe(false);
    },
    CASE_TIMEOUT_MS,
  );

  // #1901 FX-6: outside the classes Postgres words from object names, a
  // message can quote a stored value — a data exception the value that failed,
  // a PL/pgSQL RAISE whatever its trigger interpolated — and that value is a
  // row of the operator's study data.
  it.each([
    {
      failure: 'a data exception',
      backfill: 'SELECT name::int FROM teams;',
      statement: 'SELECT name::int FROM teams',
      code: '22P02',
    },
    {
      failure: 'a PL/pgSQL RAISE that interpolates a stored value',
      backfill:
        "DO $$ BEGIN RAISE EXCEPTION 'stored %', (SELECT name FROM teams WHERE id = 'team-migrate-cast'); END $$;",
      statement:
        "DO $$ BEGIN RAISE EXCEPTION 'stored %', (SELECT name FROM teams WHERE id = 'team-migrate-cast'); END $$",
      code: 'P0001',
    },
  ])(
    'reports $failure by its code alone, never the value in the message',
    async ({ backfill, statement, code: sqlState }) => {
      const scratch = await releasedDatabase();
      const before = await history(scratch.pool);
      const value = 'Alice Example';
      await scratch.admin.query(
        'INSERT INTO teams (id, name, slug) VALUES ($1, $2, $1)',
        ['team-migrate-cast', value],
      );

      const failing = release({
        slug: 'failing',
        delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
        backfill,
      });
      const version = failing.migrations.at(-1)?.version;
      const { code, output } = await migrate(scratch, failing);

      expect(code).toBe(1);
      expect(output).toContain(
        [
          `Migration ${version} failed in backfill.sql, statement 1 of 1: ${statement.length > 80 ? `${statement.slice(0, 79)}…` : statement}`,
          `Postgres refused it (${sqlState}): Postgres's message is not shown, because for this SQLSTATE it can quote stored values; run the statement against a copy of the database to see it`,
          NOTHING_APPLIED,
        ].join('\n'),
      );
      expect(output).not.toContain(value);
      expect(output).not.toMatch(STACK_FRAME);
      expect(await history(scratch.pool)).toEqual(before);
      expect(await hasProbeColumn(scratch.pool)).toBe(false);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'leaves the database at its previous release when the keyring cannot open what it stores',
    async () => {
      const scratch = await releasedDatabase();
      const before = await history(scratch.pool);

      // A secret sealed under a key the deployment's keyring lacks.
      const team = 'team-migrate-keyring';
      await seedTeam(scratch.admin, team);
      const subscriptionId = randomUUID();
      const secret = testCipher(testKeyring(['other-1'])).sealWebhookSecret(
        { teamId: team, subscriptionId },
        Redacted.make('whsec-migrate'),
      );
      await scratch.admin.query(
        `INSERT INTO webhook_subscriptions
           (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
         VALUES ($1, $2, 'https://hooks.example.org/studio',
                 ARRAY['interview.completed'], $3, $4, 'user-migrate')`,
        [subscriptionId, team, secret.ciphertext, secret.keyId],
      );

      const upgrade = release({
        slug: 'next_release',
        delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
      });
      const version = upgrade.migrations.at(-1)?.version;

      const refused = await migrate(scratch, upgrade);
      expect(refused.code).toBe(1);
      expect(refused.output).toContain(
        'Stored secrets use key id(s) the keyring cannot produce: other-1.',
      );
      expect(refused.output).toContain(NOTHING_APPLIED);
      expect(refused.output).not.toContain(`Applied ${version}`);
      expect(await history(scratch.pool)).toEqual(before);
      expect(await hasProbeColumn(scratch.pool)).toBe(false);

      // The positive control: the same upgrade, with a keyring that opens it.
      const accepted = await migrate(
        scratch,
        upgrade,
        [testKeyringEntry('boot-1'), testKeyringEntry('other-1')].join(','),
      );
      expect(accepted.output).toContain(`Applied ${version}.`);
      expect(accepted.code).toBe(0);
      expect(await history(scratch.pool)).toEqual([...before, version]);
      expect(await hasProbeColumn(scratch.pool)).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );
});
