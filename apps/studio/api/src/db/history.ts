import { asc } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Effect, Schema } from 'effect';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { sqlErrorsOnly } from './errors.ts';
import { Transaction } from './tenant.ts';

// Which numbered migrations a database carries (#1901). Written only by
// `studio-api migrate`, inside the transaction that applies them, so a failed
// run leaves no row.
//
// Declared with drizzle for the builder's sake, and deliberately kept out of
// `SCHEMA` and `SCHEMA_TABLES`: the table is the migration system's own
// bookkeeping, not part of the schema a migration describes, so it does not
// move `SCHEMA_FINGERPRINT`, and `apply-schema` (which never touches a migrated
// database) never creates it.

export const HISTORY_TABLE = 'studio_migrations';

const studioMigrations = pgTable(HISTORY_TABLE, {
  version: text('version').primaryKey(),
  ordinal: integer('ordinal').notNull().unique(),
  manifestHash: text('manifest_hash').notNull(),
  artefactHashes: jsonb('artefact_hashes')
    .$type<Record<string, string>>()
    .notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  appliedBy: text('applied_by').notNull(),
});

/** Raw because the table is outside `SCHEMA`, so drizzle-kit never renders it. */
const HISTORY_TABLE_SQL = `CREATE TABLE IF NOT EXISTS public.${HISTORY_TABLE} (
  version text PRIMARY KEY,
  ordinal int NOT NULL UNIQUE,
  manifest_hash text NOT NULL,
  artefact_hashes jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL
)`;

/**
 * Every migration re-runs the complete sidecars, and the broad grant among
 * them covers every table in `public` — this one included. Neither
 * application role may read or rewrite the history the verdicts below trust.
 */
const HISTORY_REVOKE_SQL = `REVOKE ALL ON public.${HISTORY_TABLE} FROM PUBLIC, ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}`;

export type RecordedMigration = {
  readonly version: string;
  readonly ordinal: number;
  readonly manifestHash: string;
  readonly artefactHashes: Readonly<Record<string, string>>;
  readonly appliedAt: Date;
  readonly appliedBy: string;
};

/** What the image carries for one migration: its manifest's identity and hashes. */
export type ImageMigration = {
  readonly version: string;
  readonly ordinal: number;
  readonly combined: string;
  readonly artefacts: Readonly<Record<string, string>>;
};

const ArtefactHashes = Schema.Record(Schema.String, Schema.String);
const decodeArtefactHashes = Schema.decodeUnknownSync(ArtefactHashes);

export const createHistoryTable = Effect.fn('db.history.create')(function* () {
  const { sql } = yield* Transaction;
  yield* sql.unsafe(HISTORY_TABLE_SQL);
}, sqlErrorsOnly);

export const revokeHistory = Effect.fn('db.history.revoke')(function* () {
  const { sql } = yield* Transaction;
  yield* sql.unsafe(HISTORY_REVOKE_SQL);
}, sqlErrorsOnly);

/** Ordered by ordinal. Requires the table to exist. */
export const readHistory = Effect.fn('db.history.read')(function* () {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select()
    .from(studioMigrations)
    .orderBy(asc(studioMigrations.ordinal));
  return rows.map((row): RecordedMigration => ({
    ...row,
    artefactHashes: decodeArtefactHashes(row.artefactHashes),
  }));
}, sqlErrorsOnly);

export const recordApplied = Effect.fn('db.history.record')(function* (
  migration: ImageMigration,
  appliedBy: string,
) {
  const { tx } = yield* Transaction;
  yield* tx.insert(studioMigrations).values({
    version: migration.version,
    ordinal: migration.ordinal,
    manifestHash: migration.combined,
    artefactHashes: { ...migration.artefacts },
    appliedBy,
  });
}, sqlErrorsOnly);

export type HistoryVerdict =
  | { readonly kind: 'pending'; readonly pending: readonly ImageMigration[] }
  | { readonly kind: 'newer'; readonly recorded: RecordedMigration }
  | {
      readonly kind: 'reordered';
      readonly recorded: RecordedMigration;
      readonly image: ImageMigration;
    }
  | {
      readonly kind: 'edited';
      readonly recorded: RecordedMigration;
      readonly artefact: string;
    };

function editedArtefact(
  recorded: RecordedMigration,
  image: ImageMigration,
): string | null {
  const names = [
    ...new Set([
      ...Object.keys(image.artefacts),
      ...Object.keys(recorded.artefactHashes),
    ]),
  ];
  const changed = names.find(
    (name) => recorded.artefactHashes[name] !== image.artefacts[name],
  );
  if (changed !== undefined) return changed;
  return recorded.manifestHash === image.combined ? null : 'manifest.json';
}

/**
 * Evaluated in this order, so each refusal names the most useful cause.
 * Reordered: where both lists have a migration, a recorded position holds a
 * different version than the image's (a version names its ordinal, so a moved
 * or replaced migration always shows up here). Newer: the database records
 * more migrations than the image carries, over a matching prefix. Edited: the
 * same version at the same position with an artefact that hashes differently,
 * compared per artefact rather than only by the combined hash, so the refusal
 * can name the file. Otherwise, everything past the recorded prefix is
 * pending.
 */
export function historyVerdict(
  recorded: readonly RecordedMigration[],
  image: readonly ImageMigration[],
): HistoryVerdict {
  const overlap = Math.min(recorded.length, image.length);
  for (const [index, row] of recorded.slice(0, overlap).entries()) {
    const candidate = image[index]!;
    if (
      candidate.version !== row.version ||
      candidate.ordinal !== row.ordinal
    ) {
      return { kind: 'reordered', recorded: row, image: candidate };
    }
  }

  const newer = recorded.at(-1);
  if (recorded.length > image.length && newer !== undefined) {
    return { kind: 'newer', recorded: newer };
  }

  for (const [index, row] of recorded.entries()) {
    const artefact = editedArtefact(row, image[index]!);
    if (artefact !== null) return { kind: 'edited', recorded: row, artefact };
  }

  return { kind: 'pending', pending: image.slice(recorded.length) };
}

export class MigrationHistoryRefused extends Schema.TaggedError<MigrationHistoryRefused>()(
  'MigrationHistoryRefused',
  {
    verdict: Schema.Literals([
      'newer',
      'reordered',
      'edited',
      'foreign',
      'inconsistent',
      'role',
      'transaction',
      'session',
    ]),
    message: Schema.String,
  },
) {}

const appliedOn = (row: RecordedMigration) => row.appliedAt.toISOString();

/** Every refusal names its remedy (#1901 amendments). */
export function refusalFor(
  verdict: Exclude<HistoryVerdict, { kind: 'pending' }>,
): MigrationHistoryRefused {
  switch (verdict.kind) {
    case 'newer':
      return new MigrationHistoryRefused({
        verdict: 'newer',
        message: `This database was migrated by a newer Studio (${verdict.recorded.version} applied ${appliedOn(verdict.recorded)} by ${verdict.recorded.appliedBy}), which this image does not carry. Run that image or a newer one, or restore the backup taken before the upgrade.`,
      });
    case 'reordered':
      return new MigrationHistoryRefused({
        verdict: 'reordered',
        message: `This image's migration ${verdict.image.version} is not the one applied at that position on ${appliedOn(verdict.recorded)} (${verdict.recorded.version}): this build is not a release of the history this database carries. Deploy the released image.`,
      });
    case 'edited':
      return new MigrationHistoryRefused({
        verdict: 'edited',
        message: `This image's migration ${verdict.recorded.version} is not the one applied on ${appliedOn(verdict.recorded)}: its ${verdict.artefact} differs from what was applied, so this build is not a release of the history this database carries. Deploy the released image.`,
      });
  }
}
