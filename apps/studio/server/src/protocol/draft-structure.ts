import { and, eq, inArray, sql } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { VariableNameSchema } from '@codaco/shared-consts';
import {
  type SectionDoc,
  contentHash,
  manifestHash,
} from '@codaco/studio-sync/apply';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';
import {
  assertSectionValid,
  SectionValidationFailedError,
} from '@codaco/studio-sync/section-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { sqlErrorsOnly, sqlErrorsOnlyBeside } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';

const { drafts, leases, manifests, sections } = SYNC_TABLES;

/**
 * Something the draft's structure will not allow: a stage that is already
 * there, an index off the end of the order, a section the manifest names but
 * the store has lost. A typed failure rather than a thrown error, because
 * every one of them is an answer a caller acts on.
 */
export class DraftStructureError extends Schema.TaggedError<DraftStructureError>()(
  'DraftStructureError',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

export type StructuralResult = { manifestSeq: bigint; manifestHash: string };

export type HeadState = {
  headSeq: bigint;
  headManifestHash: string;
  sectionHashes: Record<string, string>;
};

/**
 * The draft's head, locked for the rest of the transaction. Every path that
 * advances the manifest takes this first, so commits cannot fork the chain —
 * and the protocol-builder host allocates its event cursors under it too, so
 * one draft's events carry one gapless order.
 */
export const lockDraftHead: (
  teamId: string,
  draftId: string,
) => Effect.Effect<
  HeadState,
  DraftStructureError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.lockDraftHead')(function* (
  teamId: string,
  draftId: string,
) {
  const { tx } = yield* Transaction;
  const locked = yield* tx
    .select({
      headSeq: drafts.headSeq,
      headManifestHash: drafts.headManifestHash,
    })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
    .for('update');
  const draft = locked[0];
  if (draft === undefined) {
    return yield* new DraftStructureError({ reason: `no draft ${draftId}` });
  }
  const head = yield* tx
    .select({ sectionHashes: manifests.sectionHashes })
    .from(manifests)
    .where(
      and(
        eq(manifests.draftId, draftId),
        eq(manifests.seq, draft.headSeq),
        eq(manifests.teamId, teamId),
      ),
    );
  const row = head[0];
  if (row === undefined) {
    return yield* new DraftStructureError({
      reason: `draft ${draftId} has no manifest at seq ${draft.headSeq}`,
    });
  }
  return {
    // `head_seq` is a `bigint` column read through the builder, which decodes
    // it as a `bigint` — the string this used to widen by hand.
    headSeq: draft.headSeq,
    headManifestHash: draft.headManifestHash,
    sectionHashes: { ...row.sectionHashes },
  };
}, sqlErrorsOnlyBeside);

const loadDoc = Effect.fn('protocol.store.loadDoc')(function* (
  teamId: string,
  hash: string,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ doc: sections.doc })
    .from(sections)
    .where(and(eq(sections.teamId, teamId), eq(sections.hash, hash)));
  const row = rows[0];
  if (row === undefined) {
    return yield* new DraftStructureError({
      reason: `missing section document ${hash}`,
    });
  }
  return row.doc;
}, sqlErrorsOnlyBeside);

const StageOrder = Schema.Array(Schema.String);
const decodeStageOrder = Schema.decodeUnknownResult(StageOrder);

/**
 * The stage order a `stageOrder` section carries. A document that is not a
 * list of ids is a draft nothing can advance, so it fails rather than throws:
 * every caller here is already in the error channel.
 */
const stageOrderOf = (
  doc: SectionDoc,
): Effect.Effect<readonly string[], DraftStructureError> => {
  const decoded = decodeStageOrder(doc.stages);
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success)
    : Effect.fail(
        new DraftStructureError({
          reason: 'stageOrder section is not a list of ids',
        }),
      );
};

/**
 * A synchronous section validation as a typed failure. `assertSectionValid`
 * throws — it is shared with the sync server, which catches — and a throw
 * inside a generator body would arrive as a defect, which no caller can
 * answer and no test can assert on the way this suite does.
 */
export const failOnSectionValidation = (
  assert: () => void,
): Effect.Effect<void, SectionValidationFailedError> =>
  Effect.suspend(() => {
    try {
      assert();
      return Effect.void;
    } catch (error) {
      if (error instanceof SectionValidationFailedError) {
        return Effect.fail(error);
      }
      throw error;
    }
  });

// Expiry AND an epoch bump: expiring alone would let the holder's queued
// commits race the expiry check, and a removed-then-re-added section would
// accept the old owner's stale edits.
export const fenceDraftLeases: (
  teamId: string,
  draftId: string,
  sectionIds: string[],
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.fenceDraftLeases',
)(function* (teamId: string, draftId: string, sectionIds: string[]) {
  // `IN ()` is not a statement Postgres has; an empty fence is no statement.
  // `= ANY($2)` over an empty array matched nothing, so this is the same.
  if (sectionIds.length === 0) return;
  const { tx } = yield* Transaction;
  yield* tx
    .update(leases)
    .set({ epoch: sql`${leases.epoch} + 1`, expiresAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(leases.draftId, draftId),
        inArray(leases.sectionId, sectionIds),
        eq(leases.teamId, teamId),
      ),
    )
    // Fencing nothing is normal — a section nobody holds a lease on — so the
    // rows are not inspected. `.returning()` all the same: without it the
    // builder's answer is the driver's result object, and a later reader of
    // this value would be reading a lie.
    .returning({ sectionId: leases.sectionId });
}, sqlErrorsOnly);

/**
 * Writes and removals as one new manifest revision. Also the protocol-builder
 * host's write path, whose `create` and compound refactors land several
 * sections at one sequence.
 */
export const advanceDraftManifest: (
  teamId: string,
  draftId: string,
  head: HeadState,
  newSections: Record<string, SectionDoc>,
  removedSectionIds: string[],
  createdAt?: Date,
) => Effect.Effect<StructuralResult, SqlError.SqlError, Transaction> =
  Effect.fn('protocol.store.advanceDraftManifest')(function* (
    teamId: string,
    draftId: string,
    head: HeadState,
    newSections: Record<string, SectionDoc>,
    removedSectionIds: string[],
    // Dates the new sections for a caller that knows when the edit was made
    // (the synthetic-data seed); a live command leaves it unset and takes the
    // clock. Same contract as insertDraftRows.
    createdAt?: Date,
  ) {
    const { tx } = yield* Transaction;
    const written = createdAt ?? sql`clock_timestamp()`;
    const sectionHashes = { ...head.sectionHashes };
    for (const id of removedSectionIds) {
      delete sectionHashes[id];
    }
    // One upsert per document, for the reason `insertDraftRows` gives: two
    // sections of one revision may hold the same document.
    for (const [id, doc] of Object.entries(newSections)) {
      const hash = contentHash(doc);
      sectionHashes[id] = hash;
      const rows = yield* tx
        .insert(sections)
        .values({ teamId, hash, doc, createdAt: written })
        .onConflictDoUpdate({
          target: [sections.teamId, sections.hash],
          set: { createdAt: written, unreferencedAt: null },
        })
        .returning({ hash: sections.hash });
      if (rows.length === 0) {
        return yield* Effect.die(new Error(`section ${hash} wrote no row`));
      }
    }
    const newSeq = head.headSeq + 1n;
    const newManifestHash = manifestHash(sectionHashes, head.headManifestHash);
    const manifestRows = yield* tx
      .insert(manifests)
      .values({
        draftId,
        teamId,
        seq: newSeq,
        hash: newManifestHash,
        parentHash: head.headManifestHash,
        sectionHashes,
      })
      .returning({ seq: manifests.seq });
    if (manifestRows.length === 0) {
      return yield* Effect.die(
        new Error(`draft ${draftId} wrote no manifest at seq ${newSeq}`),
      );
    }
    const advanced = yield* tx
      .update(drafts)
      .set({ headSeq: newSeq, headManifestHash: newManifestHash })
      .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
      .returning({ headSeq: drafts.headSeq });
    if (advanced.length === 0) {
      return yield* Effect.die(
        new Error(`draft ${draftId} head was not advanced to ${newSeq}`),
      );
    }
    return { manifestSeq: newSeq, manifestHash: newManifestHash };
  }, sqlErrorsOnly);

export const addStage: (
  teamId: string,
  params: {
    draftId: string;
    stage: SectionDoc;
    index?: number;
    /** When the stage was added, for a caller that must say so (the seed). */
    createdAt?: Date;
  },
) => Effect.Effect<
  StructuralResult,
  DraftStructureError | SectionValidationFailedError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.addStage')(function* (
  teamId: string,
  params: {
    draftId: string;
    stage: SectionDoc;
    index?: number;
    createdAt?: Date;
  },
) {
  const stageId = params.stage.id;
  if (typeof stageId !== 'string' || stageId === '') {
    return yield* new DraftStructureError({
      reason: 'stage document has no id',
    });
  }
  const id = sectionId({ kind: 'stage', stageId });
  yield* failOnSectionValidation(() => {
    assertSectionValid(id, params.stage);
  });

  const head = yield* lockDraftHead(teamId, params.draftId);
  if (head.sectionHashes[id] !== undefined) {
    return yield* new DraftStructureError({
      reason: `stage ${stageId} already exists`,
    });
  }
  const orderId = sectionId({ kind: 'stageOrder' });
  const orderHash = head.sectionHashes[orderId];
  if (orderHash === undefined) {
    return yield* new DraftStructureError({
      reason: 'draft has no stageOrder section',
    });
  }
  const order = yield* stageOrderOf(yield* loadDoc(teamId, orderHash));
  const index = params.index ?? order.length;
  if (!Number.isInteger(index) || index < 0 || index > order.length) {
    return yield* new DraftStructureError({
      reason: `stage index ${index} out of range`,
    });
  }
  const newOrder = [...order];
  newOrder.splice(index, 0, stageId);
  yield* fenceDraftLeases(teamId, params.draftId, [orderId, id]);
  return yield* advanceDraftManifest(
    teamId,
    params.draftId,
    head,
    { [id]: params.stage, [orderId]: { stages: newOrder } },
    [],
    params.createdAt,
  );
});

export const removeStage: (
  teamId: string,
  params: {
    draftId: string;
    stageId: string;
    /** When the stage was removed, for a caller that must say so (the seed). */
    createdAt?: Date;
  },
) => Effect.Effect<
  StructuralResult,
  DraftStructureError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.removeStage')(function* (
  teamId: string,
  params: { draftId: string; stageId: string; createdAt?: Date },
) {
  const id = sectionId({ kind: 'stage', stageId: params.stageId });
  const head = yield* lockDraftHead(teamId, params.draftId);
  if (head.sectionHashes[id] === undefined) {
    return yield* new DraftStructureError({
      reason: `no stage ${params.stageId} in draft`,
    });
  }
  const orderId = sectionId({ kind: 'stageOrder' });
  const orderHash = head.sectionHashes[orderId];
  if (orderHash === undefined) {
    return yield* new DraftStructureError({
      reason: 'draft has no stageOrder section',
    });
  }
  const order = yield* stageOrderOf(yield* loadDoc(teamId, orderHash));
  const newOrder = order.filter((entry) => entry !== params.stageId);
  yield* fenceDraftLeases(teamId, params.draftId, [orderId, id]);
  return yield* advanceDraftManifest(
    teamId,
    params.draftId,
    head,
    { [orderId]: { stages: newOrder } },
    [id],
    params.createdAt,
  );
});

export const moveStage: (
  teamId: string,
  params: {
    draftId: string;
    stageId: string;
    toIndex: number;
    expectedRevision: bigint;
  },
) => Effect.Effect<
  StructuralResult,
  DraftStructureError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.moveStage')(function* (
  teamId: string,
  params: {
    draftId: string;
    stageId: string;
    toIndex: number;
    expectedRevision: bigint;
  },
) {
  const head = yield* lockDraftHead(teamId, params.draftId);
  if (head.headSeq !== params.expectedRevision) {
    return yield* new DraftStructureError({
      reason: `draft changed from revision ${params.expectedRevision} to ${head.headSeq}`,
    });
  }
  const orderId = sectionId({ kind: 'stageOrder' });
  const orderHash = head.sectionHashes[orderId];
  if (orderHash === undefined) {
    return yield* new DraftStructureError({
      reason: 'draft has no stageOrder section',
    });
  }
  const order = yield* stageOrderOf(yield* loadDoc(teamId, orderHash));
  const fromIndex = order.indexOf(params.stageId);
  if (fromIndex === -1) {
    return yield* new DraftStructureError({
      reason: `no stage ${params.stageId} in draft`,
    });
  }
  if (params.toIndex < 0 || params.toIndex >= order.length) {
    return yield* new DraftStructureError({
      reason: `stage index ${params.toIndex} out of range`,
    });
  }
  if (fromIndex === params.toIndex) {
    return { manifestSeq: head.headSeq, manifestHash: head.headManifestHash };
  }
  const newOrder = [...order];
  const [stageId] = newOrder.splice(fromIndex, 1);
  if (stageId === undefined) {
    return yield* new DraftStructureError({
      reason: `no stage ${params.stageId} in draft`,
    });
  }
  newOrder.splice(params.toIndex, 0, stageId);
  yield* fenceDraftLeases(teamId, params.draftId, [orderId]);
  return yield* advanceDraftManifest(
    teamId,
    params.draftId,
    head,
    { [orderId]: { stages: newOrder } },
    [],
  );
});

export type CodebookEntityRef =
  | { entity: 'node' | 'edge'; typeId: string }
  | { entity: 'ego' };

const entitySectionId = (
  ref: CodebookEntityRef,
): Effect.Effect<string, DraftStructureError> => {
  if (ref.entity === 'ego') {
    return Effect.succeed(sectionId({ kind: 'codebookEgo' }));
  }
  if (!VariableNameSchema.safeParse(ref.typeId).success) {
    return Effect.fail(
      new DraftStructureError({
        reason: `codebook ${ref.entity} type id ${ref.typeId} is not a valid identifier`,
      }),
    );
  }
  return Effect.succeed(
    ref.entity === 'node'
      ? sectionId({ kind: 'codebookNode', typeId: ref.typeId })
      : sectionId({ kind: 'codebookEdge', typeId: ref.typeId }),
  );
};

export const addCodebookEntity: (
  teamId: string,
  params: {
    draftId: string;
    ref: CodebookEntityRef;
    definition: SectionDoc;
  },
) => Effect.Effect<
  StructuralResult,
  DraftStructureError | SectionValidationFailedError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.addCodebookEntity')(function* (
  teamId: string,
  params: { draftId: string; ref: CodebookEntityRef; definition: SectionDoc },
) {
  const id = yield* entitySectionId(params.ref);
  yield* failOnSectionValidation(() => {
    assertSectionValid(id, params.definition);
  });
  const head = yield* lockDraftHead(teamId, params.draftId);
  if (head.sectionHashes[id] !== undefined) {
    return yield* new DraftStructureError({
      reason: `codebook section ${id} already exists`,
    });
  }
  yield* fenceDraftLeases(teamId, params.draftId, [id]);
  return yield* advanceDraftManifest(
    teamId,
    params.draftId,
    head,
    { [id]: params.definition },
    [],
  );
});

export const removeCodebookEntity: (
  teamId: string,
  params: { draftId: string; ref: CodebookEntityRef },
) => Effect.Effect<
  StructuralResult,
  DraftStructureError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.removeCodebookEntity')(function* (
  teamId: string,
  params: { draftId: string; ref: CodebookEntityRef },
) {
  const id = yield* entitySectionId(params.ref);
  const head = yield* lockDraftHead(teamId, params.draftId);
  if (head.sectionHashes[id] === undefined) {
    return yield* new DraftStructureError({
      reason: `no codebook section ${id} in draft`,
    });
  }
  yield* fenceDraftLeases(teamId, params.draftId, [id]);
  return yield* advanceDraftManifest(teamId, params.draftId, head, {}, [id]);
});
