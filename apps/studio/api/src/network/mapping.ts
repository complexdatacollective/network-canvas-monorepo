import { createHash } from 'node:crypto';

import { Schema } from 'effect';

import type { FinishOutcome } from '@codaco/protocol-validation';
import { canonicalize } from '@codaco/studio-sync/apply';

export const decodeAttributes = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Unknown),
);

export const decodeSecureAttributes = Schema.decodeUnknownSync(
  Schema.NullOr(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        iv: Schema.Array(Schema.Number),
        salt: Schema.optional(Schema.Array(Schema.Number)),
      }),
    ),
  ),
);

type SecureAttributes = Readonly<
  Record<
    string,
    { readonly iv: readonly number[]; readonly salt?: readonly number[] }
  >
>;

type Entity = {
  readonly _uid: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly _secureAttributes?: SecureAttributes | undefined;
};

export type NetworkNode = Entity & {
  readonly type: string;
  readonly stageId?: string | undefined;
  readonly promptIDs?: readonly string[] | undefined;
};

export type NetworkEdge = Entity & {
  readonly type: string;
  readonly from: string;
  readonly to: string;
};

export type Network = {
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly NetworkEdge[];
  readonly ego: Entity;
};

export type NodeRow = {
  readonly nodeId: string;
  readonly type: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly secureAttributes: SecureAttributes | null;
  readonly stageId: string | null;
  readonly promptIds: readonly string[] | null;
};

export type EdgeRow = {
  readonly edgeId: string;
  readonly type: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly secureAttributes: SecureAttributes | null;
};

export type EgoColumns = {
  readonly egoUid: string;
  readonly egoAttributes: Readonly<Record<string, unknown>>;
  readonly egoSecureAttributes: SecureAttributes | null;
};

export const nodeRow = (node: NetworkNode): NodeRow => ({
  nodeId: node._uid,
  type: node.type,
  attributes: node.attributes,
  secureAttributes: node._secureAttributes ?? null,
  stageId: node.stageId ?? null,
  promptIds: node.promptIDs ?? null,
});

export const edgeRow = (edge: NetworkEdge): EdgeRow => ({
  edgeId: edge._uid,
  type: edge.type,
  fromNode: edge.from,
  toNode: edge.to,
  attributes: edge.attributes,
  secureAttributes: edge._secureAttributes ?? null,
});

export const egoColumns = (ego: Entity): EgoColumns => ({
  egoUid: ego._uid,
  egoAttributes: ego.attributes,
  egoSecureAttributes: ego._secureAttributes ?? null,
});

export const networkFromRows = (rows: {
  readonly nodes: readonly NodeRow[];
  readonly edges: readonly EdgeRow[];
  readonly ego: EgoColumns;
}): Network => ({
  nodes: rows.nodes.map((row) => ({
    _uid: row.nodeId,
    type: row.type,
    attributes: row.attributes,
    ...(row.secureAttributes === null
      ? {}
      : { _secureAttributes: row.secureAttributes }),
    ...(row.stageId === null ? {} : { stageId: row.stageId }),
    ...(row.promptIds === null ? {} : { promptIDs: row.promptIds }),
  })),
  edges: rows.edges.map((row) => ({
    _uid: row.edgeId,
    type: row.type,
    from: row.fromNode,
    to: row.toNode,
    attributes: row.attributes,
    ...(row.secureAttributes === null
      ? {}
      : { _secureAttributes: row.secureAttributes }),
  })),
  ego: {
    _uid: rows.ego.egoUid,
    attributes: rows.ego.egoAttributes,
    ...(rows.ego.egoSecureAttributes === null
      ? {}
      : { _secureAttributes: rows.ego.egoSecureAttributes }),
  },
});

/**
 * Hashed in canonical form: jsonb does not keep key order, so the evidence
 * must be checkable from the payload as it is read back.
 */
export const snapshotPayload = (snapshot: {
  readonly network: Network;
  readonly stageMetadata: Readonly<Record<string, unknown>>;
  readonly currentStep: number;
  /** The finish stage the interview ended at, and that stage's outcome. */
  readonly finishStageId: string;
  readonly finishOutcome: FinishOutcome;
}): { readonly payload: string; readonly payloadHash: string } => {
  const payload = canonicalize(snapshot);
  return {
    payload,
    payloadHash: createHash('sha256').update(payload).digest('hex'),
  };
};
