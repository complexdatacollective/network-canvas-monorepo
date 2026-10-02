import { Effect, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { AccountRpcs } from '@codaco/studio-contract/rpc/account';
import { Me } from '@codaco/studio-contract/schema/account';
import { NotFound } from '@codaco/studio-contract/schema/errors';

import { updateUserLocale } from '../../account/commands.ts';
import { AuthService } from '../../auth/service.ts';
import { UntenantedScope } from '../../db/tenant.ts';
import { requireDatabase } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';

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
          locale: principal.locale,
          // Better Auth's own team list drops the role.
          teams: decodeTeams(yield* auth.listMemberships(principal.userId)),
        };
      }),
    'account.updateLocale': (payload) =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        yield* requireDatabase(deps);
        // Deliberately not an audited command: a personal preference has no
        // tenant, so this opens an untenanted transaction.
        const updated = yield* Effect.orDie(
          UntenantedScope.open(
            updateUserLocale({
              userId: principal.userId,
              locale: payload.locale,
            }),
          ),
        );
        if (updated === null) return yield* new NotFound({});
        return updated;
      }),
  });
