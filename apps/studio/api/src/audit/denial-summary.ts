import { randomUUID } from 'node:crypto';

import { Effect, Redacted } from 'effect';
import type { SqlError } from 'effect/sql';

import type { NotFound } from '@codaco/studio-contract/schema/errors';

import type { MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import { maintenanceTeamAccess } from '../jobs/team-access.ts';
import type { DeniedAuditSummary } from './denial-rate-limit.ts';
import type { DeniedAuditOperation } from './events.ts';
import { append, lockedTeamLabel, lockTeam } from './store.ts';

export type DeniedAuditActor = {
  readonly userId: string;
  readonly name: Redacted.Redacted;
  readonly email: Redacted.Redacted;
};

export type DeniedAuditSummaryWrite = {
  readonly teamId: string;
  readonly operation: DeniedAuditOperation;
  readonly actor: DeniedAuditActor;
  readonly summary: DeniedAuditSummary;
};

export const appendDeniedAuditSummary: (
  write: DeniedAuditSummaryWrite,
) => Effect.Effect<void, NotFound | SqlError.SqlError, MaintenanceDatabase> =
  Effect.fn('audit.appendDeniedAuditSummary')(function* (
    write: DeniedAuditSummaryWrite,
  ) {
    yield* MaintenanceScope.openTenant(
      maintenanceTeamAccess(write.teamId),
      Effect.gen(function* () {
        yield* lockTeam(write.teamId);
        const teamLabel = yield* lockedTeamLabel(write.teamId);
        yield* append({
          teamId: write.teamId,
          teamLabel,
          eventVersion: 1,
          eventType: 'security.denied_attempts.rate_limited',
          category: 'security',
          outcome: 'denied',
          actorKind: 'user',
          actorId: write.actor.userId,
          actorLabel: Redacted.make(
            (
              Redacted.value(write.actor.name).trim() ||
              Redacted.value(write.actor.email)
            ).slice(0, 320),
          ),
          subjectType: null,
          subjectId: null,
          subjectLabel: null,
          resourceType: null,
          resourceId: null,
          resourceLabel: null,
          requestId: randomUUID(),
          details: {
            operation: write.operation,
            suppressedCount: write.summary.suppressedCount,
            firstSuppressedAt: new Date(
              write.summary.firstSuppressedAt,
            ).toISOString(),
            lastSuppressedAt: new Date(
              write.summary.lastSuppressedAt,
            ).toISOString(),
          },
        });
      }),
    );
  });
