import { implement, ORPCError } from '@orpc/server';
import type pg from 'pg';

import { contract } from '@codaco/studio-rpc';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import { AuditCommandTeamNotFoundError } from './audit/command.ts';
import type { AuthService, Principal } from './auth/service.ts';
import { type AuthCapabilities, getInstanceStatus } from './domain.ts';
import {
  addAuditedInformationStage,
  commitAuditedProtocolSection,
  createAuditedProtocol,
  moveAuditedProtocolStage,
  ProtocolCommandAuthorizationError,
} from './protocol/commands.ts';
import { ProtocolStore } from './protocol/store.ts';
import { createProtocolSyncServer } from './protocol/sync.ts';
import {
  cancelTeamInvitation,
  createTeamInvitation,
  TeamCommandError,
  updateTeamMemberRole,
} from './team/commands.ts';

// The SPA's internal surface: unpublished and free-moving within the
// deploy-compatibility rules on #1245 — its only client is the Studio SPA.

export type RpcContext = {
  principal: Principal | null;
  requestId: string;
};

const os = implement(contract).$context<RpcContext>();

const requireUser = os.middleware(({ context, next }) => {
  const { principal, requestId } = context;
  if (!principal) throw new ORPCError('UNAUTHORIZED');
  return next({ context: { principal, requestId } });
});

async function handleTeamCommand<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AuditCommandTeamNotFoundError) {
      throw new ORPCError('NOT_FOUND');
    }
    if (!(error instanceof TeamCommandError)) throw error;
    if (error.code === 'FORBIDDEN') throw new ORPCError('FORBIDDEN');
    if (error.code === 'NOT_FOUND') throw new ORPCError('NOT_FOUND');
    if (error.code === 'CONFLICT') throw new ORPCError('CONFLICT');
    throw new ORPCError('BAD_REQUEST');
  }
}

async function handleAuditedProtocolCommand<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ProtocolCommandAuthorizationError) {
      throw new ORPCError('FORBIDDEN');
    }
    if (error instanceof AuditCommandTeamNotFoundError) {
      throw new ORPCError('NOT_FOUND');
    }
    throw error;
  }
}

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
          requestId: context.requestId,
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
    team: {
      updateMemberRole: os.team.updateMemberRole
        .use(requireTeam)
        .handler(({ context, input }) =>
          handleTeamCommand(() =>
            updateTeamMemberRole(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              { memberId: input.memberId, role: input.role },
            ),
          ),
        ),
      createInvitation: os.team.createInvitation
        .use(requireTeam)
        .handler(({ context, input }) =>
          handleTeamCommand(() =>
            createTeamInvitation(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              { email: input.email, role: input.role },
            ),
          ),
        ),
      cancelInvitation: os.team.cancelInvitation
        .use(requireTeam)
        .handler(({ context, input }) =>
          handleTeamCommand(() =>
            cancelTeamInvitation(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              { invitationId: input.invitationId },
            ),
          ),
        ),
    },
    protocols: {
      create: os.protocols.create
        .use(requireTeam)
        .handler(({ context, input }) =>
          handleAuditedProtocolCommand(() =>
            createAuditedProtocol(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              input,
            ),
          ),
        ),
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

          let resume: Awaited<ReturnType<typeof syncServer.resume>>;
          try {
            resume = await syncServer.resume(input.draftId, owner);
          } catch (error) {
            // Acquisition and resume are separate transactions. If the
            // sequence lookup fails after the lease commits, expire the exact
            // epoch so a client that never received it cannot block editors.
            await syncServer
              .release(input.draftId, input.sectionId, owner, lease.epoch)
              .catch(() => undefined);
            throw error;
          }
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
        .handler(({ context, input }) =>
          handleAuditedProtocolCommand(() =>
            commitAuditedProtocolSection(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              input,
            ),
          ),
        ),
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
        .handler(({ context, input }) =>
          handleAuditedProtocolCommand(() =>
            addAuditedInformationStage(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              input,
            ),
          ),
        ),
      moveStage: os.protocols.moveStage
        .use(requireTeam)
        .handler(({ context, input }) =>
          handleAuditedProtocolCommand(() =>
            moveAuditedProtocolStage(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              input,
            ),
          ),
        ),
    },
  };
}
