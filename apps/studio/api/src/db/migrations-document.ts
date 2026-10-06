import { createHash } from 'node:crypto';

import { Schema } from 'effect';

import { SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { splitStatements } from './statements.ts';

// The numbered migrations under `apps/studio/api/migrations/` reach the image
// as one JSON document, `dist/migrations.json`, rendered at build time by
// `scripts/render-migrations.ts`. This module is the part both sides share:
// the document's shape, how its artefacts hash, and the verification
// `studio-api migrate` runs before it issues a single statement. It imports no
// drizzle-kit and no node-postgres, because the migrate bundle carries
// neither.

/** Executed in this order inside one migration (#1901 D-2). */
export const EXECUTED_ARTEFACTS = [
  'delta.sql',
  'backfill.sql',
  'sidecars.sql',
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

function withoutComments(statement: string): string {
  return statement.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * A statement the runner's one transaction cannot carry: Postgres refuses
 * `CREATE INDEX CONCURRENTLY` inside a transaction block, and a value added by
 * `ALTER TYPE … ADD VALUE` cannot be used before the transaction that added it
 * commits. Either one is split across two releases instead.
 */
export function forbiddenStatement(script: string): string | null {
  for (const statement of splitStatements(script)) {
    const text = withoutComments(statement);
    if (/\bCONCURRENTLY\b/i.test(text)) return statement;
    if (/\bALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i.test(text)) return statement;
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
  if (canonicalOrder(recorded).join('\n') !== expected.join('\n')) {
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
        `Migration ${version}'s ${name} carries a statement one transaction cannot run; split it into two releases: ${forbidden}`,
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
