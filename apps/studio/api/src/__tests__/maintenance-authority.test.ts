import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { SyntaxKind } from 'typescript/unstable/ast';
import { afterAll, describe, expect, it } from 'vitest';

import { StudioRpcs } from '@codaco/studio-contract/rpc/studio';
import { StudioStreams } from '@codaco/studio-contract/sync/protocol-builder';

import {
  AUDIT_READ_TAGS,
  RPC_MUTATION_AUDIT_POLICIES,
} from '../audit/policy.ts';
import { OwnerDatabase } from '../db/client.ts';
import { migrateDatabaseEffect } from '../db/migrate.ts';
import { verifyMigrations } from '../db/migrations-document.ts';
import { startEntrypoint } from './support/entrypoint.ts';
import {
  committedDocument,
  createOwnedScratchDatabase,
  type OwnedScratchDatabase,
} from './support/migrations.ts';
import { reachableDb } from './support/postgres.ts';
import { productionFiles } from './support/source-spans.ts';
import { sourceTokens } from './support/source-tokens.ts';

// #1901: `studio-api maintenance on|off` is the only way to set the flag —
// no deployment token, no RPC procedure, no HTTP route.
//
// This rests on the code, not on privileges (#1901 review N-9). The
// `deployment_state` sidecar grants UPDATE on every column to
// `studio_maintenance`, which is the role the worker's queue client and the
// command both connect as, so the database would let the worker's process
// write `maintenance` too. What keeps it to the command is that nothing but
// the command's program calls the one function that writes the flag, and
// nothing but that function's module touches the table — which is what this
// file asserts, over the source the bundles are built from.

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const DEFINITION = 'src/db/deployment-state.ts';
const COMMAND = 'src/programs/maintenance.ts';

const relativeToServer = (file: string) => relative(SERVER_ROOT, file);

const tokensOf = (file: string) => sourceTokens(readFileSync(file, 'utf8'));

/** Production modules whose code names `identifier` (comments and strings excluded). */
function modulesNaming(identifier: string): string[] {
  return productionFiles(resolve(SERVER_ROOT, 'src'))
    .filter((file) =>
      tokensOf(file).some(
        (token) =>
          token.kind === SyntaxKind.Identifier && token.raw === identifier,
      ),
    )
    .map(relativeToServer)
    .sort();
}

/** Production modules with a string or template whose text names the table. */
function modulesWithSqlNaming(table: string): string[] {
  const pattern = new RegExp(`\\b${table}\\b`);
  const literal = new Set<SyntaxKind>([
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TemplateHead,
    SyntaxKind.TemplateMiddle,
    SyntaxKind.TemplateTail,
  ]);
  return productionFiles(resolve(SERVER_ROOT, 'src'))
    .filter((file) =>
      tokensOf(file).some(
        (token) => literal.has(token.kind) && pattern.test(token.raw),
      ),
    )
    .map(relativeToServer)
    .sort();
}

/** Every relative module `entry` reaches, by any import form. */
function moduleGraph(entry: string): Set<string> {
  const modules = new Set<string>();
  const pending = [resolve(SERVER_ROOT, entry)];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) break;
    const path = relativeToServer(file);
    if (modules.has(path)) continue;
    modules.add(path);
    const tokens = tokensOf(file);
    for (const [index, token] of tokens.entries()) {
      if (token.raw !== 'from' && token.raw !== 'import') continue;
      const next =
        tokens[index + 1]?.raw === '(' ? tokens[index + 2] : tokens[index + 1];
      if (next?.kind !== SyntaxKind.StringLiteral) continue;
      if (next.value.startsWith('.')) {
        pending.push(resolve(dirname(file), next.value));
      }
    }
  }
  return modules;
}

describe('who can set the maintenance flag', () => {
  it('only the maintenance program calls the function that writes it', () => {
    expect(modulesNaming('setMaintenance')).toEqual([DEFINITION, COMMAND]);
  });

  it('only that function’s module touches the deployment_state table', () => {
    // The Drizzle binding is the only typed handle on the row, and its SQL
    // name the only untyped one: a write that bypassed `setMaintenance`
    // would have to name one of them somewhere else.
    expect(modulesNaming('deploymentState')).toEqual([DEFINITION]);
    expect(modulesWithSqlNaming('deployment_state')).toEqual([DEFINITION]);
  });

  it('no process but the command reaches the maintenance program', () => {
    const graphs = {
      'serve': moduleGraph('src/index.ts'),
      'worker': moduleGraph('src/worker.ts'),
      'migrate': moduleGraph('src/migrate.ts'),
      'rotate-secrets': moduleGraph('src/rotate-secrets.ts'),
    };
    // Every RPC handler, HTTP route and WebSocket endpoint is in the serve graph.
    for (const handlers of [
      'src/rpc/handlers.ts',
      'src/http/router.ts',
      'src/http/api-v1.ts',
    ]) {
      expect(graphs.serve.has(handlers), handlers).toBe(true);
    }
    for (const [process, graph] of Object.entries(graphs)) {
      expect(graph.has(COMMAND), process).toBe(false);
    }
    expect(moduleGraph('src/maintenance.ts').has(COMMAND)).toBe(true);
  });

  it('the audit policy classifies every rpc tag, and none of them writes the flag', () => {
    const tags = [
      ...StudioRpcs.requests.keys(),
      ...StudioStreams.requests.keys(),
    ];
    expect(tags.length).toBeGreaterThan(0);
    const classified = new Set<string>([
      ...AUDIT_READ_TAGS,
      ...Object.keys(RPC_MUTATION_AUDIT_POLICIES),
    ]);
    const unclassified = tags.filter((tag) => !classified.has(tag));
    expect(unclassified).toEqual([]);
    // A tag's handler runs in the serve process, whose graph never names
    // `setMaintenance` outside the module that defines it.
    const serve = moduleGraph('src/index.ts');
    expect(
      modulesNaming('setMaintenance').filter((module) => serve.has(module)),
    ).toEqual([DEFINITION]);
    expect(tags.filter((tag) => /maintenance/i.test(tag))).toEqual([]);
  });
});

const db = await reachableDb();

const CASE_TIMEOUT_MS = 120_000;

describe.skipIf(!db)('studio-api maintenance on|off', () => {
  const scratches: OwnedScratchDatabase[] = [];

  afterAll(async () => {
    for (const scratch of scratches) {
      await scratch.dispose().catch(() => undefined);
    }
  }, CASE_TIMEOUT_MS);

  const flag = async (scratch: OwnedScratchDatabase) =>
    (
      await scratch.admin.query<{
        maintenance: boolean;
        reason: string | null;
      }>('select maintenance, reason from deployment_state')
    ).rows;

  /** The entry `bin/studio-api maintenance` execs, as its own process. */
  const command = async (url: string, args: string[]) => {
    const run = startEntrypoint(
      'src/maintenance.ts',
      { DATABASE_URL: url },
      args,
    );
    try {
      const exit = await run.exited;
      return { ...exit, output: run.output() };
    } finally {
      run.child.kill('SIGKILL');
    }
  };

  it(
    'round-trips the flag through the command against a migrated database',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const scratch = await createOwnedScratchDatabase(db);
      scratches.push(scratch);
      const document = committedDocument();
      await Effect.runPromise(
        migrateDatabaseEffect(
          verifyMigrations(document, document.fingerprint),
          { appliedBy: 'test' },
        ).pipe(
          Effect.provide(
            OwnerDatabase.layer({
              url: scratch.db.url,
              applicationName: 'studio-maintenance-authority-test',
            }),
          ),
        ),
      );
      expect(await flag(scratch)).toEqual([
        { maintenance: false, reason: null },
      ]);

      const on = await command(scratch.db.url, [
        'on',
        'Upgrading',
        'to',
        '0.3',
      ]);
      expect({ code: on.code, signal: on.signal }, on.output).toEqual({
        code: 0,
        signal: null,
      });
      expect(on.output).toContain('Maintenance mode is on: Upgrading to 0.3');
      expect(await flag(scratch)).toEqual([
        { maintenance: true, reason: 'Upgrading to 0.3' },
      ]);

      const off = await command(scratch.db.url, ['off']);
      expect({ code: off.code, signal: off.signal }, off.output).toEqual({
        code: 0,
        signal: null,
      });
      expect(off.output).toContain('Maintenance mode is off.');
      expect(await flag(scratch)).toEqual([
        { maintenance: false, reason: null },
      ]);
    },
    CASE_TIMEOUT_MS,
  );
});
