import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import { expect, it } from 'vitest';

import { generateMigrationFiles } from '../../../../scripts/generate-migration.ts';
import { SCHEMA_FINGERPRINT } from '../../fingerprint.generated.ts';
import { SCHEMA, SIDECARS } from '../../schema.ts';
import { jsonHash, readMigrations, sha256 } from '../artifact.ts';

it('authors a second checksummed migration from an existing current-version Drizzle snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-migration-authoring-'));
  try {
    const snapshot = await generateDrizzleJson(SCHEMA);
    snapshot.ddl = snapshot.ddl.filter(
      (entry) =>
        !(
          (entry.entityType === 'columns' &&
            entry.table === 'user' &&
            entry.name === 'locale') ||
          (entry.entityType === 'checks' &&
            entry.table === 'user' &&
            entry.name === 'user_locale_length_check')
        ),
    );
    const statements = await generateMigration(
      await generateDrizzleJson({}),
      snapshot,
    );
    const sql = statements.join('\n');
    const sidecars = SIDECARS.join('\n') + '\n';
    const id = '0001_before_locale';
    const manifest = {
      format: 1,
      id,
      previous: null,
      fingerprint: sha256([...statements, ...SIDECARS].join('\n')),
      snapshotHash: jsonHash(snapshot),
      sqlHash: sha256(sql),
      sidecarsHash: sha256(sidecars),
    };
    const initial = join(root, id);
    await mkdir(initial);
    await Promise.all([
      writeFile(join(initial, 'manifest.json'), JSON.stringify(manifest)),
      writeFile(join(initial, 'snapshot.json'), JSON.stringify(snapshot)),
      writeFile(join(initial, 'migration.sql'), sql),
      writeFile(join(initial, 'sidecars.sql'), sidecars),
    ]);
    const result = await generateMigrationFiles({ root, name: 'add_locale' });
    expect(result.id).toBe('0002_add_locale');
    expect(result.statements).toBeGreaterThan(0);
    const history = await readMigrations(root);
    expect(history).toHaveLength(2);
    expect(history[1]?.manifest).toMatchObject({
      previous: id,
      fingerprint: SCHEMA_FINGERPRINT,
    });
    expect(history[1]?.sql).toContain('ADD COLUMN "locale"');
    expect(history[1]?.snapshot.ddl).toEqual(
      (await generateDrizzleJson(SCHEMA)).ddl,
    );
    expect(await readFile(join(initial, 'snapshot.json'), 'utf8')).toBe(
      JSON.stringify(snapshot),
    );
    await expect(
      generateMigrationFiles({ root, name: 'unchanged' }),
    ).rejects.toThrow('unchanged');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
