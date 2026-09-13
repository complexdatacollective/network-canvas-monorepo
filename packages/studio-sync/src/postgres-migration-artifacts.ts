import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const migrationId = z.string().regex(/^\d{4}_[a-z][a-z0-9_]*$/);

const manifestSchema = z.strictObject({
  format: z.literal(1),
  id: migrationId,
  previous: migrationId.nullable(),
  fingerprint: digest,
  snapshotHash: digest,
  sqlHash: digest,
  sidecarsHash: digest,
});

export type MigrationManifest = z.infer<typeof manifestSchema>;
export type Migration = {
  manifest: MigrationManifest;
  checksum: string;
  sql: string;
  sidecars: string;
  snapshot: Record<string, unknown>;
};

const migrationArtifactSchema = z.strictObject({
  manifest: manifestSchema,
  checksum: digest,
  sql: z.string(),
  sidecars: z.string(),
  snapshot: z.record(z.string(), z.unknown()),
});

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Formatting a JSON artifact must not change its migration identity. */
export function jsonHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

/** Snapshot and validate caller-owned artifacts before database access. */
export function copyPostgresMigrations(
  artifacts: readonly Migration[],
): Migration[] {
  if (!Array.isArray(artifacts)) throw new Error('Supply migration artifacts.');
  const migrations: Migration[] = [];
  for (const artifact of artifacts) {
    const parsed = migrationArtifactSchema.parse(artifact);
    const snapshot = structuredClone(parsed.snapshot);
    const previous = migrations.at(-1)?.manifest.id ?? null;
    const ordinal = String(migrations.length + 1).padStart(4, '0');
    if (
      !parsed.manifest.id.startsWith(`${ordinal}_`) ||
      parsed.manifest.previous !== previous
    ) {
      throw new Error(
        `Migration history is not a contiguous chain at ${parsed.manifest.id}.`,
      );
    }
    if (
      parsed.manifest.snapshotHash !== jsonHash(snapshot) ||
      parsed.manifest.sqlHash !== sha256(parsed.sql) ||
      parsed.manifest.sidecarsHash !== sha256(parsed.sidecars) ||
      parsed.checksum !== jsonHash(parsed.manifest)
    ) {
      throw new Error(
        `Migration artifact checksum mismatch: ${parsed.manifest.id}.`,
      );
    }
    migrations.push({ ...parsed, snapshot });
  }
  return migrations;
}

/** Validate every artifact and its order before a database is connected. */
export async function readMigrations(
  directory: string,
  applicationName = 'Studio',
): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => migrationId.parse(entry.name))
    .toSorted();
  if (names.length === 0)
    throw new Error(`No versioned ${applicationName} migrations found.`);

  const migrations: Migration[] = [];
  for (const name of names) {
    const root = join(directory, name);
    const [manifestText, snapshotText, sql, sidecars] = await Promise.all([
      readFile(join(root, 'manifest.json'), 'utf8'),
      readFile(join(root, 'snapshot.json'), 'utf8'),
      readFile(join(root, 'migration.sql'), 'utf8'),
      readFile(join(root, 'sidecars.sql'), 'utf8'),
    ]);
    const manifest = manifestSchema.parse(JSON.parse(manifestText));
    const snapshot = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(snapshotText));
    const previous = migrations.at(-1)?.manifest.id ?? null;
    const ordinal = String(migrations.length + 1).padStart(4, '0');
    if (
      manifest.id !== name ||
      !name.startsWith(`${ordinal}_`) ||
      manifest.previous !== previous
    ) {
      throw new Error(
        `Migration history is not a contiguous chain at ${name}.`,
      );
    }
    migrations.push({
      manifest,
      snapshot,
      sql,
      sidecars,
      checksum: jsonHash(manifest),
    });
  }
  return copyPostgresMigrations(migrations);
}
