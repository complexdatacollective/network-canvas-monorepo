import { randomUUID } from 'node:crypto';

import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { NotFound } from '@codaco/studio-contract/schema/errors';

import type { MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import { maintenanceTeamAccess } from '../jobs/team-access.ts';
import type { DeniedAuditSummary } from './denial-rate-limit.ts';
import type { DeniedAuditOperation } from './events.ts';
import { append, lockedTeamLabel, lockTeam } from './store.ts';

// One suppressed denial window, as the single event that records it (#1909).
//
// It is not an `audited` command and cannot be: `audited` opens a
// `TenantScope` on the **application** client and stamps the actor from the
// request's `Principal`, and this write has neither. A summary is by
// construction a write into a team nobody is signed in to, on the worker,
// which is why it runs as the maintenance role — and `audit_events` has no
// maintenance escape in its policy, so the transaction still stamps the team.
//
// What it does share with `audited`, and must: the team advisory lock, the
// team label read under `FOR UPDATE`, and `append`. Those are `audit/store.ts`
// exports rather than copies, so a summary row is labelled and sequenced
// exactly as every other event in the same log.
//
// This replaces the `DeniedAuditSummaryWriter` tag and its node-postgres
// layer. That seam existed to carry the worker's maintenance **pool** across
// the Effect boundary, and its own documentation named the hazard: the write
// went through that pool while the handler's `summaryAlreadyWritten` read went
// through the queue's `Database`, so two clients pointed at different
// databases, roles or search paths would make every already-written summary
// read as missing — and a second copy of an immutable audit event is
// permanent. There is one client now, so the hazard is gone rather than
// documented.

/**
 * Who a summary is about: the three fields its event is stamped from. Its own
 * type rather than the auth provider's principal, because this module runs in
 * the worker, which reaches no auth module at all (`process-separation`).
 */
export type DeniedAuditActor = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
};

export type DeniedAuditSummaryWrite = {
  readonly teamId: string;
  readonly operation: DeniedAuditOperation;
  /**
   * The actor the suppressed attempts belonged to, read from the user row by
   * the handler: the event carries the actor's label, and a name and an email
   * address are exactly what the limiter's keys are hashed to keep out of the
   * rate-limit store.
   */
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
          actorLabel: (write.actor.name.trim() || write.actor.email).slice(
            0,
            320,
          ),
          subjectType: null,
          subjectId: null,
          subjectLabel: null,
          resourceType: null,
          resourceId: null,
          resourceLabel: null,
          // No request produced this row — it summarises attempts made in
          // sessions that ended before the window did — so the id is minted
          // here. The column is not nullable, and a shared sentinel would make
          // every summary in the log look like one request.
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
