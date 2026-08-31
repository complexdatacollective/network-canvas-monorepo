import type pg from 'pg';

import { VariableNameSchema } from '@codaco/shared-consts';
import {
  type SectionDoc,
  contentHash,
  manifestHash,
} from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
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
  teamId: string,
  draftId: string,
): Promise<HeadState> {
  const locked = await client.query(
    `SELECT head_seq, head_manifest_hash FROM drafts
     WHERE id = $1 AND team_id = $2 FOR UPDATE`,
    [draftId, teamId],
  );
  const draft = locked.rows[0] as
    | { head_seq: string; head_manifest_hash: string }
    | undefined;
  if (draft === undefined) {
    throw new DraftStructureError(`no draft ${draftId}`);
  }
  const head = await client.query(
    `SELECT section_hashes FROM manifests
     WHERE draft_id = $1 AND seq = $2 AND team_id = $3`,
    [draftId, draft.head_seq, teamId],
  );
  const row = head.rows[0] as
    | { section_hashes: Record<string, string> }
    | undefined;
  if (row === undefined) {
    throw new DraftStructureError(
      `draft ${draftId} has no manifest at seq ${draft.head_seq}`,
    );
  }
  return {
    headSeq: BigInt(draft.head_seq),
    headManifestHash: draft.head_manifest_hash,
    sectionHashes: { ...row.section_hashes },
  };
}

async function loadDoc(
  client: pg.PoolClient,
  teamId: string,
  hash: string,
): Promise<SectionDoc> {
  const res = await client.query(
    `SELECT doc FROM sections WHERE team_id = $1 AND hash = $2`,
    [teamId, hash],
  );
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
  teamId: string,
  draftId: string,
  sectionIds: string[],
): Promise<void> {
  await client.query(
    `UPDATE leases SET epoch = epoch + 1, expires_at = clock_timestamp()
     WHERE draft_id = $1 AND section_id = ANY($2) AND team_id = $3`,
    [draftId, sectionIds, teamId],
  );
}

async function advanceManifest(
  client: pg.PoolClient,
  teamId: string,
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
      `INSERT INTO sections (team_id, hash, doc) VALUES ($1, $2, $3)
       ON CONFLICT (team_id, hash) DO UPDATE
       SET created_at = clock_timestamp(), unreferenced_at = NULL`,
      [teamId, hash, doc],
    );
  }
  const newSeq = head.headSeq + 1n;
  const newManifestHash = manifestHash(sectionHashes, head.headManifestHash);
  await client.query(
    `INSERT INTO manifests (draft_id, team_id, seq, hash, parent_hash, section_hashes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      draftId,
      teamId,
      String(newSeq),
      newManifestHash,
      head.headManifestHash,
      sectionHashes,
    ],
  );
  await client.query(
    `UPDATE drafts SET head_seq = $2, head_manifest_hash = $3
     WHERE id = $1 AND team_id = $4`,
    [draftId, String(newSeq), newManifestHash, teamId],
  );
  return { manifestSeq: newSeq, manifestHash: newManifestHash };
}

export async function addStage(
  db: TenantDb,
  params: { draftId: string; stage: SectionDoc; index?: number },
  client?: pg.PoolClient,
): Promise<StructuralResult> {
  const stageId = params.stage.id;
  if (typeof stageId !== 'string' || stageId === '') {
    throw new DraftStructureError('stage document has no id');
  }
  const id = sectionId({ kind: 'stage', stageId });
  assertSectionValid(id, params.stage);

  const teamId = db.teamId;
  const add = async (transactionClient: pg.PoolClient) => {
    const head = await lockHead(transactionClient, teamId, params.draftId);
    if (head.sectionHashes[id] !== undefined) {
      throw new DraftStructureError(`stage ${stageId} already exists`);
    }
    const orderId = sectionId({ kind: 'stageOrder' });
    const orderHash = head.sectionHashes[orderId];
    if (orderHash === undefined) {
      throw new DraftStructureError('draft has no stageOrder section');
    }
    const order = stageOrderOf(
      await loadDoc(transactionClient, teamId, orderHash),
    );
    const index = params.index ?? order.length;
    if (!Number.isInteger(index) || index < 0 || index > order.length) {
      throw new DraftStructureError(`stage index ${index} out of range`);
    }
    const newOrder = [...order];
    newOrder.splice(index, 0, stageId);
    await fenceLeases(transactionClient, teamId, params.draftId, [orderId, id]);
    return advanceManifest(
      transactionClient,
      teamId,
      params.draftId,
      head,
      { [id]: params.stage, [orderId]: { stages: newOrder } },
      [],
    );
  };
  if (client !== undefined) return add(client);
  return runNoAuditTenantTransaction(db, 'protocol.addStage', add);
}

export async function removeStage(
  db: TenantDb,
  params: { draftId: string; stageId: string },
): Promise<StructuralResult> {
  const id = sectionId({ kind: 'stage', stageId: params.stageId });
  const teamId = db.teamId;
  return runNoAuditTenantTransaction(
    db,
    'protocol.removeStage',
    async (client) => {
      const head = await lockHead(client, teamId, params.draftId);
      if (head.sectionHashes[id] === undefined) {
        throw new DraftStructureError(`no stage ${params.stageId} in draft`);
      }
      const orderId = sectionId({ kind: 'stageOrder' });
      const orderHash = head.sectionHashes[orderId];
      if (orderHash === undefined) {
        throw new DraftStructureError('draft has no stageOrder section');
      }
      const order = stageOrderOf(await loadDoc(client, teamId, orderHash));
      const newOrder = order.filter((entry) => entry !== params.stageId);
      await fenceLeases(client, teamId, params.draftId, [orderId, id]);
      return advanceManifest(
        client,
        teamId,
        params.draftId,
        head,
        { [orderId]: { stages: newOrder } },
        [id],
      );
    },
  );
}

export async function moveStage(
  db: TenantDb,
  params: {
    draftId: string;
    stageId: string;
    toIndex: number;
    expectedRevision: bigint;
  },
  client?: pg.PoolClient,
): Promise<StructuralResult> {
  const teamId = db.teamId;
  const move = async (transactionClient: pg.PoolClient) => {
    const head = await lockHead(transactionClient, teamId, params.draftId);
    if (head.headSeq !== params.expectedRevision) {
      throw new DraftStructureError(
        `draft changed from revision ${params.expectedRevision} to ${head.headSeq}`,
      );
    }
    const orderId = sectionId({ kind: 'stageOrder' });
    const orderHash = head.sectionHashes[orderId];
    if (orderHash === undefined) {
      throw new DraftStructureError('draft has no stageOrder section');
    }
    const order = stageOrderOf(
      await loadDoc(transactionClient, teamId, orderHash),
    );
    const fromIndex = order.indexOf(params.stageId);
    if (fromIndex === -1) {
      throw new DraftStructureError(`no stage ${params.stageId} in draft`);
    }
    if (params.toIndex < 0 || params.toIndex >= order.length) {
      throw new DraftStructureError(
        `stage index ${params.toIndex} out of range`,
      );
    }
    if (fromIndex === params.toIndex) {
      return {
        manifestSeq: head.headSeq,
        manifestHash: head.headManifestHash,
      };
    }
    const newOrder = [...order];
    const [stageId] = newOrder.splice(fromIndex, 1);
    if (stageId === undefined) {
      throw new DraftStructureError(`no stage ${params.stageId} in draft`);
    }
    newOrder.splice(params.toIndex, 0, stageId);
    await fenceLeases(transactionClient, teamId, params.draftId, [orderId]);
    return advanceManifest(
      transactionClient,
      teamId,
      params.draftId,
      head,
      { [orderId]: { stages: newOrder } },
      [],
    );
  };
  if (client !== undefined) return move(client);
  return runNoAuditTenantTransaction(db, 'protocol.moveStage', move);
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
  db: TenantDb,
  params: {
    draftId: string;
    ref: CodebookEntityRef;
    definition: SectionDoc;
  },
): Promise<StructuralResult> {
  const id = entitySectionId(params.ref);
  assertSectionValid(id, params.definition);
  const teamId = db.teamId;
  return runNoAuditTenantTransaction(
    db,
    'protocol.addCodebookEntity',
    async (client) => {
      const head = await lockHead(client, teamId, params.draftId);
      if (head.sectionHashes[id] !== undefined) {
        throw new DraftStructureError(`codebook section ${id} already exists`);
      }
      await fenceLeases(client, teamId, params.draftId, [id]);
      return advanceManifest(
        client,
        teamId,
        params.draftId,
        head,
        { [id]: params.definition },
        [],
      );
    },
  );
}

export async function removeCodebookEntity(
  db: TenantDb,
  params: { draftId: string; ref: CodebookEntityRef },
): Promise<StructuralResult> {
  const id = entitySectionId(params.ref);
  const teamId = db.teamId;
  return runNoAuditTenantTransaction(
    db,
    'protocol.removeCodebookEntity',
    async (client) => {
      const head = await lockHead(client, teamId, params.draftId);
      if (head.sectionHashes[id] === undefined) {
        throw new DraftStructureError(`no codebook section ${id} in draft`);
      }
      await fenceLeases(client, teamId, params.draftId, [id]);
      return advanceManifest(client, teamId, params.draftId, head, {}, [id]);
    },
  );
}
