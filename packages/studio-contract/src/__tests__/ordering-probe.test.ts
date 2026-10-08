/**
 * `Authenticated` must be the LAST `.middleware()` call. The opposite order
 * fails at runtime and at the type level, the single `@ts-expect-error` here.
 */

import { it } from '@effect/vitest';
import { Effect, Exit, Layer, Redacted, Schema } from 'effect';
import { Rpc, RpcGroup, RpcMiddleware, RpcTest } from 'effect/rpc';
import { describe, expect } from 'vitest';

import { AuditActor } from '../middleware/auditActor.ts';
import { Authenticated, Principal } from '../middleware/authenticated.ts';
import { Forbidden } from '../schema/errors.ts';
import { UserId } from '../schema/ids.ts';

class TeamAdministration extends RpcMiddleware.Service<
  TeamAdministration,
  { requires: Principal }
>()('probe/TeamAdministration', { error: Forbidden }) {}

const PROBE_PRINCIPAL = Principal.of({
  kind: 'user',
  userId: UserId.make('probe-user'),
  email: Redacted.make('probe@example.org'),
  emailVerified: true,
  name: Redacted.make('Probe Researcher'),
  locale: null,
  sessionId: 'probe-session',
});

const AuthenticatedLayer = Layer.succeed(Authenticated, (effect) =>
  effect.pipe(
    Effect.provideService(Principal, PROBE_PRINCIPAL),
    Effect.provideService(
      AuditActor,
      AuditActor.of({
        kind: 'user',
        id: 'probe-user',
        label: Redacted.make('Probe Researcher'),
      }),
    ),
  ),
);

const teamAdministrationLayer = (seen: Array<Principal['Service']>) =>
  Layer.succeed(TeamAdministration, (effect) =>
    Effect.gen(function* () {
      seen.push(yield* Principal);
      return yield* effect;
    }),
  );

const AdminFirstGroup = RpcGroup.make(
  Rpc.make('adminFirst', { success: Schema.String })
    .middleware(TeamAdministration)
    .middleware(Authenticated),
);

const AdminLastGroup = RpcGroup.make(
  Rpc.make('adminLast', { success: Schema.String })
    .middleware(Authenticated)
    .middleware(TeamAdministration),
);

const seenByAdminFirst: Array<Principal['Service']> = [];
const seenByAdminLast: Array<Principal['Service']> = [];

const AdminFirstHandlers = AdminFirstGroup.toLayer({
  adminFirst: () => Effect.succeed('ok'),
});

const AdminLastHandlers = AdminLastGroup.toLayer({
  adminLast: () => Effect.succeed('ok'),
});

const withoutRequirements = <ROut, E>(
  layer: Layer.Layer<ROut, E>,
): Layer.Layer<ROut, E> => layer;

const AdminFirstLayer = withoutRequirements(
  Layer.mergeAll(
    AdminFirstHandlers,
    AuthenticatedLayer,
    teamAdministrationLayer(seenByAdminFirst),
  ),
);

const adminLastLayer = Layer.mergeAll(
  AdminLastHandlers,
  AuthenticatedLayer,
  teamAdministrationLayer(seenByAdminLast),
);

// @ts-expect-error -- Principal is an unmet requirement of the adminLast handler layer
const AdminLastLayer = withoutRequirements(adminLastLayer);

describe('declared middleware ordering (design §20 Q8)', () => {
  it.effect(
    'TeamAdministration added BEFORE Authenticated reads the principal Authenticated provides',
    () =>
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(AdminFirstGroup);
        const exit = yield* Effect.exit(client.adminFirst());

        expect(exit).toStrictEqual(Exit.succeed('ok'));
        expect(seenByAdminFirst).toStrictEqual([PROBE_PRINCIPAL]);
      }).pipe(Effect.provide(AdminFirstLayer)),
  );

  it.effect(
    'TeamAdministration added AFTER Authenticated runs outside it and cannot read the principal',
    () =>
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(AdminLastGroup);
        const exit = yield* Effect.exit(client.adminLast());

        expect(exit).toStrictEqual(
          Exit.die(new Error('Service not found: @studio/Principal')),
        );
        expect(seenByAdminLast).toStrictEqual([]);
      }).pipe(Effect.provide(AdminLastLayer)),
  );
});
