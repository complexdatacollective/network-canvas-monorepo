import { implement, ORPCError } from '@orpc/server';
import type pg from 'pg';

import { AUDIT_FACET_LIMIT, contract } from '@codaco/studio-rpc';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import { updateUserLocale } from './account/commands.ts';
import {
  appendAuditedEvent,
  auditActorEventContext,
  AuditCommandTeamNotFoundError,
  type AuditedCommandContext,
} from './audit/command.ts';
import {
  type DeniedAuditReservation,
  reserveDeniedAuditAttempt,
} from './audit/denial-rate-limit.ts';
import { createDeniedAuditSummaryWriter } from './audit/denial-summary.ts';
import { renderAuditFilterOptions } from './audit/facets.ts';
import {
  authorizeAuditRead,
  grantsAuditRead,
} from './audit/read-authorization.ts';
import {
  renderAuditEventDetail,
  renderAuditEventSummary,
} from './audit/render.ts';
import { AuditStore, clampAuditListLimit } from './audit/store.ts';
import { runNoAuditTenantTransaction } from './audit/transaction.ts';
import type { AuthService, Principal } from './auth/service.ts';
import {
  type AuthCapabilities,
  type DeploymentStatus,
  getInstanceStatus,
} from './domain.ts';
import {
  correlateAuthorizedTeam,
  logOperational,
} from './observability/logger.ts';
import {
  addAuditedInformationStage,
  commitAuditedProtocolSection,
  createAuditedProtocol,
  moveAuditedProtocolStage,
  ProtocolCommandAuthorizationError,
} from './protocol/commands.ts';
import { ProtocolStore } from './protocol/store.ts';
import { createProtocolSyncServer } from './protocol/sync.ts';
import { createAuditedStudy, StudyCommandError } from './study/commands.ts';
import { readStudyCounts } from './study/counts.ts';
import { StudyStore } from './study/store.ts';
import { resolveStudy, seesEveryTeamStudy } from './study/tenancy.ts';
import {
  acceptTeamInvitation,
  cancelTeamInvitation,
  createTeamInvitation,
  TeamCommandError,
  updateTeamMemberRole,
} from './team/commands.ts';
import { roleGrantsTeamAdministration } from './team/roles.ts';

// The SPA's internal surface: unpublished and free-moving within the
// deploy-compatibility rules on #1245 — its only client is the Studio SPA.

export type RpcContext = {
  principal: Principal | null;
  requestId: string;
};

const os = implement(contract).$context<RpcContext>();

const auditStore = new AuditStore();

type TeamRpcContext = {
  principal: Principal;
  requestId: string;
  team: { id: string; role: string };
  tenantDb: TenantDb;
};

type AuditReadProcedure = 'audit.list' | 'audit.get' | 'audit.filterOptions';

/**
 * Thrown from inside the read transaction when the caller's locked membership
 * no longer grants audit.read, so the transaction rolls back before the denial
 * event is appended in its own transaction.
 */
class AuditReadDeniedError extends Error {
  constructor() {
    super('audit read actor no longer holds audit.read');
    this.name = 'AuditReadDeniedError';
  }
}

/** A reservation the denial rate limiter has already let through. */
type AdmittedDeniedAuditReservation = Extract<
  DeniedAuditReservation,
  { admitted: true }
>;

function auditedContextFor(context: TeamRpcContext): AuditedCommandContext {
  return {
    tenantDb: context.tenantDb,
    principal: context.principal,
    requestId: context.requestId,
  };
}

/**
 * Takes the denial slot for this caller, team, and operation. The reservation
 * is made before any transaction opens, which is the rate limiter's whole
 * point (audit/denial-rate-limit.ts): once a window's allowance is spent, a
 * further denial is refused without touching the database at all.
 */
async function admitAuditReadDenial(
  context: TeamRpcContext,
): Promise<AdmittedDeniedAuditReservation> {
  const reservation = await reserveDeniedAuditAttempt(
    {
      actorId: context.principal.userId,
      teamId: context.team.id,
      operation: 'audit.read',
    },
    createDeniedAuditSummaryWriter(auditedContextFor(context), 'audit.read'),
  );
  if (!reservation.admitted) {
    throw new ORPCError(
      reservation.reason === 'overloaded' ? 'TOO_MANY_REQUESTS' : 'FORBIDDEN',
    );
  }
  return reservation;
}

/**
 * The denial event is required, so every way the append can fail has to leave
 * an operational signal: acquiring a client, beginning the transaction,
 * locking the team, and reading the team row all sit before the insert, and
 * only the insert emits a signal of its own (STUDIO_AUDIT_APPEND_FAILED, in
 * audit/command.ts). Emitting around the whole path means the insert case is
 * reported twice — a duplicate signal is the intended cost of never losing a
 * required audit event silently.
 */
function warnAuditReadDenialLost(
  context: TeamRpcContext,
  _procedure: AuditReadProcedure,
  _error: unknown,
): void {
  logOperational('STUDIO_AUDIT_DENIAL_EVENT_LOST', {
    teamId: context.team.id,
    requestId: context.requestId,
  });
}

/**
 * A caller whose committed roles do not grant audit.read is denied with a
 * committed, rate-limited audit.read_denied event (design §7.3: audit-log
 * access is security-relevant); a failed denial append still denies.
 */
async function denyAuditRead(
  context: TeamRpcContext,
  procedure: AuditReadProcedure,
  reserved: AdmittedDeniedAuditReservation | null,
): Promise<never> {
  const reservation = reserved ?? (await admitAuditReadDenial(context));
  try {
    await appendAuditedEvent(auditedContextFor(context), (auditContext) => ({
      ...auditActorEventContext(auditContext),
      eventVersion: 1,
      eventType: 'audit.read_denied',
      category: 'audit',
      outcome: 'denied',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      details: { procedure, reason: 'insufficient_permission' },
    }));
    reservation.complete('denied');
  } catch (error) {
    warnAuditReadDenialLost(context, procedure, error);
    // Not 'denied': no denial event was committed, so this attempt must not
    // consume the window's allowance. The request stays denied either way.
    reservation.complete('other');
  }
  throw new ORPCError('FORBIDDEN');
}

/**
 * Wraps an audit read whose transaction re-authorizes the caller against the
 * committed role (see audit/read-authorization.ts). The transaction is opened
 * by the caller so its no-audit operation stays a static literal.
 *
 * requireTeam resolves the caller's membership before this runs, so the role
 * it carries is stale in both directions. A demotion committing in that window
 * must not be answered with audit data; a promotion committing in it must not
 * be answered with FORBIDDEN and an audit.read_denied event that the committed
 * roles do not support — an immutable log is the wrong place to record a
 * refusal that did not happen. So the middleware's role decides nothing here.
 * Every decision comes from the locked membership re-read inside the read's
 * own transaction, which for a caller without the permission throws before a
 * single row is selected.
 *
 * What the stale role still decides is ordering. When it predicts a denial the
 * rate-limit slot is taken first, before any transaction opens, so a burst of
 * denied reads cannot open one each: past the window's allowance a predicted
 * denial is refused without touching the database, which is what the old
 * pre-check was for. Nothing reaches this function unauthenticated or outside
 * the team — requireTeam has already refused both — so no caller can force a
 * transaction that could not already open one on the permitted path.
 */
async function guardAuditRead<T>(
  context: TeamRpcContext,
  procedure: AuditReadProcedure,
  read: () => Promise<T>,
): Promise<T> {
  const reservation = grantsAuditRead(context.team.role)
    ? null
    : await admitAuditReadDenial(context);
  try {
    const result = await read();
    // Reached with a reservation held only when the committed role turned out
    // to grant the read after all; that is not a denial, so it releases the
    // slot without spending the allowance.
    reservation?.complete('other');
    return result;
  } catch (error) {
    if (error instanceof AuditReadDeniedError) {
      return denyAuditRead(context, procedure, reservation);
    }
    reservation?.complete('other');
    throw error;
  }
}

/** Throws so the read transaction rolls back before any row is returned. */
async function assertAuditReadAuthorized(
  client: pg.PoolClient,
  context: TeamRpcContext,
): Promise<void> {
  const authorization = await authorizeAuditRead(client, {
    teamId: context.team.id,
    actorUserId: context.principal.userId,
  });
  if (authorization === 'permitted') return;
  if (authorization === 'not_a_member') throw new ORPCError('FORBIDDEN');
  throw new AuditReadDeniedError();
}

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
    if (error.code === 'OVERLOADED') {
      throw new ORPCError('TOO_MANY_REQUESTS');
    }
    if (error.code === 'FORBIDDEN') throw new ORPCError('FORBIDDEN');
    if (error.code === 'NOT_FOUND') throw new ORPCError('NOT_FOUND');
    if (error.code === 'CONFLICT') throw new ORPCError('CONFLICT');
    if (error.code === 'DELIVERY_IN_PROGRESS') {
      throw new ORPCError('CONFLICT');
    }
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

async function handleAuditedStudyCommand<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AuditCommandTeamNotFoundError) {
      throw new ORPCError('NOT_FOUND');
    }
    if (!(error instanceof StudyCommandError)) throw error;
    if (error.code === 'OVERLOADED') throw new ORPCError('TOO_MANY_REQUESTS');
    if (error.code === 'CONFLICT') throw new ORPCError('CONFLICT');
    throw new ORPCError('FORBIDDEN');
  }
}

export function createRpcRouter(
  caps: AuthCapabilities,
  deps: {
    auth: AuthService;
    deployment: DeploymentStatus;
    invitationDeliveryAvailable: boolean;
    pool?: pg.Pool;
  },
) {
  const { auth, deployment, invitationDeliveryAvailable, pool } = deps;
  // Tenancy is checked per request against an explicit teamId in the
  // procedure input — never the session's active team. A non-member and a
  // nonexistent team both read FORBIDDEN, so the check is not an existence
  // oracle; a router wired without a database is a deployment bug, not an
  // authorization refusal.
  //
  // Shared by the three team middlewares below rather than repeated in each,
  // so what "this caller, in this team" means is settled once.
  const openTeam = async (
    context: RpcContext,
    teamId: string,
  ): Promise<TeamRpcContext> => {
    const { principal } = context;
    if (!principal) throw new ORPCError('UNAUTHORIZED');
    if (!pool) throw new ORPCError('INTERNAL_SERVER_ERROR');
    const membership = await auth.getMembership(principal.userId, teamId);
    if (!membership) throw new ORPCError('FORBIDDEN');
    correlateAuthorizedTeam(teamId);
    return {
      principal,
      requestId: context.requestId,
      team: { id: teamId, role: membership.role },
      tenantDb: createTenantDb(pool, teamId),
    };
  };

  const requireTeam = os.middleware(
    async ({ context, next }, input: { teamId: string }) =>
      next({ context: await openTeam(context, input.teamId) }),
  );

  /**
   * Membership plus the team Admin tier: the rule #1257 gives study creation,
   * applied to creating a protocol line no study owns. The command re-reads it
   * from the locked membership row, because this answer is already stale by
   * the time the transaction opens.
   */
  const requireTeamAdministration = os.middleware(
    async ({ context, next }, input: { teamId: string }) => {
      const team = await openTeam(context, input.teamId);
      if (!roleGrantsTeamAdministration(team.team.role)) {
        throw new ORPCError('FORBIDDEN');
      }
      return next({ context: team });
    },
  );

  /**
   * Membership plus #1257's visibility rule, carried from the study tier to
   * every procedure addressed by a protocol line (`protocol/store.ts`). A
   * Member reaches a line only through a study they hold a grant on, so what
   * `studies.list` omits and `studies.get` refuses cannot be read — or
   * edited — through the protocol behind it.
   *
   * The refusal is `studies.get`'s: unreachable for any reason — absent,
   * another team's, or one this caller's role does not show them — is the same
   * FORBIDDEN, so this is not an existence oracle either. Which draft belongs
   * to which line stays each procedure's own check; this one is about the
   * line.
   */
  const requireProtocol = os.middleware(
    async (
      { context, next },
      input: { teamId: string; protocolId: string },
    ) => {
      const team = await openTeam(context, input.teamId);
      const reachable = await new ProtocolStore(
        team.tenantDb,
      ).isReachableByCaller(input.protocolId, {
        actorUserId: team.principal.userId,
        seesEveryStudy: seesEveryTeamStudy(team.team.role),
      });
      if (!reachable) throw new ORPCError('FORBIDDEN');
      return next({ context: team });
    },
  );

  // `requireStudy` (app-shell design §6.3). A study URL names no team, so the
  // tenant is derived from the caller's own memberships and the pinned
  // TenantDb comes back with the study the probe found — nothing about the
  // study is read outside it. Unreachable for any reason — absent, another
  // team's, or one this caller's team role does not show them — is the same
  // FORBIDDEN, so this is not an existence oracle.
  const requireStudy = os.middleware(
    async ({ context, next }, input: { studyId: string }) => {
      const { principal } = context;
      if (!principal) throw new ORPCError('UNAUTHORIZED');
      if (!pool) throw new ORPCError('INTERNAL_SERVER_ERROR');
      const resolved = await resolveStudy(pool, {
        studyId: input.studyId,
        actorUserId: principal.userId,
        memberships: await auth.listMemberships(principal.userId),
      });
      if (!resolved) throw new ORPCError('FORBIDDEN');
      correlateAuthorizedTeam(resolved.teamId);
      return next({
        context: {
          principal,
          requestId: context.requestId,
          team: { id: resolved.teamId, role: resolved.role },
          tenantDb: resolved.tenantDb,
          study: resolved.study,
        },
      });
    },
  );

  return {
    status: os.status.handler(() => getInstanceStatus(caps, deployment)),
    me: os.me.use(requireUser).handler(async ({ context }) => ({
      userId: context.principal.userId,
      email: context.principal.email,
      emailVerified: context.principal.emailVerified,
      name: context.principal.name,
      // Already on the principal: the session lookup reads the user row, so
      // the stored preference costs `me` no query of its own.
      locale: context.principal.locale,
      // The same read `requireStudy` resolves a tenant over, and the same
      // index serves it. Better Auth's own team list drops the role, so this
      // is the only thing that can tell a researcher what they are in each of
      // their teams.
      teams: await auth.listMemberships(context.principal.userId),
    })),
    account: {
      updateLocale: os.account.updateLocale
        .use(requireUser)
        .handler(async ({ context, input }) => {
          if (!pool) throw new ORPCError('INTERNAL_SERVER_ERROR');
          // Deliberately not an audited command (localization design §5.2,
          // decision 7): the audit log is study/team-scoped by design, and a
          // personal presentation preference has no tenant — so this writes
          // through the plain pool, like team.acceptInvitation.
          const updated = await updateUserLocale(pool, {
            userId: context.principal.userId,
            locale: input.locale,
          });
          // A session can outlive its user row only by a hard-delete race;
          // there is nothing left to store a preference on.
          if (!updated) throw new ORPCError('NOT_FOUND');
          return updated;
        }),
    },
    team: {
      acceptInvitation: os.team.acceptInvitation
        .use(requireUser)
        .handler(async ({ context, input }) => {
          if (!pool) throw new ORPCError('INTERNAL_SERVER_ERROR');
          const accepted = await handleTeamCommand(() =>
            acceptTeamInvitation(
              {
                pool,
                principal: context.principal,
                requestId: context.requestId,
              },
              input,
            ),
          );
          correlateAuthorizedTeam(accepted.teamId);
          return accepted;
        }),
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
        .handler(({ context, input }) => {
          if (!invitationDeliveryAvailable) {
            throw new ORPCError('SERVICE_UNAVAILABLE');
          }
          return handleTeamCommand(() =>
            createTeamInvitation(
              {
                tenantDb: context.tenantDb,
                principal: context.principal,
                requestId: context.requestId,
              },
              { email: input.email, role: input.role },
            ),
          );
        }),
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
    studies: {
      // Which studies the caller sees is their TEAM role (#1257): an Admin or
      // Owner sees the team's studies, a Member sees the ones they hold a
      // study-role grant on. The predicate is the store's, not this handler's,
      // so `studies.get` refuses exactly what `studies.list` omits.
      list: os.studies.list.use(requireTeam).handler(({ context }) =>
        new StudyStore(context.tenantDb).listStudies({
          actorUserId: context.principal.userId,
          seesEveryStudy: seesEveryTeamStudy(context.team.role),
        }),
      ),
      get: os.studies.get.use(requireStudy).handler(({ context }) => {
        const { protocolDraftId, ...study } = context.study;
        return { teamId: context.team.id, study, protocolDraftId };
      }),
      // Resolved like `get`, so the numbers beside the sidebar's destinations
      // exist for exactly the studies their reader can open, and a study the
      // caller cannot reach is refused the same way for both.
      counts: os.studies.counts
        .use(requireStudy)
        .handler(async ({ context }) => {
          const counts = await readStudyCounts(
            context.tenantDb,
            context.study.id,
          );
          // `requireStudy` found the row inside this tenant a moment ago; a
          // row missing now is a purge racing the read, not an oracle.
          if (!counts) throw new ORPCError('NOT_FOUND');
          return counts;
        }),
      create: os.studies.create.use(requireTeam).handler(({ context, input }) =>
        handleAuditedStudyCommand(() =>
          createAuditedStudy(
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
    // Every procedure below is addressed by a protocol line, and #1257's rule
    // decides which lines a caller has: `requireProtocol` refuses the rest,
    // exactly as `studies.get` refuses the study in front of them. Creating a
    // line answers to the same rule from the other side — a line no study owns
    // is reachable only by an Admin or Owner, so only they may make one.
    protocols: {
      create: os.protocols.create
        .use(requireTeamAdministration)
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
      // The list names no protocol, so it takes the same predicate as a query
      // rather than as a refusal: a Member is shown the lines behind the
      // studies they hold a grant on, and an Admin or Owner every line.
      list: os.protocols.list.use(requireTeam).handler(({ context }) =>
        new ProtocolStore(context.tenantDb).listProtocols({
          actorUserId: context.principal.userId,
          seesEveryStudy: seesEveryTeamStudy(context.team.role),
        }),
      ),
      draft: os.protocols.draft
        .use(requireProtocol)
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
        .use(requireProtocol)
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
        .use(requireProtocol)
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
        .use(requireProtocol)
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
        .use(requireProtocol)
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
        .use(requireProtocol)
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
        .use(requireProtocol)
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
    audit: {
      list: os.audit.list
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          const events = await guardAuditRead(context, 'audit.list', () =>
            runNoAuditTenantTransaction(
              context.tenantDb,
              'audit.list',
              async (client) => {
                await assertAuditReadAuthorized(client, context);
                return auditStore.listForTeam(client, input.teamId, {
                  beforeSequence: input.cursor,
                  limit: input.limit,
                  categories: input.categories,
                  eventTypes: input.eventTypes,
                  actor: input.actor,
                  outcomes: input.outcomes,
                  occurredFrom: input.from,
                  occurredTo: input.to,
                });
              },
            ),
          );
          const last = events.at(-1);
          return {
            items: events.map(renderAuditEventSummary),
            nextCursor:
              last && events.length === clampAuditListLimit(input.limit)
                ? last.sequence
                : null,
          };
        }),
      get: os.audit.get.use(requireTeam).handler(async ({ context, input }) => {
        const event = await guardAuditRead(context, 'audit.get', () =>
          runNoAuditTenantTransaction(
            context.tenantDb,
            'audit.get',
            async (client) => {
              await assertAuditReadAuthorized(client, context);
              return auditStore.getForTeam(client, input.teamId, input.eventId);
            },
          ),
        );
        if (!event) throw new ORPCError('NOT_FOUND');
        return renderAuditEventDetail(event);
      }),
      // The same rows as audit.list through the same read surface, so it takes
      // the same locked-membership authorization inside the read's own
      // transaction, and the same committed, rate-limited denial.
      filterOptions: os.audit.filterOptions
        .use(requireTeam)
        .handler(async ({ context, input }) => {
          const facets = await guardAuditRead(
            context,
            'audit.filterOptions',
            () =>
              runNoAuditTenantTransaction(
                context.tenantDb,
                'audit.filterOptions',
                async (client) => {
                  await assertAuditReadAuthorized(client, context);
                  return auditStore.facetsForTeam(
                    client,
                    input.teamId,
                    AUDIT_FACET_LIMIT,
                  );
                },
              ),
          );
          return renderAuditFilterOptions(facets);
        }),
    },
  };
}
