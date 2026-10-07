import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';

import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Option } from 'effect';

import { CI } from '../../__tests__/support/env.ts';
import { readiness } from '../../http/health.ts';
import { mintStagingKey } from '../../protocol-builder/staging-store.ts';
import { type ObjectStore, stagingPrefix } from '../object-store.ts';

// The object-store contract (#2077): the cases every implementation of the
// port must pass, run once per provider by that provider's own suite —
// `../s3/__tests__/` against Garage and `../azure-blob/__tests__/` against
// Azurite. An operation added to the port gains its case here in the same
// change, so the providers cannot drift.

export type ContractSubject = {
  /** A store whose bucket or container exists. */
  readonly store: ObjectStore['Service'];
  /** The same credentials, naming a bucket or container that does not. */
  readonly missing: ObjectStore['Service'];
  /** The same store, asking for one object per listing page. */
  readonly paged: ObjectStore['Service'];
};

/**
 * On a developer's machine without the dev stack, the provider's cases skip;
 * on CI, where `dev:object-stores` starts both stores, an unreachable one is a
 * broken workflow and fails the run instead.
 */
export function unavailable(reason: string): undefined {
  if (CI) throw new Error(`the object-store contract cannot run: ${reason}`);
  return undefined;
}

export async function reachable(
  store: ObjectStore['Service'],
): Promise<boolean> {
  const exit = await Effect.runPromiseExit(
    Effect.timeout(store.head, '3 seconds'),
  );
  return Exit.isSuccess(exit);
}

/** Bytes no earlier run stored, so every case starts from an absent object. */
const freshBytes = (size: number): Uint8Array =>
  new Uint8Array(randomBytes(size));

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const drain = (body: ReadableStream<Uint8Array>) =>
  Effect.promise(async () => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) chunks.push(chunk);
    return {
      bytes: new Uint8Array(Buffer.concat(chunks)),
      chunks: chunks.length,
    };
  });

const silentEndpoint = Effect.acquireRelease(
  Effect.callback<{
    readonly origin: string;
    readonly accepted: () => number;
    readonly closed: () => number;
    readonly close: () => void;
  }>((resume) => {
    const sockets = new Set<Socket>();
    let accepted = 0;
    let closed = 0;
    const server = createServer((socket) => {
      accepted += 1;
      sockets.add(socket);
      // Read and discard what the SDK sends, or the far end's close would
      // never be seen here.
      socket.resume();
      socket.on('close', () => {
        closed += 1;
        sockets.delete(socket);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        resume(Effect.die(new Error('no TCP address')));
        return;
      }
      resume(
        Effect.succeed({
          origin: `http://127.0.0.1:${address.port}`,
          accepted: () => accepted,
          closed: () => closed,
          close: () => {
            for (const socket of sockets) socket.destroy();
            server.close();
          },
        }),
      );
    });
  }),
  (endpoint) => Effect.sync(() => endpoint.close()),
);

export function objectStoreContract(
  name: string,
  options: {
    /** Undefined when the provider's store is not running here. */
    readonly subject: ContractSubject | undefined;
    /** A store whose requests go to `origin`, for the cases needing no store. */
    readonly storeAt: (origin: string) => ObjectStore['Service'];
  },
): void {
  const { subject } = options;

  describe(`the ${name} object store`, () => {
    it.live(
      'ends a readiness probe it stopped waiting on, rather than only giving up on it',
      () =>
        Effect.gen(function* () {
          const endpoint = yield* silentEndpoint;
          const store = options.storeAt(endpoint.origin);

          const result = yield* readiness({
            objectStore: Effect.as(store.head, 'ok' as const),
          });
          expect(result.checks.objectStore).toBe(
            'failed: timed out after 1000ms',
          );
          expect(endpoint.accepted()).toBe(1);

          yield* Effect.gen(function* () {
            while (endpoint.closed() === 0) yield* Effect.sleep('10 millis');
          }).pipe(
            Effect.timeoutOrElse({
              duration: '2 seconds',
              orElse: () => Effect.void,
            }),
          );
          expect(endpoint.closed()).toBe(1);
        }).pipe(Effect.scoped),
      10_000,
    );

    describe.skipIf(subject === undefined)('against a running store', () => {
      // Narrowed once for every case: `skipIf` skips them when it is absent.
      const store = subject?.store;
      const missing = subject?.missing;
      const paged = subject?.paged;
      if (store === undefined || missing === undefined || paged === undefined) {
        return;
      }

      it.live('stores bytes under their content hash and reads them back', () =>
        Effect.gen(function* () {
          const bytes = freshBytes(1024);
          const stored = yield* store.put(bytes, 'text/plain');
          expect(stored).toEqual({
            hash: sha256(bytes),
            size: bytes.byteLength,
            mediaType: 'text/plain',
          });

          const found = yield* store.get(stored.hash);
          assertSome(found);
          expect(found.value.mediaType).toBe('text/plain');
          expect(found.value.size).toBe(bytes.byteLength);
          expect((yield* drain(found.value.body)).bytes).toEqual(bytes);
        }),
      );

      it.live(
        'keeps the first media type when the same bytes are put again',
        () =>
          Effect.gen(function* () {
            const bytes = freshBytes(512);
            yield* store.put(bytes, 'image/png');
            const again = yield* store.put(bytes, 'application/octet-stream');
            expect(again).toEqual({
              hash: sha256(bytes),
              size: bytes.byteLength,
              mediaType: 'image/png',
            });

            const found = yield* store.get(again.hash);
            assertSome(found);
            expect(found.value.mediaType).toBe('image/png');
            yield* drain(found.value.body);
          }),
      );

      it.live('reads an object that was never stored as absent', () =>
        Effect.gen(function* () {
          const found = yield* store.get(sha256(freshBytes(32)));
          expect(Option.isNone(found)).toBe(true);
        }),
      );

      it.live('streams a body larger than one chunk', () =>
        Effect.gen(function* () {
          const bytes = freshBytes(512 * 1024);
          const stored = yield* store.put(bytes, 'application/octet-stream');

          const found = yield* store.get(stored.hash);
          assertSome(found);
          expect(found.value.size).toBe(bytes.byteLength);
          const read = yield* drain(found.value.body);
          expect(read.chunks).toBeGreaterThan(1);
          expect(read.bytes).toEqual(bytes);
        }),
      );

      it.live('answers the readiness probe for a store that exists', () =>
        Effect.gen(function* () {
          const result = yield* readiness({
            objectStore: Effect.as(store.head, 'ok' as const),
          });
          expect(result.checks.objectStore).toBe('ok');
        }),
      );

      it.live(
        'fails the readiness probe for a bucket or container that does not exist',
        () =>
          Effect.gen(function* () {
            const error = yield* Effect.flip(missing.head);
            expect(error._tag).toBe('ObjectStoreError');
            expect(error.operation).toBe('head');
          }),
      );

      it.live(
        'reports a get from a missing bucket or container as a failure, not an absent asset',
        () =>
          Effect.gen(function* () {
            const error = yield* Effect.flip(
              missing.get(sha256(freshBytes(32))),
            );
            expect(error.operation).toBe('get');
          }),
      );

      // Each staging case stages under a team of its own, so a listing sees
      // only that case's objects whatever earlier runs left behind.
      it.live(
        'reads back what was staged, and nothing for a key never staged',
        () =>
          Effect.gen(function* () {
            const teamId = randomUUID();
            const key = mintStagingKey(teamId);
            const bytes = freshBytes(2048);
            yield* store.putStaged(key, bytes, 'image/png');

            const found = yield* store.getStaged(key);
            assertSome(found);
            expect(found.value).toEqual(bytes);
            const never = yield* store.getStaged(mintStagingKey(teamId));
            expect(Option.isNone(never)).toBe(true);
            yield* store.deleteStaged(key);
          }),
      );

      it.live(
        'deletes a staged object, and deletes it again without failing',
        () =>
          Effect.gen(function* () {
            const key = mintStagingKey(randomUUID());
            yield* store.putStaged(key, freshBytes(64), 'text/plain');

            yield* store.deleteStaged(key);
            expect(Option.isNone(yield* store.getStaged(key))).toBe(true);
            yield* store.deleteStaged(key);
          }),
      );

      it.live(
        'lists only the staged objects under the prefix and older than the bound',
        () =>
          Effect.gen(function* () {
            const team = randomUUID();
            const mine = mintStagingKey(team);
            const theirs = mintStagingKey(randomUUID());
            yield* store.putStaged(mine, freshBytes(16), 'text/plain');
            yield* store.putStaged(theirs, freshBytes(16), 'text/plain');
            // A minute either side of now, so the store's clock need not agree
            // with this one to the second.
            const later = new Date(Date.now() + 60_000);
            const earlier = new Date(Date.now() - 60_000);

            expect(yield* store.listStaged(stagingPrefix(team), later)).toEqual(
              [mine],
            );
            expect(
              yield* store.listStaged(stagingPrefix(team), earlier),
            ).toEqual([]);
            yield* store.deleteStaged(mine);
            yield* store.deleteStaged(theirs);
          }),
      );

      it.live('lists staged objects across every page of a listing', () =>
        Effect.gen(function* () {
          const team = randomUUID();
          const keys = [
            mintStagingKey(team),
            mintStagingKey(team),
            mintStagingKey(team),
          ];
          for (const key of keys) {
            yield* paged.putStaged(key, freshBytes(16), 'text/plain');
          }
          const later = new Date(Date.now() + 60_000);

          expect(
            (yield* paged.listStaged(stagingPrefix(team), later)).toSorted(),
          ).toEqual(keys.toSorted());
          for (const key of keys) yield* paged.deleteStaged(key);
        }),
      );

      it.live('promotes a staged object into the asset its hash names', () =>
        Effect.gen(function* () {
          const key = mintStagingKey(randomUUID());
          const bytes = freshBytes(4096);
          yield* store.putStaged(key, bytes, 'image/png');

          expect(
            yield* store.promoteStaged(key, sha256(bytes), 'image/png'),
          ).toBe(true);
          const found = yield* store.get(sha256(bytes));
          assertSome(found);
          expect(found.value.mediaType).toBe('image/png');
          expect((yield* drain(found.value.body)).bytes).toEqual(bytes);
          // Promotion copies; removing what was staged is the caller's step.
          expect(Option.isSome(yield* store.getStaged(key))).toBe(true);
          yield* store.deleteStaged(key);
        }),
      );

      it.live(
        'keeps an asset already stored under the hash when promoting',
        () =>
          Effect.gen(function* () {
            const bytes = freshBytes(256);
            yield* store.put(bytes, 'image/png');
            const key = mintStagingKey(randomUUID());
            yield* store.putStaged(key, bytes, 'application/octet-stream');

            expect(
              yield* store.promoteStaged(
                key,
                sha256(bytes),
                'application/octet-stream',
              ),
            ).toBe(true);
            const found = yield* store.get(sha256(bytes));
            assertSome(found);
            expect(found.value.mediaType).toBe('image/png');
            yield* drain(found.value.body);
            yield* store.deleteStaged(key);
          }),
      );

      it.live('reports a staged object that is gone as unpromoted', () =>
        Effect.gen(function* () {
          const bytes = freshBytes(32);
          const promoted = yield* store.promoteStaged(
            mintStagingKey(randomUUID()),
            sha256(bytes),
            'text/plain',
          );
          expect(promoted).toBe(false);
          expect(Option.isNone(yield* store.get(sha256(bytes)))).toBe(true);
        }),
      );

      it.live('fails a listing of a missing bucket or container', () =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            missing.listStaged('staging/', new Date()),
          );
          expect(error.operation).toBe('list');
        }),
      );

      it.live('fails a put into a missing bucket or container', () =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            missing.put(freshBytes(64), 'text/plain'),
          );
          expect(error.operation).toBe('put');
        }),
      );
    });
  });
}

function assertSome<A>(
  option: Option.Option<A>,
): asserts option is Option.Some<A> {
  expect(Option.isSome(option)).toBe(true);
}
