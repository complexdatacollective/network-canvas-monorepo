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

/** The index just past a balanced `<…>` starting at `start`, or `start`. */
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

/** The index of the parenthesis closing the one opened at `open`. */
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

/**
 * `Effect.fn('<span>')(…)`: the span owns every token up to the parenthesis
 * that closes its body. Enclosure rather than "the nearest span above" — a
 * plain helper written after a span would otherwise be charged to it.
 */
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
    // The formatter leaves a trailing comma after a name that wrapped.
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

/**
 * Whether `sql` in this file is drizzle's fragment builder. A drizzle `sql`
 * template builds part of a builder statement, and is not a statement of its
 * own; the Effect client's is. A file cannot bind both to the same name.
 */
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

/**
 * The members that hand a statement to a driver as text: the Effect client's
 * `unsafe`, drizzle's and a reserved connection's `execute`, a connection's
 * `executeRaw`/`executeValues`/`executeStream`/`executeUnprepared`, and
 * node-postgres's `query` — counted so the node-postgres residue is pinned
 * too, and can only shrink.
 */
const RAW_MEMBERS = new Set([
  'unsafe',
  'execute',
  'executeUnprepared',
  'executeRaw',
  'executeValues',
  'executeStream',
  'query',
]);

/**
 * Names the Effect client is bound to under another name by destructuring
 * (`const { sql: client } = yield* Transaction`), so `` client`…` `` is its
 * template as surely as `` sql`…` `` is.
 */
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

/**
 * Every statement handed to the driver as text: a call to one of
 * `RAW_MEMBERS`, drizzle's `sql.raw(…)`, and the Effect client's template —
 * `` sql`…` `` where `sql` is not drizzle's fragment builder, `` x.sql`…` ``,
 * and a template on a destructured alias.
 *
 * It counts templates, not executions: an Effect `sql` fragment built to be
 * interpolated into another statement is counted as well as the statement it
 * joins. Over-counting fails loudly on the next change, which is the safe
 * direction for an exact list.
 */
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
      token.raw === 'sql' &&
      isPunctuation(next, SyntaxKind.DotToken) &&
      isName(tokens[index + 2], 'raw') &&
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

/**
 * The span each raw statement in `source` sits in, or `null` for one outside
 * any `Effect.fn` — innermost wins, so a span nested in another is its own.
 */
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
  for (const file of [...sourceFiles(SERVER_SRC), ...sourceFiles(SYNC_SRC)]) {
    const path = relative(REPO_ROOT, file);
    for (const span of rawStatementsIn(readFileSync(file, 'utf8'))) {
      const key = span === null ? path : `${path} › ${span}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

const SERVER = 'apps/studio/server/src';
const SYNC = 'packages/studio-sync/src';

/**
 * Every statement Studio hands the driver as text, and why the builder cannot
 * write it. Keyed by file and, where the statement sits inside an
 * `Effect.fn`, by that span; the count is the number of statements there.
 *
 * Exact in both directions: a new raw statement fails until it is listed here
 * with its reason, and an entry whose statement has gone fails until it is
 * removed, so the list cannot drift into describing code that no longer
 * exists.
 */
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
  [`${SERVER}/db/migrate.ts › db.migrate`]: {
    count: 3,
    why: 'the session advisory lock, its release, and the split schema install',
  },
  [`${SERVER}/db/schema.ts › db.checkSchema`]: {
    count: 2,
    why: '`to_regclass` over a runtime-built identifier list (no FROM), then the stamp read that probe gates',
  },
  [`${SERVER}/db/schema.ts › db.stampFingerprint`]: {
    count: 1,
    why: 'the stamp upsert, which must match the node-postgres `stampFingerprint` statement text for text',
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
    count: 3,
    why: '`set local role` and `set local search_path` (fallback A: rc.115 has no startup parameters), and the team GUC via `set_config`',
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
    count: 12,
    why: 'claim, settle, retry, cron and queue-depth statements against the job schema, which drizzle does not model — one of them the singleton guard, a fragment the claim interpolates',
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
  // Raw since the queue replaced pg-boss (#1957), which ported `gc.ts` "text for
  // text"; the stage-3 allowlist names the queue's own files but not these.
  [`${SERVER}/jobs/handlers/protocol-store-gc.ts › protocol.gcProtocolStore`]: {
    count: 10,
    why: '#1957’s port of the store sweep: `select current_user` (no FROM) and the sweep over the shared `REFERENCED` predicate',
  },
  [`${SERVER}/jobs/handlers/invitation-delivery.ts › job.invitation-delivery`]:
    {
      count: 9,
      why: '#1957’s port of the delivery state machine',
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
    count: 19,
    why: 'the scratch-schema harness: create, apply, grant and drop, and the one-statement fixtures and oracles every suite shares — as the owner, a tenant, the maintenance role, and under the erasure marker',
  },
  [`${SERVER}/jobs/__tests__/support.ts`]: {
    count: 13,
    why: 'the queue suites’ scratch job schema and fixtures, and `holding`’s BEGIN, statements, lock probe and COMMIT/ROLLBACK on a reserved connection',
  },
  [`${SYNC}/__tests__/helpers.ts`]: {
    count: 6,
    why: 'the conformance suite’s scratch schema (node-postgres) and the role and tenant pin its Effect runtime sets',
  },
  // node-postgres. Nothing here is Effect code; it is listed so the residue is
  // pinned rather than invisible, and the list shrinks as stage 4 retires `pg`
  // (better-auth's adapter is the last consumer that needs it).
  [`${SERVER}/db/schema.ts`]: {
    count: 3,
    why: 'the node-postgres `checkSchema` (the `to_regclass` probe and the stamp read) and `stampFingerprint`, the scripts’ and the schema gate’s twins of the Effect pair',
  },
  [`${SERVER}/jobs/install.ts`]: {
    count: 1,
    why: 'the node-postgres `installJobSchema`, over the same split statement list as the Effect path',
  },
  [`${SERVER}/http/health.ts`]: {
    count: 1,
    why: 'the readiness probe’s `select 1` on the process’s node-postgres pool',
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
});

// The collector is itself under test: an inventory that quietly missed a form
// would make the list above pass while raw statements accumulate.
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
});
