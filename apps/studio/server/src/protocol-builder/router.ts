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
  parseSectionId,
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
  deleteStage,
  deleteVariable,
  listSectionIds,
  readSection,
  releaseConnection,
  releaseLock,
  sessionOwner,
  sessionPresence,
  submit,
  type ProtocolBuilderSession,
  type RefactorOutcome,
} from './host.ts';
import {
  committedDescriptors,
  committedInspection,
  committedPreview,
  SECRET_STORAGE,
  StagedResourceRegistry,
} from './resources.ts';
import type { ProtocolBuilderRuntime } from './runtime.ts';
import { resolveProtocolSession } from './tenancy.ts';
import {
  readWriteReceipt,
  type WriteOperation,
  type WriteReceipt,
} from './writeReceipts.ts';

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
 * The connection this call arrived on, which is the presence identity. A
 * WebSocket names its own; a unary call has no connection to name and falls
 * back to the cookie session.
 */
function connectionOf(context: RpcContext, principal: Principal): string {
  return context.connectionId ?? principal.sessionId;
}

/**
 * The browser tab this call came from, which is what its locks belong to. A
 * client that names none is identified by its connection instead, so it is
 * still its own owner and still keeps its lock across calls — it just has no
 * identity to present on the next socket.
 */
function clientSessionOf(context: RpcContext, principal: Principal): string {
  return context.clientSessionId ?? connectionOf(context, principal);
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
      clientSessionId: clientSessionOf(context, principal),
      memberships,
    });
    if (session !== null) runtime.leases.touch(sessionOwner(session));
    return session;
  };

  /**
   * Where one edit's staged imports live: the draft, the owner and the edit.
   *
   * Not the connection: an edit outlives a dropped socket, and one owner can
   * have two edits open at once — a codebook dialog over a stage editor, or
   * two tabs — whose cancels must not reach each other. Not the owner alone
   * either, for the same reason.
   */
  const stagingKey = (session: ProtocolBuilderSession, editId: string) =>
    `${ownerPrefix(session)}${editId}`;

  /** Everything one owner has staged, whichever edit staged it. */
  const ownerPrefix = (session: ProtocolBuilderSession) =>
    `${session.draftId}\u0000${sessionOwner(session)}\u0000`;

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
   * Everything an owner whose reconnection never came owes its colleagues: its
   * locks back, with the lock events that say so, and its staged imports
   * dropped. The lease keeper calls this once the reconnect grace is up, not
   * when a socket ends: the tab behind that socket is one blip away from
   * asking for its section again, and the section is still its own.
   */
  const endOwner = async (session: ProtocolBuilderSession): Promise<void> => {
    const owner = sessionOwner(session);
    const held = runtime.leases.heldSections(
      session.draftId,
      owner,
    ) as ProtocolSectionId[];
    // Renewal stops here rather than after the release, because it must stop
    // whatever the release does: this runs from a timer, and a process left
    // renewing the leases of a tab that has gone would be a lock nobody could
    // ever take. Dropped first, an unreachable database costs the section one
    // lease expiry instead.
    for (const sectionId of held) {
      runtime.leases.drop(session.draftId, sectionId, owner);
    }
    staged.releaseMatching(ownerPrefix(session));
    const released = await releaseConnection(session, held);
    publish(session, released.events);
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
      // The channel is the connection: while it runs, every lease its owner
      // holds is renewed however long they go without calling anything. Its
      // ending starts the reconnect grace rather than the release, and
      // `endOwner` is what runs if nothing of this owner's comes back.
      const disconnect = runtime.leases.connect(
        sessionOwner(session),
        session.draftId,
        () => endOwner(session),
      );
      try {
        runtime.presence.join(
          session.draftId,
          sessionPresence(session, 'viewing'),
        );
        publishPresence(session);
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
        disconnect();
        // Presence is the connection's, so it goes with the connection even
        // though the locks stay: a colleague's cursor cannot outlive the
        // socket it was drawn from.
        runtime.presence.leave(session.draftId, session.connectionId);
        publishPresence(session);
      }
    }),

    submit: os.protocolBuilder.submit.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const promotion = input.promote;
        // This request id's attempt is already committed, so this call is the
        // retry of an answer that was lost: it is told what that attempt
        // wrote. Asked before the promotion is planned, because a retry's
        // staged resources are gone — the first attempt took them — and
        // planning again would refuse the retry rather than answer it.
        const already = await readWriteReceipt(
          session.tenantDb,
          writeKey(session, 'submit', input.requestId),
        );
        if (already !== undefined) return submitted(already);
        const store =
          promotion === undefined
            ? undefined
            : staged.for(stagingKey(session, promotion.editId));
        // The promotion is planned before anything is written: its bytes go to
        // the object store, where nothing names them, and only the section
        // write below puts them in the manifest. A refused submit therefore
        // leaves the protocol as it was and the resources still staged.
        const planned =
          promotion === undefined || store === undefined
            ? undefined
            : await store.plan(
                deps.assetStore,
                promotion.resourceIds,
                promotion.secretHandles,
              );
        if (planned?.status === 'failed') {
          throw errors.PROMOTION_FAILED({
            data: { sectionId: input.sectionId, failure: planned.failure },
          });
        }
        const result = await submit(session, input.sectionId, input.document, {
          requestId: input.requestId,
          ...(planned === undefined
            ? {}
            : {
                assetEntries: planned.data.entries,
                promoted: planned.data.promoted,
              }),
        });
        publish(session, result.events);
        const outcome = result.outcome;
        if (outcome === undefined) {
          throw errors.SECTION_NOT_FOUND({ data: input });
        }
        // Another call carrying this request id got there first — the two
        // serialise behind the draft-head lock — so this one is its retry.
        if (outcome.status === 'replayed') return submitted(outcome.receipt);
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
        if (outcome.status === 'blocked') {
          throw errors.SECTIONS_LOCKED({ data: { blocked: outcome.blocked } });
        }
        if (outcome.status === 'invalidShape') {
          throw errors.INVALID_SHAPE({
            data: { sectionId: input.sectionId, issues: outcome.issues },
          });
        }
        if (promotion !== undefined && store !== undefined) {
          store.completePromotion(promotion.resourceIds);
        }
        const promoted = planned?.data.promoted;
        return {
          revision: outcome.revision,
          ...(promoted === undefined ? {} : { promoted }),
        };
      },
    ),

    /**
     * Creates a section and registers its pointer in the same revision.
     *
     * `promote` is here for the reason a submit cannot cover: a stage being
     * ADDED can carry a file the researcher imported while composing it, and
     * there is no earlier revision of that stage to have promoted it with. The
     * section, its pointer and the manifest entries are one revision, so a
     * promotion that cannot be committed refuses the create outright and
     * writes nothing.
     */
    create: os.protocolBuilder.create.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const promotion = input.promote;
        // This request id's attempt is already committed, so this call is the
        // retry of an answer that was lost. The section is named from the
        // record rather than minted again, because a second create would put a
        // second copy of the stage in the protocol and the retry would never
        // learn of the first.
        const already = await readWriteReceipt(
          session.tenantDb,
          writeKey(session, 'create', input.requestId),
        );
        if (already !== undefined) return created(already);
        const store =
          promotion === undefined
            ? undefined
            : staged.for(stagingKey(session, promotion.editId));
        // Planned before anything is written, so a promotion that cannot be
        // committed leaves the protocol without the section and the staged
        // resources staged. The refusal names no section: the host mints an id
        // only for one it is going to write.
        const planned =
          promotion === undefined || store === undefined
            ? undefined
            : await store.plan(
                deps.assetStore,
                promotion.resourceIds,
                promotion.secretHandles,
              );
        if (planned?.status === 'failed') {
          throw errors.PROMOTION_FAILED({ data: { failure: planned.failure } });
        }
        const result = await create(session, {
          requestId: input.requestId,
          kind: input.kind,
          document: input.document,
          ...(input.position === undefined ? {} : { position: input.position }),
          ...(planned === undefined
            ? {}
            : {
                assetEntries: planned.data.entries,
                promoted: planned.data.promoted,
              }),
          mintId: randomUUID,
        });
        publish(session, result.events);
        // Another call carrying this request id got there first, so this one
        // is its retry: the stage it made, not a second one.
        if (result.outcome.status === 'replayed') {
          return created(result.outcome.receipt);
        }
        if (result.outcome.status === 'exists') {
          throw errors.SECTION_EXISTS({
            data: { sectionId: result.outcome.sectionId },
          });
        }
        if (result.outcome.status === 'blocked') {
          throw errors.SECTIONS_LOCKED({
            data: { blocked: result.outcome.blocked },
          });
        }
        if (result.outcome.status === 'invalidShape') {
          throw errors.INVALID_SHAPE({
            data: {
              sectionId: result.outcome.sectionId,
              issues: result.outcome.issues,
            },
          });
        }
        if (promotion !== undefined && store !== undefined) {
          store.completePromotion(promotion.resourceIds);
        }
        return {
          sectionId: result.outcome.sectionId,
          revision: result.outcome.revision,
          ...(planned === undefined ? {} : { promoted: planned.data.promoted }),
        };
      },
    ),

    /**
     * Removes a stage and its place in the stage order in one revision.
     *
     * Server-mediated like the refactors: the two writes cannot be made under
     * one lock, and it takes neither of them, so a stage or an order any
     * editor holds — including one on this connection, whose draft would put
     * the stage back — refuses the change.
     *
     * A stage other stages depend on is refused naming them, not swept: a skip
     * destination or the pedigree a narrative describes is a decision made
     * about that other stage, and rewriting it as a side effect of removing
     * this one is not a deletion anybody asked for.
     */
    delete: os.protocolBuilder.delete.handler(
      async ({ input, context, errors }) => {
        const session = await openSession(context, input.protocolId);
        if (session === null) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        const ref = parseSectionId(input.sectionId);
        if (ref.kind !== 'stage') {
          throw errors.SECTION_NOT_FOUND({ data: input });
        }
        const result = await deleteStage(session, ref.stageId);
        publish(session, result.events);
        if (result.outcome === undefined) {
          throw errors.SECTION_NOT_FOUND({ data: input });
        }
        if (result.outcome.status === 'blocked') {
          throw errors.SECTIONS_LOCKED({
            data: { blocked: result.outcome.blocked },
          });
        }
        if (result.outcome.status === 'referenced') {
          throw errors.REFERENCES_REMAIN({
            data: { remaining: result.outcome.remaining },
          });
        }
        return result.outcome;
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
          // Committed resources are the protocol's; staged ones are the
          // named edit's, and another edit's imports are no more part of this
          // protocol than the draft that will name them.
          const store =
            input.editId === undefined
              ? undefined
              : staged.opened(stagingKey(session, input.editId));
          const resources = [
            ...committedDescriptors(await assetsDocument(session)),
            ...(store?.descriptors() ?? []),
          ].filter(
            (descriptor) =>
              (input.kinds === undefined ||
                input.kinds.includes(descriptor.kind)) &&
              (input.status === undefined ||
                descriptor.status === input.status),
          );
          return {
            status: 'ok' as const,
            data: { secretStorage: SECRET_STORAGE, resources },
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
            .for(stagingKey(session, input.editId))
            .stage(input.requestId, input.request);
        },
      ),

      discard: os.protocolBuilder.resources.discard.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          // Only what this edit staged: a stage editor's cancel must not take
          // away the file the codebook dialog over it is about to submit.
          return staged
            .for(stagingKey(session, input.editId))
            .discard(input.resourceId);
        },
      ),

      inspect: os.protocolBuilder.resources.inspect.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const assets = await assetsDocument(session);
          const store =
            input.editId === undefined
              ? undefined
              : staged.opened(stagingKey(session, input.editId));
          return store === undefined
            ? committedInspection(assets, input.resourceId)
            : store.inspect(assets, input.resourceId);
        },
      ),

      preview: os.protocolBuilder.resources.preview.handler(
        async ({ input, context, errors }) => {
          const session = await openSession(context, input.protocolId);
          if (session === null) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const assets = await assetsDocument(session);
          const store =
            input.editId === undefined
              ? undefined
              : staged.opened(stagingKey(session, input.editId));
          return store === undefined
            ? committedPreview(assets, input.resourceId)
            : store.preview(assets, input.resourceId);
        },
      ),
    },
  };
}

/**
 * A write's identity, for the receipt that answers its retry: the draft it
 * was made in, which of the two keyed procedures it was, and the id the
 * client promised to repeat.
 */
function writeKey(
  session: ProtocolBuilderSession,
  operation: WriteOperation,
  requestId: string,
) {
  return { draftId: session.draftId, operation, requestId };
}

/** A recorded submit, answered as the contract answers a fresh one. */
function submitted(receipt: WriteReceipt) {
  return {
    revision: receipt.revision,
    ...(receipt.promoted === undefined ? {} : { promoted: receipt.promoted }),
  };
}

/** A recorded create, which always names the section that attempt made. */
function created(receipt: WriteReceipt) {
  if (receipt.createdSection === undefined) {
    throw new ORPCError('INTERNAL_SERVER_ERROR');
  }
  return {
    sectionId: receipt.createdSection,
    revision: receipt.revision,
    ...(receipt.promoted === undefined ? {} : { promoted: receipt.promoted }),
  };
}

type AppliedRefactor = Extract<RefactorOutcome, { status: 'applied' }>;

/**
 * A refactor either took every section it writes and left nothing naming what
 * it removed, or it made no change and says which of the two stopped it. A
 * subject that does not exist is a NOT_FOUND, which the contract's own errors
 * do not cover — they name a protocol or a section, and this is neither.
 */
function applied(
  outcome: RefactorOutcome | undefined,
  errors: {
    SECTIONS_LOCKED: (options: {
      data: {
        blocked: Extract<RefactorOutcome, { status: 'blocked' }>['blocked'];
      };
    }) => Error;
    REFERENCES_REMAIN: (options: {
      data: {
        remaining: Extract<
          RefactorOutcome,
          { status: 'referenced' }
        >['remaining'];
      };
    }) => Error;
  },
): AppliedRefactor {
  if (outcome === undefined) throw new ORPCError('NOT_FOUND');
  if (outcome.status === 'blocked') {
    throw errors.SECTIONS_LOCKED({ data: { blocked: outcome.blocked } });
  }
  if (outcome.status === 'referenced') {
    throw errors.REFERENCES_REMAIN({ data: { remaining: outcome.remaining } });
  }
  return outcome;
}
