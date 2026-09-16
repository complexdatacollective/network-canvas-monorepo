/**
 * Design §20 Q8: can a declared rpc middleware read the `Principal` that
 * `Authenticated` provides?
 *
 * Yes, but only in one `.middleware()` order, and it is the order that reads
 * backwards. `RpcServer.applyMiddleware` walks an rpc's middleware set in
 * insertion order and rebinds `handler = middleware(handler)` at each step, so
 * the middleware added FIRST ends up innermost and the middleware added LAST
 * ends up outermost. The outermost wrapper runs first, and the context it
 * installs reaches everything inside it, so `Authenticated` -- the middleware
 * that provides the principal -- must be the LAST `.middleware()` call:
 *
 *     Rpc.make('adminFirst', ...)
 *       .middleware(TeamAdministration) // innermost: reads Principal
 *       .middleware(Authenticated)      // outermost: provides Principal
 *
 * Written that way `TeamAdministration` sees the principal `Authenticated`
 * resolved, and the procedure succeeds. The types agree: `Rpc.AddMiddleware`
 * folds `RpcMiddleware.ApplyServices` (`Exclude<R, Provides> | Requires`) over
 * the calls in written order, so `TeamAdministration` adds `Principal` to the
 * rpc's requirements and `Authenticated` then subtracts it again, leaving the
 * handler layer needing nothing.
 *
 * The opposite order, `.middleware(Authenticated).middleware(TeamAdministration)`,
 * is wrong in both channels, and both failures are asserted below. At the type
 * level `Principal` survives the fold and lands in the handler layer's
 * requirements, where nothing can satisfy it: a principal exists per request,
 * and the handler layer is built once at startup. That is the single
 * `@ts-expect-error` in this file. At runtime `TeamAdministration` is the outer
 * wrapper, so its `yield* Principal` runs before `Authenticated` has provided
 * anything, and the request dies with the defect
 * `Error: Service not found: @studio/Principal` -- a defect rather than the
 * declared `Forbidden` failure, so the client gets nothing it can act on.
 *
 * The fallback of having the second middleware resolve the principal itself is
 * therefore unnecessary. Ordered reads work, as long as every middleware that
 * consumes the principal is declared BEFORE `Authenticated` in the chain.
 */

import { it } from '@effect/vitest';
import { Effect, Exit, Layer, Schema } from 'effect';
import { Rpc, RpcGroup, RpcMiddleware, RpcTest } from 'effect/unstable/rpc';
import { describe, expect } from 'vitest';

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
  email: 'probe@example.org',
  emailVerified: true,
  name: 'Probe Researcher',
  locale: null,
  sessionId: 'probe-session',
});

const AuthenticatedLayer = Layer.succeed(Authenticated, (effect) =>
  Effect.provideService(effect, Principal, PROBE_PRINCIPAL),
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

/**
 * Identity at runtime. Its parameter type is the assertion: a layer that still
 * has an unmet requirement cannot be passed to it.
 */
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

// `Principal` is still an unmet requirement of the adminLast handler layer.
// `Rpc.AddMiddleware` folds `RpcMiddleware.ApplyServices` (`Exclude<R, Provides>
// | Requires`) over the `.middleware()` calls in the order they are written, so
// `.middleware(Authenticated).middleware(TeamAdministration)` first discharges
// nothing and then ADDS `Principal`, leaving it for whoever builds the handler
// layer to supply — which no server can do, because a principal exists only per
// request. The other order subtracts it again and lands on `never`.
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
