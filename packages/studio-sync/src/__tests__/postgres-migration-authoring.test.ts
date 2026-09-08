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
  const sidecarStatements = ['SELECT 1;', 'SELECT 2;'];
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
