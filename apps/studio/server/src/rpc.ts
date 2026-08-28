import { implement, ORPCError } from '@orpc/server';
import type pg from 'pg';

import { contract } from '@codaco/studio-rpc';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import type { AuthService, Principal } from './auth/service.ts';
import { type AuthCapabilities, getInstanceStatus } from './domain.ts';
import { addStage, moveStage } from './protocol/draft-structure.ts';
import { emptyProtocol } from './protocol/sectionize.ts';
import { ProtocolStore } from './protocol/store.ts';
import { createProtocolSyncServer } from './protocol/sync.ts';

// The SPA's internal surface: unpublished and free-moving within the
// deploy-compatibility rules on #1245 — its only client is the Studio SPA.

export type RpcContext = {
  principal: Principal | null;
};

const os = implement(contract).$context<RpcContext>();

const requireUser = os.middleware(({ context, next }) => {
  const { principal } = context;
  if (!principal) throw new ORPCError('UNAUTHORIZED');
  return next({ context: { principal } });
});

export function createRpcRouter(
  caps: AuthCapabilities,
  deps: { auth: AuthService; pool?: pg.Pool },
) {
  const { auth, pool } = deps;
  // Tenancy is checked per request against an explicit teamId in the
  // procedure input — never the session's active team. A non-member and a
  // nonexistent team both read FORBIDDEN, so the check is not an existence
  // oracle; a router wired without a database is a deployment bug, not an
  // authorization refusal.
  const requireTeam = os.middleware(
    async ({ context, next }, input: { teamId: string }) => {
      const { principal } = context;
      if (!principal) throw new ORPCError('UNAUTHORIZED');
      if (!pool) throw new ORPCError('INTERNAL_SERVER_ERROR');
      const membership = await auth.getMembership(
        principal.userId,
        input.teamId,
      );
      if (!membership) throw new ORPCError('FORBIDDEN');
      return next({
        context: {
          principal,
          team: { id: input.teamId, role: membership.role },
          tenantDb: createTenantDb(pool, input.teamId),
        },
      });
    },
  );

  return {
    status: os.status.handler(() => getInstanceStatus(caps)),
    me: os.me.use(requireUser).handler(({ context }) => ({
      userId: context.principal.userId,
      email: context.principal.email,
      emailVerified: context.principal.emailVerified,
      name: context.principal.name,
    })),
    protocols: {
      create: os.protocols.create
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          const store = new ProtocolStore(context.tenantDb);
          return store.createProtocol({ protocol: emptyProtocol(input.name) });
        }),
      list: os.protocols.list
        .use(requireTeam)
        .handler(({ context }) =>
          new ProtocolStore(context.tenantDb).listProtocols(),
        ),
      draft: os.protocols.draft
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          const { protocol, draft } = await new ProtocolStore(
            context.tenantDb,
          ).getProtocolDraft(input.protocolId, input.draftId);
          return {
            protocol,
            revision: {
              sequence: String(draft.headSeq),
              hash: draft.headManifestHash,
            },
            sections: draft.sections,
          };
        }),
      acquireSection: os.protocols.acquireSection
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          await new ProtocolStore(context.tenantDb).getProtocolDraftMetadata(
            input.protocolId,
            input.draftId,
          );
          const syncServer = createProtocolSyncServer(context.tenantDb);
          const owner = `${context.principal.userId}:${input.clientId}`;
          const lease = await syncServer.acquire(
            input.draftId,
            input.sectionId,
            owner,
          );
          if (!lease) return { mode: 'readOnly' as const };

          const resume = await syncServer.resume(input.draftId, owner);
          const lastApplied = resume.lastApplied[input.sectionId];
          const nextClientSequence =
            lastApplied?.epoch === lease.epoch
              ? lastApplied.clientSeq + 1n
              : 1n;
          return {
            mode: 'editable' as const,
            leaseEpoch: String(lease.epoch),
            nextClientSequence: String(nextClientSequence),
          };
        }),
      commitSection: os.protocols.commitSection
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          await new ProtocolStore(context.tenantDb).getProtocolDraftMetadata(
            input.protocolId,
            input.draftId,
          );
          const result = await createProtocolSyncServer(
            context.tenantDb,
          ).commit({
            draftId: input.draftId,
            sectionId: input.sectionId,
            owner: `${context.principal.userId}:${input.clientId}`,
            epoch: BigInt(input.leaseEpoch),
            clientSeq: BigInt(input.clientSequence),
            commands: input.commands,
          });
          return {
            sequence: String(result.manifestSeq),
            hash: result.manifestHash,
          };
        }),
      renewSection: os.protocols.renewSection
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          await new ProtocolStore(context.tenantDb).getProtocolDraftMetadata(
            input.protocolId,
            input.draftId,
          );
          return {
            renewed: Boolean(
              await createProtocolSyncServer(context.tenantDb).renew(
                input.draftId,
                input.sectionId,
                `${context.principal.userId}:${input.clientId}`,
                BigInt(input.leaseEpoch),
              ),
            ),
          };
        }),
      releaseSection: os.protocols.releaseSection
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          await new ProtocolStore(context.tenantDb).getProtocolDraftMetadata(
            input.protocolId,
            input.draftId,
          );
          await createProtocolSyncServer(context.tenantDb).release(
            input.draftId,
            input.sectionId,
            `${context.principal.userId}:${input.clientId}`,
            BigInt(input.leaseEpoch),
          );
        }),
      addInformationStage: os.protocols.addInformationStage
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          await new ProtocolStore(context.tenantDb).getProtocolDraftMetadata(
            input.protocolId,
            input.draftId,
          );
          const result = await addStage(context.tenantDb, {
            draftId: input.draftId,
            stage: {
              id: input.stageId,
              type: 'Information',
              label: 'Untitled screen',
              title: 'Untitled screen',
              items: [],
            },
          });
          return {
            sequence: String(result.manifestSeq),
            hash: result.manifestHash,
          };
        }),
      moveStage: os.protocols.moveStage
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          await new ProtocolStore(context.tenantDb).getProtocolDraftMetadata(
            input.protocolId,
            input.draftId,
          );
          const result = await moveStage(context.tenantDb, input);
          return {
            sequence: String(result.manifestSeq),
            hash: result.manifestHash,
          };
        }),
    },
  };
}
