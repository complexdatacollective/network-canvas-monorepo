import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

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
import { noAuditTransaction } from '../../audit/no-audit.ts';
import {
  renderAuditEventDetail,
  renderAuditEventSummary,
} from '../../audit/render.ts';
import { clampAuditListLimit, facets, get, list } from '../../audit/store.ts';
import { assertAuditReadAuthorized, guardAuditRead } from '../audit-read.ts';
import { withRequestId } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam } from '../team-scope.ts';

const decodeList = Schema.decodeUnknownSync(Schema.toType(AuditListOutput));
const decodeDetail = Schema.decodeUnknownSync(Schema.toType(AuditEventDetail));
const decodeFilterOptions = Schema.decodeUnknownSync(
  Schema.toType(AuditFilterOptions),
);

const refusals = <A, R>(
  read: Effect.Effect<A, AuditReadDenied | NotFound | SqlError.SqlError, R>,
): Effect.Effect<A, Forbidden, R> =>
  read.pipe(
    Effect.catch((error): Effect.Effect<never, Forbidden> =>
      error instanceof AuditReadDenied ? new Forbidden({}) : Effect.die(error),
    ),
  );

export const AuditHandlers = (deps: RpcDeps) =>
  AuditRpcs.toLayer({
    'audit.list': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        const events = yield* withRequestId(
          guardAuditRead(
            access,
            'audit.list',
            noAuditTransaction(
              'audit.list',
              access,
              Effect.gen(function* () {
                yield* assertAuditReadAuthorized(access);
                return yield* list(payload.teamId, {
                  beforeSequence: payload.cursor,
                  limit: payload.limit,
                  categories: payload.categories,
                  eventTypes: payload.eventTypes,
                  actor: payload.actor,
                  outcomes: payload.outcomes,
                  occurredFrom: payload.from,
                  occurredTo: payload.to,
                });
              }),
            ),
          ),
        ).pipe(refusals);
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
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        const event = yield* withRequestId(
          guardAuditRead(
            access,
            'audit.get',
            noAuditTransaction(
              'audit.get',
              access,
              Effect.gen(function* () {
                yield* assertAuditReadAuthorized(access);
                return yield* get(payload.teamId, payload.eventId);
              }),
            ),
          ),
        ).pipe(refusals);
        if (event === null) return yield* new NotFound({});
        return decodeDetail(renderAuditEventDetail(event));
      }),
    'audit.filterOptions': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        const options = yield* withRequestId(
          guardAuditRead(
            access,
            'audit.filterOptions',
            noAuditTransaction(
              'audit.filterOptions',
              access,
              Effect.gen(function* () {
                yield* assertAuditReadAuthorized(access);
                return yield* facets(payload.teamId, AUDIT_FACET_LIMIT);
              }),
            ),
          ),
        ).pipe(refusals);
        return decodeFilterOptions(renderAuditFilterOptions(options));
      }),
  });
