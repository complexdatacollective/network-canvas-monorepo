import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { Schema } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';

import {
  decodeManifest,
  hashArtefacts,
} from '../../src/db/migrations-document.ts';
import { splitStatements } from '../../src/db/statements.ts';
import { schemaFingerprintOf } from '../apply.ts';
import {
  GenerateRefused,
  type GeneratorInputs,
  type GeneratorRequest,
  generateMigrationDirectory,
} from '../migrate-generate.ts';
import { readMigrationsDocument } from '../render-migrations.ts';

// Small fixture schemas in a temporary directory: the generator is driven
// through its exported function with every input injected, so nothing here
// touches the real SCHEMA or the committed migrations.

const notes = (
  columns: 'body' | 'text' | 'none' | 'required-body',
  indexName = 'fx_notes_team_idx',
  code: 'none' | 'required' | 'defaulted' | 'nullable' = 'none',
) =>
  pgTable(
    'fx_notes',
    {
      id: integer('id').primaryKey(),
      team: text('team').notNull(),
      ...(columns === 'body' ? { body: text('body') } : {}),
      ...(columns === 'required-body' ? { body: text('body').notNull() } : {}),
      ...(columns === 'text' ? { text: text('text') } : {}),
      ...(code === 'required' ? { code: text('code').notNull() } : {}),
      ...(code === 'defaulted'
        ? { code: text('code').notNull().default('none') }
        : {}),
      ...(code === 'nullable' ? { code: text('code') } : {}),
    },
    (table) => [
      index(indexName).on(table.team),
      check('fx_notes_id_check', sql`${table.id} > 0`),
    ],
  );

const teams = () =>
  pgTable('fx_teams', { id: text('id').primaryKey(), name: text('name') });

const extra = () => pgTable('fx_extra', { id: integer('id').primaryKey() });

const V1 = { teams: teams(), notes: notes('body') };
const SIDECARS = [
  'CREATE OR REPLACE FUNCTION fx_one() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;',
];
const JOBS = ['CREATE SCHEMA IF NOT EXISTS fx_jobs;'];

async function fingerprintOf(
  schema: Record<string, unknown>,
  sidecars: readonly string[] = SIDECARS,
  jobStatements: readonly string[] = JOBS,
): Promise<string> {
  const statements = await generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson(schema),
  );
  return schemaFingerprintOf(statements, sidecars, jobStatements);
}

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function migrationsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'studio-migrations-'));
  dirs.push(dir);
  return join(dir, 'migrations');
}

async function inputsFor(
  dir: string,
  schema: Record<string, unknown>,
  overrides: Partial<GeneratorInputs> = {},
): Promise<GeneratorInputs> {
  const sidecars = overrides.sidecars ?? SIDECARS;
  const jobStatements = overrides.jobStatements ?? JOBS;
  return {
    schema,
    sidecars,
    jobStatements,
    committedFingerprint: await fingerprintOf(schema, sidecars, jobStatements),
    dir,
    isReleased: () => false,
    ...overrides,
  };
}

/** Every file under the directory with its size and modification time. */
function listing(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true })
      .map(String)
      .toSorted()
      .map((path) => {
        const stat = statSync(join(dir, path));
        return `${path} ${stat.size} ${stat.mtimeMs}`;
      });
  } catch {
    return ['(absent)'];
  }
}

async function refusal(
  inputs: GeneratorInputs,
  request: GeneratorRequest,
): Promise<GenerateRefused> {
  const outcome = await generateMigrationDirectory(inputs, request).then(
    (result) => result,
    (error: unknown) => error,
  );
  if (outcome instanceof GenerateRefused) return outcome;
  throw new Error(
    `expected a refusal, got ${outcome instanceof Error ? outcome.stack : JSON.stringify(outcome)}`,
  );
}

const read = (dir: string, version: string, name: string) =>
  readFileSync(join(dir, version, name), 'utf8');

async function initial(dir: string) {
  const result = await generateMigrationDirectory(await inputsFor(dir, V1), {
    kind: 'generate',
    name: 'initial',
  });
  expect(result).toMatchObject({ kind: 'written', version: '0001_initial' });
}

describe('migrate:generate', () => {
  it('writes the first migration from an empty database, with a manifest that re-hashes to itself', async () => {
    const dir = migrationsDir();
    await initial(dir);

    expect(readdirSync(join(dir, '0001_initial')).toSorted()).toEqual([
      'delta.sql',
      'manifest.json',
      'sidecars.sql',
      'snapshot.json',
    ]);
    expect(read(dir, '0001_initial', 'delta.sql')).toMatch(
      /CREATE TABLE "fx_notes"/,
    );
    expect(read(dir, '0001_initial', 'sidecars.sql')).toBe(
      [...SIDECARS, ...JOBS].join('\n'),
    );

    const manifest = decodeManifest(read(dir, '0001_initial', 'manifest.json'));
    const rehashed = hashArtefacts({
      'delta.sql': read(dir, '0001_initial', 'delta.sql'),
      'sidecars.sql': read(dir, '0001_initial', 'sidecars.sql'),
      'snapshot.json': read(dir, '0001_initial', 'snapshot.json'),
    });
    expect(manifest).toMatchObject({
      version: '0001_initial',
      ordinal: 1,
      fingerprint: await fingerprintOf(V1),
      drops: [],
      artefacts: rehashed.artefacts,
      combined: rehashed.combined,
    });
    expect(
      readMigrationsDocument(dir, await fingerprintOf(V1)).migrations,
    ).toHaveLength(1);
  });

  // #1901 E-10: "regenerate and diff" is an audit only if generating twice
  // from one tree writes the same bytes.
  it('writes the same bytes every time from the same tree, chaining each snapshot to the last', async () => {
    const contents = async () => {
      const dir = migrationsDir();
      await initial(dir);
      await generateMigrationDirectory(
        await inputsFor(dir, {
          teams: teams(),
          notes: notes('body'),
          extra: extra(),
        }),
        { kind: 'generate', name: 'extra' },
      );
      return Object.fromEntries(
        readdirSync(dir, { recursive: true })
          .map(String)
          .filter((path) => statSync(join(dir, path)).isFile())
          .toSorted()
          .map((path) => [path, readFileSync(join(dir, path), 'utf8')]),
      );
    };
    const first = await contents();
    expect(Object.keys(first)).toHaveLength(8);
    expect(await contents()).toEqual(first);

    const snapshot = (version: string) =>
      Schema.decodeUnknownSync(
        Schema.fromJsonString(
          Schema.Struct({
            id: Schema.String,
            prevIds: Schema.Array(Schema.String),
          }),
        ),
      )(first[join(version, 'snapshot.json')]);
    expect(snapshot('0001_initial').prevIds).toEqual([
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(snapshot('0002_extra').prevIds).toEqual([
      snapshot('0001_initial').id,
    ]);
    expect(snapshot('0002_extra').id).not.toBe(snapshot('0001_initial').id);
  });

  it('writes nothing, and succeeds, when nothing changed', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const before = listing(dir);

    const result = await generateMigrationDirectory(await inputsFor(dir, V1), {
      kind: 'generate',
      name: 'again',
    });
    expect(result).toEqual({ kind: 'unchanged', newest: '0001_initial' });
    expect(listing(dir)).toEqual(before);
  });

  it('refuses a stale fingerprint before anything is written', async () => {
    const fresh = migrationsDir();
    const stale = await refusal(
      await inputsFor(fresh, V1, { committedFingerprint: 'f'.repeat(64) }),
      { kind: 'generate', name: 'initial' },
    );
    expect(stale.message).toMatch(/fingerprint\.generated\.ts is stale/);
    expect(stale.message).toMatch(/sync-fingerprint/);
    expect(listing(fresh)).toEqual(['(absent)']);

    const dir = migrationsDir();
    await initial(dir);
    const before = listing(dir);
    const v2 = { teams: teams(), notes: notes('body'), extra: extra() };
    await refusal(
      await inputsFor(dir, v2, { committedFingerprint: 'f'.repeat(64) }),
      { kind: 'generate', name: 'second' },
    );
    expect(listing(dir)).toEqual(before);
  });

  it('refuses an ambiguous column change, naming both candidates, and writes nothing', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const before = listing(dir);

    const renamed = await refusal(
      await inputsFor(dir, { teams: teams(), notes: notes('text') }),
      { kind: 'generate', name: 'rename', drops: ['public.fx_notes.body'] },
    );
    expect(renamed.message).toContain(
      'ambiguous column change in public.fx_notes: removed [body] and added [text]',
    );
    expect(renamed.message).toMatch(/--hand-written/);
    expect(listing(dir)).toEqual(before);
  });

  it('refuses an ambiguous table change, naming both candidates', async () => {
    const dir = migrationsDir();
    await initial(dir);

    const renamed = await refusal(
      await inputsFor(dir, {
        renamed: pgTable('fx_groups', {
          id: text('id').primaryKey(),
          name: text('name'),
        }),
        notes: notes('body'),
      }),
      { kind: 'generate', name: 'rename', drops: ['public.fx_teams'] },
    );
    expect(renamed.message).toContain(
      'ambiguous table change: removed [public.fx_teams] and added [public.fx_groups]',
    );
  });

  it('refuses a data-bearing drop the author did not name', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const before = listing(dir);
    const v2 = { teams: teams(), notes: notes('none') };

    const unnamed = await refusal(await inputsFor(dir, v2), {
      kind: 'generate',
      name: 'drop_body',
    });
    expect(unnamed.message).toContain(
      'This change drops [public.fx_notes.body]',
    );
    expect(listing(dir)).toEqual(before);

    const misnamed = await refusal(await inputsFor(dir, v2), {
      kind: 'generate',
      name: 'drop_body',
      drops: ['public.fx_notes.team'],
    });
    expect(misnamed.message).toContain('--drop names [public.fx_notes.team]');

    const result = await generateMigrationDirectory(await inputsFor(dir, v2), {
      kind: 'generate',
      name: 'drop_body',
      drops: ['public.fx_notes.body'],
    });
    expect(result).toMatchObject({
      kind: 'written',
      version: '0002_drop_body',
    });
    expect(read(dir, '0002_drop_body', 'delta.sql')).toContain(
      'ALTER TABLE "fx_notes" DROP COLUMN "body";',
    );
    expect(
      decodeManifest(read(dir, '0002_drop_body', 'manifest.json')).drops,
    ).toEqual(['public.fx_notes.body']);
  });

  it('swaps an index or a check without a flag, drop before create', async () => {
    const dir = migrationsDir();
    await initial(dir);

    const swapped = {
      teams: teams(),
      notes: notes('body', 'fx_notes_team_v2_idx'),
    };
    const result = await generateMigrationDirectory(
      await inputsFor(dir, swapped),
      { kind: 'generate', name: 'swap_index' },
    );
    expect(result).toMatchObject({ kind: 'written', statements: 2 });
    const statements = splitStatements(
      read(dir, '0002_swap_index', 'delta.sql'),
    );
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/DROP INDEX "fx_notes_team_idx"$/);
    expect(statements[1]).toMatch(/^CREATE INDEX "fx_notes_team_v2_idx"/);
  });

  it('gives a sidecar-only change an empty delta', async () => {
    const dir = migrationsDir();
    await initial(dir);

    const sidecars = [
      ...SIDECARS,
      'CREATE OR REPLACE FUNCTION fx_two() RETURNS int AS $$ SELECT 2 $$ LANGUAGE sql;',
    ];
    const result = await generateMigrationDirectory(
      await inputsFor(dir, V1, { sidecars }),
      { kind: 'generate', name: 'sidecar' },
    );
    expect(result).toMatchObject({ kind: 'written', statements: 0 });
    expect(splitStatements(read(dir, '0002_sidecar', 'delta.sql'))).toEqual([]);
    expect(read(dir, '0002_sidecar', 'sidecars.sql')).toBe(
      [...sidecars, ...JOBS].join('\n'),
    );
    expect(
      readMigrationsDocument(dir, await fingerprintOf(V1, sidecars)).migrations,
    ).toHaveLength(2);
  });

  it('lets the author hand-write an ambiguous change and seal it', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const v2 = { teams: teams(), notes: notes('text') };
    const inputs = await inputsFor(dir, v2);

    const written = await generateMigrationDirectory(inputs, {
      kind: 'generate',
      name: 'rename_body',
      handWritten: true,
    });
    expect(written).toMatchObject({
      kind: 'written',
      version: '0002_rename_body',
      handWritten: true,
    });
    const header = read(dir, '0002_rename_body', 'delta.sql');
    expect(header).toContain('removed [body] and added [text]');
    expect(readdirSync(join(dir, '0002_rename_body'))).not.toContain(
      'manifest.json',
    );

    // Unsealed: neither the next generation nor the build will take it.
    expect(
      (await refusal(inputs, { kind: 'generate', name: 'next' })).message,
    ).toMatch(/0002_rename_body is not sealed/);
    expect(() =>
      readMigrationsDocument(dir, inputs.committedFingerprint),
    ).toThrow(/not sealed/);
    expect((await refusal(inputs, { kind: 'seal' })).message).toMatch(
      /has no statements yet/,
    );

    writeFileSync(
      join(dir, '0002_rename_body', 'delta.sql'),
      `${header}ALTER TABLE "fx_notes" RENAME COLUMN "body" TO "text";\n`,
    );
    // The snapshot diff shows the old name as dropped, as it does on the
    // generated path: the author names it, having accounted for its data.
    expect((await refusal(inputs, { kind: 'seal' })).message).toContain(
      'This change drops [public.fx_notes.body], and --drop names nothing.',
    );
    expect(
      await generateMigrationDirectory(inputs, {
        kind: 'seal',
        drops: ['public.fx_notes.body'],
      }),
    ).toEqual({
      kind: 'sealed',
      version: '0002_rename_body',
    });
    expect(
      decodeManifest(read(dir, '0002_rename_body', 'manifest.json')).drops,
    ).toEqual(['public.fx_notes.body']);
    const document = readMigrationsDocument(dir, inputs.committedFingerprint);
    expect(document.migrations.map(({ version }) => version)).toEqual([
      '0001_initial',
      '0002_rename_body',
    ]);
  });

  it('seals a backfill added to a generated migration', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const v2 = {
      teams: teams(),
      notes: notes('body'),
      extra: pgTable('fx_extra', { id: integer('id').primaryKey() }),
    };
    const inputs = await inputsFor(dir, v2);
    await generateMigrationDirectory(inputs, {
      kind: 'generate',
      name: 'extra',
    });

    writeFileSync(
      join(dir, '0002_extra', 'backfill.sql'),
      'INSERT INTO fx_extra (id) VALUES (1);\n',
    );
    expect(() =>
      readMigrationsDocument(dir, inputs.committedFingerprint),
    ).toThrow(/backfill\.sql/);

    await generateMigrationDirectory(inputs, { kind: 'seal' });
    const migration = readMigrationsDocument(
      dir,
      inputs.committedFingerprint,
    ).migrations.at(-1);
    expect(migration?.artefacts.map(({ name }) => name)).toEqual([
      'delta.sql',
      'sidecars.sql',
      'backfill.sql',
    ]);
  });

  it('refuses to seal a migration origin/main already carries', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const before = listing(dir);
    const released = await refusal(
      await inputsFor(dir, V1, {
        isReleased: (version) => version === '0001_initial',
      }),
      { kind: 'seal' },
    );
    expect(released.message).toMatch(/0001_initial is on origin\/main/);
    expect(listing(dir)).toEqual(before);
  });

  it('refuses to seal a migration whose snapshot the schema has moved past', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const moved = { teams: teams(), notes: notes('body'), extra: extra() };
    expect(
      (await refusal(await inputsFor(dir, moved), { kind: 'seal' })).message,
    ).toMatch(/snapshot\.json is not the current Drizzle schema/);
  });

  // #1901 E-4: on the empty database every suite builds, the generated ALTER
  // passes; on a deployment whose table has a row, it fails.
  it('refuses a column made NOT NULL with no default on an existing table, and writes nothing', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const before = listing(dir);

    const added = await refusal(
      await inputsFor(dir, {
        teams: teams(),
        notes: notes('body', undefined, 'required'),
      }),
      { kind: 'generate', name: 'code' },
    );
    expect(added.message).toContain(
      'This change makes [public.fx_notes.code] NOT NULL with no default',
    );
    expect(added.message).toMatch(/--hand-written/);
    expect(added.message).toMatch(/SET NOT NULL/);

    const tightened = await refusal(
      await inputsFor(dir, { teams: teams(), notes: notes('required-body') }),
      { kind: 'generate', name: 'body_required' },
    );
    expect(tightened.message).toContain('[public.fx_notes.body] NOT NULL');
    expect(listing(dir)).toEqual(before);

    // Each of these the generator writes: a default fills the rows, a
    // nullable column needs nothing, and a new table has no rows.
    for (const [name, schema] of [
      [
        'defaulted',
        { teams: teams(), notes: notes('body', undefined, 'defaulted') },
      ],
      [
        'nullable',
        { teams: teams(), notes: notes('body', undefined, 'nullable') },
      ],
      [
        'new_table',
        {
          teams: teams(),
          notes: notes('body'),
          extra: pgTable('fx_extra', {
            id: integer('id').primaryKey(),
            label: text('label').notNull(),
          }),
        },
      ],
    ] as const) {
      const fresh = migrationsDir();
      await initial(fresh);
      expect(
        await generateMigrationDirectory(await inputsFor(fresh, schema), {
          kind: 'generate',
          name,
        }),
        name,
      ).toMatchObject({ kind: 'written', version: `0002_${name}` });
    }
  });

  it('seals a NOT NULL column only with a backfill, and only when the delta leaves it nullable', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const inputs = await inputsFor(dir, {
      teams: teams(),
      notes: notes('body', undefined, 'required'),
    });
    await generateMigrationDirectory(inputs, {
      kind: 'generate',
      name: 'code',
      handWritten: true,
    });
    const header = read(dir, '0002_code', 'delta.sql');
    expect(header).toContain(
      'NOT NULL with no default on an existing table: public.fx_notes.code.',
    );

    const write = (name: string, content: string) =>
      writeFileSync(join(dir, '0002_code', name), content);

    write(
      'delta.sql',
      `${header}ALTER TABLE "fx_notes" ADD COLUMN "code" text;\n`,
    );
    expect((await refusal(inputs, { kind: 'seal' })).message).toMatch(
      /0002_code makes \[public\.fx_notes\.code\] NOT NULL with no default on an existing table, and has no backfill\.sql/,
    );

    const backfill = [
      'SET LOCAL ROLE studio_maintenance;',
      `UPDATE fx_notes SET code = 'legacy';`,
      'RESET ROLE;',
      'ALTER TABLE fx_notes ALTER COLUMN code SET NOT NULL;',
      '',
    ].join('\n');
    write('backfill.sql', backfill);
    for (const delta of [
      'ALTER TABLE "fx_notes" ADD COLUMN "code" text NOT NULL;',
      'alter table public.fx_notes add code text not null;',
      'ALTER TABLE "fx_notes" ADD COLUMN "code" text;\nALTER TABLE "fx_notes" ALTER COLUMN "code" SET NOT NULL;',
    ]) {
      write('delta.sql', `${header}${delta}\n`);
      expect((await refusal(inputs, { kind: 'seal' })).message, delta).toMatch(
        /0002_code\/delta\.sql makes \[public\.fx_notes\.code\] NOT NULL before the backfill can fill it/,
      );
    }

    write(
      'delta.sql',
      `${header}ALTER TABLE "fx_notes" ADD COLUMN "code" text;\n`,
    );
    expect(await generateMigrationDirectory(inputs, { kind: 'seal' })).toEqual({
      kind: 'sealed',
      version: '0002_code',
    });
  });

  // #1901 E-5: --drop on the hand-written path is checked against the same
  // snapshot diff as on the generated one.
  it('refuses to seal a hand-written drop the author did not name', async () => {
    const dir = migrationsDir();
    await initial(dir);
    const inputs = await inputsFor(dir, {
      teams: teams(),
      notes: notes('text'),
    });
    await generateMigrationDirectory(inputs, {
      kind: 'generate',
      name: 'swap_body',
      handWritten: true,
    });
    const header = read(dir, '0002_swap_body', 'delta.sql');
    // The tempting wrong delta for a rename: the data in `body` is gone.
    writeFileSync(
      join(dir, '0002_swap_body', 'delta.sql'),
      `${header}ALTER TABLE "fx_notes" DROP COLUMN "body";\nALTER TABLE "fx_notes" ADD COLUMN "text" text;\n`,
    );
    const before = listing(dir);

    for (const drops of [undefined, [], ['public.fx_notes.team']]) {
      expect(
        (
          await refusal(inputs, {
            kind: 'seal',
            ...(drops === undefined ? {} : { drops }),
          })
        ).message,
        JSON.stringify(drops),
      ).toContain('This change drops [public.fx_notes.body]');
    }
    expect(listing(dir)).toEqual(before);

    await generateMigrationDirectory(inputs, {
      kind: 'seal',
      drops: ['public.fx_notes.body'],
    });
    expect(
      decodeManifest(read(dir, '0002_swap_body', 'manifest.json')).drops,
    ).toEqual(['public.fx_notes.body']);
    // A re-seal keeps the drops it was sealed with.
    expect(await generateMigrationDirectory(inputs, { kind: 'seal' })).toEqual({
      kind: 'sealed',
      version: '0002_swap_body',
    });
  });

  it('refuses to number a migration beside a directory that is not one', async () => {
    const dir = migrationsDir();
    await initial(dir);
    mkdirSync(join(dir, '0002-display-name'));
    expect(
      (
        await refusal(
          await inputsFor(dir, {
            teams: teams(),
            notes: notes('body'),
            extra: extra(),
          }),
          { kind: 'generate', name: 'extra' },
        )
      ).message,
    ).toMatch(/directories that are not migrations: 0002-display-name\./);
  });

  it('refuses a statement the one transaction cannot run', async () => {
    const dir = migrationsDir();
    await initial(dir);
    writeFileSync(
      join(dir, '0001_initial', 'backfill.sql'),
      'CREATE INDEX CONCURRENTLY fx_idx ON fx_notes (team);\n',
    );
    expect(
      (await refusal(await inputsFor(dir, V1), { kind: 'seal' })).message,
    ).toMatch(/split it across two releases/);
  });

  it('refuses to seal a backfill that controls the transaction itself', async () => {
    const dir = migrationsDir();
    await initial(dir);
    writeFileSync(
      join(dir, '0001_initial', 'backfill.sql'),
      'BEGIN;\nUPDATE fx_notes SET body = team;\nCOMMIT;\n',
    );
    const before = listing(dir);
    expect(
      (await refusal(await inputsFor(dir, V1), { kind: 'seal' })).message,
    ).toMatch(
      /0001_initial\/backfill\.sql carries a statement the migration's one transaction cannot run; remove it: .*\nBEGIN$/,
    );
    expect(listing(dir)).toEqual(before);
  });
});
