import type pg from 'pg';

import { VariableNameSchema } from '@codaco/shared-consts';
import {
  type SectionDoc,
  contentHash,
  manifestHash,
} from '@codaco/studio-sync/apply';

import { sectionId } from './taxonomy.ts';
import { inTransaction } from './transaction.ts';
import { assertSectionValid } from './validate.ts';

export class DraftStructureError extends Error {}

export type StructuralResult = { manifestSeq: bigint; manifestHash: string };

type HeadState = {
  headSeq: bigint;
  headManifestHash: string;
  sectionHashes: Record<string, string>;
};

async function lockHead(
  client: pg.PoolClient,
  draftId: string,
): Promise<HeadState> {
  const head = await client.query(
    `SELECT d.head_seq, d.head_manifest_hash, m.section_hashes
     FROM drafts d
     JOIN manifests m ON m.draft_id = d.id AND m.seq = d.head_seq
     WHERE d.id = $1
     FOR UPDATE OF d`,
    [draftId],
  );
  const row = head.rows[0] as
    | {
        head_seq: string;
        head_manifest_hash: string;
        section_hashes: Record<string, string>;
      }
    | undefined;
  if (row === undefined) {
    throw new DraftStructureError(`no draft ${draftId}`);
  }
  return {
    headSeq: BigInt(row.head_seq),
    headManifestHash: row.head_manifest_hash,
    sectionHashes: { ...row.section_hashes },
  };
}

async function loadDoc(
  client: pg.PoolClient,
  hash: string,
): Promise<SectionDoc> {
  const res = await client.query(`SELECT doc FROM sections WHERE hash = $1`, [
    hash,
  ]);
  const row = res.rows[0] as { doc: SectionDoc } | undefined;
  if (row === undefined) {
    throw new DraftStructureError(`missing section document ${hash}`);
  }
  return row.doc;
}

function stageOrderOf(doc: SectionDoc): string[] {
  const order = doc.stages;
  if (
    !Array.isArray(order) ||
    order.some((entry) => typeof entry !== 'string')
  ) {
    throw new DraftStructureError('stageOrder section is not a list of ids');
  }
  return order as string[];
}

// Expiry AND an epoch bump: expiring alone would let the holder's queued
// commits race the expiry check, and a removed-then-re-added section would
// accept the old owner's stale edits.
async function fenceLeases(
  client: pg.PoolClient,
  draftId: string,
  sectionIds: string[],
): Promise<void> {
  await client.query(
    `UPDATE leases SET epoch = epoch + 1, expires_at = clock_timestamp()
     WHERE draft_id = $1 AND section_id = ANY($2)`,
    [draftId, sectionIds],
  );
}

async function advanceManifest(
  client: pg.PoolClient,
  draftId: string,
  head: HeadState,
  newSections: Record<string, SectionDoc>,
  removedSectionIds: string[],
): Promise<StructuralResult> {
  const sectionHashes = { ...head.sectionHashes };
  for (const id of removedSectionIds) {
    delete sectionHashes[id];
  }
  for (const [id, doc] of Object.entries(newSections)) {
    const hash = contentHash(doc);
    sectionHashes[id] = hash;
    await client.query(
      `INSERT INTO sections (hash, doc) VALUES ($1, $2)
       ON CONFLICT (hash) DO UPDATE SET created_at = clock_timestamp()`,
      [hash, doc],
    );
  }
  const newSeq = head.headSeq + 1n;
  const newManifestHash = manifestHash(sectionHashes, head.headManifestHash);
  await client.query(
    `INSERT INTO manifests (draft_id, seq, hash, parent_hash, section_hashes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      draftId,
      String(newSeq),
      newManifestHash,
      head.headManifestHash,
      sectionHashes,
    ],
  );
  await client.query(
    `UPDATE drafts SET head_seq = $2, head_manifest_hash = $3 WHERE id = $1`,
    [draftId, String(newSeq), newManifestHash],
  );
  return { manifestSeq: newSeq, manifestHash: newManifestHash };
}

export async function addStage(
  db: pg.Pool,
  params: { draftId: string; stage: SectionDoc; index?: number },
): Promise<StructuralResult> {
  const stageId = params.stage.id;
  if (typeof stageId !== 'string' || stageId === '') {
    throw new DraftStructureError('stage document has no id');
  }
  const id = sectionId({ kind: 'stage', stageId });
  assertSectionValid(id, params.stage);

  return inTransaction(db, async (client) => {
    const head = await lockHead(client, params.draftId);
    if (head.sectionHashes[id] !== undefined) {
      throw new DraftStructureError(`stage ${stageId} already exists`);
    }
    const orderId = sectionId({ kind: 'stageOrder' });
    const orderHash = head.sectionHashes[orderId];
    if (orderHash === undefined) {
      throw new DraftStructureError('draft has no stageOrder section');
    }
    const order = stageOrderOf(await loadDoc(client, orderHash));
    const index = params.index ?? order.length;
    if (!Number.isInteger(index) || index < 0 || index > order.length) {
      throw new DraftStructureError(`stage index ${index} out of range`);
    }
    const newOrder = [...order];
    newOrder.splice(index, 0, stageId);
    await fenceLeases(client, params.draftId, [orderId, id]);
    return advanceManifest(
      client,
      params.draftId,
      head,
      { [id]: params.stage, [orderId]: { stages: newOrder } },
      [],
    );
  });
}

export async function removeStage(
  db: pg.Pool,
  params: { draftId: string; stageId: string },
): Promise<StructuralResult> {
  const id = sectionId({ kind: 'stage', stageId: params.stageId });
  return inTransaction(db, async (client) => {
    const head = await lockHead(client, params.draftId);
    if (head.sectionHashes[id] === undefined) {
      throw new DraftStructureError(`no stage ${params.stageId} in draft`);
    }
    const orderId = sectionId({ kind: 'stageOrder' });
    const orderHash = head.sectionHashes[orderId];
    if (orderHash === undefined) {
      throw new DraftStructureError('draft has no stageOrder section');
    }
    const order = stageOrderOf(await loadDoc(client, orderHash));
    const newOrder = order.filter((entry) => entry !== params.stageId);
    await fenceLeases(client, params.draftId, [orderId, id]);
    return advanceManifest(
      client,
      params.draftId,
      head,
      { [orderId]: { stages: newOrder } },
      [id],
    );
  });
}

export type CodebookEntityRef =
  | { entity: 'node' | 'edge'; typeId: string }
  | { entity: 'ego' };

function entitySectionId(ref: CodebookEntityRef): string {
  if (ref.entity === 'ego') return sectionId({ kind: 'codebookEgo' });
  if (!VariableNameSchema.safeParse(ref.typeId).success) {
    throw new DraftStructureError(
      `codebook ${ref.entity} type id ${ref.typeId} is not a valid identifier`,
    );
  }
  return ref.entity === 'node'
    ? sectionId({ kind: 'codebookNode', typeId: ref.typeId })
    : sectionId({ kind: 'codebookEdge', typeId: ref.typeId });
}

export async function addCodebookEntity(
  db: pg.Pool,
  params: {
    draftId: string;
    ref: CodebookEntityRef;
    definition: SectionDoc;
  },
): Promise<StructuralResult> {
  const id = entitySectionId(params.ref);
  assertSectionValid(id, params.definition);
  return inTransaction(db, async (client) => {
    const head = await lockHead(client, params.draftId);
    if (head.sectionHashes[id] !== undefined) {
      throw new DraftStructureError(`codebook section ${id} already exists`);
    }
    await fenceLeases(client, params.draftId, [id]);
    return advanceManifest(
      client,
      params.draftId,
      head,
      { [id]: params.definition },
      [],
    );
  });
}

export async function removeCodebookEntity(
  db: pg.Pool,
  params: { draftId: string; ref: CodebookEntityRef },
): Promise<StructuralResult> {
  const id = entitySectionId(params.ref);
  return inTransaction(db, async (client) => {
    const head = await lockHead(client, params.draftId);
    if (head.sectionHashes[id] === undefined) {
      throw new DraftStructureError(`no codebook section ${id} in draft`);
    }
    await fenceLeases(client, params.draftId, [id]);
    return advanceManifest(client, params.draftId, head, {}, [id]);
  });
}
