import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import {
  enclosingSpan,
  moduleClauseTokens,
  productionFiles,
  skipTypeArguments,
  spansOf,
} from '../../__tests__/support/source-spans.ts';
import { sourceTokens } from '../../__tests__/support/source-tokens.ts';

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

const MECHANISM = new Set([
  'apps/studio/api/src/db/tenant.ts',
  'apps/studio/api/src/audit/audited.ts',
  'apps/studio/api/src/audit/no-audit.ts',
]);

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
    if (
      token.raw === 'transaction' &&
      tokens[index - 1]?.kind === SyntaxKind.DotToken &&
      tokens[skipTypeArguments(tokens, index + 1)]?.kind ===
        SyntaxKind.OpenParenToken
    ) {
      found.push({ span: enclosingSpan(spans, index), opener: 'transaction' });
      continue;
    }
    if (token.raw === 'withTransaction') {
      if (!inClause || tokens[index + 1]?.raw === 'as') {
        found.push({ span: enclosingSpan(spans, index), opener: token.raw });
      }
      continue;
    }
    if (!scopes || !SCOPES.has(token.raw)) continue;
    if (inClause && tokens[index + 1]?.raw !== 'as') continue;
    if (tokens[index - 1]?.kind === SyntaxKind.ConstKeyword) continue;
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

const SERVER = 'apps/studio/api';

const OPENERS: Record<string, { count: number; why: string }> = {
  [`${SERVER}/src/db/tenant.ts › transaction`]: {
    count: 2,
    why: "the mechanism: `openOn`'s root transaction, which pins the role and search path first, and `savepoint`'s nested one on the same handle",
  },
  [`${SERVER}/src/auth/secrets-adapter.ts › transaction`]: {
    count: 1,
    why: "better-auth's own adapter transaction, wrapped only so writes inside it are sealed; it delegates to `auth/adapter.ts`'s, which the bridge opens as an untenanted scope",
  },
  [`${SERVER}/src/auth/adapter.ts › transaction`]: {
    count: 1,
    why: "better-auth's `transaction()` handed to the bridge, which opens it as `sql-bridge.ts`'s untenanted scope: sign-up, OAuth linking and the like on the auth tables, which belong to no team",
  },
  [`${SERVER}/src/auth/sql-bridge.ts › UntenantedScope.open`]: {
    count: 1,
    why: "better-auth's adapter: the transaction around a `transaction()` callback — auth tables, no team, and no audit event of Studio's (better-auth's organization mutations are gated at the mount by `audit/better-auth-policy.ts`)",
  },
  [`${SERVER}/src/app.ts › UntenantedScope.open`]: {
    count: 1,
    why: 'the deployment-status read of the installation row, which belongs to no team',
  },
  [`${SERVER}/src/db/deployment-state.ts › UntenantedScope.open`]: {
    count: 2,
    why: '`readDeploymentState` and `readLatestRelease`: the one untenanted row, read-only, as two selects so the flag read never names the release columns (#1901 R-1)',
  },
  [`${SERVER}/src/db/deployment-state.ts › MaintenanceScope.open`]: {
    count: 1,
    why: '`readDeploymentStateAsMaintenance`: the same row, read-only, on the worker’s maintenance client',
  },
  [`${SERVER}/src/programs/maintenance.ts › maintenance.apply › MaintenanceScope.open`]:
    {
      count: 1,
      why: '`studio-api maintenance on|off` flipping the deployment’s flag, which belongs to no team; an operator’s command, not a researcher’s act',
    },
  [`${SERVER}/src/db/migrate.ts › db.migrate › OwnerScope.open`]: {
    count: 1,
    why: '`studio-api migrate` applying the schema DDL as the owner; no team exists at this layer',
  },
  [`${SERVER}/src/programs/migrate.ts › OwnerScope.open`]: {
    count: 2,
    why: 'issuing the `/setup` bootstrap token, which only the owner may write, and reading the installation id the command’s telemetry is stamped with, read-only',
  },
  [`${SERVER}/src/programs/maintenance.ts › maintenance › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'reading the installation id the command’s telemetry is stamped with, read-only; the row belongs to no team',
    },
  [`${SERVER}/src/programs/rotate-secrets.ts › MaintenanceScope.open`]: {
    count: 1,
    why: 'reading the installation id the command’s telemetry is stamped with, read-only; the row belongs to no team',
  },
  [`${SERVER}/src/programs/serve.ts › UntenantedScope.open`]: {
    count: 1,
    why: 'reading the installation id the server’s telemetry is stamped with, read-only and retried until the row exists; it belongs to no team',
  },
  [`${SERVER}/src/programs/worker.ts › MaintenanceScope.open`]: {
    count: 1,
    why: 'reading the installation id the worker’s telemetry is stamped with, read-only and retried until the row exists; it belongs to no team',
  },
  [`${SERVER}/src/jobs/clock.ts › MaintenanceScope.open`]: {
    count: 1,
    why: 'the worker clock’s `SELECT now()`, read-only',
  },
  [`${SERVER}/src/jobs/clock.ts › UntenantedScope.open`]: {
    count: 1,
    why: 'the web process clock’s `SELECT now()`, read-only',
  },
  [`${SERVER}/src/auth/service.ts › auth.sendMagicLink › UntenantedScope.open`]:
    {
      count: 1,
      why: 'the magic-link hook enqueueing a sign-in mail in a transaction of its own, because better-auth calls it outside any adapter transaction; it belongs to no team, and `Jobs.enqueue` requires a transaction',
    },
  [`${SERVER}/src/auth/service.ts › auth.recordAccountUsage › UntenantedScope.open`]:
    {
      count: 1,
      why: 'better-auth’s after-commit hook for a new account or session enqueueing its usage event in a transaction of its own; the hook runs only once the account or session has committed, the rows belong to no team, and `Jobs.enqueue` requires a transaction',
    },
  [`${SERVER}/src/auth/service.ts › UntenantedScope.open`]: {
    count: 1,
    why: "`AuthService`'s two membership reads over `team_members` (the `pinned` helper both go through), read-only and policy-free; the scope is there because both reads require `Transaction`",
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
  [`${SERVER}/src/jobs/handlers/update-check.ts › MaintenanceScope.open`]: {
    count: 1,
    why: 'the daily update check’s four touches of rows that belong to no team, through the one helper `inMaintenance`: recording the manifest on `deployment_state`, reading the installation owner’s name and address, claiming the notification for a version, and giving that claim back',
  },
  [`${SERVER}/src/jobs/handlers/protocol-store-gc.ts › protocol.gcProtocolStore › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'the sweep’s cross-team tenant enumeration, read-only; its writes go through `noAuditMaintenanceTransaction`',
    },
  [`${SERVER}/src/jobs/handlers/protocol-store-gc.ts › protocol.gcProtocolStore › MaintenanceScope.openTenant`]:
    {
      count: 1,
      why: 'listing one tenant’s drafts for the sweep, read-only',
    },
  [`${SERVER}/src/jobs/handlers/staged-resources-gc.ts › protocol.gcStagedResources › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'the staging collection’s cross-team tenant enumeration, read-only; its writes go through `noAuditMaintenanceTransaction`',
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
  [`${SERVER}/src/secrets/verify.ts › secrets.verify.verifyStoredKeys › MaintenanceScope.open`]:
    {
      count: 1,
      why: 'the boot check that every stored secret can be opened, read-only; the gate and the re-keying command both run it',
    },
  [`${SERVER}/src/secrets/rotate.ts › secrets.rotate.rotateSecrets › MaintenanceScope.open`]:
    {
      count: 2,
      why: 'the hand-run re-keying command: each re-seal batch (ciphertext only, no plaintext changes), and the read-only postcondition',
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
  [`${SERVER}/src/rpc/require-session.ts › TenantScope.open`]: {
    count: 1,
    why: 'resolving a presented participant session token to its session, read-only, before any procedure runs',
  },
  [`${SERVER}/src/interview/session.ts › interview.readParticipantSession › TenantScope.open`]:
    {
      count: 1,
      why: '`participant.session`: reading a session and claiming it for the page that opens it, unaudited by policy',
    },
  [`${SERVER}/src/interview/sync.ts › interview.syncParticipantSession › TenantScope.open`]:
    {
      count: 1,
      why: '`participant.sync`: one of an interview’s many writes, unaudited by policy; the session row carries its activity',
    },
  [`${SERVER}/src/interview/analytics.ts › interview.forwardParticipantEvents › TenantScope.open`]:
    {
      count: 1,
      why: '`participant.analytics`: reading whether the session’s study allows analytics before forwarding, read-only and unaudited by policy',
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
  [`${SERVER}/src/protocol-builder/tenancy.ts › protocolBuilder.resolveProtocolSession › TenantScope.open`]:
    {
      count: 1,
      why: 'probing each membership’s team for the protocol and its draft, read-only',
    },
  [`${SERVER}/src/protocol-builder/host.ts › protocolBuilder.authorizeCaller › TenantScope.open`]:
    {
      count: 1,
      why: 'rereading the caller’s role and grants for work held in memory, read-only',
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
  [`${SERVER}/src/protocol-builder/handlers.ts › TenantScope.open`]: {
    count: 2,
    why: 'the event backlog a watch replays, and a resource inspection with its committed asset key, read-only',
  },
  [`${SERVER}/src/protocol-builder/handlers.ts › protocolBuilder.Submit › TenantScope.open`]:
    {
      count: 1,
      why: 'the write receipt that answers a retried submit, read-only',
    },
  [`${SERVER}/src/protocol-builder/handlers.ts › protocolBuilder.Create › TenantScope.open`]:
    {
      count: 1,
      why: 'the write receipt that answers a retried create, read-only',
    },
  [`${SERVER}/scripts/apply-schema.ts › OwnerScope.open`]: {
    count: 1,
    why: 'the development schema script issuing the bootstrap token as the owner',
  },
  [`${SERVER}/scripts/seed/seed.ts › db.seed › OwnerScope.open`]: {
    count: 1,
    why: 'the development seed, populating fixtures as the owner',
  },
  [`${SERVER}/scripts/e2e-participant-links.ts › program › OwnerScope.open`]: {
    count: 1,
    why: 'the stack e2e fixture, publishing the lean protocol and creating participant links as the owner',
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
        yield* db.transaction((tx) => body);
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
      { span: 'a', opener: 'transaction' },
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
