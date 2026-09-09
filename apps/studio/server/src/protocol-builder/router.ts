// The protocol-builder host contract, implemented against Studio.
//
// Every procedure starts by resolving the protocol to a tenant and a draft
// (tenancy.ts): the contract names neither, and a caller who cannot reach the
// line gets the same PROTOCOL_NOT_FOUND as one asking for a line that does not
// exist, so this is no more an existence oracle than `studies.get` is.
import { randomUUID } from 'node:crypto';

import { implement, ORPCError, withEventMeta } from '@orpc/server';
import type pg from 'pg';

import { contract } from '@codaco/studio-rpc';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId as makeSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { AssetStore } from '../assets.ts';
import type { AuthService, Principal } from '../auth/service.ts';
import { createProtocolSyncServer } from '../protocol/sync.ts';
import type { RpcContext } from '../rpc.ts';
import { readProtocolEvents, type LoggedProtocolEvent } from './events.ts';
import {
  acquireLock,
  create,
  deleteEntityType,
  deleteVariable,
  listSectionIds,
  mergeAssets,
  readSection,
  releaseConnection,
  releaseLock,
  sessionOwner,
  sessionPresence,
  submit,
  type ProtocolBuilderSession,
  type RefactorOutcome,
} from './host.ts';
import { StagedResourceRegistry } from './resources.ts';
import type { ProtocolBuilderRuntime } from './runtime.ts';
import { resolveProtocolSession } from './tenancy.ts';

const os = implement(contract).$context<RpcContext>();

export type ProtocolBuilderRouterDeps = {
  auth: AuthService;
  runtime: ProtocolBuilderRuntime;
  pool?: pg.Pool;
  assetStore?: AssetStore;
};

function requirePrincipal(context: RpcContext): Principal {
  if (!context.principal) throw new ORPCError('UNAUTHORIZED');
  return context.principal;
}

/**
 * The connection this call arrived on, which is the lock owner and the
 * presence identity. A WebSocket names its own; a unary call has no connection
 * to name and falls back to the cookie session, so an editor keeps its lock
 * across calls on that plane too.
 */
function connectionOf(context: RpcContext, principal: Principal): string {
  return context.connectionId ?? principal.sessionId;
}

export function createProtocolBuilderRouter(deps: ProtocolBuilderRouterDeps) {
  const { auth, runtime } = deps;
  const staged = new StagedResourceRegistry(randomUUID);

  const openSession = async (
    context: RpcContext,
    protocolId: string,
  ): Promise<ProtocolBuilderSession | null> => {
    const principal = requirePrincipal(context);
    if (!deps.pool) throw new ORPCError('INTERNAL_SERVER_ERROR');
    const memberships = await auth.listMemberships(principal.userId);
    const session = await resolveProtocolSession(deps.pool, {
      protocolId,
      principal,
      requestId: context.requestId,
      connectionId: connectionOf(context, principal),
      memberships,
    });
    if (session !== null) runtime.leases.touch(sessionOwner(session));
    return session;
  };

  const stagingKey = (session: ProtocolBuilderSession) =>
    `${session.draftId} ${sessionOwner(session)}`;

  const publish = (
    session: ProtocolBuilderSession,
    events: readonly LoggedProtocolEvent[],
  ) => {
    if (events.length > 0) runtime.publisher.publish(session.draftId, events);
  };

  const publishPresence = (session: ProtocolBuilderSession) => {
    runtime.publisher.publish(session.draftId, [
      {
        event: {
          type: 'presence',
          present: runtime.presence.list(session.draftId),
        },
      },
    ]);
  };

  const assetsDocument = async (
    session: ProtocolBuilderSession,
  ): Promise<SectionDoc> => {
    const assets = await readSection(
      session,
      makeSectionId({ kind: 'assets' }),
    );
    return assets?.document ?? {};
  };

  /**
   * Everything a closing connection owes its colleagues: its locks back, its
   * staged imports dropped, and its presence gone.
   */
  const endConnection = async (
    session: ProtocolBuilderSession,
  ): Promise<void> => {
    const owner = sessionOwner(session);
    const held = runtime.leases.heldSections(
      session.draftId,
      owner,
    ) as ProtocolSectionId[];
    const released = await releaseConnection(session, held);
    for (const sectionId of held) {
      runtime.leases.drop(session.draftId, sectionId, owner);
    }
    staged.release(stagingKey(session));
    runtime.presence.leave(session.draftId, session.connectionId);
    publish(session, released.events);
    publishPresence(session);
  };

  return {
    acquireLock: os.protocolBuilder.acquireLock.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const result = await acquireLock(session, input.sectionId);
        if (result.outcome === undefined) {
          throw errors.SECTION_NOT_FOUND({ data: input });
        }
        if (result.lease !== undefined) {
          runtime.leases.hold({
            sync: createProtocolSyncServer(session.tenantDb),
            draftId: session.draftId,
            sectionId: input.sectionId,
            owner: sessionOwner(session),
            epoch: result.lease.epoch,
          });
          runtime.presence.join(
            session.draftId,
            sessionPresence(session, 'editing', input.sectionId),
          );
        }
        publish(session, result.events);
        if (result.lease !== undefined) publishPresence(session);
        return result.outcome;
      },
    ),

    releaseLock: os.protocolBuilder.releaseLock.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const result = await releaseLock(session, input.sectionId);
        runtime.leases.drop(
          session.draftId,
          input.sectionId,
          sessionOwner(session),
        );
        runtime.presence.setMode(
          session.draftId,
          session.connectionId,
          'viewing',
          undefined,
        );
        publish(session, result.events);
        if (result.events.length > 0) publishPresence(session);
      },
    ),

    getSection: os.protocolBuilder.getSection.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const state = await readSection(session, input.sectionId);
        if (state === undefined) {
          throw errors.SECTION_NOT_FOUND({ data: input });
        }
        return state;
      },
    ),

    listSections: os.protocolBuilder.listSections.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        return { sectionIds: await listSectionIds(session) };
      },
    ),

    watchProtocol: os.protocolBuilder.watchProtocol.handler(async function* ({
      input,
      context,
      errors,
      lastEventId,
      signal,
    }) {
      const session = await openSession(context, input.protocolId);
      if (session === null) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      // Subscribed before the backlog is read, so an event committed
      // between the two is queued rather than lost; the cursor check below
      // drops the overlap.
      const subscription = runtime.publisher.subscribe(session.draftId);
      const stop = () => subscription.close();
      signal?.addEventListener('abort', stop, { once: true });
      runtime.presence.join(
        session.draftId,
        sessionPresence(session, 'viewing'),
      );
      publishPresence(session);
      try {
        const backlog = await readProtocolEvents(
          session.tenantDb,
          session.draftId,
          input.since ?? lastEventId,
        );
        let last = backlog.at(-1)?.cursor ?? input.since ?? lastEventId;
        for (const entry of backlog) {
          yield withEventMeta(entry.event, { id: entry.cursor });
        }
        // The join above published this watcher's own arrival, which the
        // subscription below delivers: the first live event a new watcher
        // sees is who is here.
        for await (const entry of subscription.events) {
          // Presence carries no cursor: it is not replayable, so it must
          // never move the position a dropped client resumes from.
          if (entry.cursor === undefined) {
            yield entry.event;
            continue;
          }
          if (last !== undefined && BigInt(entry.cursor) <= BigInt(last)) {
            continue;
          }
          last = entry.cursor;
          yield withEventMeta(entry.event, { id: entry.cursor });
        }
      } finally {
        signal?.removeEventListener('abort', stop);
        subscription.close();
        await endConnection(session);
      }
    }),

    submit: os.protocolBuilder.submit.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const result = await submit(session, input.sectionId, input.document);
        publish(session, result.events);
        const outcome = result.outcome;
        if (outcome === undefined) {
          throw errors.SECTION_NOT_FOUND({ data: input });
        }
        if (outcome.status === 'notLockHolder') {
          throw errors.NOT_LOCK_HOLDER({
            data: {
              sectionId: input.sectionId,
              ...(outcome.holder === undefined
                ? {}
                : { holder: outcome.holder }),
            },
          });
        }
        if (outcome.status === 'invalidShape') {
          throw errors.INVALID_SHAPE({
            data: { sectionId: input.sectionId, issues: outcome.issues },
          });
        }
        return { revision: outcome.revision };
      },
    ),

    create: os.protocolBuilder.create.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const result = await create(session, {
          kind: input.kind,
          document: input.document,
          ...(input.position === undefined ? {} : { position: input.position }),
          mintId: randomUUID,
        });
        publish(session, result.events);
        if (result.outcome.status === 'invalidShape') {
          throw errors.INVALID_SHAPE({
            data: {
              sectionId: result.outcome.sectionId,
              issues: result.outcome.issues,
            },
          });
        }
        return {
          sectionId: result.outcome.sectionId,
          revision: result.outcome.revision,
        };
      },
    ),

    refactor: {
      deleteVariable: os.protocolBuilder.refactor.deleteVariable.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const result = await deleteVariable(session, {
            subject: input.subject,
            variableId: input.variableId,
          });
          publish(session, result.events);
          return applied(result.outcome, errors);
        },
      ),
      deleteEntityType: os.protocolBuilder.refactor.deleteEntityType.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const result = await deleteEntityType(session, {
            entity: input.entity,
            typeId: input.typeId,
          });
          publish(session, result.events);
          return applied(result.outcome, errors);
        },
      ),
    },

    resources: {
      list: os.protocolBuilder.resources.list.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const store = staged.for(stagingKey(session));
          const resources = [
            ...store.committed(await assetsDocument(session)),
            ...store.descriptors(),
          ].filter(
            (descriptor) =>
              (input.kinds === undefined ||
                input.kinds.includes(descriptor.kind)) &&
              (input.status === undefined ||
                descriptor.status === input.status),
          );
          return {
            status: 'ok' as const,
            data: { secretStorage: store.secretStorage, resources },
          };
        },
      ),

      stage: os.protocolBuilder.resources.stage.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          return staged
            .for(stagingKey(session))
            .stage(input.requestId, input.request);
        },
      ),

      promote: os.protocolBuilder.resources.promote.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const store = staged.for(stagingKey(session));
          const plan = await store.plan(
            deps.assetStore,
            input.promotionId,
            input.resourceIds,
          );
          if (plan.status === 'failed') return plan;
          const merged = await mergeAssets(session, plan.data.entries);
          publish(session, merged.events);
          if (merged.outcome === undefined) {
            return {
              status: 'failed' as const,
              failure: {
                reason: 'promotion-failed' as const,
                message: 'this protocol has no asset manifest',
                retryable: true,
              },
            };
          }
          store.completePromotion(input.promotionId, input.resourceIds);
          return {
            status: 'ok' as const,
            data: {
              id: input.promotionId,
              promoted: plan.data.promoted,
              revision: merged.outcome,
            },
          };
        },
      ),

      discard: os.protocolBuilder.resources.discard.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          return staged.for(stagingKey(session)).discard(input.resourceId);
        },
      ),

      inspect: os.protocolBuilder.resources.inspect.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          return staged
            .for(stagingKey(session))
            .inspect(await assetsDocument(session), input.resourceId);
        },
      ),

      preview: os.protocolBuilder.resources.preview.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          return staged
            .for(stagingKey(session))
            .preview(await assetsDocument(session), input.resourceId);
        },
      ),
    },
  };
}

type AppliedRefactor = Extract<RefactorOutcome, { status: 'applied' }>;

/**
 * A refactor either took every section it writes, or it took none and names
 * who has them. A subject that does not exist is a NOT_FOUND, which the
 * contract's own errors do not cover — they name a protocol or a section, and
 * this is neither.
 */
function applied(
  outcome: RefactorOutcome | undefined,
  errors: {
    SECTIONS_LOCKED: (options: {
      data: {
        blocked: Extract<RefactorOutcome, { status: 'blocked' }>['blocked'];
      };
    }) => Error;
  },
): AppliedRefactor {
  if (outcome === undefined) throw new ORPCError('NOT_FOUND');
  if (outcome.status === 'blocked') {
    throw errors.SECTIONS_LOCKED({ data: { blocked: outcome.blocked } });
  }
  return outcome;
}
