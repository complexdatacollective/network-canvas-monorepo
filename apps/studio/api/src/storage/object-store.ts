import { createHash } from 'node:crypto';

import { Brand, Context, Effect, Option, Schema } from 'effect';

// The object store is a port with one implementation per storage platform
// (#2077): `./s3/` for every S3-compatible store and `./azure-blob/` for Azure
// Blob Storage. Nothing else in Studio sees a provider — routes, the protocol
// builder and readiness ask for `ObjectStore` — and each provider's SDK is
// imported by its own implementation alone, which
// src/__tests__/process-separation.test.ts holds.
//
// An implementation is an `ObjectBackend`: the SDK calls, as promises, and the
// provider's own not-found signal. Everything that must not differ by
// provider — the content hash, the key layout, put's existence check, what
// "absent" means, how a failure is wrapped, which keys are staging keys and how
// old a listed object is — is `fromBackend` below, so a provider cannot drift
// on it. An operation added to the port is added here
// and to every backend, and src/storage/__tests__/contract.ts gains a case for
// it in the same change.

export type StoredAsset = {
  hash: string;
  size: number;
  mediaType: string;
};

/** Bytes `start` to `end` inclusive; `end` left out runs to the last byte. */
export type ByteRange = {
  readonly start: number;
  readonly end: number | undefined;
};

/**
 * Which bytes `body` holds: the whole object, the satisfiable part of a range
 * asked for (`total` is the object's size), or none, when the range starts at
 * or past the last byte.
 */
export type StoredPart =
  | { readonly kind: 'whole' }
  | {
      readonly kind: 'range';
      readonly start: number;
      readonly end: number;
      readonly total: number;
    }
  | { readonly kind: 'unsatisfiable'; readonly total: number };

export type StoredObject = {
  readonly body: ReadableStream<Uint8Array>;
  readonly mediaType: string;
  readonly size: number | undefined;
  readonly part: StoredPart;
};

/**
 * Where a resource waits between being staged and being promoted into the
 * content-addressed `assets/` space: `staging/<teamId>/<uuid>`. Only
 * src/protocol-builder/staging-store.ts mints one; the store recognises one
 * when it lists, so a listing can never name an asset.
 */
export type StagingKey = string & Brand.Brand<'StagingKey'>;

export const StagingKey = Brand.make<StagingKey>((key) =>
  /^staging\/[^/]+\/[0-9a-f-]{36}$/.test(key),
);

/** The prefix every team's staging keys share. */
export const STAGING_ROOT = 'staging/';

export function stagingPrefix(teamId: string): string {
  return `${STAGING_ROOT}${teamId}/`;
}

export class ObjectStoreError extends Schema.TaggedError<ObjectStoreError>()(
  'ObjectStoreError',
  {
    operation: Schema.Literals(['put', 'get', 'head', 'delete', 'list']),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    if (this.cause instanceof Error) return this.cause.message;
    return typeof this.cause === 'string'
      ? this.cause
      : `object store ${this.operation} failed`;
  }
}

export class ObjectStore extends Context.Service<
  ObjectStore,
  {
    readonly configured: boolean;
    readonly put: (
      bytes: Uint8Array,
      mediaType: string,
    ) => Effect.Effect<StoredAsset, ObjectStoreError>;
    readonly get: (
      hash: string,
      range?: ByteRange,
    ) => Effect.Effect<Option.Option<StoredObject>, ObjectStoreError>;
    readonly head: Effect.Effect<void, ObjectStoreError>;
    readonly putStaged: (
      key: StagingKey,
      bytes: Uint8Array,
      mediaType: string,
    ) => Effect.Effect<void, ObjectStoreError>;
    readonly getStaged: (
      key: StagingKey,
    ) => Effect.Effect<Option.Option<Uint8Array>, ObjectStoreError>;
    /** Succeeds for a key that is already gone. */
    readonly deleteStaged: (
      key: StagingKey,
    ) => Effect.Effect<void, ObjectStoreError>;
    /** The staging keys under `prefix` last written before `olderThan`. */
    readonly listStaged: (
      prefix: string,
      olderThan: Date,
    ) => Effect.Effect<ReadonlyArray<StagingKey>, ObjectStoreError>;
    /**
     * Makes the staged object the asset `hash`, leaving the staged object in
     * place. An asset already stored under `hash` is kept as it is. False when
     * the staged object is gone.
     */
    readonly promoteStaged: (
      key: StagingKey,
      hash: string,
      mediaType: string,
    ) => Effect.Effect<boolean, ObjectStoreError>;
  }
>()('@studio/ObjectStore') {
  static readonly absent: ObjectStore['Service'] = ObjectStore.of({
    configured: false,
    put: () => Effect.die(new Error('no object store is configured')),
    get: () => Effect.die(new Error('no object store is configured')),
    head: Effect.die(new Error('no object store is configured')),
    putStaged: () => Effect.die(new Error('no object store is configured')),
    getStaged: () => Effect.die(new Error('no object store is configured')),
    deleteStaged: () => Effect.die(new Error('no object store is configured')),
    listStaged: () => Effect.die(new Error('no object store is configured')),
    promoteStaged: () => Effect.die(new Error('no object store is configured')),
  });
}

/**
 * Deletes a staged object for `operation`, warning rather than failing when
 * the store will not: an object left behind is unnamed, and the worker's
 * orphan sweep removes it. True when the object is gone.
 */
export const removeStaged = (
  store: ObjectStore['Service'],
  key: StagingKey,
  operation: string,
): Effect.Effect<boolean> =>
  store.deleteStaged(key).pipe(
    Effect.as(true),
    Effect.catchCause((cause) =>
      Effect.logWarning('Deleting a staged object failed', cause).pipe(
        Effect.annotateLogs({ key, operation }),
        Effect.as(false),
      ),
    ),
  );

/** How a provider's backend is built, beyond its environment. */
export type BackendOptions = {
  /**
   * The most objects one listing request asks for. Left to the provider but
   * in the contract tests, which make it small so a listing spans pages.
   */
  readonly listPageSize?: number;
};

/** What a stored object's metadata says, where the provider reported it. */
type ObjectMetadata = {
  readonly size: number | undefined;
  readonly mediaType: string | undefined;
};

/** One object a listing found. */
type ListedObject = {
  readonly key: string;
  readonly lastModified: Date | undefined;
};

/**
 * One provider's SDK calls. Each takes the signal Effect aborts when the
 * caller stops waiting, so an abandoned request ends rather than only being
 * ignored. `stat`, `read` and `copy` reject with whatever the SDK throws for a
 * missing object, and `isNotFound` says which rejections those are.
 */
export type ObjectBackend = {
  readonly stat: (key: string, signal: AbortSignal) => Promise<ObjectMetadata>;
  readonly write: (
    key: string,
    bytes: Uint8Array,
    mediaType: string,
    signal: AbortSignal,
  ) => Promise<unknown>;
  /** With `range`, the bytes `start` to `end` inclusive, both in bounds. */
  readonly read: (
    key: string,
    signal: AbortSignal,
    range?: { readonly start: number; readonly end: number },
  ) => Promise<
    ObjectMetadata & { readonly body: ReadableStream<Uint8Array> | undefined }
  >;
  /** Resolves for a key that does not exist. */
  readonly remove: (key: string, signal: AbortSignal) => Promise<unknown>;
  /** Every object under `prefix`, across all of the provider's pages. */
  readonly list: (
    prefix: string,
    signal: AbortSignal,
  ) => Promise<ReadonlyArray<ListedObject>>;
  /**
   * A copy made by the store itself, keeping the source's media type. A
   * provider without one has promotion read the object and write it back.
   */
  readonly copy?: (
    from: string,
    to: string,
    signal: AbortSignal,
  ) => Promise<unknown>;
  /** Whether the bucket or container exists and answers, for `/readyz`. */
  readonly probe: (signal: AbortSignal) => Promise<unknown>;
  readonly isNotFound: (error: unknown) => boolean;
};

function assetKey(hash: string): string {
  return `assets/${hash}`;
}

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const FALLBACK_MEDIA_TYPE = 'application/octet-stream';

export function fromBackend(backend: ObjectBackend): ObjectStore['Service'] {
  const request = <A>(
    operation: ObjectStoreError['operation'],
    send: (signal: AbortSignal) => Promise<A>,
  ): Effect.Effect<A, ObjectStoreError> =>
    Effect.tryPromise({
      try: send,
      catch: (cause) => new ObjectStoreError({ operation, cause }),
    });

  const unlessAbsent = <A>(
    operation: ObjectStoreError['operation'],
    send: (signal: AbortSignal) => Promise<A>,
  ): Effect.Effect<Option.Option<A>, ObjectStoreError> =>
    request(operation, (signal) =>
      send(signal).then(
        (found) => Option.some(found),
        (error: unknown) =>
          backend.isNotFound(error) ? Option.none<A>() : Promise.reject(error),
      ),
    );

  const readBytes = (key: string) =>
    Effect.map(
      unlessAbsent('get', (signal) =>
        backend
          .read(key, signal)
          .then(({ body }) =>
            body === undefined
              ? undefined
              : new Response(body).arrayBuffer().then((b) => new Uint8Array(b)),
          ),
      ),
      Option.flatMap(Option.fromUndefinedOr),
    );

  return ObjectStore.of({
    configured: true,
    put: Effect.fnUntraced(function* (bytes: Uint8Array, mediaType: string) {
      const hash = contentHash(bytes);
      const key = assetKey(hash);
      // Re-uploading identical bytes with a different media type must not
      // rewrite the object's metadata: cached copies live for a year.
      const existing = yield* unlessAbsent('put', (signal) =>
        backend.stat(key, signal),
      );
      if (Option.isSome(existing)) {
        return {
          hash,
          size: existing.value.size ?? bytes.byteLength,
          mediaType: existing.value.mediaType ?? mediaType,
        };
      }
      yield* request('put', (signal) =>
        backend.write(key, bytes, mediaType, signal),
      );
      return { hash, size: bytes.byteLength, mediaType };
    }),
    get: Effect.fnUntraced(function* (hash: string, range?: ByteRange) {
      const key = assetKey(hash);
      const whole = (found: Awaited<ReturnType<ObjectBackend['read']>>) =>
        found.body === undefined
          ? Option.none<StoredObject>()
          : Option.some<StoredObject>({
              body: found.body,
              mediaType: found.mediaType ?? FALLBACK_MEDIA_TYPE,
              size: found.size,
              part: { kind: 'whole' },
            });
      if (range === undefined) {
        return Option.flatMap(
          yield* unlessAbsent('get', (signal) => backend.read(key, signal)),
          whole,
        );
      }
      // The size first, from the metadata, so every provider bounds a range
      // the same way rather than by its own refusal.
      const stat = yield* unlessAbsent('get', (signal) =>
        backend.stat(key, signal),
      );
      if (Option.isNone(stat)) return Option.none();
      const total = stat.value.size;
      if (total === undefined) {
        return Option.flatMap(
          yield* unlessAbsent('get', (signal) => backend.read(key, signal)),
          whole,
        );
      }
      const mediaType = stat.value.mediaType ?? FALLBACK_MEDIA_TYPE;
      if (range.start >= total) {
        return Option.some<StoredObject>({
          body: new ReadableStream({ start: (c) => c.close() }),
          mediaType,
          size: 0,
          part: { kind: 'unsatisfiable', total },
        });
      }
      const end = Math.min(range.end ?? total - 1, total - 1);
      const found = yield* unlessAbsent('get', (signal) =>
        backend.read(key, signal, { start: range.start, end }),
      );
      if (Option.isNone(found) || found.value.body === undefined) {
        return Option.none();
      }
      return Option.some<StoredObject>({
        body: found.value.body,
        mediaType,
        size: end - range.start + 1,
        part: { kind: 'range', start: range.start, end, total },
      });
    }),
    head: Effect.asVoid(request('head', backend.probe)),
    putStaged: (key, bytes, mediaType) =>
      Effect.asVoid(
        request('put', (signal) =>
          backend.write(key, bytes, mediaType, signal),
        ),
      ),
    getStaged: readBytes,
    deleteStaged: (key) =>
      Effect.asVoid(
        unlessAbsent('delete', (signal) => backend.remove(key, signal)),
      ),
    listStaged: (prefix, olderThan) =>
      Effect.map(
        request('list', (signal) => backend.list(prefix, signal)),
        (listed) =>
          listed.flatMap(({ key, lastModified }) =>
            lastModified !== undefined &&
            lastModified.getTime() < olderThan.getTime() &&
            StagingKey.is(key)
              ? [key]
              : [],
          ),
      ),
    promoteStaged: Effect.fnUntraced(function* (
      key: StagingKey,
      hash: string,
      mediaType: string,
    ) {
      const target = assetKey(hash);
      const existing = yield* unlessAbsent('put', (signal) =>
        backend.stat(target, signal),
      );
      if (Option.isSome(existing)) return true;
      const { copy } = backend;
      if (copy !== undefined) {
        const copied = yield* unlessAbsent('put', (signal) =>
          copy(key, target, signal),
        );
        return Option.isSome(copied);
      }
      const bytes = yield* readBytes(key);
      if (Option.isNone(bytes)) return false;
      yield* request('put', (signal) =>
        backend.write(target, bytes.value, mediaType, signal),
      );
      return true;
    }),
  });
}
