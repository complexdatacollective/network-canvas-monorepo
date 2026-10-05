import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Predicate } from 'effect';
import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import { StudioRpcs } from '@codaco/studio-contract/rpc/studio';
import { StudioStreams } from '@codaco/studio-contract/sync/protocol-builder';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Predicate.isObjectKeyword(value);
}

function byName(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
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
      if (token.raw === ',' && argumentDepth === 1) break;
      if (argumentDepth === 1 && token.kind === SyntaxKind.StringLiteral) {
        operations.push(token.value);
        break;
      }
    }
  }
  return operations;
}

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
  const servedTags = (): string[] => [
    ...StudioRpcs.requests.keys(),
    ...StudioStreams.requests.keys(),
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
      'Submit',
      'Create',
      'Delete',
      'RefactorDeleteVariable',
      'RefactorDeleteEntityType',
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
    const clientRoot = resolve(REPO_ROOT, 'apps/studio/web/src');
    const bypasses = typescriptFiles(clientRoot).filter((file) =>
      forbiddenMutation.test(readFileSync(file, 'utf8')),
    );
    expect(bypasses.map((file) => relative(REPO_ROOT, file))).toEqual([]);
  });

  it('keeps the writable team store behind audited commands', () => {
    const serverRoot = resolve(REPO_ROOT, 'apps/studio/api/src');
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
      'apps/studio/api/src/audit/read-authorization.ts',
      'apps/studio/api/src/protocol/commands.ts',
      'apps/studio/api/src/study/commands.ts',
      'apps/studio/api/src/team/commands.ts',
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
      resolve(REPO_ROOT, 'apps/studio/api/src'),
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
    expect(actual).toEqual({
      'apps/studio/api/src/db/tenant.ts': [
        { member: 'transaction', form: 'call', line: 0 },
        { member: 'transaction', form: 'call', line: 0 },
      ],
      // Not a tenant transaction: this is better-auth's own adapter handing
      // out a scoped adapter, which the secrets wrapper re-wraps so the
      // account writes inside an OAuth sign-up are sealed like every other
      // one (#1900). The oracle matches `.transaction` on any receiver on
      // purpose, so a non-tenant one is listed here rather than exempted.
      'apps/studio/api/src/auth/secrets-adapter.ts': [
        { member: 'transaction', form: 'call', line: 0 },
      ],
      'apps/studio/api/src/auth/adapter.ts': [
        { member: 'transaction', form: 'call', line: 0 },
      ],
      'apps/studio/api/src/db/schema.ts': [
        { member: 'query', form: 'call', line: 0, sqlVerb: 'INSERT' },
      ],
    });
  });

  it('keeps every no-audit transaction exact, reasoned, and in use', () => {
    const roots = [
      resolve(REPO_ROOT, 'apps/studio/api/src'),
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
