import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import {
  type SourceToken,
  sourceTokens,
  tokenName,
} from '../../__tests__/support/source-tokens.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_SRC = resolve(HERE, '../..');
const REPO_ROOT = resolve(SERVER_SRC, '../../../..');
const SYNC_SRC = resolve(REPO_ROOT, 'packages/studio-sync/src');
const SERVER_SCRIPTS = resolve(SERVER_SRC, '../scripts');
const SCANNED_FILES = () => [
  ...sourceFiles(SERVER_SRC),
  ...sourceFiles(SERVER_SCRIPTS),
  ...sourceFiles(SYNC_SRC),
];

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() &&
      path.endsWith('.ts') &&
      !path.endsWith('.test.ts') &&
      !path.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

const isPunctuation = (token: SourceToken | undefined, kind: SyntaxKind) =>
  token?.kind === kind;

const isName = (token: SourceToken | undefined, name: string) =>
  token?.kind === SyntaxKind.Identifier && token.raw === name;

const TEMPLATE_KINDS = new Set([
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
]);

function skipTypeArguments(tokens: SourceToken[], start: number): number {
  if (!isPunctuation(tokens[start], SyntaxKind.LessThanToken)) return start;
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const kind = tokens[index]!.kind;
    if (kind === SyntaxKind.LessThanToken) depth += 1;
    else if (kind === SyntaxKind.GreaterThanToken) depth -= 1;
    else if (kind === SyntaxKind.GreaterThanGreaterThanToken) depth -= 2;
    if (depth <= 0) return index + 1;
  }
  return start;
}

const skipTypeArgumentsToken = (tokens: SourceToken[], start: number) =>
  tokens[skipTypeArguments(tokens, start)];

function closingParen(tokens: SourceToken[], open: number): number {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    const kind = tokens[index]!.kind;
    if (kind === SyntaxKind.OpenParenToken) depth += 1;
    else if (kind === SyntaxKind.CloseParenToken) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return tokens.length - 1;
}

type Span = { name: string; start: number; end: number };

function spansOf(tokens: SourceToken[]): Span[] {
  const spans: Span[] = [];
  for (let index = 0; index + 4 < tokens.length; index += 1) {
    if (
      !isName(tokens[index], 'Effect') ||
      !isPunctuation(tokens[index + 1], SyntaxKind.DotToken) ||
      !isName(tokens[index + 2], 'fn') ||
      !isPunctuation(tokens[index + 3], SyntaxKind.OpenParenToken) ||
      tokens[index + 4]?.kind !== SyntaxKind.StringLiteral
    ) {
      continue;
    }
    let close = index + 5;
    if (isPunctuation(tokens[close], SyntaxKind.CommaToken)) close += 1;
    if (
      isPunctuation(tokens[close], SyntaxKind.CloseParenToken) &&
      isPunctuation(tokens[close + 1], SyntaxKind.OpenParenToken)
    ) {
      spans.push({
        name: tokenName(tokens[index + 4])!,
        start: index,
        end: closingParen(tokens, close + 1),
      });
    }
  }
  return spans;
}

function importsDrizzleSql(tokens: SourceToken[]): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]!.kind !== SyntaxKind.ImportKeyword) continue;
    let end = index;
    while (
      end < tokens.length &&
      tokens[end]!.kind !== SyntaxKind.FromKeyword
    ) {
      end += 1;
    }
    const specifier = tokenName(tokens[end + 1]);
    if (specifier !== 'drizzle-orm') continue;
    if (tokens.slice(index, end).some((token) => isName(token, 'sql'))) {
      return true;
    }
  }
  return false;
}

const RAW_MEMBERS = new Set([
  'unsafe',
  'execute',
  'executeUnprepared',
  'executeRaw',
  'executeValues',
  'executeStream',
  'query',
]);

function clientAliases(tokens: SourceToken[]): Set<string> {
  const aliases = new Set<string>();
  for (let index = 1; index + 3 < tokens.length; index += 1) {
    if (
      isName(tokens[index], 'sql') &&
      (isPunctuation(tokens[index - 1], SyntaxKind.OpenBraceToken) ||
        isPunctuation(tokens[index - 1], SyntaxKind.CommaToken)) &&
      isPunctuation(tokens[index + 1], SyntaxKind.ColonToken) &&
      tokens[index + 2]?.kind === SyntaxKind.Identifier &&
      (isPunctuation(tokens[index + 3], SyntaxKind.CommaToken) ||
        isPunctuation(tokens[index + 3], SyntaxKind.CloseBraceToken))
    ) {
      aliases.add(tokens[index + 2]!.raw);
    }
  }
  return aliases;
}

function rawCalls(tokens: SourceToken[]): number[] {
  const drizzleSql = importsDrizzleSql(tokens);
  const aliases = clientAliases(tokens);
  const calls: number[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    if (token.kind !== SyntaxKind.Identifier) continue;

    const member = isPunctuation(previous, SyntaxKind.DotToken);
    if (
      member &&
      RAW_MEMBERS.has(token.raw) &&
      isPunctuation(
        skipTypeArgumentsToken(tokens, index + 1),
        SyntaxKind.OpenParenToken,
      )
    ) {
      calls.push(index);
      continue;
    }
    if (
      (token.raw === 'sql' || (!member && aliases.has(token.raw))) &&
      isPunctuation(next, SyntaxKind.DotToken) &&
      (isName(tokens[index + 2], 'raw') ||
        isName(tokens[index + 2], 'literal')) &&
      isPunctuation(tokens[index + 3], SyntaxKind.OpenParenToken)
    ) {
      calls.push(index);
      continue;
    }
    const tag =
      (token.raw === 'sql' && (member || !drizzleSql)) ||
      (!member && aliases.has(token.raw));
    if (
      tag &&
      TEMPLATE_KINDS.has(
        tokens[skipTypeArguments(tokens, index + 1)]?.kind ??
          SyntaxKind.Unknown,
      )
    ) {
      calls.push(index);
    }
  }
  return calls;
}

function rawStatementsIn(source: string): (string | null)[] {
  const tokens = sourceTokens(source);
  const spans = spansOf(tokens);
  return rawCalls(tokens).map(
    (call) =>
      spans.filter((span) => span.start < call && call < span.end).at(-1)
        ?.name ?? null,
  );
}

function inventory(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of SCANNED_FILES()) {
    const path = relative(REPO_ROOT, file);
    for (const span of rawStatementsIn(readFileSync(file, 'utf8'))) {
      const key = span === null ? path : `${path} › ${span}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

const SERVER = 'apps/studio/api/src';
const SYNC = 'packages/studio-sync/src';
const SCRIPTS = 'apps/studio/api/scripts';

const ALLOWLIST: Record<string, { count: number; why: string }> = {
  [`${SERVER}/audit/store.ts › audit.store.facets`]: {
    count: 2,
    why: '`WITH RECURSIVE` has no builder path, and the plans are load-bearing',
  },
  [`${SERVER}/audit/store.ts › audit.store.lockTeam`]: {
    count: 1,
    why: '`select pg_advisory_xact_lock(…)`, no FROM clause',
  },
  [`${SERVER}/audit/schema.ts`]: {
    count: 2,
    why: 'the policy predicate spliced into a `pgPolicy` declaration: DDL drizzle-kit renders, never a runtime statement',
  },
  [`${SYNC}/rls.ts`]: {
    count: 2,
    why: 'the same, for every tenant table’s policy',
  },
  [`${SERVER}/db/migrate.ts`]: {
    count: 2,
    why: 'each split statement of a pending migration’s artefacts, and the `select 1` that tells, after one fails, whether the transaction is still open',
  },
  [`${SERVER}/db/migrate.ts › db.migrate`]: {
    count: 2,
    why: 'the session advisory lock and its release',
  },
  [`${SERVER}/db/migrate.ts › db.migrate.probe`]: {
    count: 1,
    why: '`to_regclass` over the history table, the stamp and a runtime-built identifier list (no FROM)',
  },
  [`${SERVER}/db/migrate.ts › db.migrate.readStamp`]: {
    count: 1,
    why: 'the stamp read the probe gates, on a table that may not exist yet when the module is written',
  },
  [`${SERVER}/db/migrate.ts › db.migrate.readSessionState`]: {
    count: 1,
    why: 'the transaction id, roles, settings, triggers and row-level security each artefact must leave as it found them: session functions and `pg_trigger`/`pg_class` aggregates, no application table',
  },
  [`${SERVER}/db/migrate.ts › db.migrate.settleDeferredChecks`]: {
    count: 1,
    why: 'the deferrable constraints, by name, read from `pg_constraint`: a catalog read the builder has no form for (the `SET CONSTRAINTS` naming them go through the file-level statement runner)',
  },
  [`${SERVER}/programs/migrate.ts`]: {
    count: 2,
    why: '`SET LOCAL ROLE studio_maintenance` and `RESET ROLE` around the keyring check inside the migration transaction',
  },
  [`${SERVER}/db/history.ts › db.history.create`]: {
    count: 1,
    why: '`CREATE TABLE IF NOT EXISTS public.studio_migrations`: DDL for a table kept outside SCHEMA, which drizzle-kit therefore never renders',
  },
  [`${SERVER}/db/history.ts › db.history.revoke`]: {
    count: 1,
    why: '`REVOKE ALL` on the history table from both application roles: DCL, which the builder has no form for',
  },
  [`${SERVER}/db/schema.ts › db.checkSchema`]: {
    count: 2,
    why: '`to_regclass` over a runtime-built identifier list (no FROM), then the stamp read that probe gates',
  },
  [`${SERVER}/db/schema.ts › db.stampFingerprint`]: {
    count: 1,
    why: 'the stamp upsert, which must match the node-postgres `stampFingerprint` statement text for text',
  },
  [`${SERVER}/db/deployment-state.ts › db.deploymentState.read`]: {
    count: 1,
    why: 'a transaction-local `statement_timeout` via `set_config` (no FROM), so a read queued behind a migration’s lock ends on the server rather than holding its connection',
  },
  [`${SERVER}/db/deployment-state.ts › db.deploymentState.readLatestRelease`]: {
    count: 1,
    why: 'the same transaction-local `statement_timeout` on the release-state read, kept separate from the flag read so a new image can read the flag against an older schema (#1901 R-1)',
  },
  [`${SERVER}/db/readiness.ts › db.readiness.alive`]: {
    count: 1,
    why: 'the liveness probe’s `select 1`, no FROM clause',
  },
  [`${SERVER}/db/readiness.ts › db.readiness.migrationLockHeld`]: {
    count: 1,
    why: '`pg_locks` and `pg_database`, catalogue views drizzle does not model, matched on the advisory key’s two halves',
  },
  [`${SERVER}/db/tenant.ts`]: {
    count: 1,
    why: 'the team GUC via `set_config`, the first statement of every tenant scope',
  },
  [`${SERVER}/jobs/jobs.ts`]: {
    count: 1,
    why: 'the enqueue INSERT, rendered once by `jobs/insert.ts` against the job schema, which drizzle does not model',
  },
  [`${SERVER}/jobs/install.ts › installJobSchema`]: {
    count: 1,
    why: 'the job schema, split statement by statement (its trigger carries a dollar-quoted plpgsql body)',
  },
  [`${SERVER}/jobs/worker.ts`]: {
    count: 13,
    why: 'claim, settle, retry, cron and queue-depth statements against the job schema, which drizzle does not model — one of them the singleton guard, a fragment the claim interpolates, and its `sql.literal` empty twin',
  },
  [`${SERVER}/jobs/worker.ts › JobWorker.deleteExpired`]: {
    count: 1,
    why: 'retention over the job schema',
  },
  [`${SERVER}/jobs/worker.ts › JobWorker.reapExpired`]: {
    count: 1,
    why: 'the reaper over the job schema',
  },
  [`${SERVER}/jobs/worker.ts › JobWorker.tickSchedules`]: {
    count: 3,
    why: 'cron bookkeeping over the job schema',
  },
  [`${SERVER}/auth/adapter.ts`]: {
    count: 38,
    why: 'statements generated from better-auth’s schema through `sql(identifier)` with an `AUTH_TABLES` allowlist; the builder would need `any`. Counted by template, so the where-clause fragments each operator compiles to are in the count',
  },
  [`${SERVER}/jobs/clock.ts`]: {
    count: 1,
    why: '`SELECT now()`, no FROM clause',
  },
  [`${SERVER}/jobs/handlers/protocol-store-gc.ts › protocol.gcProtocolStore`]: {
    count: 12,
    why: '#1957’s port of the store sweep: `select current_user` (no FROM) and the sweep over the shared `REFERENCED` predicate, spliced in through `sql.literal`',
  },
  [`${SERVER}/jobs/handlers/invitation-delivery.ts › job.invitation-delivery`]:
    {
      count: 15,
      why: '#1957’s port of the delivery state machine, six of them the shared `STILL_PENDING` predicate spliced in through `sql.literal`',
    },
  [`${SERVER}/jobs/handlers/denied-attempts-summary.ts`]: {
    count: 2,
    why: '#1957’s port of the summary job’s two reads',
  },
  [`${SERVER}/network/projections.ts › network.projections.refreshProjectionsForSessions`]:
    {
      count: 2,
      why: '`INSERT … SELECT` over a correlated `CROSS JOIN LATERAL`, and an upsert reading `excluded.*`',
    },
  [`${SERVER}/protocol/store.ts › protocol.store.insertVersion`]: {
    count: 1,
    why: '`INSERT … SELECT` over its own target table, freezing the manifest row through `to_jsonb(m)`',
  },
  [`${SYNC}/server.ts`]: {
    count: 2,
    why: "`current_setting('transaction_isolation')` (no FROM), and the built `sectionExists` query executed as the same SQL it embeds in an `EXISTS`",
  },
  [`${SERVER}/__tests__/support/database.ts`]: {
    count: 17,
    why: 'the scratch-schema harness: create, apply, grant and drop, and the one-statement fixtures and oracles every suite shares — as the owner, a tenant, the maintenance role, and under the erasure marker',
  },
  [`${SERVER}/jobs/__tests__/support.ts`]: {
    count: 14,
    why: 'the queue suites’ scratch job schema and fixtures, and `holding`’s BEGIN, statements, lock probe and COMMIT/ROLLBACK on a reserved connection, and the `sql.literal` that stands for no queue filter',
  },
  [`${SYNC}/__tests__/helpers.ts`]: {
    count: 5,
    why: 'the conformance suite’s scratch schema (node-postgres) and the tenant pin its Effect runtime sets',
  },
  [`${SERVER}/db/schema.ts`]: {
    count: 3,
    why: 'the node-postgres `checkSchema` (the `to_regclass` probe and the stamp read) and `stampFingerprint`, the scripts’ twins of the Effect pair',
  },
  [`${SERVER}/jobs/install.ts`]: {
    count: 1,
    why: 'the node-postgres `installJobSchema`, over the same split statement list as the Effect path',
  },
  [`${SCRIPTS}/apply.ts`]: {
    count: 18,
    why: 'the node-postgres schema apply and local reset: the advisory lock and its release, the migration-history probe and count that refuse a migrated database, the stamp probe and clear, the sidecars, the transaction around the job schema and stamp, the schema drops, and the scratch sweep over `pg_namespace` and `pg_database`',
  },
  [`${SCRIPTS}/protocol-demo.ts`]: {
    count: 1,
    why: 'the demo’s team upsert, before the protocol store takes over',
  },
  [`${SCRIPTS}/seed/insert.ts`]: {
    count: 1,
    why: 'the seed’s batched multi-row insert, over table and column names that are literals in the seed source',
  },
  [`${SCRIPTS}/seed/integrations.ts`]: {
    count: 1,
    why: 'the seed’s webhook disablement update',
  },
  [`${SCRIPTS}/seed/messaging.ts`]: {
    count: 1,
    why: 'the seed’s link redemption rollup, an `UPDATE … FROM` over an aggregate',
  },
  [`${SCRIPTS}/seed/monitoring.ts`]: {
    count: 2,
    why: 'the seed’s wave and stage rollups, `INSERT … SELECT` over aggregates',
  },
  [`${SCRIPTS}/seed/seed.ts`]: {
    count: 4,
    why: 'the seed’s truncate-everything `DO` block, the team GUC via `set_config`, and the constraint-mode switches',
  },
  [`${SCRIPTS}/seed/studies.ts`]: {
    count: 3,
    why: 'the seed’s schedule insert and its consent and study state backdating',
  },
  [`${SCRIPTS}/seed/teams.ts`]: {
    count: 3,
    why: 'the seed’s installation row and better-auth credential accounts, whose quoted camel-case columns the seed writes directly',
  },
  [`${SERVER}/__tests__/support/migrations.ts`]: {
    count: 3,
    why: 'the non-superuser owner login the runner suites connect as, and the scratch databases it owns: bootstrap, create and drop',
  },
  [`${SERVER}/__tests__/support/postgres.ts`]: {
    count: 4,
    why: 'the reachability probe and the scratch databases the process suites point child processes at',
  },
};

describe('the raw SQL allowlist', () => {
  it('names every raw statement, and nothing else', () => {
    const found = inventory();
    const drift = [
      ...[...found]
        .filter(([key, count]) => ALLOWLIST[key]?.count !== count)
        .map(
          ([key, count]) =>
            `${key}: ${count} raw, allowlisted ${ALLOWLIST[key]?.count ?? 0}`,
        ),
      ...Object.keys(ALLOWLIST)
        .filter((key) => !found.has(key))
        .map((key) => `${key}: allowlisted, and no longer raw`),
    ];
    expect(drift).toEqual([]);
  });

  it('gives every entry a reason', () => {
    for (const [key, entry] of Object.entries(ALLOWLIST)) {
      expect(entry.why, key).not.toBe('');
    }
  });

  it('scans the scripts as well as the server and sync sources', () => {
    const scanned = SCANNED_FILES().map((file) => relative(REPO_ROOT, file));
    expect(scanned).toContain('apps/studio/api/scripts/apply.ts');
    expect(scanned).toContain('apps/studio/api/scripts/seed/seed.ts');
  });

  // A file that imports drizzle's `sql` has its `sql` templates read as
  // fragments. Lint's `no-shadow` stops a second `sql` binding in a nested
  // scope and TypeScript stops one at module level, so the only way a raw
  // statement hides under that name is a suppressed lint rule.
  it('finds no module that suppresses no-shadow', () => {
    expect(
      SCANNED_FILES()
        .filter((file) => /no-shadow/.test(readFileSync(file, 'utf8')))
        .map((file) => relative(REPO_ROOT, file)),
    ).toEqual([]);
  });
});

describe('the raw SQL collector', () => {
  it('finds each form a statement reaches the driver as text', () => {
    const source = `
      const a = Effect.fn('a')(function* () {
        yield* sql.unsafe('select 1');
        yield* client.unsafe<{ n: number }>('select 1');
        yield* sql\`select 1\`;
        yield* sql<{ n: number }>\`select \${1}\`;
        yield* open.sql\`select 1\`;
        yield* tx.execute(query);
        yield* conn.executeUnprepared('select 1');
        yield* db.select().where(sql.raw('true'));
      });`;
    expect(rawStatementsIn(source)).toEqual(Array(8).fill('a'));
  });

  it('counts drizzle fragments only through a member client', () => {
    const source = `
      import { eq, sql } from 'drizzle-orm';
      const b = Effect.fn('b')(function* () {
        yield* tx.select({ one: sql\`1\` }).from(t);
        yield* open.sql\`select 1\`;
      });`;
    expect(rawStatementsIn(source)).toEqual(['b']);
  });

  it('reads no statement out of a comment or a string', () => {
    const source = `
      // yield* sql.unsafe('select 1');
      const text = "sql.unsafe('select 1')";
      /* tx.execute(query) */`;
    expect(rawStatementsIn(source)).toEqual([]);
  });

  it('charges a statement to the span that encloses it, not the one above it', () => {
    const source = `
      const spanned = Effect.fn(
        'spanned',
      )(function* () {
        yield* sql.unsafe('select 1');
      });
      const plain = function* () {
        yield* sql.unsafe('select 1');
      };`;
    expect(rawStatementsIn(source)).toEqual(['spanned', null]);
  });

  it('charges a statement to the innermost span that encloses it', () => {
    const source = `
      const outer = Effect.fn('outer')(function* () {
        const inner = Effect.fn('inner')(function* () {
          yield* sql.unsafe('select 1');
        });
        yield* sql.unsafe('select 2');
      });`;
    expect(rawStatementsIn(source)).toEqual(['inner', 'outer']);
  });

  it('finds node-postgres and reserved-connection statements too', () => {
    const source = `
      const c = Effect.fn('c')(function* () {
        yield* held.executeRaw('BEGIN');
        yield* held.executeValues('select 1');
        yield* held.executeStream('select 1');
        yield* tx.execute<Row>(query);
      });
      await pool.query('select 1');`;
    expect(rawStatementsIn(source)).toEqual(['c', 'c', 'c', 'c', null]);
  });

  it('follows the client under a destructured name', () => {
    const source = `
      import { sql } from 'drizzle-orm';
      const d = Effect.fn('d')(function* () {
        const { tx, sql: client } = yield* Transaction;
        yield* client\`select 1\`;
        yield* tx.select({ one: sql\`1\` }).from(t);
      });`;
    expect(rawStatementsIn(source)).toEqual(['d']);
  });

  it('counts sql.raw only where it is called', () => {
    expect(rawStatementsIn(`const f = sql.raw;`)).toEqual([]);
  });

  it('counts sql.literal, under its own name or a destructured one', () => {
    const source = `
      import { sql } from 'drizzle-orm';
      const g = Effect.fn('g')(function* () {
        const { sql: client } = yield* Transaction;
        yield* open.sql\`select \${sql.literal('true')}\`;
        yield* open.sql\`select \${client.literal('true')}\`;
        const f = sql.literal;
      });`;
    expect(rawStatementsIn(source)).toEqual(['g', 'g', 'g', 'g']);
  });
});
