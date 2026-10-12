// Protocol resources for the host contract: the asset manifest's entries and
// their bytes.
//
// A resource an edit imports is staged until that edit's submit promotes it,
// and a discarded stage leaves nothing behind, which is the property that
// made staging worth having. Staging is persistent and shared by every
// replica (staging-store.ts): a file's bytes wait in the object store under a
// staging key, a key's value is sealed into its row, and any replica can
// promote, inspect or discard what another staged. Only promotion writes the
// `assets/` space: the bytes are copied to their content hash, and their
// manifest entries land in the `assets` section as one revision whose
// transaction also deletes the staged rows.
import { randomUUID } from 'node:crypto';

import { Context, Effect, Exit, Layer, Option, Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import {
  ResourceKindSchema,
  type ResourceDescriptorSchema,
  type ResourceGatewayFailureSchema,
  type ResourceInspectionSchema,
  type ResourcePreviewSchema,
  type StageResourceInputSchema,
} from '@codaco/protocol-builder-core/contract/schemas';
import { MAX_UPLOAD_BYTES } from '@codaco/studio-contract/limits';
import type { Forbidden } from '@codaco/studio-contract/schema/errors';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { provideCaller } from '../audit/actor.ts';
import { noAuditTransaction } from '../audit/no-audit.ts';
import { Database } from '../db/client.ts';
import { requireProtocol } from '../rpc/team-scope.ts';
import {
  contentHash,
  ObjectStore,
  removeStaged,
  type StagingKey,
} from '../storage/object-store.ts';
import { sessionOwner, type ProtocolBuilderSession } from './host.ts';
import {
  deleteStagedRows,
  findStagedByRequest,
  insertStaged,
  mintStagingKey,
  releaseStaged,
  stagedRows,
  type StagedInsert,
  type StagingScope,
} from './staging-store.ts';

type Descriptor = typeof ResourceDescriptorSchema.Type;
type Failure = typeof ResourceGatewayFailureSchema.Type;
export type Inspection = typeof ResourceInspectionSchema.Type;
type Preview = typeof ResourcePreviewSchema.Type;
type StageRequest = (typeof StageResourceInputSchema.Type)['request'];
type ContentRequest = Extract<StageRequest, { kind: 'content' }>;

export type ResourceOutcome<TData> =
  | { status: 'ok'; data: TData }
  | { status: 'failed'; failure: Failure };

/** A discard has nothing to answer with, so its success is the status alone. */
type DiscardOutcome = { status: 'ok' } | { status: 'failed'; failure: Failure };

/** Manifest entries a promotion writes, and the descriptors it answers with. */
type PromotionPlan = {
  entries: Record<string, unknown>;
  promoted: Descriptor[];
};

/** One edit of one tab: what every staging call is confined to. */
type StagingEdit = {
  readonly session: ProtocolBuilderSession;
  readonly editId: string;
};

type StagingError = Forbidden | SqlError.SqlError;

const SHA256_HEX = /^[0-9a-f]{64}$/;
const FALLBACK_MEDIA_TYPE = 'application/octet-stream';
const UNREACHABLE = 'the object store could not be reached';
const NO_STORE = 'this deployment has no object storage configured';
const NOT_RECORDED = 'the staged resource could not be recorded';
const NO_BYTES = 'this host holds no bytes for that resource';
const NOT_STAGED = 'no such staged resource';

const decodeKind = Schema.decodeUnknownOption(ResourceKindSchema);

function failure(
  reason: Failure['reason'],
  message: string,
  resourceId?: string,
): ResourceOutcome<never> {
  return {
    status: 'failed',
    failure: {
      reason,
      message,
      retryable: reason === 'unavailable' || reason === 'promotion-failed',
      ...(resourceId === undefined ? {} : { resourceId }),
    },
  };
}

/**
 * What a write answers when a resource it was asked to promote stopped being
 * staged between its plan and its transaction.
 */
export function stagingGone(resourceId: string): Failure {
  return {
    reason: 'not-found',
    message: NOT_STAGED,
    retryable: false,
    resourceId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  );
}

/**
 * The stored name for promoted bytes: the content hash, keeping the original
 * extension so an exported protocol still names a file a reader recognises.
 * The manifest has nowhere else to put a hash, and `source` may carry no path
 * separators, so this is what lets a committed resource's bytes be found again
 * at `/storage/:hash`.
 */
function storedSource(hash: string, filename: string): string {
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot).toLowerCase() : '';
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? `${hash}${extension}` : hash;
}

function hashOfSource(source: string): string | undefined {
  const dot = source.indexOf('.');
  const hash = dot === -1 ? source : source.slice(0, dot);
  return SHA256_HEX.test(hash) ? hash : undefined;
}

function descriptorFromManifestEntry(
  id: string,
  entry: Record<string, unknown>,
): Descriptor | undefined {
  const kind = decodeKind(entry.type);
  if (Option.isNone(kind) || typeof entry.name !== 'string') return undefined;
  return {
    id,
    kind: kind.value,
    name: Redacted.make(entry.name),
    status: 'committed',
    ...(typeof entry.source === 'string'
      ? { source: Redacted.make(entry.source) }
      : {}),
  };
}

function contentDescriptor(id: string, request: ContentRequest): Descriptor {
  return {
    id,
    kind: request.contentKind,
    name: request.name,
    status: 'staged',
    source: request.source,
    byteLength: Redacted.value(request.bytes).byteLength,
    contentType: request.contentType,
  };
}

function refusedContent(request: ContentRequest) {
  const bytes = Redacted.value(request.bytes);
  if (bytes.byteLength === 0) {
    // An empty file promotes into a manifest entry an interview would try to
    // show: an image with no pixels, a roster with no network. The contract's
    // own host refuses it, and a picker that offers it here and nowhere else
    // would be Studio disagreeing with the contract it serves.
    return failure('invalid-content', 'that file is empty');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return failure(
      'too-large',
      `this deployment stores at most ${MAX_UPLOAD_BYTES} bytes per resource`,
    );
  }
  return undefined;
}

const scopeOf = ({ session, editId }: StagingEdit): StagingScope => ({
  teamId: session.access.teamId,
  draftId: session.draftId,
  owner: sessionOwner(session),
  editId,
});

export class StagedImports extends Context.Service<
  StagedImports,
  {
    /**
     * Idempotent in the request id, so an uncertain retry stages once.
     *
     * The kind is part of the key because the contract asks only that a
     * request id be stable across a retry of one intent, not that it be unique
     * across the pickers an editor has open: a secret answered with an earlier
     * upload's descriptor is a resource the submit cannot promote.
     */
    readonly stage: (
      edit: StagingEdit,
      requestId: string,
      request: StageRequest,
    ) => Effect.Effect<
      ResourceOutcome<{ descriptor: Descriptor }>,
      StagingError
    >;
    readonly descriptors: (
      edit: StagingEdit,
    ) => Effect.Effect<Descriptor[], StagingError>;
    /**
     * Copies each staged file to its content hash and returns the manifest
     * entries naming them. Writing those entries, and deleting the staged
     * rows, is the write's half (host.ts), so until it commits nothing here
     * is committed and the resources are still staged.
     */
    readonly plan: (
      edit: StagingEdit,
      resourceIds: readonly string[],
    ) => Effect.Effect<ResourceOutcome<PromotionPlan>, StagingError>;
    /** One staged resource, or every one the edit holds. */
    readonly discard: (
      edit: StagingEdit,
      resourceId: string | undefined,
    ) => Effect.Effect<DiscardOutcome, StagingError>;
    /** Undefined when the edit has staged no such resource. */
    readonly inspect: (
      edit: StagingEdit,
      resourceId: string,
    ) => Effect.Effect<ResourceOutcome<Inspection> | undefined, StagingError>;
    /**
     * A staged file's bytes, inlined: they are not in the `assets/` space yet,
     * so there is no immutable URL to give. Undefined when the edit has staged
     * no such resource.
     */
    readonly preview: (
      edit: StagingEdit,
      resourceId: string,
    ) => Effect.Effect<ResourceOutcome<Preview> | undefined, StagingError>;
    /**
     * Drops everything a tab staged on the draft once its reconnection never
     * came, in every edit it had open. Never fails: what it leaves behind, the
     * worker's collection takes.
     */
    readonly releaseOwner: (
      session: ProtocolBuilderSession,
    ) => Effect.Effect<void>;
    /**
     * Deletes the staged objects a committed promotion consumed. Never fails:
     * an object left behind is one the orphan sweep removes.
     */
    readonly removePromoted: (
      keys: ReadonlyArray<StagingKey>,
    ) => Effect.Effect<void>;
  }
>()('@studio/protocol-builder/StagedImports') {
  static readonly layer: Layer.Layer<
    StagedImports,
    never,
    Database | ObjectStore
  > = Layer.effect(
    StagedImports,
    Effect.gen(function* () {
      const database = yield* Database;
      const store = yield* ObjectStore;
      const withDatabase = <A, E>(effect: Effect.Effect<A, E, Database>) =>
        Effect.provideService(effect, Database, database);

      // Every staging call is decided on the role and grants locked in its
      // own transaction.
      const readRows = (
        { session, editId }: StagingEdit,
        resourceIds?: readonly string[],
      ) =>
        withDatabase(
          noAuditTransaction(
            'protocolBuilder.readStaged',
            session.access,
            Effect.andThen(
              requireProtocol(session.access, session.protocolId),
              stagedRows(scopeOf({ session, editId }), resourceIds),
            ).pipe(provideCaller(session.principal)),
          ),
        );

      /**
       * Deletes each row's object, then the rows whose object is gone, so a
       * row never outlives the only record of the object it names. True when
       * every row went.
       */
      const discardRows = Effect.fnUntraced(function* (
        edit: StagingEdit,
        rows: ReadonlyArray<{
          resourceId: string;
          objectKey: StagingKey | undefined;
        }>,
      ) {
        const removable: string[] = [];
        for (const row of rows) {
          if (
            row.objectKey !== undefined &&
            store.configured &&
            !(yield* removeStaged(store, row.objectKey, 'discard'))
          ) {
            continue;
          }
          removable.push(row.resourceId);
        }
        yield* withDatabase(
          noAuditTransaction(
            'protocolBuilder.discardStaged',
            edit.session.access,
            deleteStagedRows(scopeOf(edit), removable),
          ),
        );
        return removable.length === rows.length;
      });

      /**
       * The descriptor holding the request id: ours, or a racing twin's.
       * Undefined when a twin's row was gone again by the time it was read,
       * twice over.
       */
      const insertOrFind = (
        { session, editId }: StagingEdit,
        requestId: string,
        input: StagedInsert,
      ) =>
        withDatabase(
          noAuditTransaction(
            'protocolBuilder.stageResource',
            session.access,
            Effect.gen(function* () {
              yield* requireProtocol(session.access, session.protocolId);
              const scope = scopeOf({ session, editId });
              for (let attempt = 0; attempt < 2; attempt += 1) {
                const inserted = yield* insertStaged(
                  session.cipher,
                  scope,
                  requestId,
                  input,
                );
                if (inserted) return input.descriptor;
                // The conflicting row can be discarded or released between
                // the insert and this read; the insert is then asked again.
                const winner = yield* findStagedByRequest(
                  scope,
                  input.kind,
                  requestId,
                );
                if (winner !== undefined) return winner.descriptor;
              }
              return undefined;
            }).pipe(provideCaller(session.principal)),
          ),
        );

      /**
       * Whether a row names the object being staged. Its insert may have
       * committed though its answer never came, so after a failure or an
       * interruption there the row is looked for. When that read fails too
       * the object is kept: deleting one a row names would lose the bytes,
       * and one no row names is the orphan sweep's.
       */
      const namedByRow = (
        edit: StagingEdit,
        requestId: string,
        objectKey: StagingKey,
      ) =>
        withDatabase(
          noAuditTransaction(
            'protocolBuilder.readStaged',
            edit.session.access,
            findStagedByRequest(scopeOf(edit), 'content', requestId),
          ),
        ).pipe(
          Effect.map((row) => row?.objectKey === objectKey),
          Effect.orElseSucceed(() => true),
        );

      const stageContent = Effect.fnUntraced(function* (
        edit: StagingEdit,
        requestId: string,
        request: ContentRequest,
      ): Effect.fn.Return<
        ResourceOutcome<{ descriptor: Descriptor }>,
        StagingError
      > {
        if (!store.configured) return failure('unsupported-kind', NO_STORE);
        const objectKey = mintStagingKey(edit.session.access.teamId);
        const descriptor = contentDescriptor(randomUUID(), request);
        // How far the stage got, which decides what its exit does with the
        // object: an interrupted stage must not leave one behind either.
        let step: 'put' | 'insert' | 'named' | 'unnamed' = 'put';
        const settle = Effect.gen(function* () {
          if (step === 'named') return;
          if (
            step === 'insert' &&
            (yield* namedByRow(edit, requestId, objectKey))
          ) {
            return;
          }
          yield* removeStaged(store, objectKey, 'stage');
        });
        return yield* Effect.gen(function* () {
          const put = yield* Effect.exit(
            store.putStaged(
              objectKey,
              Redacted.value(request.bytes),
              request.contentType,
            ),
          );
          if (Exit.isFailure(put)) {
            step = 'unnamed';
            return failure('unavailable', UNREACHABLE);
          }
          step = 'insert';
          const winner = yield* insertOrFind(edit, requestId, {
            kind: 'content',
            descriptor,
            objectKey,
            contentHash: contentHash(Redacted.value(request.bytes)),
            byteLength: Redacted.value(request.bytes).byteLength,
            contentType: request.contentType,
          });
          step = winner?.id === descriptor.id ? 'named' : 'unnamed';
          if (winner === undefined) {
            return failure('unavailable', NOT_RECORDED);
          }
          const outcome: ResourceOutcome<{ descriptor: Descriptor }> = {
            status: 'ok',
            data: { descriptor: winner },
          };
          return outcome;
        }).pipe(Effect.onExit(() => settle));
      });

      return StagedImports.of({
        stage: Effect.fnUntraced(function* (edit, requestId, request) {
          const { session } = edit;
          const existing = yield* withDatabase(
            noAuditTransaction(
              'protocolBuilder.readStaged',
              session.access,
              Effect.andThen(
                requireProtocol(session.access, session.protocolId),
                findStagedByRequest(scopeOf(edit), request.kind, requestId),
              ).pipe(provideCaller(session.principal)),
            ),
          );
          if (existing !== undefined) {
            return { status: 'ok', data: { descriptor: existing.descriptor } };
          }
          if (request.kind === 'content') {
            return (
              refusedContent(request) ??
              (yield* stageContent(edit, requestId, request))
            );
          }
          const descriptor = yield* insertOrFind(edit, requestId, {
            kind: 'secret',
            descriptor: {
              id: randomUUID(),
              kind: 'apikey',
              name: request.name,
              status: 'staged',
            },
            value: request.value,
          });
          if (descriptor === undefined) {
            return failure('unavailable', NOT_RECORDED);
          }
          return { status: 'ok', data: { descriptor } };
        }),

        descriptors: (edit) =>
          Effect.map(readRows(edit), (rows) =>
            rows.map((row) => row.descriptor),
          ),

        plan: Effect.fnUntraced(function* (edit, resourceIds) {
          const rows = new Map(
            (yield* readRows(edit, resourceIds)).map((row) => [
              row.resourceId,
              row,
            ]),
          );
          const entries: Record<string, unknown> = {};
          const promoted: Descriptor[] = [];
          for (const resourceId of resourceIds) {
            const row = rows.get(resourceId);
            if (row === undefined) {
              return failure('not-found', NOT_STAGED, resourceId);
            }
            if (row.secret !== undefined) {
              entries[resourceId] = {
                name: Redacted.value(row.descriptor.name),
                type: 'apikey',
                value: Redacted.value(row.secret(edit.session.cipher)),
              };
              promoted.push({ ...row.descriptor, status: 'committed' });
              continue;
            }
            if (!store.configured) {
              return failure('unsupported-kind', NO_STORE, resourceId);
            }
            const { objectKey, contentHash: hash } = row;
            const filename = row.descriptor.source;
            if (
              objectKey === undefined ||
              hash === null ||
              filename === undefined
            ) {
              return failure(
                'invalid-content',
                'staged resource has no bytes',
                resourceId,
              );
            }
            // An unreachable object store gets the contract's retryable
            // failure rather than the generic error boundary.
            const copied = yield* Effect.exit(
              store.promoteStaged(
                objectKey,
                hash,
                row.contentType ?? FALLBACK_MEDIA_TYPE,
              ),
            );
            if (Exit.isFailure(copied)) {
              return failure('unavailable', UNREACHABLE, resourceId);
            }
            if (!copied.value) {
              return failure('not-found', NOT_STAGED, resourceId);
            }
            const source = storedSource(hash, Redacted.value(filename));
            entries[resourceId] = {
              name: Redacted.value(row.descriptor.name),
              type: row.descriptor.kind,
              source,
            };
            promoted.push({
              ...row.descriptor,
              status: 'committed',
              source: Redacted.make(source),
            });
          }
          return { status: 'ok', data: { entries, promoted } };
        }),

        discard: Effect.fnUntraced(function* (edit, resourceId) {
          const { session } = edit;
          const scope = scopeOf(edit);
          const rows = yield* withDatabase(
            noAuditTransaction(
              'protocolBuilder.discardStaged',
              session.access,
              Effect.andThen(
                requireProtocol(session.access, session.protocolId),
                stagedRows(
                  scope,
                  resourceId === undefined ? undefined : [resourceId],
                ),
              ).pipe(provideCaller(session.principal)),
            ),
          );
          if (resourceId !== undefined && rows.length === 0) {
            return failure('not-found', NOT_STAGED, resourceId);
          }
          const complete = yield* discardRows(edit, rows);
          return complete
            ? { status: 'ok' }
            : failure('unavailable', UNREACHABLE, resourceId);
        }),

        inspect: Effect.fnUntraced(function* (edit, resourceId) {
          const [row] = yield* readRows(edit, [resourceId]);
          if (row === undefined) return undefined;
          return {
            status: 'ok',
            data: {
              descriptor: row.descriptor,
              ...(row.secret === undefined
                ? {}
                : { value: row.secret(edit.session.cipher) }),
            },
          };
        }),

        preview: Effect.fnUntraced(function* (edit, resourceId) {
          const [row] = yield* readRows(edit, [resourceId]);
          if (row === undefined) return undefined;
          if (row.objectKey === undefined) {
            return failure('not-found', NO_BYTES, resourceId);
          }
          if (!store.configured) {
            return failure('unsupported-kind', NO_STORE, resourceId);
          }
          const bytes = yield* Effect.exit(store.getStaged(row.objectKey));
          if (Exit.isFailure(bytes)) {
            return failure('unavailable', UNREACHABLE, resourceId);
          }
          if (Option.isNone(bytes.value)) {
            return failure('not-found', NO_BYTES, resourceId);
          }
          const contentType = row.contentType ?? FALLBACK_MEDIA_TYPE;
          return {
            status: 'ok',
            data: {
              resourceId,
              url: Redacted.make(
                `data:${contentType};base64,${base64(bytes.value.value)}`,
              ),
            },
          };
        }),

        releaseOwner: (session) =>
          Effect.gen(function* () {
            const keys = yield* withDatabase(
              noAuditTransaction(
                'protocolBuilder.releaseStaged',
                session.access,
                releaseStaged({
                  teamId: session.access.teamId,
                  draftId: session.draftId,
                  owner: sessionOwner(session),
                }),
              ),
            );
            if (!store.configured) return;
            yield* Effect.forEach(
              keys,
              (key) => removeStaged(store, key, 'release'),
              { discard: true },
            );
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(
                'Releasing the staged resources of a tab that stayed away failed',
                cause,
              ),
            ),
          ),

        removePromoted: (keys) =>
          Effect.forEach(keys, (key) => removeStaged(store, key, 'promote'), {
            discard: true,
          }),
      });
    }),
  );
}

// What the protocol itself holds, which every caller may reach: a resource
// listed, inspected or previewed without naming an edit is a committed one,
// and an edit's staged imports are not the protocol's until a submit promotes
// them.

export function committedDescriptors(assets: SectionDoc): Descriptor[] {
  const descriptors: Descriptor[] = [];
  for (const [id, entry] of Object.entries(assets)) {
    if (!isRecord(entry)) continue;
    const descriptor = descriptorFromManifestEntry(id, entry);
    if (descriptor !== undefined) descriptors.push(descriptor);
  }
  return descriptors;
}

export function committedInspection(
  assets: SectionDoc,
  resourceId: string,
): ResourceOutcome<Inspection> {
  const descriptor = committedDescriptor(assets, resourceId);
  if (descriptor === undefined) {
    return failure('not-found', 'no such resource', resourceId);
  }
  // An API key's value is in the manifest — promotion put it there, and the
  // interview runtime reads it back from the published protocol to build the
  // same map the editor is previewing.
  const entry = assets[resourceId];
  const value =
    descriptor.kind === 'apikey' && isRecord(entry) ? entry.value : undefined;
  return {
    status: 'ok',
    data: {
      descriptor,
      ...(typeof value === 'string' ? { value: Redacted.make(value) } : {}),
    },
  };
}

export function committedPreview(
  assets: SectionDoc,
  resourceId: string,
): ResourceOutcome<Preview> {
  const descriptor = committedDescriptor(assets, resourceId);
  if (descriptor === undefined) {
    return failure('not-found', 'no such resource', resourceId);
  }
  const hash =
    descriptor.source === undefined
      ? undefined
      : hashOfSource(Redacted.value(descriptor.source));
  if (hash === undefined) return failure('not-found', NO_BYTES, resourceId);
  return {
    status: 'ok',
    data: { resourceId, url: Redacted.make(`/storage/${hash}`) },
  };
}

function committedDescriptor(
  assets: SectionDoc,
  resourceId: string,
): Descriptor | undefined {
  const entry = assets[resourceId];
  return isRecord(entry)
    ? descriptorFromManifestEntry(resourceId, entry)
    : undefined;
}
