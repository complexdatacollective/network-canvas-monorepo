import { and, eq, inArray, sql } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import {
  findTimelineStructureProblems,
  isFinishSessionStage,
} from '@codaco/protocol-validation';
import { CodebookIdSchema } from '@codaco/shared-consts';
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

export class DraftStructureError extends Schema.TaggedError<DraftStructureError>()(
  'DraftStructureError',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

export class DraftRevisionConflict extends Schema.TaggedError<DraftRevisionConflict>()(
  'DraftRevisionConflict',
  { expected: Schema.String, current: Schema.String },
) {
  override get message(): string {
    return `draft changed from revision ${this.expected} to ${this.current}`;
  }
}

export type StructuralResult = { manifestSeq: bigint; manifestHash: string };

export type HeadState = {
  headSeq: bigint;
  headManifestHash: string;
  sectionHashes: Record<string, string>;
};

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
    headSeq: draft.headSeq,
    headManifestHash: draft.headManifestHash,
    sectionHashes: { ...row.sectionHashes },
  };
}, sqlErrorsOnlyBeside);

export const loadDoc: (
  teamId: string,
  hash: string,
) => Effect.Effect<
  SectionDoc,
  DraftStructureError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.loadDoc')(function* (
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

type TimelineStage = Readonly<{ type: string }>;

export const timelineStageOf = (
  doc: SectionDoc | undefined,
): TimelineStage => ({
  type: typeof doc?.type === 'string' ? doc.type : '',
});

/**
 * The type of each stage the order names, in the order's order: what the
 * timeline's structural rules read. One query for the whole order; a stage the
 * manifest does not hold reads as a stage of no type, which none of the rules
 * mistake for a finish stage.
 */
export const loadStageTypes: (
  teamId: string,
  head: HeadState,
  order: readonly string[],
) => Effect.Effect<TimelineStage[], SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.loadStageTypes',
)(function* (teamId: string, head: HeadState, order: readonly string[]) {
  const hashes = order.flatMap((stageId) => {
    const hash = head.sectionHashes[sectionId({ kind: 'stage', stageId })];
    return hash === undefined ? [] : [hash];
  });
  if (hashes.length === 0) return order.map(() => timelineStageOf(undefined));
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ hash: sections.hash, doc: sections.doc })
    .from(sections)
    .where(and(eq(sections.teamId, teamId), inArray(sections.hash, hashes)));
  const byHash = new Map(rows.map((row) => [row.hash, row.doc]));
  return order.map((stageId) => {
    const hash = head.sectionHashes[sectionId({ kind: 'stage', stageId })];
    return timelineStageOf(hash === undefined ? undefined : byHash.get(hash));
  });
}, sqlErrorsOnly);

/**
 * Where a stage being created goes, following Architect's rule: a stage that
 * is not itself a finish stage is never put after a finish stage, where no
 * participant could reach it, so a position at or past the first finish stage
 * — or no position at all — puts it just before that stage. A finish stage
 * goes at the end; a draft that already has one gets no second
 * (`addsSecondFinishStage`).
 */
export const creationIndex = (
  stages: readonly TimelineStage[],
  stage: TimelineStage,
  requested: number,
): number => {
  if (isFinishSessionStage(stage)) return stages.length;
  const firstFinish = stages.findIndex(isFinishSessionStage);
  return firstFinish === -1 ? requested : Math.min(requested, firstFinish);
};

/** Whether creating `stage` would give the protocol a second finish stage:
 * a protocol has exactly one. */
export const addsSecondFinishStage = (
  stages: readonly TimelineStage[],
  stage: TimelineStage,
): boolean => isFinishSessionStage(stage) && stages.some(isFinishSessionStage);

/**
 * Whether rewriting a stage as `after` turns a finish stage into another kind
 * of stage, or another kind into a finish stage. Either breaks the timeline: the
 * first leaves the interview no finish stage to end at, the second gives the
 * protocol a second one, or puts one where stages still follow it. A stage
 * keeps the kind it was created as.
 */
export const changesFinishStage = (
  before: TimelineStage,
  after: TimelineStage,
): boolean => isFinishSessionStage(before) !== isFinishSessionStage(after);

/**
 * Whether removing this stage would leave the interview with no finish stage
 * to end at. The last finish stage cannot be removed; a protocol that holds
 * more than one may lose the others.
 */
export const isLastFinishStage = (
  order: readonly string[],
  stages: readonly TimelineStage[],
  stageId: string,
): boolean => {
  const finishIds = order.filter((_, index) =>
    isFinishSessionStage(stages[index]),
  );
  return finishIds.length === 1 && finishIds[0] === stageId;
};

/**
 * Whether a reorder adds a problem to the timeline's structure: a stage after
 * the finish stage, or the interview ending anywhere else. Only problems it
 * ADDS refuse it, so a draft already in such a shape can still be reordered
 * into a better one.
 */
const reorderAddsTimelineProblems = (
  current: readonly TimelineStage[],
  proposed: readonly TimelineStage[],
): boolean =>
  findTimelineStructureProblems(proposed).length >
  findTimelineStructureProblems(current).length;

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
// commits race the expiry check.
export const fenceDraftLeases: (
  teamId: string,
  draftId: string,
  sectionIds: string[],
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.fenceDraftLeases',
)(function* (teamId: string, draftId: string, sectionIds: string[]) {
  // `IN ()` is not a statement Postgres has.
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
    .returning({ sectionId: leases.sectionId });
}, sqlErrorsOnly);

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
    createdAt?: Date,
  ) {
    const { tx } = yield* Transaction;
    const written = createdAt ?? sql`clock_timestamp()`;
    const sectionHashes = { ...head.sectionHashes };
    for (const id of removedSectionIds) {
      delete sectionHashes[id];
    }
    // One upsert per document: two sections of one revision may hold the same
    // document.
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
  const requested = params.index ?? order.length;
  if (
    !Number.isInteger(requested) ||
    requested < 0 ||
    requested > order.length
  ) {
    return yield* new DraftStructureError({
      reason: `stage index ${requested} out of range`,
    });
  }
  const types = yield* loadStageTypes(teamId, head, order);
  const created = timelineStageOf(params.stage);
  if (addsSecondFinishStage(types, created)) {
    return yield* new DraftStructureError({
      reason: 'a protocol has exactly one finish stage, and this draft has one',
    });
  }
  const index = creationIndex(types, created, requested);
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
  if (
    isLastFinishStage(
      order,
      yield* loadStageTypes(teamId, head, order),
      params.stageId,
    )
  ) {
    return yield* new DraftStructureError({
      reason: `stage ${params.stageId} is the only finish stage, and the interview has to end at one`,
    });
  }
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
  DraftStructureError | DraftRevisionConflict | SqlError.SqlError,
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
    return yield* new DraftRevisionConflict({
      expected: String(params.expectedRevision),
      current: String(head.headSeq),
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
  const types = yield* loadStageTypes(teamId, head, order);
  const typeOf = new Map(order.map((entry, index) => [entry, types[index]]));
  if (
    reorderAddsTimelineProblems(
      types,
      newOrder.map((entry) => typeOf.get(entry) ?? timelineStageOf(undefined)),
    )
  ) {
    return yield* new DraftStructureError({
      reason: `moving stage ${params.stageId} to index ${params.toIndex} would leave a stage after the finish stage, or the interview ending without one`,
    });
  }
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
  if (!CodebookIdSchema.safeParse(ref.typeId).success) {
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
