import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateDrizzleJson } from 'drizzle-kit/api-postgres';
import { describe, expect, it } from 'vitest';

import { computeSchemaFingerprint } from '../../../../scripts/apply.ts';
import { SCHEMA, SIDECARS } from '../../schema.ts';
import { jsonHash, readMigrations, sha256 } from '../artifact.ts';

const directory = fileURLToPath(
  new URL('../../../../migrations', import.meta.url),
);

describe('shipped migration artifacts', () => {
  it('reaches the current Drizzle definitions and exact ordered sidecars', async () => {
    const migrations = await readMigrations(directory);
    expect(migrations.length).toBeGreaterThan(0);
    const latest = migrations.at(-1)!;
    const currentSnapshot = await generateDrizzleJson(SCHEMA);
    // Drizzle generates fresh snapshot IDs; the schema definition is ddl.
    expect(latest.snapshot.ddl).toEqual(currentSnapshot.ddl);
    expect(latest.snapshot.version).toBe(currentSnapshot.version);
    expect(latest.manifest.fingerprint).toBe(await computeSchemaFingerprint());
    expect(latest.sidecars).toBe(SIDECARS.join('\n') + '\n');
    expect(
      latest.sidecars.lastIndexOf('REVOKE UPDATE, DELETE, TRUNCATE'),
    ).toBeGreaterThan(
      latest.sidecars.lastIndexOf('GRANT SELECT, INSERT, UPDATE, DELETE'),
    );
  });

  it.each(['migration.sql', 'sidecars.sql', 'snapshot.json'])(
    'refuses changed %s before connecting to a database',
    async (changed) => {
      const scratch = await mkdtemp(
        join(tmpdir(), 'studio-migration-artifact-'),
      );
      try {
        const initial = (await readMigrations(directory))[0]!;
        const target = join(scratch, initial.manifest.id);
        await mkdir(target);
        for (const name of [
          'manifest.json',
          'migration.sql',
          'sidecars.sql',
          'snapshot.json',
        ]) {
          let contents = await readFile(
            join(directory, initial.manifest.id, name),
            'utf8',
          );
          if (name === changed)
            contents = name.endsWith('.json')
              ? JSON.stringify({ altered: true })
              : contents + '\n-- edited historical SQL\n';
          await writeFile(join(target, name), contents);
        }
        await expect(readMigrations(scratch)).rejects.toThrow(
          'checksum mismatch',
        );
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    },
  );

  it('binds every source component into the migration identity', async () => {
    const migration = (await readMigrations(directory))[0]!;
    expect(migration.manifest.sqlHash).toBe(sha256(migration.sql));
    expect(migration.manifest.sidecarsHash).toBe(sha256(migration.sidecars));
    expect(migration.manifest.snapshotHash).toBe(jsonHash(migration.snapshot));
    expect(migration.checksum).toBe(jsonHash(migration.manifest));
    expect(
      jsonHash({ ...migration.manifest, fingerprint: 'f'.repeat(64) }),
    ).not.toBe(migration.checksum);
  });

  it('refuses an empty history', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'studio-migration-empty-'));
    try {
      await expect(readMigrations(scratch)).rejects.toThrow(
        'No versioned Studio migrations',
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
