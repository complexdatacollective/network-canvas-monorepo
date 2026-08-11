import { implement, ORPCError } from '@orpc/server';

import { contract } from '@codaco/studio-rpc';

import type { Principal } from './auth/index.ts';
import { type AuthCapabilities, getInstanceStatus } from './domain.ts';

// The SPA's internal surface: the server-side implementation of the
// @codaco/studio-rpc contract, mounted at /rpc (src/app.ts). Unpublished and
// free-moving within the deploy-compatibility rules on #1245 — its only
// client is the Studio SPA. Handlers are thin adapters over the domain layer
// (src/domain.ts). The context carries the resolved principal (#1248); the
// principal middleware in src/auth/principal.ts is the only writer.

export type RpcContext = {
  principal: Principal | null;
};

const os = implement(contract).$context<RpcContext>();

const requireUser = os.middleware(({ context, next }) => {
  const { principal } = context;
  if (!principal) throw new ORPCError('UNAUTHORIZED');
  return next({ context: { principal } });
});

export function createRpcRouter(auth: AuthCapabilities) {
  return {
    status: os.status.handler(() => getInstanceStatus(auth)),
    me: os.me.use(requireUser).handler(({ context }) => ({
      userId: context.principal.userId,
      email: context.principal.email,
      emailVerified: context.principal.emailVerified,
      name: context.principal.name,
    })),
  };
}
