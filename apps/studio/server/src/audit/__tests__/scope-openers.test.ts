import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import {
  enclosingSpan,
  moduleClauseTokens,
  productionFiles,
  spansOf,
} from '../../__tests__/support/source-spans.ts';
import { sourceTokens } from '../../__tests__/support/source-tokens.ts';

// The other half of the no-audit registry (`audit/transaction-policy.ts`).
// That registry names the transactions opened through `noAuditTransaction` /
// `noAuditMaintenanceTransaction`, and `audit/policy.ts` names every `audited`
// command; a scope opened directly goes through neither, so it is pinned here
// instead — each with the reason it needs no audit event (a read, the queue's
// own bookkeeping, a row that belongs to no team). Tests are not inventoried.

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(HERE, '../../..');
const REPO_ROOT = resolve(SERVER_ROOT, '../../..');

const SCOPES = new Set([
  'TenantScope',
  'UntenantedScope',
  'MaintenanceScope',
  'OwnerScope',
  'savepoint',
]);

/**
 * The modules that are the mechanism rather than a caller: `db/tenant.ts`
 * declares the scopes, and `audit/audited.ts` / `audit/no-audit.ts` are the two
 * seams the audit policies already cover — every `audited` command is named in
 * `audit/policy.ts`, every `noAuditTransaction` operation in
 * `audit/transaction-policy.ts`. `withTransaction` is collected in these too.
 */
const MECHANISM = new Set([
  'apps/studio/server/src/db/tenant.ts',
  'apps/studio/server/src/audit/audited.ts',
  'apps/studio/server/src/audit/no-audit.ts',
]);

/**
 * Every way `source` opens a transaction other than through the two audit
 * seams, by the `Effect.fn` it sits in (`null` outside one) and the opener:
 * `TenantScope.open`, `MaintenanceScope.openTenant` and so on, `savepoint`,
 * and `withTransaction` — the `SqlClient`'s own, which would open one without
 * `pinSession`'s role and search path. A scope named without a member (handed
 * on, aliased, destructured) is `TenantScope` alone, and a renaming import is
 * counted where it is, so a call under another name cannot go unseen.
 */
function openers(
  source: string,
  { scopes }: { scopes: boolean },
): { span: string | null; opener: string }[] {
  const tokens = sourceTokens(source);
  const spans = spansOf(tokens);
  const clauses = moduleClauseTokens(tokens);
  const found: { span: string | null; opener: string }[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== SyntaxKind.Identifier) continue;
    const inClause = clauses.has(index);
    if (token.raw === 'withTransaction') {
      if (!inClause || tokens[index + 1]?.raw === 'as') {
        found.push({ span: enclosingSpan(spans, index), opener: token.raw });
      }
      continue;
    }
    if (!scopes || !SCOPES.has(token.raw)) continue;
    if (inClause && tokens[index + 1]?.raw !== 'as') continue;
    if (tokens[index - 1]?.kind === SyntaxKind.ConstKeyword) continue;
    // A property of something else (`open.savepoint`) is not the scope.
    if (tokens[index - 1]?.kind === SyntaxKind.DotToken) continue;
    const member =
      !inClause &&
      tokens[index + 1]?.kind === SyntaxKind.DotToken &&
      tokens[index + 2]?.kind === SyntaxKind.Identifier
        ? `.${tokens[index + 2]!.raw}`
        : '';
    found.push({
      span: enclosingSpan(spans, index),
      opener: `${token.raw}${member}`,
    });
  }
  return found;
}

function inventory(): Map<string, number> {
  const counts = new Map<string, number>();
  const files = [
    ...productionFiles(resolve(SERVER_ROOT, 'src')),
    ...productionFiles(resolve(SERVER_ROOT, 'scripts')),
    ...productionFiles(resolve(REPO_ROOT, 'packages/studio-sync/src')),
  ];
  for (const file of files) {
    const path = relative(REPO_ROOT, file);
    const found = openers(readFileSync(file, 'utf8'), {
      scopes: !MECHANISM.has(path),
    });
    for (const { span, opener } of found) {
      const key = `${span === null ? path : `${path} › ${span}`} › ${opener}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

const SERVER = 'apps/studio/server';

/**
 * Every transaction opened other than through `audited` or
 * `noAuditTransaction` / `noAuditMaintenanceTransaction`, and why it needs
 * neither. Keyed by file, the `Effect.fn` it sits in where there is one, and
 * the opener; the count is how many times it is named there. Exact in both
 * directions: a new direct opener fails until it is listed here with its
 * reason, and an entry whose opener has gone fails until it is removed.
 */
const OPENERS: Record<string, { count: number; why: string }> = {
  [`${SERVER}/src/app.ts › UntenantedScope.open`]: {
    count: 1,
    why: 'the deployment-status read of the installation row, which belongs to no team',
  },
  [`${SERVER}/src/db/deployment-state.ts › UntenantedScope.open`]: {
    count: 1,
    why: '`readDeploymentState`: one untenanted row, read-only',
  },
  [`${SERVER}/src/db/migrate.ts › db.migrate › OwnerScope.open`]: {
    count: 1,
    why: '`studio-api migrate` applying the schema DDL as the owner; no team exists at this layer',
  },
  [`${SERVER}/src/programs/migrate.ts › OwnerScope.open`]: {
    count: 1,
    why: 'issuing the `/setup` bootstrap token, which only the owner may write',
  },
  [`${SERVER}/src/jobs/clock.ts › MaintenanceScope.open`]: {
    count: 1,
    why: 'the worker clock’s `SELECT now()`, read-only',
  },
  [`${SERVER}/src/jobs/clock.ts › UntenantedScope.open`]: {
    count: 1,
    why: 'the web process clock’s `SELECT now()`, read-only',
  },
  [`${SERVER}/src/jobs/sign-in-email.ts › UntenantedScope.open`]: {
    count: 1,
    why: 'enqueueing a sign-in mail, which belongs to no team; the scope only pins the application role',
  },
  [`${SERVER}/src/jobs/handlers/denied-attempts-summary.ts › loadActor › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'reading the actor’s user row for a summary’s label, read-only',
    },
  [`${SERVER}/src/jobs/handlers/denied-attempts-summary.ts › summaryAlreadyWritten › MaintenanceScope.openTenant`]:
    {
      count: 1,
      why: 'the idempotence read of `audit_events`, read-only (the table has no maintenance escape, hence the team)',
    },
  [`${SERVER}/src/audit/denial-summary.ts › audit.appendDeniedAuditSummary › MaintenanceScope.openTenant`]:
    {
      count: 1,
      why: 'the write that is itself the audit event: a denied-attempts summary appended under the team lock',
    },
  [`${SERVER}/src/jobs/handlers/invitation-delivery.ts › job.invitation-delivery › MaintenanceScope.open`]:
    {
      count: 4,
      why: 'the delivery state machine’s bookkeeping on `team_invitations` (attempt count, send, outcome); the invitation’s creation and cancellation are the audited acts',
    },
  [`${SERVER}/src/jobs/handlers/protocol-store-gc.ts › protocol.gcProtocolStore › MaintenanceScope.open`]:
    {
      count: 2,
      why: 'the sweep’s role probe and its cross-team tenant enumeration, both read-only; its writes go through `noAuditMaintenanceTransaction`',
    },
  [`${SERVER}/src/jobs/handlers/protocol-store-gc.ts › protocol.gcProtocolStore › MaintenanceScope.openTenant`]:
    {
      count: 1,
      why: 'listing one tenant’s drafts for the sweep, read-only',
    },
  [`${SERVER}/src/jobs/worker.ts › JobWorker.drainOnce › MaintenanceScope.open`]:
    {
      count: 5,
      why: 'claiming and settling jobs in the queue schema, which holds no team’s rows',
    },
  [`${SERVER}/src/jobs/worker.ts › JobWorker.reapExpired › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'reaping expired claims in the queue schema',
    },
  [`${SERVER}/src/jobs/worker.ts › JobWorker.deleteExpired › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'queue retention',
    },
  [`${SERVER}/src/jobs/worker.ts › schedule › MaintenanceScope.open`]: {
    count: 1,
    why: 'declaring a cron schedule in the queue schema',
  },
  [`${SERVER}/src/jobs/worker.ts › dropUndeclaredSchedules › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'removing schedules the deployment no longer declares',
    },
  [`${SERVER}/src/jobs/worker.ts › JobWorker.tickSchedules › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'cron bookkeeping in the queue schema',
    },
  [`${SERVER}/src/jobs/worker.ts › queueDepths › MaintenanceScope.open`]: {
    count: 1,
    why: 'queue-depth metrics, read-only',
  },
  [`${SERVER}/src/secrets/services.ts › MaintenanceScope.open`]: {
    count: 1,
    why: 'the boot check that every stored secret can be opened, read-only',
  },
  [`${SERVER}/src/secrets/rotate.ts › secrets.rotate.rotateSecrets › MaintenanceScope.open`]:
    {
      count: 3,
      why: 'the hand-run re-keying command: the same read-only check, each re-seal batch (ciphertext only, no plaintext changes), and the read-only postcondition',
    },
  [`${SERVER}/src/setup/commands.ts › setup.complete › UntenantedScope.open`]: {
    count: 2,
    why: 'reading and claiming the installation row, which belongs to no team and so to no team’s audit log',
  },
  [`${SERVER}/src/team/commands.ts › team.acceptInvitation › UntenantedScope.open`]:
    {
      count: 1,
      why: 'finding which team an invitation names, read-only, before the audited transaction on that team opens',
    },
  [`${SERVER}/src/rpc/handlers/account.ts › UntenantedScope.open`]: {
    count: 1,
    why: 'a user’s own locale preference: personal, no tenant, deliberately unaudited (localization design §5.2)',
  },
  [`${SERVER}/src/rpc/handlers/protocols.ts › TenantScope.open`]: {
    count: 2,
    why: '`protocols.list` and `protocols.draft`, reads (the draft read with its #1257 check in the same transaction)',
  },
  [`${SERVER}/src/rpc/handlers/studies.ts › TenantScope.open`]: {
    count: 2,
    why: '`studies.list` and `studies.counts`, reads',
  },
  [`${SERVER}/src/study/tenancy.ts › study.tenancy.resolveStudy › TenantScope.open`]:
    {
      count: 1,
      why: 'probing each membership’s team for the study, read-only',
    },
  [`${SERVER}/src/protocol-builder/tenancy.ts › protocolBuilder.openSession › TenantScope.open`]:
    {
      count: 1,
      why: 'probing each membership’s team for the protocol and its draft, read-only',
    },
  [`${SERVER}/src/protocol-builder/host.ts › protocolBuilder.readSection › TenantScope.open`]:
    {
      count: 1,
      why: 'the editor reading one section at its head, read-only',
    },
  [`${SERVER}/src/protocol-builder/host.ts › protocolBuilder.listSectionIds › TenantScope.open`]:
    {
      count: 1,
      why: 'the editor listing a draft’s sections, read-only',
    },
  [`${SERVER}/src/protocol-builder/router.ts › TenantScope.open`]: {
    count: 4,
    why: 'the event backlog, two write-receipt lookups for a retried submit/create, and opening a committed asset key — all reads',
  },
  [`${SERVER}/scripts/apply-schema.ts › OwnerScope.open`]: {
    count: 1,
    why: 'the development schema script issuing the bootstrap token as the owner',
  },
  [`${SERVER}/scripts/seed/seed.ts › db.seed › OwnerScope.open`]: {
    count: 1,
    why: 'the development seed, populating fixtures as the owner',
  },
  [`${SERVER}/scripts/protocol-demo.ts › TenantScope.open`]: {
    count: 1,
    why: 'a hand-run development script against a fixture team',
  },
};

describe('the transactions opened outside the audit seams', () => {
  it('are exactly the listed ones', () => {
    const found = inventory();
    const drift = [
      ...[...found]
        .filter(([key, count]) => OPENERS[key]?.count !== count)
        .map(
          ([key, count]) =>
            `${key}: ${count} opened, listed ${OPENERS[key]?.count ?? 0}`,
        ),
      ...Object.keys(OPENERS)
        .filter((key) => !found.has(key))
        .map((key) => `${key}: listed, and no longer opened`),
    ];
    expect(drift).toEqual([]);
  });

  it('each say why', () => {
    for (const [key, entry] of Object.entries(OPENERS)) {
      expect(entry.why, key).not.toBe('');
    }
  });
});

describe('the opener collector', () => {
  it('finds every scope, savepoint and withTransaction, by span', () => {
    const source = `
      import { TenantScope as Scope } from '../db/tenant.ts';
      const a = Effect.fn('a')(function* () {
        yield* TenantScope.open(access, body);
        yield* MaintenanceScope.openTenant(access, body);
        yield* savepoint(body);
        yield* sql.withTransaction(body);
      });
      const b = Effect.fnUntraced(function* () {
        yield* UntenantedScope.open(body);
      });
      const run = OwnerScope.open;
      const { open } = MaintenanceScope;`;
    expect(openers(source, { scopes: true })).toEqual([
      { span: null, opener: 'TenantScope' },
      { span: 'a', opener: 'TenantScope.open' },
      { span: 'a', opener: 'MaintenanceScope.openTenant' },
      { span: 'a', opener: 'savepoint' },
      { span: 'a', opener: 'withTransaction' },
      { span: 'b', opener: 'UntenantedScope.open' },
      { span: null, opener: 'OwnerScope.open' },
      { span: null, opener: 'MaintenanceScope' },
    ]);
  });

  it('collects withTransaction even in the modules that are the mechanism', () => {
    const source = `
      yield* TenantScope.open(access, body);
      yield* client.withTransaction(body);`;
    expect(openers(source, { scopes: false })).toEqual([
      { span: null, opener: 'withTransaction' },
    ]);
  });

  it('reads nothing out of an import, a comment or a string', () => {
    const source = `
      import { MaintenanceScope, savepoint, TenantScope } from '../db/tenant.ts';
      // TenantScope.open(access, body)
      const text = 'sql.withTransaction(body)';
      const note = open.savepoint;`;
    expect(openers(source, { scopes: true })).toEqual([]);
  });
});
