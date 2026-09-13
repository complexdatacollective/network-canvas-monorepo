import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSourceFile,
  isStringLiteralLike,
  isTemplateLiteralToken,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  type Node,
} from '@typescript/typescript6';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { contract } from '@codaco/studio-rpc';

import { createBetterAuthInstance } from '../../auth/better-auth.ts';
import type { AuthEnv } from '../../env.ts';
import { SYNC_TRANSACTION_POLICIES } from '../../protocol/sync.ts';
import {
  BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES,
  BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS,
} from '../better-auth-policy.ts';
import {
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
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
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

type SourceToken = {
  kind: SyntaxKind;
  raw: string;
  value: string;
  position: number;
};

// A parser supplies the context needed to distinguish regular expressions,
// division, and template interpolation. Walking its token leaves keeps comments
// and literal contents from spoofing the inventory without running a typecheck.
function sourceTokens(
  source: string,
  fileName = 'policy-source.ts',
): SourceToken[] {
  const parsed = createSourceFile(
    fileName,
    source,
    ScriptTarget.Latest,
    false,
    fileName.endsWith('.tsx') ? ScriptKind.TSX : ScriptKind.TS,
  );
  // TypeScript exposes parser diagnostics at runtime but omits this field from
  // its public SourceFile type. Fail closed if that contract ever changes.
  if (
    !('parseDiagnostics' in parsed) ||
    !Array.isArray(parsed.parseDiagnostics) ||
    parsed.parseDiagnostics.length !== 0
  ) {
    throw new Error(`Cannot inventory invalid TypeScript: ${fileName}`);
  }
  const tokens: SourceToken[] = [];
  const visit = (node: Node): void => {
    if (node.kind <= SyntaxKind.LastToken) {
      if (node.kind !== SyntaxKind.EndOfFileToken) {
        tokens.push({
          kind: node.kind,
          raw: node.getText(parsed),
          value:
            isStringLiteralLike(node) || isTemplateLiteralToken(node)
              ? node.text
              : '',
          position: node.getStart(parsed),
        });
      }
      return;
    }
    for (const child of node.getChildren(parsed)) visit(child);
  };
  visit(parsed);
  return tokens;
}

function tokenName(token: SourceToken | undefined): string | undefined {
  if (token === undefined) return undefined;
  return token.kind === SyntaxKind.StringLiteral ||
    token.kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
    token.kind === SyntaxKind.TemplateHead ||
    token.kind === SyntaxKind.TemplateMiddle ||
    token.kind === SyntaxKind.TemplateTail
    ? token.value
    : token.raw;
}

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

function tenantBoundaryAccesses(
  source: string,
  fileName?: string,
): TenantBoundaryAccess[] {
  const tokens = sourceTokens(source, fileName);
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

function noAuditOperations(source: string, fileName?: string): string[] {
  const tokens = sourceTokens(source, fileName);
  const operations: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokenName(tokens[index]) !== 'runNoAuditTenantTransaction') continue;
    let argumentDepth = 0;
    let sawFirstComma = false;
    for (let cursor = index + 1; cursor < tokens.length; cursor++) {
      const token = tokens[cursor];
      if (token === undefined) break;
      if (token.raw === '(') argumentDepth++;
      if (token.raw === ')') {
        argumentDepth--;
        if (argumentDepth === 0) break;
      }
      if (token.raw === ',' && argumentDepth === 1) {
        if (!sawFirstComma) {
          sawFirstComma = true;
          continue;
        }
        break;
      }
      if (sawFirstComma && token.kind === SyntaxKind.StringLiteral) {
        operations.push(token.value);
        break;
      }
    }
  }
  return operations;
}

describe('audit mutation policy', () => {
  it('classifies every internal RPC mutation and only mutations', () => {
    const reads = new Set([
      'status',
      'setup.status',
      'me',
      'account.registry',
      'protocols.draft',
      'protocols.list',
      'studies.counts',
      'studies.get',
      'studies.list',
      'templates.list',
      'templates.registryIntents',
      'audit.list',
      'audit.get',
      'audit.filterOptions',
      'audit.alerts.list',
      'audit.alerts.settings',
      // The protocol-builder host's reads. `watchProtocol` is a subscription
      // rather than a write: it observes revisions, locks and presence, and
      // changes nothing it observes.
      'protocolBuilder.getSection',
      'protocolBuilder.listSections',
      'protocolBuilder.watchProtocol',
      'protocolBuilder.resources.list',
      'protocolBuilder.resources.inspect',
      'protocolBuilder.resources.preview',
    ]);
    const mutations = contractLeaves(contract).filter(
      (procedure) => !reads.has(procedure),
    );
    expect(mutations.toSorted()).toEqual(
      Object.keys(RPC_MUTATION_AUDIT_POLICIES).toSorted(),
    );
    expect(RPC_MUTATION_AUDIT_POLICIES['team.updateMemberRole']).toEqual({
      kind: 'required',
    });
    expect(RPC_MUTATION_AUDIT_POLICIES['team.acceptInvitation']).toEqual({
      kind: 'required',
    });
    expect(RPC_MUTATION_AUDIT_POLICIES['team.createInvitation']).toEqual({
      kind: 'required',
    });
    expect(RPC_MUTATION_AUDIT_POLICIES['team.cancelInvitation']).toEqual({
      kind: 'required',
    });
    expect(RPC_MUTATION_AUDIT_POLICIES['protocols.create']).toEqual({
      kind: 'required',
    });
    expect(RPC_MUTATION_AUDIT_POLICIES['studies.create']).toEqual({
      kind: 'required',
    });
    expect(
      RPC_MUTATION_AUDIT_POLICIES['protocols.addInformationStage'],
    ).toEqual({ kind: 'required' });
    expect(RPC_MUTATION_AUDIT_POLICIES['protocols.moveStage']).toEqual({
      kind: 'required',
    });
    expect(RPC_MUTATION_AUDIT_POLICIES['protocolBuilder.submit']).toEqual({
      kind: 'required',
    });
    expect(RPC_MUTATION_AUDIT_POLICIES['protocolBuilder.create']).toEqual({
      kind: 'required',
    });
    expect(
      RPC_MUTATION_AUDIT_POLICIES['protocolBuilder.refactor.deleteVariable'],
    ).toEqual({ kind: 'required' });
    expect(RPC_MUTATION_AUDIT_POLICIES['protocolBuilder.delete']).toEqual({
      kind: 'required',
    });
    assertReasons(RPC_MUTATION_AUDIT_POLICIES);
    assertReasons(NON_RPC_MUTATION_AUDIT_POLICIES);
    assertReasons(NO_AUDIT_TRANSACTION_POLICIES);
  });

  it('classifies the exact configured Better Auth organization route inventory', async () => {
    // Reads endpoint metadata only; this pool never opens a connection.
    const pool = new pg.Pool();
    const env: AuthEnv = {
      baseUrl: 'http://studio.test',
      secret: randomBytes(32).toString('hex'),
      mailer: { kind: 'refuse' },
      trustedProxies: undefined,
      socialProviders: {},
    };
    try {
      const auth = createBetterAuthInstance(env, pool, {
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

      expect(runtimeRoutes.toSorted()).toEqual(
        Object.keys(BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES).toSorted(),
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
    } finally {
      await pool.end();
    }
  });

  it('keeps every unaudited Better Auth team mutation blocked', () => {
    expect([...BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS].toSorted()).toEqual([
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

    // The audit, PII and webhook readers use lockActor to authorize the live
    // committed membership in the audit transaction. The writable store stays
    // confined to these reviewed services and the existing command producers.
    expect(importers.map((file) => relative(REPO_ROOT, file))).toEqual([
      'apps/studio/server/src/audit/read-authorization.ts',
      'apps/studio/server/src/pii/participants.ts',
      'apps/studio/server/src/pii/webhooks.ts',
      'apps/studio/server/src/protocol/commands.ts',
      'apps/studio/server/src/study/commands.ts',
      'apps/studio/server/src/team/commands.ts',
      'apps/studio/server/src/template/registry.ts',
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
        'options transaction call',
        'options.transaction(async () => undefined)',
        'transaction',
      ],
      [
        'options transaction alias',
        'const run = options.transaction',
        'transaction',
      ],
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
    expect(
      tenantBoundaryAccesses('const expected = options.expectedTransaction'),
    ).toEqual([]);
  });

  it('parses regex, division, templates, and TSX without hiding real mutations', () => {
    const urlPattern = String.raw`/^https:\/\/[^/?#]+(?:[/?#]|$)/i`;
    expect(
      tenantBoundaryAccesses(
        `const valid = ${urlPattern}.test(value); tenant.transaction(work);`,
      ),
    ).toMatchObject([{ member: 'transaction', form: 'call' }]);
    expect(
      tenantBoundaryAccesses(
        String.raw`const pattern = /tenant.transaction(work)/;`,
      ),
    ).toEqual([]);
    expect(
      tenantBoundaryAccesses(
        'const ratio = numerator / tenant.transaction(work) / denominator;',
      ),
    ).toMatchObject([{ member: 'transaction', form: 'call' }]);
    expect(
      tenantBoundaryAccesses(
        'tenant.query(`UPDATE rows SET value = ${/}/.test(value) ? `nested ${value}` : value}`);',
      ),
    ).toMatchObject([{ member: 'query', sqlVerb: 'UPDATE' }]);
    expect(
      tenantBoundaryAccesses(
        '<div>tenant.transaction(work){tenant.transaction(work)}</div>',
        'fixture.tsx',
      ),
    ).toMatchObject([{ member: 'transaction', form: 'call' }]);
    expect(
      tenantBoundaryAccesses('const value = <number>tenant.transaction(work);'),
    ).toMatchObject([{ member: 'transaction', form: 'call' }]);
    expect(() => tenantBoundaryAccesses('tenant.transaction(')).toThrow(
      'Cannot inventory invalid TypeScript',
    );
  });

  it('allows raw tenant writes only inside the two executors or schema bootstrap', () => {
    const roots = [
      resolve(REPO_ROOT, 'apps/studio/server/src'),
      resolve(REPO_ROOT, 'packages/studio-sync/src'),
    ];
    const actual: Record<string, TenantBoundaryAccess[]> = {};
    for (const file of roots.flatMap(typescriptFiles)) {
      const accesses = tenantBoundaryAccesses(readFileSync(file, 'utf8'), file);
      if (accesses.length > 0) {
        actual[relative(REPO_ROOT, file)] = accesses.map((access) => ({
          ...access,
          line: 0,
        }));
      }
    }
    expect(actual).toEqual({
      'apps/studio/server/src/audit/command.ts': [
        { member: 'transaction', form: 'call', line: 0 },
        { member: 'transaction', form: 'call', line: 0 },
      ],
      'apps/studio/server/src/audit/transaction.ts': [
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
      .flatMap((file) => noAuditOperations(readFileSync(file, 'utf8'), file));
    const usedOperations = new Set([
      ...directOperations,
      ...Object.values(SYNC_TRANSACTION_POLICIES),
    ]);
    expect([...usedOperations].toSorted()).toEqual(
      Object.keys(NO_AUDIT_TRANSACTION_POLICIES).toSorted(),
    );
  });
});
