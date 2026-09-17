import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

import type { TeamAccess as TeamAccessToken } from '@codaco/studio-sync/tenant';

import { Forbidden, RateLimited } from '../schema/errors.ts';
import { type Principal } from './authenticated.ts';

// The tier gate, declared rather than called (#1927 §10, Josh's ruling on Q8).
//
// There are deliberately no `TeamScoped`/`StudyScoped` middlewares beside it:
// membership is the `TeamAccess` token's own guarantee, so an ordinary
// team-scoped procedure proves it by calling `openTeam` in the handler and
// letting the compiler refuse a tenant transaction opened without one. What a
// declared middleware buys here is the one thing the token cannot say — that a
// procedure is *admin-only* — so an admin-only procedure added later cannot be
// written without its gate.

/**
 * The proof that a procedure's caller may act in the team its payload names,
 * as the service a gated handler reads it from.
 *
 * The service's value is the branded token `@codaco/studio-sync/tenant`
 * declares, imported as a type and nothing else. That brand is what
 * `TenantScope.open` takes instead of a bare team id, so a handler that reads
 * this tag can open its tenant transaction directly and one that does not
 * cannot open one at all. Declaring a second, contract-owned shape here would
 * mean re-minting the token in the server, which is exactly the hole the brand
 * closes.
 *
 * The tag lives in the contract because a middleware's `provides` is part of
 * the middleware's declaration, and the declaration is what an rpc names.
 */
export class TeamAccess extends Context.Service<TeamAccess, TeamAccessToken>()(
  '@studio/TeamAccess',
) {}

/**
 * Membership plus the team Admin tier, resolved before the handler runs.
 *
 * `error` is `Forbidden | RateLimited` because the gate does both jobs the
 * handler-level `openTeam` does: it charges the caller's per-user window
 * before it touches the database and the team's window once membership is
 * proved, and either can be spent. A non-member, an unknown team and a member
 * below the tier are one `Forbidden`, so the gate is no more an existence
 * oracle than the handler call is. The command's locked re-read stays the
 * authoritative check; this is the pre-transaction refusal that keeps a
 * non-admin from taking the team audit lock at all.
 *
 * **Declare this BEFORE `Authenticated` on an rpc.** `RpcServer.applyMiddleware`
 * walks the middleware set in insertion order rebinding
 * `handler = middleware(handler)`, so the middleware added last is the
 * outermost and runs first — and this one needs the `Principal` that
 * `Authenticated` installs. Written the other way round, `Principal` survives
 * `Rpc.AddMiddleware`'s fold and lands in the handler layer's requirements,
 * where nothing can satisfy it; at runtime the request dies on
 * `Service not found: @studio/Principal`. Both halves are asserted in
 * `__tests__/ordering-probe.test.ts`, and the order this contract actually
 * declares is asserted in `__tests__/procedures.test.ts`.
 *
 * `requires: Principal` is what makes that ordering a compile-time fact rather
 * than a convention: `Rpc.AddMiddleware` folds
 * `ApplyServices` (`Exclude<R, Provides> | Requires`) over the `.middleware()`
 * calls in written order, so this one adds `Principal` and `Authenticated`
 * then subtracts it again — and only in that order.
 *
 * `requiredForClient` stays at its default of false, as it is for
 * `Authenticated`: the gate is entirely server-side and there is nothing for a
 * client-side wrapper to attach.
 */
export class TeamAdministration extends RpcMiddleware.Service<
  TeamAdministration,
  { provides: TeamAccess; requires: Principal }
>()('@studio/TeamAdministration', {
  error: Schema.Union([Forbidden, RateLimited]),
}) {}
