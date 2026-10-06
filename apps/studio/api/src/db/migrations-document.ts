import { createHash } from 'node:crypto';

import { Schema } from 'effect';

import { SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { executableText, splitStatements } from './statements.ts';

// The numbered migrations under `apps/studio/api/migrations/` reach the image
// as one JSON document, `dist/migrations.json`, rendered at build time by
// `scripts/render-migrations.ts`. This module is the part both sides share:
// the document's shape, how its artefacts hash, and the verification
// `studio-api migrate` runs before it issues a single statement. It imports no
// drizzle-kit and no node-postgres, because the migrate bundle carries
// neither.

/**
 * Executed in this order inside one migration. The backfill runs last, after
 * the sidecars (#1901 E-2, 6 Oct 2026, replacing D-2's delta → backfill →
 * sidecars): only then does a table the delta created carry its policies and
 * its grants to `studio_maintenance`, so one recipe fills a new table and an
 * existing one alike. An existing table's triggers, policies and FORCE are the
 * previous release's whichever order runs, so nothing a backfill writes to
 * one escapes a check by running earlier. And no sidecar `ALTER TABLE` then
 * follows a backfill inside its migration, where a deferred trigger event the
 * backfill queued would refuse it.
 */
export const EXECUTED_ARTEFACTS = [
  'delta.sql',
  'sidecars.sql',
  'backfill.sql',
] as const;

/** Hashed into the manifest, never executed and never shipped in the image. */
export const SNAPSHOT_ARTEFACT = 'snapshot.json';

const REQUIRED_ARTEFACTS = [
  'delta.sql',
  'sidecars.sql',
  SNAPSHOT_ARTEFACT,
] as const;

/** `0001_initial`: a zero-padded ordinal and a lower-case slug. */
export const MIGRATION_VERSION = /^(\d{4})_([a-z0-9_]+)$/;

export const MIGRATION_SLUG = /^[a-z0-9_]+$/;

export function migrationVersion(ordinal: number, slug: string): string {
  return `${String(ordinal).padStart(4, '0')}_${slug}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const Sha256 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));

export const MigrationManifest = Schema.Struct({
  version: Schema.String,
  ordinal: Schema.Int,
  /** The `SCHEMA_FINGERPRINT` of the build that generated this migration. */
  fingerprint: Sha256,
  /** The data-bearing drops the author named with `--drop`. */
  drops: Schema.Array(Schema.String),
  artefacts: Schema.Record(Schema.String, Sha256),
  combined: Sha256,
});

export type MigrationManifest = typeof MigrationManifest.Type;

const MigrationArtefact = Schema.Struct({
  name: Schema.String,
  sql: Schema.String,
});

export const DocumentMigration = Schema.Struct({
  version: Schema.String,
  ordinal: Schema.Int,
  /** Executed artefacts only, in execution order. */
  artefacts: Schema.Array(MigrationArtefact),
  manifest: MigrationManifest,
});

export type DocumentMigration = typeof DocumentMigration.Type;

export const MigrationsDocument = Schema.Struct({
  fingerprint: Sha256,
  migrations: Schema.Array(DocumentMigration),
});

export type MigrationsDocument = typeof MigrationsDocument.Type;

export const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(MigrationManifest),
);

/** Execution order, then the snapshot last. */
function canonicalOrder(names: Iterable<string>): string[] {
  const present = new Set(names);
  return [
    ...EXECUTED_ARTEFACTS.filter((name) => present.has(name)),
    ...(present.has(SNAPSHOT_ARTEFACT) ? [SNAPSHOT_ARTEFACT] : []),
  ];
}

/**
 * The manifest's `combined` hash: one line per artefact, `<name>:<sha256>`, in
 * execution order with the snapshot last. History records it as the
 * migration's `manifest_hash`.
 */
function combinedHash(artefacts: Readonly<Record<string, string>>): string {
  return sha256(
    canonicalOrder(Object.keys(artefacts))
      .map((name) => `${name}:${artefacts[name]}\n`)
      .join(''),
  );
}

export type ArtefactHashes = {
  readonly artefacts: Record<string, string>;
  readonly combined: string;
};

/** Hashes a migration directory's artefacts, keyed by file name. */
export function hashArtefacts(
  contents: Readonly<Record<string, string>>,
): ArtefactHashes {
  const unknown = Object.keys(contents).filter(
    (name) => !canonicalOrder([name]).includes(name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `not a migration artefact: ${unknown.join(', ')} (expected ${[...EXECUTED_ARTEFACTS, SNAPSHOT_ARTEFACT].join(', ')})`,
    );
  }
  const artefacts: Record<string, string> = {};
  for (const name of canonicalOrder(Object.keys(contents))) {
    artefacts[name] = sha256(contents[name] ?? '');
  }
  return { artefacts, combined: combinedHash(artefacts) };
}

/**
 * Every statement that opens, ends, nests or reconfigures a transaction. The
 * runner owns the one transaction a run applies in: an inner `COMMIT` would
 * commit half an upgrade and run the rest outside any transaction, and an
 * inner `ROLLBACK` would record a migration whose statements were undone.
 */
const TRANSACTION_CONTROL =
  /^(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION|SET\s+(?:(?:LOCAL|SESSION)\s+)?TRANSACTION|SET\s+SESSION\s+CHARACTERISTICS)\b/i;

export type ForbiddenStatement = {
  readonly statement: string;
  /** What to do instead, as the end of a sentence. */
  readonly remedy: string;
};

const SPLIT_ACROSS_RELEASES = 'split it across two releases';

/**
 * `SET CONSTRAINTS ALL` sets the transaction's default rather than the modes
 * of the constraints that exist, so it would also govern every constraint a
 * later file of the run creates (#1901 FX-4).
 */
const ALL_CONSTRAINTS = /^SET\s+CONSTRAINTS\s+ALL\b/i;

const NAME_THE_CONSTRAINTS =
  'name the constraints instead (SET CONSTRAINTS <name> IMMEDIATE): migrate applies every pending migration in one transaction, and ALL would change the constraints of every file after this one too';

const NO_TRANSACTION_CONTROL =
  'remove it: migrate applies every pending migration in one transaction of its own, so a file never begins, ends or nests one';

/**
 * A statement the runner's one transaction cannot carry: Postgres refuses
 * `CREATE INDEX CONCURRENTLY` inside a transaction block, a value added by
 * `ALTER TYPE … ADD VALUE` cannot be used before the transaction that added it
 * commits, and transaction control would break the transaction itself.
 */
export function forbiddenStatement(script: string): ForbiddenStatement | null {
  for (const statement of splitStatements(script)) {
    // Only what Postgres executes: a keyword inside a comment, a string, a
    // quoted name or a function body is not a command.
    const text = executableText(statement);
    const command = text.trimStart();
    if (TRANSACTION_CONTROL.test(command)) {
      return { statement, remedy: NO_TRANSACTION_CONTROL };
    }
    if (ALL_CONSTRAINTS.test(command)) {
      return { statement, remedy: NAME_THE_CONSTRAINTS };
    }
    if (/\bCONCURRENTLY\b/i.test(text)) {
      return { statement, remedy: SPLIT_ACROSS_RELEASES };
    }
    if (/\bALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i.test(text)) {
      return { statement, remedy: SPLIT_ACROSS_RELEASES };
    }
  }
  return null;
}

export class MigrationsDocumentRefused extends Schema.TaggedError<MigrationsDocumentRefused>()(
  'MigrationsDocumentRefused',
  { message: Schema.String },
) {}

const VERIFIED: unique symbol = Symbol('VerifiedMigrations');

/**
 * A document `verifyMigrations` accepted. Only that function can make one, so
 * the runner cannot be handed a document nobody checked.
 */
export class VerifiedMigrations {
  readonly fingerprint: string;
  readonly migrations: readonly DocumentMigration[];

  constructor(
    token: typeof VERIFIED,
    fingerprint: string,
    migrations: readonly DocumentMigration[],
  ) {
    if (token !== VERIFIED) {
      throw new Error('a VerifiedMigrations is made by verifyMigrations only');
    }
    this.fingerprint = fingerprint;
    this.migrations = migrations;
  }
}

const short = (hash: string) => hash.slice(0, 12);

function refuse(message: string): never {
  throw new MigrationsDocumentRefused({ message });
}

function verifyMigration(migration: DocumentMigration, index: number): void {
  const { version, ordinal, manifest } = migration;
  const expectedOrdinal = index + 1;
  const parsed = MIGRATION_VERSION.exec(version);
  if (
    ordinal !== expectedOrdinal ||
    parsed === null ||
    Number(parsed[1]) !== ordinal
  ) {
    refuse(
      `The migrations are not numbered contiguously from 0001: position ${expectedOrdinal} holds ${version} (ordinal ${ordinal}).`,
    );
  }
  if (manifest.version !== version || manifest.ordinal !== ordinal) {
    refuse(
      `Migration ${version}'s manifest names ${manifest.version} (ordinal ${manifest.ordinal}).`,
    );
  }

  const names = migration.artefacts.map((artefact) => artefact.name);
  const executed = canonicalOrder(names).filter(
    (name) => name !== SNAPSHOT_ARTEFACT,
  );
  if (names.join('\n') !== executed.join('\n')) {
    refuse(
      `Migration ${version} carries ${names.join(', ')}; expected executed artefacts in the order ${EXECUTED_ARTEFACTS.join(', ')}, each at most once.`,
    );
  }
  const recorded = Object.keys(manifest.artefacts);
  const expected = canonicalOrder([...names, SNAPSHOT_ARTEFACT]);
  for (const required of REQUIRED_ARTEFACTS) {
    if (!expected.includes(required)) {
      refuse(`Migration ${version} has no ${required}.`);
    }
  }
  // Every recorded key, before canonicalOrder (which keeps only names it
  // knows) can drop one: an unknown key would otherwise pass here, be left out
  // of the combined hash, and still be written to the history, where the next
  // image would read it as an edit.
  if ([...recorded].sort().join('\n') !== [...expected].sort().join('\n')) {
    refuse(
      `Migration ${version}'s manifest records ${recorded.join(', ')}, but the migration carries ${expected.join(', ')}.`,
    );
  }

  for (const { name, sql } of migration.artefacts) {
    const rehashed = sha256(sql);
    if (rehashed !== manifest.artefacts[name]) {
      refuse(
        `Migration ${version}'s ${name} does not hash to its manifest (${short(rehashed)} against ${short(manifest.artefacts[name] ?? '')}): the file is damaged or was edited. Rebuild the image from a release.`,
      );
    }
    const forbidden = forbiddenStatement(sql);
    if (forbidden !== null) {
      refuse(
        `Migration ${version}'s ${name} carries a statement one transaction cannot run; ${forbidden.remedy}: ${forbidden.statement}`,
      );
    }
  }
  if (combinedHash(manifest.artefacts) !== manifest.combined) {
    refuse(
      `Migration ${version}'s manifest does not hash to its combined hash: the manifest was edited.`,
    );
  }
}

/**
 * Two directions, as `verifySchemaDdl` checked before it: the document must be
 * this build's (its fingerprint is the bundle's), and it must be intact (every
 * artefact re-hashes to the manifest that records it). Throws
 * `MigrationsDocumentRefused`; nothing here touches a database.
 */
export function verifyMigrations(
  document: MigrationsDocument,
  expectedFingerprint: string = SCHEMA_FINGERPRINT,
): VerifiedMigrations {
  if (document.fingerprint !== expectedFingerprint) {
    refuse(
      `The migrations beside this bundle were rendered by a different build: they record ${short(document.fingerprint)} and this build is ${short(expectedFingerprint)}. Rebuild the image.`,
    );
  }
  if (document.migrations.length === 0) {
    refuse('The migrations document carries no migrations. Rebuild the image.');
  }
  document.migrations.forEach(verifyMigration);

  const newest = document.migrations.at(-1)!;
  if (newest.manifest.fingerprint !== document.fingerprint) {
    refuse(
      `The newest migration, ${newest.version}, was generated for schema ${short(newest.manifest.fingerprint)}, but this build's schema is ${short(document.fingerprint)}: the schema changed without a migration. Run: pnpm --filter @codaco/studio-api migrate:generate --name <slug>`,
    );
  }
  return new VerifiedMigrations(
    VERIFIED,
    document.fingerprint,
    document.migrations,
  );
}
