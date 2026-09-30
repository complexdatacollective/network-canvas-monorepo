import { createHash } from 'node:crypto';

import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Context, Effect, Layer, Option, Schema } from 'effect';

import { Environment, type S3Env } from '../env.ts';

// Asset storage (#1246/#1278, 2026-08-11): content-addressed bytes in
// S3-compatible object storage — R2 managed, Garage self-hosted and in
// development (#1909). Objects are keyed by content hash, so retrieval is
// immutable-cacheable by construction. The key prefix gains a team scope when
// multi-tenancy lands (#1249) — cross-team dedup is deliberately not a goal
// (confidentiality boundary).
//
// Every request to the bucket is made with the abort signal of the fiber that
// asked for it. A caller that stops waiting — the readiness check's one-second
// bound is the one that matters — interrupts that fiber, and the interruption
// reaches the SDK as an abort, so the request is ended rather than left to
// retry and hold a socket once per probe for as long as the endpoint is
// unreachable.

const KEY_PREFIX = 'assets/';

/** What an upload stored: the name the bytes are known by, and their metadata. */
export type StoredAsset = {
  hash: string;
  size: number;
  mediaType: string;
};

/** A stored object on its way out: the bytes as a stream, and their metadata. */
export type StoredObject = {
  readonly body: ReadableStream<Uint8Array>;
  readonly mediaType: string;
  readonly size: number | undefined;
};

/**
 * The bucket did not answer. The message is the SDK's own, because it is what
 * `/readyz` reports as the object store's reason.
 */
export class ObjectStoreError extends Schema.TaggedError<ObjectStoreError>()(
  'ObjectStoreError',
  {
    operation: Schema.Literals(['put', 'get', 'head']),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'NoSuchKey' || error.name === 'NotFound')
  );
}

export class ObjectStore extends Context.Service<
  ObjectStore,
  {
    /**
     * False when the deployment names no bucket. Nothing below may be asked
     * then: the `/storage` routes answer 503, readiness omits the check, and
     * a content promotion is refused as unavailable — each surface says what
     * absence means for it rather than this store inventing one answer.
     */
    readonly configured: boolean;
    /**
     * Stores the bytes under their content hash. First write wins: the stored
     * representation (bytes AND metadata) is canonical and immutable.
     */
    readonly put: (
      bytes: Uint8Array,
      mediaType: string,
    ) => Effect.Effect<StoredAsset, ObjectStoreError>;
    /** The object a hash names, or none when nothing is stored under it. */
    readonly get: (
      hash: string,
    ) => Effect.Effect<Option.Option<StoredObject>, ObjectStoreError>;
    /**
     * Does the configured bucket answer, with these credentials? What
     * `/readyz` asks (#1897). Deliberately a bucket-level probe rather than a
     * read of some object, because there is no object every deployment is
     * known to hold.
     */
    readonly head: Effect.Effect<void, ObjectStoreError>;
  }
>()('@studio/ObjectStore') {
  /** The store over one bucket. */
  static readonly make = (env: S3Env): ObjectStore['Service'] => {
    const client = new S3Client({
      endpoint: env.endpoint,
      region: env.region,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
      forcePathStyle: true,
    });

    const request = <A>(
      operation: ObjectStoreError['operation'],
      send: (abortSignal: AbortSignal) => Promise<A>,
    ): Effect.Effect<A, ObjectStoreError> =>
      Effect.tryPromise({
        try: send,
        catch: (cause) => new ObjectStoreError({ operation, cause }),
      });

    return ObjectStore.of({
      configured: true,
      put: Effect.fnUntraced(function* (bytes: Uint8Array, mediaType: string) {
        const hash = createHash('sha256').update(bytes).digest('hex');
        const key = `${KEY_PREFIX}${hash}`;
        // Re-uploading identical bytes with a different media type must not
        // rewrite the object's metadata — cached copies of /storage/:hash live
        // for a year, and a changed type would make the same hash mean
        // different things to different clients.
        const existing = yield* request('put', (abortSignal) =>
          client
            .send(new HeadObjectCommand({ Bucket: env.bucket, Key: key }), {
              abortSignal,
            })
            .then(
              (found) => found,
              (error: unknown) =>
                isNotFound(error) ? undefined : Promise.reject(error),
            ),
        );
        if (existing !== undefined) {
          return {
            hash,
            size: existing.ContentLength ?? bytes.byteLength,
            mediaType: existing.ContentType ?? mediaType,
          };
        }
        yield* request('put', (abortSignal) =>
          client.send(
            new PutObjectCommand({
              Bucket: env.bucket,
              Key: key,
              Body: bytes,
              ContentType: mediaType,
              ContentLength: bytes.byteLength,
            }),
            { abortSignal },
          ),
        );
        return { hash, size: bytes.byteLength, mediaType };
      }),
      get: (hash) =>
        Effect.map(
          request('get', (abortSignal) =>
            client
              .send(
                new GetObjectCommand({
                  Bucket: env.bucket,
                  Key: `${KEY_PREFIX}${hash}`,
                }),
                { abortSignal },
              )
              .then(
                (found) => found,
                (error: unknown) =>
                  isNotFound(error) ? undefined : Promise.reject(error),
              ),
          ),
          (response) =>
            response?.Body === undefined
              ? Option.none()
              : Option.some({
                  body: response.Body.transformToWebStream(),
                  mediaType: response.ContentType ?? 'application/octet-stream',
                  size: response.ContentLength,
                }),
        ),
      head: Effect.asVoid(
        request('head', (abortSignal) =>
          client.send(new HeadBucketCommand({ Bucket: env.bucket }), {
            abortSignal,
          }),
        ),
      ),
    });
  };

  /**
   * No bucket. Its operations die rather than answer: every consumer reads
   * `configured` first, so reaching one is a wiring bug, not a refusal.
   */
  static readonly absent: ObjectStore['Service'] = ObjectStore.of({
    configured: false,
    put: () => Effect.die(new Error('no object store is configured')),
    get: () => Effect.die(new Error('no object store is configured')),
    head: Effect.die(new Error('no object store is configured')),
  });

  /** The bucket the environment names, or none. What the web program takes. */
  static readonly layer: Layer.Layer<ObjectStore, never, Environment> =
    Layer.effect(ObjectStore)(
      Effect.map(Environment, (env) =>
        env.s3 === undefined ? ObjectStore.absent : ObjectStore.make(env.s3),
      ),
    );
}
