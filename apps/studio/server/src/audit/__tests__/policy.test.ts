import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Predicate } from 'effect';
import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import { StudioRpcs, StudioStreams } from '@codaco/studio-contract/rpc/studio';

import { testCipher } from '../../__tests__/support/secrets.ts';
import {
  sourceTokens,
  tokenName,
  type SourceToken,
} from '../../__tests__/support/source-tokens.ts';
import { studioAuthAdapter } from '../../auth/adapter.ts';
import { createBetterAuthInstance } from '../../auth/better-auth.ts';
import type { SqlBridge } from '../../auth/sql-bridge.ts';
import type { AuthEnv } from '../../env.ts';
import { SYNC_TRANSACTION_POLICIES } from '../../protocol/sync.ts';
import {
  BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES,
  BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS,
} from '../better-auth-policy.ts';
import {
  AUDIT_READ_TAGS,
  NON_RPC_MUTATION_AUDIT_POLICIES,
  RPC_MUTATION_AUDIT_POLICIES,
  type AuditPolicy,
} from '../policy.ts';
import { NO_AUDIT_TRANSACTION_POLICIES } from '../transaction-policy.ts';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../..',
);

/**
 * A value whose properties can be read: an object, an array or a callable,
 * never null. `Predicate.isObjectKeyword` is that check — better-auth's
 * endpoints are functions carrying `path` and `options`, and an oRPC
 * contract's nodes are plain objects, so both walks below need the callable
 * case. The refinement adds the index signature the callers read through.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Predicate.isObjectKeyword(value);
}

/**
 * The default `toSorted()` ordering, spelled out: every inventory compared
 * below is sorted by the same total order, so each comparison is about its
 * contents alone. `toSorted()` with no argument sorts by the string form of
 * each element, which is what this is for the string arrays here — stating it
 * is what keeps the two sides of a comparison provably ordered alike.
 */
function byName(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function contractLeaves(value: Record<string, unknown>, prefix = ''): string[] {
  const leaves: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (!isRecord(child)) throw new Error(`invalid contract node ${key}`);
    const path = prefix ? `${prefix}.${key}` : key;
    if ('~orpc' in child) leaves.push(path);
    else leaves.push(...contractLeaves(child, path));
  }
  return leaves;
}

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : typescriptFiles(path);
    }
    return entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx'))
      ? [path]
      : [];
  });
}

function assertReasons(policies: Record<string, AuditPolicy>): void {
  for (const [name, policy] of Object.entries(policies)) {
    if (policy.kind !== 'required') {
      expect(
        policy.reason,
        `${name} needs a static audit-policy reason`,
      ).not.toHaveLength(0);
    }
  }
}

type TenantBoundaryAccess = {
  member: 'transaction' | 'query' | 'computed';
  form: 'call' | 'alias' | 'computed';
  line: number;
  sqlVerb?: 'INSERT' | 'UPDATE' | 'DELETE';
};

function isTenantReceiver(token: SourceToken | undefined): boolean {
  const name = tokenName(token);
  return name === 'db' || name === 'tenant' || name === 'tenantDb';
}

function isDestructuredBinding(tokens: SourceToken[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const raw = tokens[cursor]?.raw;
    if (raw === ';' || raw === '}') return false;
    if (raw === '{') {
      return ['const', 'let', 'var'].includes(tokens[cursor - 1]?.raw ?? '');
    }
  }
  return false;
}

function staticSqlVerb(
  token: SourceToken | undefined,
): 'INSERT' | 'UPDATE' | 'DELETE' | undefined {
  const verb = tokenName(token)
    ?.trimStart()
    .match(/^(INSERT|UPDATE|DELETE)\b/i)?.[1];
  return verb?.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE' | undefined;
}

function callArgumentIndex(
  tokens: SourceToken[],
  memberIndex: number,
): number | undefined {
  let cursor = memberIndex + 1;
  if (tokens[cursor]?.raw === '<') {
    let depth = 0;
    for (; cursor < tokens.length; cursor++) {
      const raw = tokens[cursor]?.raw;
      if (raw === '<') depth++;
      if (raw === '>') {
        depth--;
        if (depth === 0) {
          cursor++;
          break;
        }
      }
    }
  }
  return tokens[cursor]?.raw === '(' ? cursor + 1 : undefined;
}

function tenantBoundaryAccesses(source: string): TenantBoundaryAccess[] {
  const tokens = sourceTokens(source);
  const accesses: TenantBoundaryAccess[] = [];
  const record = (
    token: SourceToken,
    access: Omit<TenantBoundaryAccess, 'line'>,
  ) => {
    const line = source.slice(0, token.position).split('\n').length;
    accesses.push({ ...access, line });
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined) continue;
    const name = tokenName(token);

    if (tokens[index - 1]?.raw === '.' && name === 'transaction') {
      const argumentIndex = callArgumentIndex(tokens, index);
      record(token, {
        member: 'transaction',
        form: argumentIndex === undefined ? 'alias' : 'call',
      });
    }
    if (
      tokens[index - 1]?.raw === '.' &&
      name === 'query' &&
      isTenantReceiver(tokens[index - 2])
    ) {
      const argumentIndex = callArgumentIndex(tokens, index);
      if (argumentIndex === undefined) {
        record(token, { member: 'query', form: 'alias' });
      } else {
        const sqlVerb = staticSqlVerb(tokens[argumentIndex]);
        if (sqlVerb !== undefined) {
          record(token, { member: 'query', form: 'call', sqlVerb });
        }
      }
    }

    if (token.raw === '[' && isTenantReceiver(tokens[index - 1])) {
      const computedName = tokenName(tokens[index + 1]);
      if (computedName === 'transaction' || computedName === 'query') {
        record(token, { member: computedName, form: 'computed' });
      } else {
        record(token, { member: 'computed', form: 'computed' });
      }
    }

    if (
      (name === 'transaction' || name === 'query') &&
      (tokens[index - 1]?.raw === '{' || tokens[index - 1]?.raw === ',') &&
      isDestructuredBinding(tokens, index)
    ) {
      record(token, { member: name, form: 'alias' });
    }
  }
  return accesses;
}

/**
 * The two seams that open a registered no-audit transaction, and which
 * argument names the operation.
 *
 * `runNoAuditTenantTransaction` took the handle first and the operation
 * second; `noAuditTransaction` / `noAuditMaintenanceTransaction`
 * (`audit/no-audit.ts`) take the operation first, because the access they take
 * beside it is a branded token rather than a database handle.
 */
const NO_AUDIT_SEAMS = ['noAuditTransaction', 'noAuditMaintenanceTransaction'];

function noAuditOperations(source: string): string[] {
  const tokens = sourceTokens(source);
  const operations: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const name = tokenName(tokens[index]);
    if (name === undefined || !NO_AUDIT_SEAMS.includes(name)) continue;
    if (tokens[index + 1]?.raw !== '(') continue;
    let argumentDepth = 0;
    for (let cursor = index + 1; cursor < tokens.length; cursor++) {
      const token = tokens[cursor];
      if (token === undefined) break;
      if (token.raw === '(') argumentDepth++;
      if (token.raw === ')') {
        argumentDepth--;
        if (argumentDepth === 0) break;
      }
      // The first argument, and only the first: an operation read from any
      // later position would let a caller name one it does not run under.
      if (token.raw === ',' && argumentDepth === 1) break;
      if (argumentDepth === 1 && token.kind === SyntaxKind.StringLiteral) {
        operations.push(token.value);
        break;
      }
    }
  }
  return operations;
}

/**
 * Everything wrong with one classification of `tags`, as sentences.
 *
 * Read and mutation are the two halves of one partition, so the invariant has
 * four ways to break and each is named separately: a tag in both halves, a tag
 * in neither, and an entry in either half that nothing serves. Comparing the
 * two key lists instead would see only the last two, and only when they do not
 * cancel out.
 */
function classificationProblems(
  tags: readonly string[],
  reads: ReadonlySet<string>,
  policies: Readonly<Record<string, unknown>>,
): string[] {
  const problems: string[] = [];
  for (const tag of tags) {
    const isRead = reads.has(tag);
    const isMutation = Object.hasOwn(policies, tag);
    if (isRead && isMutation) {
      problems.push(`${tag} is classified as a read and as a mutation`);
    }
    if (!isRead && !isMutation) {
      problems.push(`${tag} is classified as neither a read nor a mutation`);
    }
  }
  const served = new Set(tags);
  for (const tag of reads) {
    if (!served.has(tag)) {
      problems.push(`${tag} is in the read set but is served by nothing`);
    }
  }
  for (const tag of Object.keys(policies)) {
    if (!served.has(tag)) {
      problems.push(`${tag} has a mutation policy but is served by nothing`);
    }
  }
  return problems.toSorted(byName);
}

describe('audit mutation policy', () => {
  /**
   * Every procedure the two planes serve, as the rpc plane names them.
   *
   * The SPA's are the Effect rpc group's request tags; the protocol-builder
   * surface is still an oRPC contract until stage 8, so its leaves are walked
   * the oRPC way — through the contract's own `StudioStreams` re-export, which
   * is the one name that surface keeps. When stage 8 moves it onto the rpc
   * plane this second half becomes `StudioStreams.requests.keys()` and
   * `contractLeaves` goes with it.
   */
  const servedTags = (): string[] => [
    ...StudioRpcs.requests.keys(),
    ...contractLeaves(StudioStreams, 'protocolBuilder'),
  ];

  it('gives every served tag exactly one classification', () => {
    expect(
      classificationProblems(
        servedTags(),
        AUDIT_READ_TAGS,
        RPC_MUTATION_AUDIT_POLICIES,
      ),
    ).toEqual([]);
  });

  it('names every way a classification can be wrong', () => {
    // The oracle for the case above, run against an inventory that is wrong in
    // all four ways at once. Without it, comparing two sorted key lists would
    // pass for a surface where one tag is in both halves and another in
    // neither: the lengths match and so do the contents once the duplicate
    // collapses. Each line here is a mutation that must not survive.
    expect(
      classificationProblems(
        ['both.ways', 'neither.way', 'a.read', 'a.write'],
        new Set(['both.ways', 'a.read', 'gone.read']),
        {
          'both.ways': { kind: 'required' },
          'a.write': { kind: 'required' },
          'gone.write': { kind: 'required' },
        },
      ),
    ).toEqual([
      'both.ways is classified as a read and as a mutation',
      'gone.read is in the read set but is served by nothing',
      'gone.write has a mutation policy but is served by nothing',
      'neither.way is classified as neither a read nor a mutation',
    ]);
  });

  it('keeps the required classification on every meaningful domain mutation', () => {
    for (const tag of [
      'team.updateMemberRole',
      'team.acceptInvitation',
      'team.createInvitation',
      'team.cancelInvitation',
      'protocols.create',
      'studies.create',
      'protocols.addInformationStage',
      'protocols.moveStage',
      'protocolBuilder.submit',
      'protocolBuilder.create',
      'protocolBuilder.delete',
      'protocolBuilder.refactor.deleteVariable',
      'protocolBuilder.refactor.deleteEntityType',
    ] as const) {
      expect(RPC_MUTATION_AUDIT_POLICIES[tag], tag).toEqual({
        kind: 'required',
      });
    }
    assertReasons(RPC_MUTATION_AUDIT_POLICIES);
    assertReasons(NON_RPC_MUTATION_AUDIT_POLICIES);
    assertReasons(NO_AUDIT_TRANSACTION_POLICIES);
  });

  it('classifies the exact configured Better Auth organization route inventory', () => {
    const env: AuthEnv = {
      baseUrl: 'http://studio.test',
      secret: randomBytes(32).toString('hex'),
      trustedProxies: undefined,
      socialProviders: {},
    };
    // The server's own adapter, over a bridge that refuses every statement:
    // the inventory is read off the configured plugin, so building the
    // instance must not need a database, and this proves it does not.
    const unreachable = (): Promise<never> =>
      Promise.reject(new Error('the route inventory reads no database'));
    const bridge: SqlBridge = {
      run: unreachable,
      transaction: unreachable,
    };
    const auth = createBetterAuthInstance({
      env,
      adapter: studioAuthAdapter(bridge),
      cipher: testCipher(),
      sendMagicLink: () => Promise.resolve(),
    });
    const plugin = auth.options.plugins?.find(
      (candidate) => candidate.id === 'organization',
    );
    if (!plugin?.endpoints) throw new Error('organization plugin not found');
    const runtimeRoutes = Object.values(plugin.endpoints).flatMap(
      (endpoint): string[] => {
        if (!isRecord(endpoint)) throw new Error('invalid auth endpoint');
        const path = endpoint.path;
        const options = endpoint.options;
        if (path === undefined) return [];
        if (
          typeof path !== 'string' ||
          !isRecord(options) ||
          (options.method !== 'GET' && options.method !== 'POST')
        ) {
          throw new Error('invalid organization route metadata');
        }
        return [`${options.method} /api/auth${path}`];
      },
    );

    expect(runtimeRoutes.toSorted(byName)).toEqual(
      Object.keys(BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES).toSorted(byName),
    );
    for (const [key, policy] of Object.entries(
      BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES,
    )) {
      expect(`${policy.method} ${policy.path}`).toBe(key);
      expect(policy.reason).not.toHaveLength(0);
      if (policy.audit.kind !== 'required') {
        expect(policy.audit.reason).not.toHaveLength(0);
      }
    }
  });

  it('keeps every unaudited Better Auth team mutation blocked', () => {
    expect(
      [...BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS].toSorted(byName),
    ).toEqual([
      '/api/auth/organization/accept-invitation',
      '/api/auth/organization/cancel-invitation',
      '/api/auth/organization/create',
      '/api/auth/organization/delete',
      '/api/auth/organization/invite-member',
      '/api/auth/organization/leave',
      '/api/auth/organization/reject-invitation',
      '/api/auth/organization/remove-member',
      '/api/auth/organization/update',
      '/api/auth/organization/update-member-role',
    ]);
    const forbiddenMutation =
      /authClient\.organization\.(acceptInvitation|cancelInvitation|create|delete|inviteMember|leave|rejectInvitation|removeMember|update|updateMemberRole)/;
    const clientRoot = resolve(REPO_ROOT, 'apps/studio/client/src');
    const bypasses = typescriptFiles(clientRoot).filter((file) =>
      forbiddenMutation.test(readFileSync(file, 'utf8')),
    );
    expect(bypasses.map((file) => relative(REPO_ROOT, file))).toEqual([]);
  });

  it('keeps the writable team store behind audited commands', () => {
    const serverRoot = resolve(REPO_ROOT, 'apps/studio/server/src');
    const storePath = resolve(serverRoot, 'team/store.ts');
    const importers = typescriptFiles(serverRoot).filter((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].some(
        ([, specifier]) =>
          specifier?.startsWith('.') &&
          resolve(dirname(file), specifier) === storePath,
      );
    });

    // read-authorization.ts is the one reader: audit reads must authorize the
    // caller's committed role inside their own transaction, and confining that
    // lock here keeps the store's write surface out of the RPC router.
    expect(importers.map((file) => relative(REPO_ROOT, file))).toEqual([
      'apps/studio/server/src/audit/read-authorization.ts',
      'apps/studio/server/src/protocol/commands.ts',
      'apps/studio/server/src/study/commands.ts',
      'apps/studio/server/src/team/commands.ts',
    ]);
  });

  it('recognizes transaction aliases, computed access, and raw query mutations', () => {
    const cases = [
      [
        'direct transaction',
        'db.transaction(async () => undefined)',
        'transaction',
      ],
      ['transaction alias', 'const run = db.transaction', 'transaction'],
      [
        'computed transaction',
        "db['transaction'](async () => undefined)",
        'transaction',
      ],
      ['dynamic computed access', 'tenantDb[method](sql)', 'computed'],
      ['query alias', 'const run = tenant.query', 'query'],
      ['destructured query', 'const { query: run } = tenantDb', 'query'],
      ['raw update', 'tenant.query(`UPDATE leases SET owner = $1`)', 'query'],
    ] as const;
    for (const [name, source, member] of cases) {
      expect(
        tenantBoundaryAccesses(source).some(
          (access) => access.member === member,
        ),
        `${name} must be rejected by the production boundary oracle`,
      ).toBe(true);
    }
    expect(tenantBoundaryAccesses('tenant.query(`SELECT 1`)')).toEqual([]);
    expect(
      tenantBoundaryAccesses('client.query(`UPDATE leases SET owner = $1`)'),
    ).toEqual([]);
  });

  it('allows raw tenant writes only inside the two executors or schema bootstrap', () => {
    const roots = [
      resolve(REPO_ROOT, 'apps/studio/server/src'),
      resolve(REPO_ROOT, 'packages/studio-sync/src'),
    ];
    const actual: Record<string, TenantBoundaryAccess[]> = {};
    for (const file of roots.flatMap(typescriptFiles)) {
      const accesses = tenantBoundaryAccesses(readFileSync(file, 'utf8'));
      if (accesses.length > 0) {
        actual[relative(REPO_ROOT, file)] = accesses.map((access) => ({
          ...access,
          line: 0,
        }));
      }
    }
    // The two executors are `db/tenant.ts`'s, since #1927 stage 3.
    // `audit/command.ts` and `audit/transaction.ts` used to be them, each
    // opening a transaction on a `TenantDb` handle a caller passed in; both
    // are deleted. `audited` (`audit/audited.ts`) and `noAuditTransaction`
    // (`audit/no-audit.ts`) now go through the scopes, which take a branded
    // `TeamAccess` and read their client from a service — so there is exactly
    // one module left that opens a transaction at all, and a third call
    // appearing anywhere else is what this case is for.
    expect(actual).toEqual({
      'apps/studio/server/src/db/tenant.ts': [
        // `openOn`: the root of every scope — `TenantScope`, `OwnerScope`,
        // `MaintenanceScope` and the untenanted one all share it.
        { member: 'transaction', form: 'call', line: 0 },
        // `savepoint`: the nested transaction `audited` runs its body in, on
        // the connection the outer scope already holds.
        { member: 'transaction', form: 'call', line: 0 },
      ],
      // Not a tenant transaction: this is better-auth's own adapter handing
      // out a scoped adapter, which the secrets wrapper re-wraps so the
      // account writes inside an OAuth sign-up are sealed like every other
      // one (#1900). The oracle matches `.transaction` on any receiver on
      // purpose, so a non-tenant one is listed here rather than exempted.
      'apps/studio/server/src/auth/secrets-adapter.ts': [
        { member: 'transaction', form: 'call', line: 0 },
      ],
      // Not a tenant transaction either: the sql-pg adapter's
      // `transaction` config handing better-auth's callback to the bridge,
      // which opens an untenanted scope on the auth tables — no tenant table
      // has a better-auth model.
      'apps/studio/server/src/auth/adapter.ts': [
        { member: 'transaction', form: 'call', line: 0 },
      ],
      'apps/studio/server/src/db/schema.ts': [
        { member: 'query', form: 'call', line: 0, sqlVerb: 'INSERT' },
      ],
    });
  });

  it('keeps every no-audit transaction exact, reasoned, and in use', () => {
    const roots = [
      resolve(REPO_ROOT, 'apps/studio/server/src'),
      resolve(REPO_ROOT, 'packages/studio-sync/src'),
    ];
    const directOperations = roots
      .flatMap(typescriptFiles)
      .flatMap((file) => noAuditOperations(readFileSync(file, 'utf8')));
    const usedOperations = new Set([
      ...directOperations,
      ...Object.values(SYNC_TRANSACTION_POLICIES),
    ]);
    expect([...usedOperations].toSorted(byName)).toEqual(
      Object.keys(NO_AUDIT_TRANSACTION_POLICIES).toSorted(byName),
    );
  });
});
