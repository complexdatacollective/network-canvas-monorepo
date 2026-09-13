import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pgTable, text } from 'drizzle-orm/pg-core';
import { expect, it } from 'vitest';

import { readMigrations } from '../postgres-migration-artifacts.ts';
import {
  fingerprintPostgresSchema,
  generatePostgresMigrationFiles,
  readMigrationAuthoringOptions,
  renderPostgresSchemaStatements,
} from '../postgres-migration-authoring.ts';

it('authors a separate application chain through the same engine without overwriting history or guessing renames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'registry-authoring-'));
  const root = join(directory, 'migrations');
  const original = {
    item: pgTable('authoring_item', {
      id: text('id').primaryKey(),
      obsolete: text('obsolete'),
    }),
  };
  const updated = {
    item: pgTable('authoring_item', {
      id: text('id').primaryKey(),
      replacement: text('replacement'),
    }),
  };
  // Application-owned template literals may already end in blank lines. The
  // authored byte contract keeps exactly one final newline.
  const sidecarStatements = ['SELECT 1;', 'SELECT 2;\n\n'];
  const fingerprint = async (schema: typeof original | typeof updated) =>
    fingerprintPostgresSchema(
      await renderPostgresSchemaStatements(schema),
      sidecarStatements,
    );
  try {
    const initial = await generatePostgresMigrationFiles({
      applicationName: 'Template Registry',
      schema: original,
      sidecarStatements,
      expectedFingerprint: await fingerprint(original),
      root,
      name: 'initial',
    });
    expect(initial.id).toBe('0001_initial');
    const firstPaths = [
      'manifest.json',
      'snapshot.json',
      'migration.sql',
      'sidecars.sql',
    ].map((name) => join(root, initial.id, name));
    const before = await Promise.all(
      firstPaths.map((path) => readFile(path, 'utf8')),
    );
    expect(before).toHaveLength(4);
    const next = await generatePostgresMigrationFiles({
      applicationName: 'Template Registry',
      schema: updated,
      sidecarStatements,
      expectedFingerprint: await fingerprint(updated),
      root,
      name: 'replacement',
      before: 'SELECT 10;',
      after: 'SELECT 20;',
    });
    expect(next.id).toBe('0002_replacement');
    const chain = await readMigrations(root, 'Template Registry');
    expect(chain).toHaveLength(2);
    expect(chain[1]?.sql).toContain('ADD COLUMN "replacement"');
    expect(chain[1]?.sql).toContain('DROP COLUMN "obsolete"');
    expect(chain[1]?.sql).not.toContain('RENAME');
    expect(chain[1]?.sql.startsWith('SELECT 10;\n')).toBe(true);
    expect(chain[1]?.sql.endsWith('SELECT 20;\n')).toBe(true);
    expect(chain[1]?.sidecars).toBe('SELECT 1;\nSELECT 2;\n');
    expect(chain[1]?.manifest).toMatchObject({
      previous: '0001_initial',
      fingerprint: await fingerprint(updated),
    });
    expect(
      await Promise.all(firstPaths.map((path) => readFile(path, 'utf8'))),
    ).toEqual(before);
    await expect(
      generatePostgresMigrationFiles({
        schema: updated,
        sidecarStatements,
        expectedFingerprint: await fingerprint(updated),
        root,
        name: 'unchanged',
        before: 'SELECT 99;',
      }),
    ).rejects.toThrow('unchanged');
    await writeFile(firstPaths[2]!, 'SELECT 999;\n');
    await expect(
      generatePostgresMigrationFiles({
        schema: updated,
        sidecarStatements,
        expectedFingerprint: await fingerprint(updated),
        root,
        name: 'tampered',
      }),
    ).rejects.toThrow('checksum mismatch');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('preserves authored SQL bytes and rejects duplicate, missing or unknown CLI options', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'migration-authoring-options-'),
  );
  try {
    const before = join(directory, 'before.sql');
    const after = join(directory, 'after.sql');
    await writeFile(before, "SELECT 'before';\n");
    await writeFile(after, "SELECT 'after';\n");
    expect(
      await readMigrationAuthoringOptions([
        '--after',
        after,
        '--name',
        'verified',
        '--before',
        before,
      ]),
    ).toEqual({
      name: 'verified',
      before: "SELECT 'before';\n",
      after: "SELECT 'after';\n",
    });
    const invalid = [
      ['--name'],
      ['--name', 'first', '--name', 'second'],
      ['--unknown', 'value'],
      ['--before', before, '--after'],
    ];
    expect(invalid).toHaveLength(4);
    for (const args of invalid)
      await expect(readMigrationAuthoringOptions(args)).rejects.toThrow(
        'Usage: generate-migration',
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('snapshots caller-owned sidecars before authoring awaits', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'migration-sidecar-snapshot-'),
  );
  const root = join(directory, 'migrations');
  const schema = {
    item: pgTable('sidecar_snapshot_item', {
      id: text('id').primaryKey(),
    }),
  };
  const sidecarStatements = ['SELECT 1;'];
  const expectedFingerprint = fingerprintPostgresSchema(
    await renderPostgresSchemaStatements(schema),
    sidecarStatements,
  );
  try {
    const pending = generatePostgresMigrationFiles({
      schema,
      sidecarStatements,
      expectedFingerprint,
      root,
      name: 'initial',
    });
    sidecarStatements.splice(0, sidecarStatements.length, 'SELECT 2;');
    await expect(pending).resolves.toEqual({
      id: '0001_initial',
      statements: 1,
    });
    expect(
      await readFile(join(root, '0001_initial', 'sidecars.sql'), 'utf8'),
    ).toBe('SELECT 1;\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('refuses a schema that changes between fingerprinting and artifact generation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'migration-schema-snapshot-'));
  const original = pgTable('changing_schema', { id: text('id').primaryKey() });
  const changed = pgTable('changing_schema', {
    id: text('id').primaryKey(),
    added: text('added'),
  });
  const sidecarStatements = ['SELECT 1;'];
  const expectedFingerprint = fingerprintPostgresSchema(
    await renderPostgresSchemaStatements({ item: original }),
    sidecarStatements,
  );
  let reads = 0;
  // Deterministically model a caller replacing a table after the initial
  // rendering, while the author waits for the existing history on disk.
  const schema = {
    get item() {
      reads += 1;
      return reads === 1 ? original : changed;
    },
  };
  try {
    await expect(
      generatePostgresMigrationFiles({
        schema,
        sidecarStatements,
        expectedFingerprint,
        root,
        name: 'initial',
      }),
    ).rejects.toThrow('Schema changed during migration authoring');
    expect(reads).toBeGreaterThan(1);
    await expect(
      readFile(join(root, '0001_initial', 'manifest.json'), 'utf8'),
    ).rejects.toHaveProperty('code', 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
