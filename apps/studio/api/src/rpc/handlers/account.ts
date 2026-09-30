import { Effect, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { AccountRpcs } from '@codaco/studio-contract/rpc/account';
import { Me } from '@codaco/studio-contract/schema/account';
import { NotFound } from '@codaco/studio-contract/schema/errors';

import { updateUserLocale } from '../../account/commands.ts';
import { AuthService } from '../../auth/service.ts';
import { UntenantedScope } from '../../db/tenant.ts';
import { requirePool } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';

// The account tier: personal, not team-scoped, so no tenant is opened and only
// the caller's own budget is charged — by `Authenticated`, before either
// handler runs.

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
        const auth = yield* AuthService;
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
          teams: decodeTeams(yield* auth.listMemberships(principal.userId)),
        };
      }),
    'account.updateLocale': (payload) =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        // A plane wired without a database refuses here, in the same place it
        // always did, rather than reaching a client that has nothing behind it.
        yield* requirePool(deps);
        // Deliberately not an audited command (localization design §5.2,
        // decision 7): the audit log is study/team-scoped by design, and a
        // personal presentation preference has no tenant — so this opens an
        // untenanted transaction rather than a tenant one, and stamps no team.
        const updated = yield* Effect.orDie(
          UntenantedScope.open(
            updateUserLocale({
              userId: principal.userId,
              locale: payload.locale,
            }),
          ),
        );
        // A session can outlive its user row only by a hard-delete race; there
        // is nothing left to store a preference on.
        if (updated === null) return yield* new NotFound({});
        return updated;
      }),
  });
