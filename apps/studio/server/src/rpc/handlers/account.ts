import { Effect, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { AccountRpcs } from '@codaco/studio-contract/rpc/account';
import { Me } from '@codaco/studio-contract/schema/account';
import { NotFound } from '@codaco/studio-contract/schema/errors';

import { updateUserLocale } from '../../account/commands.ts';
import { chargeLimit, requirePool } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';

// The account tier: personal, not team-scoped, so no tenant is opened and only
// the caller's own budget is charged.

/**
 * The membership list as the contract spells it — the same rows the auth
 * service returns, with `teamId` branded by decoding through the procedure's
 * own field schema rather than asserted.
 */
const decodeTeams = Schema.decodeUnknownSync(Me.fields.teams);

export const AccountHandlers = (deps: RpcDeps) =>
  AccountRpcs.toLayer({
    'me': () =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        yield* chargeLimit(deps.limiter, 'rpc_user', principal.userId);
        return {
          userId: principal.userId,
          email: principal.email,
          emailVerified: principal.emailVerified,
          name: principal.name,
          // Already on the principal: the session lookup reads the user row,
          // so the stored preference costs `me` no query of its own.
          locale: principal.locale,
          // The same read `studies.get` resolves a tenant over, and the same
          // index serves it. Better Auth's own team list drops the role, so
          // this is the only thing that can tell a researcher what they are in
          // each of their teams.
          teams: decodeTeams(
            yield* Effect.promise(() =>
              deps.auth.listMemberships(principal.userId),
            ),
          ),
        };
      }),
    'account.updateLocale': (payload) =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        yield* chargeLimit(deps.limiter, 'rpc_user', principal.userId);
        const pool = yield* requirePool(deps);
        // Deliberately not an audited command (localization design §5.2,
        // decision 7): the audit log is study/team-scoped by design, and a
        // personal presentation preference has no tenant — so this writes
        // through the plain pool, like team.acceptInvitation.
        const updated = yield* Effect.promise(() =>
          updateUserLocale(pool, {
            userId: principal.userId,
            locale: payload.locale,
          }),
        );
        // A session can outlive its user row only by a hard-delete race; there
        // is nothing left to store a preference on.
        if (!updated) return yield* new NotFound({});
        return updated;
      }),
  });
