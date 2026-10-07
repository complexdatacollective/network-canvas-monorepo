// The rows behind a protocol-builder edit's staged resources, which outlive
// the replica a file was staged on: any replica can promote, inspect or
// discard what another staged. A staged file's bytes are in the object store
// under a staging key minted here; a staged secret is sealed into its row.
//
// Every statement runs in the caller's transaction, and every span carries
// `sqlErrorsOnly`: the drizzle wrapper interpolates bind parameters, here
// sealed ciphertext, into its message.
import { randomUUID } from 'node:crypto';

import { and, asc, eq, gt, inArray, notExists, or, sql } from 'drizzle-orm';
import { Effect, Option } from 'effect';

import type { ResourceDescriptor } from '@codaco/protocol-builder-core/contract/schemas';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import type { SecretsCipherApi } from '../secrets/cipher.ts';
import { StagingKey, stagingPrefix } from '../storage/object-store.ts';
import { PROTOCOL_BUILDER_TABLES } from './schema.ts';

const { protocolStagedResources: staged, protocolConnections: connections } =
  PROTOCOL_BUILDER_TABLES;

const CLOCK = sql`clock_timestamp()`;

export function mintStagingKey(teamId: string): StagingKey {
  return StagingKey(`${stagingPrefix(teamId)}${randomUUID()}`);
}

/** One edit of one tab on one draft: the boundary staging never crosses. */
export type StagingScope = {
  readonly teamId: string;
  readonly draftId: string;
  readonly owner: string;
  readonly editId: string;
};

export type StagedRow = {
  readonly resourceId: string;
  readonly descriptor: ResourceDescriptor;
  readonly objectKey: StagingKey | undefined;
  readonly contentHash: string | null;
  readonly contentType: string | null;
  /** Opens the row's secret; undefined for a staged file. */
  readonly secret: ((cipher: SecretsCipherApi) => string) | undefined;
};

type StoredStagedRow = {
  resourceId: string;
  descriptor: ResourceDescriptor;
  objectKey: string | null;
  contentHash: string | null;
  contentType: string | null;
  secretCiphertext: Buffer | null;
  secretKeyId: string | null;
};

const COLUMNS = {
  resourceId: staged.resourceId,
  descriptor: staged.descriptor,
  objectKey: staged.objectKey,
  contentHash: staged.contentHash,
  contentType: staged.contentType,
  secretCiphertext: staged.secretCiphertext,
  secretKeyId: staged.secretKeyId,
};

function asStagedRow(
  scope: Omit<StagingScope, 'editId'>,
  row: StoredStagedRow,
): StagedRow {
  const { secretCiphertext: ciphertext, secretKeyId: keyId } = row;
  return {
    resourceId: row.resourceId,
    descriptor: row.descriptor,
    objectKey:
      row.objectKey === null
        ? undefined
        : Option.getOrUndefined(StagingKey.option(row.objectKey)),
    contentHash: row.contentHash,
    contentType: row.contentType,
    secret:
      ciphertext === null || keyId === null
        ? undefined
        : (cipher) =>
            cipher.openStagedSecret(
              {
                teamId: scope.teamId,
                draftId: scope.draftId,
                owner: scope.owner,
                resourceId: row.resourceId,
              },
              { ciphertext, keyId },
            ),
  };
}

const inEdit = (scope: StagingScope) =>
  and(
    eq(staged.teamId, scope.teamId),
    eq(staged.draftId, scope.draftId),
    eq(staged.owner, scope.owner),
    eq(staged.editId, scope.editId),
  );

export const findStagedByRequest = Effect.fn(
  'protocolBuilder.findStagedByRequest',
)(function* (
  scope: StagingScope,
  kind: 'content' | 'secret',
  requestId: string,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select(COLUMNS)
    .from(staged)
    .where(
      and(
        inEdit(scope),
        eq(staged.kind, kind),
        eq(staged.requestId, requestId),
      ),
    );
  const row = rows[0];
  return row === undefined ? undefined : asStagedRow(scope, row);
}, sqlErrorsOnly);

export type StagedInsert =
  | {
      readonly kind: 'content';
      readonly descriptor: ResourceDescriptor;
      readonly objectKey: StagingKey;
      readonly contentHash: string;
      readonly byteLength: number;
      readonly contentType: string;
    }
  | {
      readonly kind: 'secret';
      readonly descriptor: ResourceDescriptor;
      readonly value: string;
    };

/**
 * False when another attempt with the same request id inserted first. A
 * secret is sealed here, so no caller can write one unsealed.
 */
export const insertStaged = Effect.fn('protocolBuilder.insertStaged')(
  function* (
    cipher: SecretsCipherApi,
    scope: StagingScope,
    requestId: string,
    input: StagedInsert,
  ) {
    const { tx } = yield* Transaction;
    const resourceId = input.descriptor.id;
    const common = {
      teamId: scope.teamId,
      draftId: scope.draftId,
      owner: scope.owner,
      editId: scope.editId,
      resourceId,
      requestId,
      kind: input.kind,
      descriptor: input.descriptor,
    };
    const values =
      input.kind === 'content'
        ? {
            ...common,
            objectKey: input.objectKey,
            contentHash: input.contentHash,
            byteLength: input.byteLength,
            contentType: input.contentType,
          }
        : (() => {
            const sealed = cipher.sealStagedSecret(
              {
                teamId: scope.teamId,
                draftId: scope.draftId,
                owner: scope.owner,
                resourceId,
              },
              input.value,
            );
            return {
              ...common,
              secretCiphertext: sealed.ciphertext,
              secretKeyId: sealed.keyId,
            };
          })();
    const inserted = yield* tx
      .insert(staged)
      .values(values)
      .onConflictDoNothing({
        target: [
          staged.draftId,
          staged.owner,
          staged.editId,
          staged.kind,
          staged.requestId,
        ],
      })
      .returning({ resourceId: staged.resourceId });
    return inserted.length > 0;
  },
  sqlErrorsOnly,
);

export const stagedRows = Effect.fn('protocolBuilder.stagedRows')(function* (
  scope: StagingScope,
  resourceIds?: ReadonlyArray<string>,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select(COLUMNS)
    .from(staged)
    .where(
      and(
        inEdit(scope),
        resourceIds === undefined
          ? undefined
          : inArray(staged.resourceId, [...resourceIds]),
      ),
    )
    .orderBy(asc(staged.createdAt), asc(staged.resourceId));
  return rows.map((row) => asStagedRow(scope, row));
}, sqlErrorsOnly);

/**
 * Every row the owner staged on the draft, in any edit, unless one of its
 * sockets is live again on some replica.
 */
export const releasableRows = Effect.fn('protocolBuilder.releasableRows')(
  function* (scope: Omit<StagingScope, 'editId'>) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({ ...COLUMNS, editId: staged.editId })
      .from(staged)
      .where(
        and(
          eq(staged.teamId, scope.teamId),
          eq(staged.draftId, scope.draftId),
          eq(staged.owner, scope.owner),
          notExists(
            tx
              .select({ connectionId: connections.connectionId })
              .from(connections)
              .where(
                and(
                  eq(connections.teamId, scope.teamId),
                  eq(connections.draftId, scope.draftId),
                  eq(connections.owner, scope.owner),
                  eq(connections.kind, 'socket'),
                  gt(connections.expiresAt, CLOCK),
                ),
              ),
          ),
        ),
      );
    return rows.map((row) => ({
      editId: row.editId,
      ...asStagedRow(scope, row),
    }));
  },
  sqlErrorsOnly,
);

/**
 * Deletes the named rows, all in one edit or each with its own. The rows a
 * promotion consumes are deleted by `consumeStaged` instead.
 */
export const deleteStagedRows = Effect.fn('protocolBuilder.deleteStagedRows')(
  function* (
    scope: Omit<StagingScope, 'editId'>,
    rows: ReadonlyArray<{ editId: string; resourceId: string }>,
  ) {
    if (rows.length === 0) return 0;
    const { tx } = yield* Transaction;
    const deleted = yield* tx
      .delete(staged)
      .where(
        and(
          eq(staged.teamId, scope.teamId),
          eq(staged.draftId, scope.draftId),
          eq(staged.owner, scope.owner),
          or(
            ...rows.map((row) =>
              and(
                eq(staged.editId, row.editId),
                eq(staged.resourceId, row.resourceId),
              ),
            ),
          ),
        ),
      )
      .returning({ resourceId: staged.resourceId });
    return deleted.length;
  },
  sqlErrorsOnly,
);

export type Consumed =
  | { readonly status: 'consumed'; readonly objectKeys: StagingKey[] }
  | { readonly status: 'gone'; readonly resourceId: string };

/**
 * Takes a promotion's rows inside the write that promotes them, under the
 * draft head that write holds: every named row, or none when one is gone —
 * discarded, released or collected since the promotion was planned — so the
 * write can refuse before it changes anything. The objects stay for the
 * caller to delete once the write has committed.
 */
export const consumeStaged = Effect.fn('protocolBuilder.consumeStaged')(
  function* (scope: StagingScope, resourceIds: ReadonlyArray<string>) {
    if (resourceIds.length === 0) {
      const none: Consumed = { status: 'consumed', objectKeys: [] };
      return none;
    }
    const { tx } = yield* Transaction;
    const held = yield* tx
      .select({ resourceId: staged.resourceId })
      .from(staged)
      .where(and(inEdit(scope), inArray(staged.resourceId, [...resourceIds])))
      .orderBy(asc(staged.resourceId))
      .for('update');
    const present = new Set(held.map((row) => row.resourceId));
    const missing = resourceIds.find((id) => !present.has(id));
    if (missing !== undefined) {
      const gone: Consumed = { status: 'gone', resourceId: missing };
      return gone;
    }
    const deleted = yield* tx
      .delete(staged)
      .where(and(inEdit(scope), inArray(staged.resourceId, [...resourceIds])))
      .returning({ objectKey: staged.objectKey });
    const consumed: Consumed = {
      status: 'consumed',
      objectKeys: deleted.flatMap((row) =>
        row.objectKey === null
          ? []
          : Option.toArray(StagingKey.option(row.objectKey)),
      ),
    };
    return consumed;
  },
  sqlErrorsOnly,
);
