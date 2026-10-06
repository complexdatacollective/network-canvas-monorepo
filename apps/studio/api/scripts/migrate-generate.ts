import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import { Schema } from 'effect';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import {
  decodeManifest,
  forbiddenStatement,
  hashArtefacts,
  MIGRATION_SLUG,
  MIGRATION_VERSION,
  type MigrationManifest,
  migrationVersion,
  SNAPSHOT_ARTEFACT,
} from '../src/db/migrations-document.ts';
import { SCHEMA, SIDECARS } from '../src/db/schema.ts';
import { splitStatements } from '../src/db/statements.ts';
import { renderJobStatements } from '../src/jobs/queues.ts';
import { schemaFingerprintOf } from './apply.ts';
import { MIGRATIONS_DIR } from './render-migrations.ts';

// `pnpm --filter @codaco/studio-api migrate:generate --name <slug>` (#1901).
//
// Writes the next numbered directory under `migrations/`: the drizzle-kit
// delta from the previous migration's snapshot to the current Drizzle schema,
// the complete ordered sidecars at this version, the snapshot, and a manifest
// of their hashes. `migrations/README.md` is the author's guide.
//
// drizzle-kit's programmatic API never guesses a rename, but when it meets one
// it throws an internal error naming neither side. So this runs its own
// preflight over the two snapshots first and refuses an ambiguous change
// naming both, and it refuses a data-bearing drop the author did not name with
// `--drop`. The author resolves an ambiguous change with `--hand-written`,
// writes the delta, and finishes with `--seal`.

type Snapshot = Awaited<ReturnType<typeof generateDrizzleJson>>;
type Entity = Snapshot['ddl'][number];

export type GeneratorInputs = {
  /** Drizzle table objects, as `SCHEMA`. */
  readonly schema: Record<string, unknown>;
  readonly sidecars: readonly string[];
  readonly jobStatements: readonly string[];
  /** The committed `SCHEMA_FINGERPRINT`. */
  readonly committedFingerprint: string;
  readonly dir: string;
  /** Whether a migration directory is present on `origin/main`. */
  readonly isReleased?: (version: string) => boolean;
};

export type GeneratorRequest =
  | {
      readonly kind: 'generate';
      readonly name: string;
      readonly drops?: readonly string[];
      readonly handWritten?: boolean;
    }
  | { readonly kind: 'seal'; readonly drops?: readonly string[] };

export type GeneratorResult =
  | { readonly kind: 'unchanged'; readonly newest: string }
  | {
      readonly kind: 'written';
      readonly version: string;
      readonly statements: number;
      readonly handWritten: boolean;
    }
  | { readonly kind: 'sealed'; readonly version: string };

export class GenerateRefused extends Error {}

const STALE_FINGERPRINT =
  'src/db/fingerprint.generated.ts is stale: the schema definitions have moved since it was written. Run: pnpm --filter @codaco/studio-api sync-fingerprint';

/** The kinds that carry data: dropping one and creating another may be a rename. */
const DATA_KINDS = new Set([
  'tables',
  'columns',
  'enums',
  'sequences',
  'schemas',
  'views',
  'roles',
]);

/** No data: a drop-then-create is exact, never a guessed rename. */
const NON_DATA_KINDS = new Set([
  'indexes',
  'checks',
  'uniques',
  'fks',
  'pks',
  'policies',
]);

const SINGULAR: Record<string, string> = {
  tables: 'table',
  columns: 'column',
  enums: 'enum',
  sequences: 'sequence',
  schemas: 'schema',
  views: 'view',
  roles: 'role',
};

function field(entity: Entity, name: 'schema' | 'table'): string | null {
  const value: unknown = Reflect.get(entity, name);
  return typeof value === 'string' ? value : null;
}

function entityKey(entity: Entity): string {
  return JSON.stringify([
    entity.entityType,
    field(entity, 'schema'),
    field(entity, 'table'),
    entity.name,
  ]);
}

function qualified(entity: Entity): string {
  return [field(entity, 'schema'), field(entity, 'table'), entity.name]
    .filter((part) => part !== null)
    .join('.');
}

type SnapshotDiff = {
  readonly removed: readonly Entity[];
  readonly added: readonly Entity[];
};

function diffSnapshots(prev: Snapshot, cur: Snapshot): SnapshotDiff {
  const prevKeys = new Set(prev.ddl.map(entityKey));
  const curKeys = new Set(cur.ddl.map(entityKey));
  return {
    removed: prev.ddl.filter((entity) => !curKeys.has(entityKey(entity))),
    added: cur.ddl.filter((entity) => !prevKeys.has(entityKey(entity))),
  };
}

/**
 * The scope drizzle-kit resolves a kind in: columns per table (of a table both
 * sides carry; a dropped table takes its columns with it), everything else
 * across the whole diff, because that is how `ddlDiff` groups them.
 */
function ambiguityScope(entity: Entity, survivors: Set<string>): string | null {
  if (!DATA_KINDS.has(entity.entityType)) return null;
  if (entity.entityType !== 'columns') return '';
  const table = `${field(entity, 'schema')}.${field(entity, 'table')}`;
  return survivors.has(table) ? table : null;
}

function tablesIn(snapshot: Snapshot): Set<string> {
  return new Set(
    snapshot.ddl
      .filter((entity) => entity.entityType === 'tables')
      .map((entity) => `${field(entity, 'schema')}.${entity.name}`),
  );
}

export function ambiguousChanges(prev: Snapshot, cur: Snapshot): string[] {
  const { removed, added } = diffSnapshots(prev, cur);
  const before = tablesIn(prev);
  const survivors = new Set([...tablesIn(cur)].filter((t) => before.has(t)));
  const groups = new Map<
    string,
    { kind: string; scope: string; removed: string[]; added: string[] }
  >();
  const collect = (entity: Entity, side: 'removed' | 'added') => {
    const scope = ambiguityScope(entity, survivors);
    if (scope === null) return;
    const key = JSON.stringify([entity.entityType, scope]);
    const group = groups.get(key) ?? {
      kind: SINGULAR[entity.entityType] ?? entity.entityType,
      scope,
      removed: [],
      added: [],
    };
    group[side].push(
      entity.entityType === 'columns' ? entity.name : qualified(entity),
    );
    groups.set(key, group);
  };
  for (const entity of removed) collect(entity, 'removed');
  for (const entity of added) collect(entity, 'added');

  return [...groups.values()]
    .filter((group) => group.removed.length > 0 && group.added.length > 0)
    .map(
      (group) =>
        `ambiguous ${group.kind} change${group.scope === '' ? '' : ` in ${group.scope}`}: removed [${group.removed.join(', ')}] and added [${group.added.join(', ')}]`,
    );
}

/** Tables (`schema.table`) and columns of surviving tables (`schema.table.column`). */
export function dataDrops(prev: Snapshot, cur: Snapshot): string[] {
  const { removed } = diffSnapshots(prev, cur);
  const after = tablesIn(cur);
  return removed
    .filter(
      (entity) =>
        entity.entityType === 'tables' ||
        (entity.entityType === 'columns' &&
          after.has(`${field(entity, 'schema')}.${field(entity, 'table')}`)),
    )
    .map(qualified)
    .toSorted();
}

function ambiguityRefusal(lines: readonly string[]): GenerateRefused {
  return new GenerateRefused(
    [
      ...lines,
      'drizzle-kit will not guess a rename, and neither will this. Re-run with --hand-written --name <slug>, write the delta yourself, then run --seal.',
    ].join('\n'),
  );
}

async function diffStatements(
  prev: Snapshot,
  cur: Snapshot,
): Promise<string[]> {
  // Swapping one index, check, key or policy for another reaches drizzle-kit's
  // rename resolver too, though nothing about it is a rename. Dropping the
  // removed ones in a first pass leaves the second pass only creates.
  const { removed } = diffSnapshots(prev, cur);
  const swapped = new Set(
    removed
      .filter((entity) => NON_DATA_KINDS.has(entity.entityType))
      .map(entityKey),
  );
  const mid: Snapshot = {
    ...prev,
    ddl: prev.ddl.filter((entity) => !swapped.has(entityKey(entity))),
  };
  try {
    return [
      ...(swapped.size === 0 ? [] : await generateMigration(prev, mid)),
      ...(await generateMigration(mid, cur)),
    ];
  } catch (error) {
    // The safety net behind the preflight: drizzle-kit's own refusal names
    // neither candidate, so say what it means.
    const message = error instanceof Error ? error.message : String(error);
    const kind =
      /resolver\((\w[\w ]*)\) was called without a HintsHandler/.exec(message);
    if (kind === null) throw error;
    throw ambiguityRefusal([
      `ambiguous ${kind[1]} change that drizzle-kit could not resolve`,
    ]);
  }
}

const SnapshotShape = Schema.Struct({
  id: Schema.String,
  dialect: Schema.Literal('postgres'),
  ddl: Schema.Array(
    Schema.Struct({ entityType: Schema.String, name: Schema.String }),
  ),
});

function readSnapshot(path: string): Snapshot {
  const text = readFileSync(path, 'utf8');
  Schema.decodeUnknownSync(Schema.fromJsonString(SnapshotShape))(text);
  // The shape is drizzle-kit's own (`PostgresSnapshot`), written by this
  // script; the decode above refuses anything that is not one of them.
  return JSON.parse(text) as Snapshot;
}

type Directory = {
  readonly version: string;
  readonly ordinal: number;
  readonly path: string;
};

function migrationDirectories(dir: string): Directory[] {
  if (!existsSync(dir)) return [];
  const found = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const match = MIGRATION_VERSION.exec(entry.name);
      return match === null
        ? []
        : [
            {
              version: entry.name,
              ordinal: Number(match[1]),
              path: join(dir, entry.name),
            },
          ];
    })
    .toSorted((left, right) => left.ordinal - right.ordinal);
  found.forEach((directory, index) => {
    if (directory.ordinal !== index + 1) {
      throw new GenerateRefused(
        `migrations/ is not numbered contiguously from 0001: position ${index + 1} holds ${directory.version}. Two branches may each have added one; regenerate yours after merging.`,
      );
    }
  });
  return found;
}

function readManifest(directory: Directory): MigrationManifest | null {
  const path = join(directory.path, 'manifest.json');
  return existsSync(path) ? decodeManifest(readFileSync(path, 'utf8')) : null;
}

/** The fingerprint the inputs describe, computed as `sync-fingerprint` does. */
async function renderedFingerprint(inputs: GeneratorInputs): Promise<string> {
  const drizzle = await generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson(inputs.schema),
  );
  return schemaFingerprintOf(drizzle, inputs.sidecars, inputs.jobStatements);
}

function sidecarsSql(inputs: GeneratorInputs): string {
  return [...inputs.sidecars, ...inputs.jobStatements].join('\n');
}

function deltaHeader(lines: readonly string[]): string {
  return lines.map((line) => `-- ${line}`.trimEnd()).join('\n');
}

function refuseForbidden(name: string, script: string): void {
  const forbidden = forbiddenStatement(script);
  if (forbidden !== null) {
    throw new GenerateRefused(
      `${name} carries a statement the migration's one transaction cannot run; split it across two releases:\n${forbidden}`,
    );
  }
}

/** Written beside the target and renamed into place, so a failure leaves nothing. */
function writeDirectory(
  dir: string,
  version: string,
  files: Readonly<Record<string, string>>,
): void {
  mkdirSync(dir, { recursive: true });
  const pending = join(dir, `.${version}.pending`);
  rmSync(pending, { recursive: true, force: true });
  mkdirSync(pending);
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(pending, name), content);
    }
    renameSync(pending, join(dir, version));
  } catch (error) {
    rmSync(pending, { recursive: true, force: true });
    throw error;
  }
}

function manifestJson(manifest: MigrationManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  return isDeepStrictEqual(left.toSorted(), right.toSorted());
}

async function generate(
  inputs: GeneratorInputs,
  request: Extract<GeneratorRequest, { kind: 'generate' }>,
): Promise<GeneratorResult> {
  if (!MIGRATION_SLUG.test(request.name)) {
    throw new GenerateRefused(
      `--name must match ${MIGRATION_SLUG}: lower-case letters, digits and underscores (got ${JSON.stringify(request.name)}).`,
    );
  }
  // First, before anything is read or written: a migration generated from a
  // stale fingerprint would record a schema nobody synced.
  const fingerprint = await renderedFingerprint(inputs);
  if (fingerprint !== inputs.committedFingerprint) {
    throw new GenerateRefused(STALE_FINGERPRINT);
  }

  const directories = migrationDirectories(inputs.dir);
  const newest = directories.at(-1);
  const newestManifest = newest === undefined ? null : readManifest(newest);
  if (newest !== undefined && newestManifest === null) {
    throw new GenerateRefused(
      `${newest.version} is not sealed. Finish it first: pnpm --filter @codaco/studio-api migrate:generate --seal`,
    );
  }
  if (newest !== undefined && newestManifest?.fingerprint === fingerprint) {
    return { kind: 'unchanged', newest: newest.version };
  }

  const prev =
    newest === undefined
      ? await generateDrizzleJson({})
      : readSnapshot(join(newest.path, SNAPSHOT_ARTEFACT));
  const cur = await generateDrizzleJson(inputs.schema, prev.id);
  const version = migrationVersion(directories.length + 1, request.name);
  const sidecars = sidecarsSql(inputs);
  const snapshot = `${JSON.stringify(cur, null, 2)}\n`;
  const from = newest?.version ?? 'an empty database';
  const ambiguous = ambiguousChanges(prev, cur);

  if (request.handWritten) {
    writeDirectory(inputs.dir, version, {
      'delta.sql': `${deltaHeader([
        `${version}: hand-written delta from ${from}.`,
        ...(ambiguous.length === 0
          ? ['drizzle-kit found nothing ambiguous here.']
          : ambiguous.map((line) => `${line}.`)),
        'Write the statements below, then run:',
        '  pnpm --filter @codaco/studio-api migrate:generate --seal',
      ])}\n`,
      'sidecars.sql': sidecars,
      [SNAPSHOT_ARTEFACT]: snapshot,
    });
    return { kind: 'written', version, statements: 0, handWritten: true };
  }

  if (ambiguous.length > 0) throw ambiguityRefusal(ambiguous);

  const drops = dataDrops(prev, cur);
  const named = request.drops ?? [];
  if (!sameNames(drops, named)) {
    throw new GenerateRefused(
      [
        `This change drops ${drops.length === 0 ? 'no table or column' : `[${drops.join(', ')}]`}, and --drop names ${named.length === 0 ? 'nothing' : `[${named.join(', ')}]`}.`,
        'A dropped table or column takes its data with it, so each one must be named: re-run with --drop <schema.table> or --drop <schema.table.column> for exactly the drops above.',
      ].join('\n'),
    );
  }

  const statements = await diffStatements(prev, cur);
  const delta = `${deltaHeader([
    `${version}: generated by migrate:generate from ${from}.`,
  ])}\n${statements.length === 0 ? '' : `${statements.join('\n\n')}\n`}`;
  refuseForbidden(`${version}/delta.sql`, delta);

  const contents = {
    'delta.sql': delta,
    'sidecars.sql': sidecars,
    [SNAPSHOT_ARTEFACT]: snapshot,
  };
  const { artefacts, combined } = hashArtefacts(contents);
  writeDirectory(inputs.dir, version, {
    ...contents,
    'manifest.json': manifestJson({
      version,
      ordinal: directories.length + 1,
      fingerprint,
      drops,
      artefacts,
      combined,
    }),
  });
  return {
    kind: 'written',
    version,
    statements: statements.length,
    handWritten: false,
  };
}

async function seal(
  inputs: GeneratorInputs,
  request: Extract<GeneratorRequest, { kind: 'seal' }>,
): Promise<GeneratorResult> {
  const fingerprint = await renderedFingerprint(inputs);
  if (fingerprint !== inputs.committedFingerprint) {
    throw new GenerateRefused(STALE_FINGERPRINT);
  }

  const newest = migrationDirectories(inputs.dir).at(-1);
  if (newest === undefined) {
    throw new GenerateRefused('There is no migration to seal.');
  }
  const isReleased = inputs.isReleased ?? releasedOnMain;
  if (isReleased(newest.version)) {
    throw new GenerateRefused(
      `${newest.version} is on origin/main: a merged migration is frozen, because a database somewhere may already carry it. Generate a new migration instead.`,
    );
  }

  const read = (name: string) => {
    const path = join(newest.path, name);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  };
  const snapshot = readSnapshot(join(newest.path, SNAPSHOT_ARTEFACT));
  const current = await generateDrizzleJson(inputs.schema);
  if (!isDeepStrictEqual(snapshot.ddl, current.ddl)) {
    throw new GenerateRefused(
      `${newest.version}/snapshot.json is not the current Drizzle schema: the schema moved after it was generated. Delete the directory and generate it again.`,
    );
  }
  const sidecars = read('sidecars.sql');
  if (sidecars !== sidecarsSql(inputs)) {
    throw new GenerateRefused(
      `${newest.version}/sidecars.sql is not the current sidecars: they moved after it was generated, or it was edited. Delete the directory and generate it again.`,
    );
  }

  const delta = read('delta.sql') ?? '';
  const backfill = read('backfill.sql');
  const previous = readManifest(newest);
  if (previous === null && splitStatements(delta).length === 0) {
    throw new GenerateRefused(
      `${newest.version}/delta.sql has no statements yet: write the hand-written delta, then seal it.`,
    );
  }
  refuseForbidden(`${newest.version}/delta.sql`, delta);
  if (backfill !== undefined) {
    refuseForbidden(`${newest.version}/backfill.sql`, backfill);
  }

  const { artefacts, combined } = hashArtefacts({
    'delta.sql': delta,
    ...(backfill === undefined ? {} : { 'backfill.sql': backfill }),
    'sidecars.sql': sidecars,
    [SNAPSHOT_ARTEFACT]: read(SNAPSHOT_ARTEFACT) ?? '',
  });
  writeFileSync(
    join(newest.path, 'manifest.json'),
    manifestJson({
      version: newest.version,
      ordinal: newest.ordinal,
      fingerprint,
      drops: [...(request.drops ?? previous?.drops ?? [])].toSorted(),
      artefacts,
      combined,
    }),
  );
  return { kind: 'sealed', version: newest.version };
}

export function generateMigrationDirectory(
  inputs: GeneratorInputs,
  request: GeneratorRequest,
): Promise<GeneratorResult> {
  return request.kind === 'seal'
    ? seal(inputs, request)
    : generate(inputs, request);
}

/**
 * `--seal` re-hashes the newest directory, which is only safe while no
 * database can carry it. Merged means released (#1901 N-3), so a directory
 * `origin/main` already has is refused. Fails closed when `origin/main` is
 * unknown.
 */
function releasedOnMain(version: string): boolean {
  const repo = fileURLToPath(new URL('../../../../', import.meta.url));
  const path = relative(repo, join(MIGRATIONS_DIR, version));
  try {
    return (
      execFileSync(
        'git',
        ['ls-tree', '--name-only', 'origin/main', '--', path],
        {
          cwd: repo,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim() !== ''
    );
  } catch (error) {
    throw new GenerateRefused(
      `Could not tell whether ${version} is on origin/main (${error instanceof Error ? error.message.trim() : String(error)}). Run git fetch origin main and seal again.`,
    );
  }
}

function dropsFrom(values: readonly string[] | undefined): string[] {
  return (values ?? []).flatMap((value) =>
    value
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  );
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      'name': { type: 'string' },
      'drop': { type: 'string', multiple: true },
      'hand-written': { type: 'boolean', default: false },
      'seal': { type: 'boolean', default: false },
    },
  });
  const inputs: GeneratorInputs = {
    schema: SCHEMA,
    sidecars: SIDECARS,
    jobStatements: renderJobStatements(),
    committedFingerprint: SCHEMA_FINGERPRINT,
    dir: MIGRATIONS_DIR,
  };
  const drops = dropsFrom(values.drop);
  try {
    let request: GeneratorRequest;
    if (values.seal) {
      request = { kind: 'seal', ...(values.drop ? { drops } : {}) };
    } else if (values.name === undefined) {
      throw new GenerateRefused(
        'Usage: migrate:generate --name <slug> [--drop <schema.table[.column]>]… [--hand-written] | --seal',
      );
    } else {
      request = {
        kind: 'generate',
        name: values.name,
        drops,
        handWritten: values['hand-written'],
      };
    }
    const result = await generateMigrationDirectory(inputs, request);
    switch (result.kind) {
      case 'unchanged':
        console.log(
          `No schema change since ${result.newest}; nothing written.`,
        );
        break;
      case 'written':
        console.log(
          result.handWritten
            ? `Wrote migrations/${result.version}/ with an empty delta.sql. Write the delta, then run: pnpm --filter @codaco/studio-api migrate:generate --seal`
            : `Wrote migrations/${result.version}/ (${result.statements} delta statement(s)).`,
        );
        break;
      case 'sealed':
        console.log(`Sealed migrations/${result.version}/manifest.json.`);
        break;
    }
  } catch (error) {
    if (!(error instanceof GenerateRefused)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  // drizzle-kit's esbuild service keeps the loop alive.
  process.exit(0);
}
