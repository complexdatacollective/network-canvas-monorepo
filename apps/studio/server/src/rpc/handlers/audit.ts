import { Effect, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { AuditRpcs } from '@codaco/studio-contract/rpc/audit';
import {
  AUDIT_FACET_LIMIT,
  AuditEventDetail,
  AuditFilterOptions,
  AuditListOutput,
  AuditReadDenied,
} from '@codaco/studio-contract/schema/audit';
import { Forbidden, NotFound } from '@codaco/studio-contract/schema/errors';

import { renderAuditFilterOptions } from '../../audit/facets.ts';
import {
  renderAuditEventDetail,
  renderAuditEventSummary,
} from '../../audit/render.ts';
import { AuditStore, clampAuditListLimit } from '../../audit/store.ts';
import { runNoAuditTenantTransaction } from '../../audit/transaction.ts';
import { assertAuditReadAuthorized, guardAuditRead } from '../audit-read.ts';
import { runCommand } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam } from '../team-scope.ts';

// The team's immutable activity record. Every audit denial is `Forbidden` and
// nothing else, including the denial-rate-limit refusal: telling a caller which
// refusals were recorded would make the audit log's own suppression observable
// from outside.

const auditStore = new AuditStore();

const auditRefusal = (cause: unknown): Effect.Effect<never, Forbidden> =>
  cause instanceof AuditReadDenied ? new Forbidden({}) : Effect.die(cause);

const decodeList = Schema.decodeUnknownSync(AuditListOutput);
const decodeDetail = Schema.decodeUnknownSync(AuditEventDetail);
const decodeFilterOptions = Schema.decodeUnknownSync(AuditFilterOptions);

export const AuditHandlers = (deps: RpcDeps) =>
  AuditRpcs.toLayer({
    'audit.list': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        const events = yield* runCommand(
          () =>
            guardAuditRead(scope, 'audit.list', () =>
              runNoAuditTenantTransaction(
                scope.tenantDb,
                'audit.list',
                async (client) => {
                  await assertAuditReadAuthorized(client, scope);
                  return auditStore.listForTeam(client, payload.teamId, {
                    beforeSequence: payload.cursor,
                    limit: payload.limit,
                    categories: payload.categories,
                    eventTypes: payload.eventTypes,
                    actor: payload.actor,
                    outcomes: payload.outcomes,
                    occurredFrom: payload.from,
                    occurredTo: payload.to,
                  });
                },
              ),
            ),
          auditRefusal,
        );
        const last = events.at(-1);
        return decodeList({
          items: events.map(renderAuditEventSummary),
          nextCursor:
            last && events.length === clampAuditListLimit(payload.limit)
              ? last.sequence
              : null,
        });
      }),
    'audit.get': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        const event = yield* runCommand(
          () =>
            guardAuditRead(scope, 'audit.get', () =>
              runNoAuditTenantTransaction(
                scope.tenantDb,
                'audit.get',
                async (client) => {
                  await assertAuditReadAuthorized(client, scope);
                  return auditStore.getForTeam(
                    client,
                    payload.teamId,
                    payload.eventId,
                  );
                },
              ),
            ),
          auditRefusal,
        );
        if (!event) return yield* new NotFound({});
        return decodeDetail(renderAuditEventDetail(event));
      }),
    // The same rows as audit.list through the same read surface, so it takes
    // the same locked-membership authorization inside the read's own
    // transaction, and the same committed, rate-limited denial.
    'audit.filterOptions': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        const facets = yield* runCommand(
          () =>
            guardAuditRead(scope, 'audit.filterOptions', () =>
              runNoAuditTenantTransaction(
                scope.tenantDb,
                'audit.filterOptions',
                async (client) => {
                  await assertAuditReadAuthorized(client, scope);
                  return auditStore.facetsForTeam(
                    client,
                    payload.teamId,
                    AUDIT_FACET_LIMIT,
                  );
                },
              ),
            ),
          auditRefusal,
        );
        return decodeFilterOptions(renderAuditFilterOptions(facets));
      }),
  });
