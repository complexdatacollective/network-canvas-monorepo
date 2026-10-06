import { and, eq, notInArray, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import { sqlErrorsOnly } from '../db/errors.ts';
import { tenantTeamId, Transaction } from '../db/tenant.ts';
import {
  decodeAttributes,
  decodeSecureAttributes,
  type EdgeRow,
  edgeRow,
  type Network,
  type NodeRow,
  nodeRow,
} from './mapping.ts';
import { refreshSessionProjections } from './projections.ts';
import { NETWORK_TABLES } from './schema.ts';

const { edges, nodes, sessionSnapshots } = NETWORK_TABLES;

const ROWS_PER_STATEMENT = 500;

const chunks = <A>(rows: readonly A[]): A[][] => {
  const out: A[][] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_STATEMENT) {
    out.push(rows.slice(start, start + ROWS_PER_STATEMENT));
  }
  return out;
};

export const replaceSessionNetwork: (input: {
  readonly sessionId: string;
  readonly network: Pick<Network, 'nodes' | 'edges'>;
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'network.replaceSessionNetwork',
)(function* (input: {
  readonly sessionId: string;
  readonly network: Pick<Network, 'nodes' | 'edges'>;
}) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const nodeRows = input.network.nodes.map(nodeRow);
  const edgeRows = input.network.edges.map(edgeRow);
  const ofSession = (table: typeof nodes | typeof edges) =>
    and(eq(table.teamId, teamId), eq(table.sessionId, input.sessionId));

  const keptEdges = edgeRows.map((row) => row.edgeId);
  yield* tx
    .delete(edges)
    .where(
      keptEdges.length === 0
        ? ofSession(edges)
        : and(ofSession(edges), notInArray(edges.edgeId, keptEdges)),
    );
  const keptNodes = nodeRows.map((row) => row.nodeId);
  yield* tx
    .delete(nodes)
    .where(
      keptNodes.length === 0
        ? ofSession(nodes)
        : and(ofSession(nodes), notInArray(nodes.nodeId, keptNodes)),
    );

  for (const chunk of chunks(nodeRows)) {
    yield* tx
      .insert(nodes)
      .values(
        chunk.map((row) => ({
          teamId,
          sessionId: input.sessionId,
          nodeId: row.nodeId,
          type: row.type,
          attributes: row.attributes,
          secureAttributes: row.secureAttributes,
          stageId: row.stageId,
          promptIds: row.promptIds === null ? null : [...row.promptIds],
        })),
      )
      .onConflictDoUpdate({
        target: [nodes.sessionId, nodes.nodeId],
        set: {
          type: sql`excluded.type`,
          attributes: sql`excluded.attributes`,
          secureAttributes: sql`excluded.secure_attributes`,
          stageId: sql`excluded.stage_id`,
          promptIds: sql`excluded.prompt_ids`,
        },
      });
  }
  for (const chunk of chunks(edgeRows)) {
    yield* tx
      .insert(edges)
      .values(
        chunk.map((row) => ({
          teamId,
          sessionId: input.sessionId,
          edgeId: row.edgeId,
          type: row.type,
          fromNode: row.fromNode,
          toNode: row.toNode,
          attributes: row.attributes,
          secureAttributes: row.secureAttributes,
        })),
      )
      .onConflictDoUpdate({
        target: [edges.sessionId, edges.edgeId],
        set: {
          type: sql`excluded.type`,
          fromNode: sql`excluded.from_node`,
          toNode: sql`excluded.to_node`,
          attributes: sql`excluded.attributes`,
          secureAttributes: sql`excluded.secure_attributes`,
        },
      });
  }
  yield* refreshSessionProjections({ teamId, sessionId: input.sessionId });
}, sqlErrorsOnly);

export const refreshSessionNetworkProjections: (
  sessionId: string,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'network.refreshSessionNetworkProjections',
)(function* (sessionId: string) {
  const teamId = yield* tenantTeamId;
  yield* refreshSessionProjections({ teamId, sessionId });
});

export const readSessionNetwork: (
  sessionId: string,
) => Effect.Effect<
  { readonly nodes: NodeRow[]; readonly edges: EdgeRow[] },
  SqlError.SqlError,
  Transaction
> = Effect.fn('network.readSessionNetwork')(function* (sessionId: string) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const nodeRows = yield* tx
    .select()
    .from(nodes)
    .where(and(eq(nodes.teamId, teamId), eq(nodes.sessionId, sessionId)))
    .orderBy(nodes.nodeId);
  const edgeRows = yield* tx
    .select()
    .from(edges)
    .where(and(eq(edges.teamId, teamId), eq(edges.sessionId, sessionId)))
    .orderBy(edges.edgeId);
  return {
    nodes: nodeRows.map((row) => ({
      nodeId: row.nodeId,
      type: row.type,
      attributes: decodeAttributes(row.attributes),
      secureAttributes: decodeSecureAttributes(row.secureAttributes),
      stageId: row.stageId,
      promptIds: row.promptIds,
    })),
    edges: edgeRows.map((row) => ({
      edgeId: row.edgeId,
      type: row.type,
      fromNode: row.fromNode,
      toNode: row.toNode,
      attributes: decodeAttributes(row.attributes),
      secureAttributes: decodeSecureAttributes(row.secureAttributes),
    })),
  };
}, sqlErrorsOnly);

export const insertSessionSnapshot: (snapshot: {
  readonly sessionId: string;
  readonly studyId: string;
  readonly protocolVersionId: string;
  readonly schemaVersion: number;
  readonly payload: string;
  readonly payloadHash: string;
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'network.insertSessionSnapshot',
)(function* (snapshot: {
  readonly sessionId: string;
  readonly studyId: string;
  readonly protocolVersionId: string;
  readonly schemaVersion: number;
  readonly payload: string;
  readonly payloadHash: string;
}) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  yield* tx.insert(sessionSnapshots).values({
    sessionId: snapshot.sessionId,
    teamId,
    studyId: snapshot.studyId,
    protocolVersionId: snapshot.protocolVersionId,
    schemaVersion: snapshot.schemaVersion,
    payload: sql`${snapshot.payload}::jsonb`,
    payloadHash: snapshot.payloadHash,
  });
}, sqlErrorsOnly);
