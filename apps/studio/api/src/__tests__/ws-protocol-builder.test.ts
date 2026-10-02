import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';

import { NodeWS } from '@effect/platform-node/NodeSocket';
import {
  Cause,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  MutableRef,
  Option,
  Predicate,
  Scope,
  Stream,
} from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientRequest from 'effect/http/HttpClientRequest';
import * as RpcClient from 'effect/rpc/RpcClient';
import type { RpcClientError } from 'effect/rpc/RpcClientError';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import * as Socket from 'effect/socket/Socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  CLIENT_SESSION_HEADER,
  CLIENT_SESSION_PARAM,
} from '@codaco/studio-contract/client-session';
import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';
import { sectionId as makeSectionId } from '@codaco/studio-sync/taxonomy';

import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../db/tenant.ts';
import { readEnv } from '../env.ts';
import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import { MaintenanceState } from '../platform/maintenance-state.ts';
import { REAUTHORIZE_MS } from '../protocol-builder/handlers.ts';
import { RECONNECT_GRACE_MS } from '../protocol-builder/leases.ts';
import { PROTOCOL_BUILDER_RPC_PATH } from '../protocol-builder/rpc.ts';
import { createProtocol } from '../protocol/store.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { authServiceStub } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  createProtocolBuilderClient,
  makeShiftableClock,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';
import { testCipher } from './support/secrets.ts';
import { startStudioServer } from './support/serve.ts';

const env = readEnv();

const TEAM_ID = 'protocol-builder-ws-team';

const STAGE_ORDER = makeSectionId({ kind: 'stageOrder' });
const ASSETS = makeSectionId({ kind: 'assets' });

function researcher(slug: string): SessionPrincipal {
  return {
    kind: 'user',
    userId: `pb-ws-${slug}-user`,
    email: `pb-ws-${slug}@example.com`,
    emailVerified: true,
    name: `Socket Researcher ${slug}`,
    locale: null,
    sessionId: `pb-ws-${slug}-session`,
  };
}

const ADA = researcher('ada');
const GRACE = researcher('grace');

const COOKIES = new Map([
  ['session=ada', ADA],
  ['session=grace', GRACE],
  ['session=grace-elsewhere', GRACE],
]);

const cookieOf = (who: SessionPrincipal) =>
  who === ADA ? 'session=ada' : 'session=grace';

type Client = RpcClient.RpcClient.Flat<ProtocolBuilderRpcs, RpcClientError>;

type LockEvent = Extract<ProtocolEvent, { type: 'lock' }>;
type PresenceEvent = Extract<ProtocolEvent, { type: 'presence' }>;

type Watch = {
  readonly events: ProtocolEvent[];
  readonly ended: () => Exit.Exit<void, unknown> | undefined;
  readonly stop: () => Promise<void>;
};

type Connected = {
  readonly client: Client;
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  readonly runExit: <A, E>(
    effect: Effect.Effect<A, E>,
  ) => Promise<Exit.Exit<A, E>>;
  readonly watch: (
    protocolId: string,
    since?: string,
    headers?: Readonly<Record<string, string>>,
  ) => Watch;
  readonly socket: () => NodeWS.WebSocket;
  readonly close: () => Promise<void>;
};

async function until(
  predicate: () => boolean,
  what: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function lockHolder(
  events: readonly ProtocolEvent[],
  sectionId: string,
): LockEvent['holder'] | undefined {
  return events.findLast(
    (event): event is LockEvent =>
      event.type === 'lock' && event.sectionId === sectionId,
  )?.holder;
}

function released(events: readonly ProtocolEvent[], sectionId: string) {
  const last = events.findLast(
    (event): event is LockEvent =>
      event.type === 'lock' && event.sectionId === sectionId,
  );
  return last !== undefined && last.holder === undefined;
}

function isPresent(events: readonly ProtocolEvent[], sessionId: string) {
  const latest = events.findLast(
    (event): event is PresenceEvent => event.type === 'presence',
  );
  return (
    latest?.present.some((present) => present.sessionId === sessionId) ?? false
  );
}

function closeCodeOf(exit: Exit.Exit<unknown, unknown>): number | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const error = Cause.findErrorOption(exit.cause);
  if (Option.isNone(error)) return undefined;
  const failure = error.value;
  if (
    !Predicate.hasProperty(failure, 'reason') ||
    !Predicate.isTagged(failure.reason, 'SocketCloseError') ||
    !Predicate.hasProperty(failure.reason, 'code') ||
    !Predicate.isNumber(failure.reason.code)
  ) {
    return undefined;
  }
  return failure.reason.code;
}

describe.skipIf(!testDb || !env.auth)(
  'the protocol-builder host over /ws',
  () => {
    let database: TestDatabaseRuntime;
    let server: Awaited<ReturnType<typeof startStudioServer>>;
    let protocolId: string;
    let origin: string;
    let wsUrl: string;
    const clock = makeShiftableClock();
    const connections: Connected[] = [];
    let studio: ReturnType<typeof createStudio>;

    async function connect(
      options: {
        readonly as?: SessionPrincipal;
        readonly tab?: string;
        readonly url?: string;
        readonly query?: string;
        readonly handshake?: Readonly<Record<string, string>>;
      } = {},
    ): Promise<Connected> {
      const sockets: NodeWS.WebSocket[] = [];
      const base = options.url ?? wsUrl;
      const url =
        options.query !== undefined
          ? `${base}${options.query}`
          : options.tab === undefined
            ? base
            : `${base}?${CLIENT_SESSION_PARAM}=${encodeURIComponent(options.tab)}`;
      const runtime = ManagedRuntime.make(
        RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
          Layer.provide(Socket.layerWebSocket(url)),
          Layer.provide(
            Layer.succeed(Socket.WebSocketConstructor)((target) => {
              const socket = new NodeWS.WebSocket(target, {
                headers: {
                  ...options.handshake,
                  origin,
                  cookie: cookieOf(options.as ?? ADA),
                },
              });
              sockets.push(socket);
              return socket;
            }),
          ),
          Layer.provide(
            RpcSerialization.layerSchemaBinary({
              maxFrameSize: MAX_SOCKET_FRAME_BYTES,
            }),
          ),
        ),
      );
      const scope = Scope.makeUnsafe();
      const client = await runtime.runPromise(
        Scope.provide(
          RpcClient.make(ProtocolBuilderGroup, { flatten: true }),
          scope,
        ),
      );
      const connected: Connected = {
        client,
        run: (effect) => runtime.runPromise(effect),
        runExit: (effect) => runtime.runPromiseExit(effect),
        watch: (watched, since, headers = {}) => {
          const events: ProtocolEvent[] = [];
          let ended: Exit.Exit<void, unknown> | undefined;
          const fiber = runtime.runFork(
            RpcClient.withHeaders(
              Stream.runForEach(
                client('WatchProtocol', {
                  protocolId: watched,
                  ...(since === undefined ? {} : { since }),
                }),
                (event) => Effect.sync(() => events.push(event)),
              ),
              headers,
            ),
          );
          fiber.addObserver((exit) => {
            ended = exit;
          });
          return {
            events,
            ended: () => ended,
            stop: () => runtime.runPromise(Fiber.interrupt(fiber)),
          };
        },
        socket: () => {
          const socket = sockets.at(-1);
          if (socket === undefined) throw new Error('no socket was opened');
          return socket;
        },
        close: async () => {
          await runtime.runPromise(Scope.close(scope, Exit.void));
          await runtime.dispose();
        },
      };
      connections.push(connected);
      return connected;
    }

    const createStage = (tab: Connected, label: string) =>
      tab
        .run(
          tab.client('Create', {
            protocolId,
            requestId: randomUUID(),
            kind: 'stage',
            document: { type: 'Information', label, title: label, items: [] },
          }),
        )
        .then((created) => created.sectionId);

    beforeAll(async () => {
      if (!testDb || !env.auth) {
        throw new Error('unreachable: guarded by skipIf');
      }
      database = await openTestDatabase();
      await database.run(insertTeam(TEAM_ID));
      for (const who of [ADA, GRACE]) {
        await database.run(
          ownerAffected(
            `INSERT INTO "user" (id, name, email, "emailVerified")
             VALUES ($1, $2, $3, true)`,
            [who.userId, who.name, who.email],
          ),
        );
        await database.run(
          ownerAffected(
            `INSERT INTO team_members (id, team_id, user_id, role)
             VALUES ($1, $2, $3, 'owner')`,
            [`${who.userId}-member`, TEAM_ID, who.userId],
          ),
        );
      }

      const protocol = JSON.parse(
        readFileSync(
          fileURLToPath(import.meta.resolve('@codaco/protocols/sample')),
          'utf8',
        ),
      ) as CurrentProtocol;
      const services = Context.add(
        database.services,
        SecretsCipher,
        testCipher(),
      );
      const created = await Effect.runPromiseWith(services)(
        TenantScope.open(
          unsafeMakeTeamAccess(TEAM_ID, 'owner'),
          createProtocol(TEAM_ID, testCipher(), { protocol }),
        ),
      );
      protocolId = created.protocolId;

      // Self-hosted: the managed topology refuses anything that has not come
      // through its proxy.
      const serverEnv = { ...env, deploymentMode: 'self-hosted' } as const;
      studio = createStudio(serverEnv, {
        auth: authServiceStub({
          getSession: (headers) =>
            Effect.succeed(
              Option.fromNullishOr(COOKIES.get(headers.cookie ?? '')),
            ),
          listMemberships: () =>
            Effect.succeed([{ teamId: TEAM_ID, role: 'owner' }]),
        }),
        services,
      });
      server = await startStudioServer(
        serverEnv,
        studio,
        undefined,
        undefined,
        { clock: clock.clock },
      );
      origin = new URL(env.auth.baseUrl).origin;
      wsUrl = `${server.origin.replace('http://', 'ws://')}/ws`;
    });

    afterAll(async () => {
      for (const connection of connections) {
        await connection.close().catch(() => undefined);
      }
      await server?.dispose();
      await database?.dispose();
    });

    it('refuses a socket from another origin', async () => {
      const refused = new NodeWS.WebSocket(wsUrl, {
        headers: { origin: 'http://evil.example', cookie: cookieOf(ADA) },
      });
      const code = await new Promise<number | string>((resolve) => {
        refused.once('unexpected-response', (_request, response) =>
          resolve(response.statusCode ?? 0),
        );
        refused.once('open', () => resolve('opened'));
        refused.once('error', (error) => resolve(error.message));
      });
      refused.close();
      expect(code).toBe(403);
    });

    it('serves unary calls and a resumable watch over one socket', async () => {
      const tab = await connect();
      const sections = await tab.run(
        tab.client('ListSections', { protocolId }),
      );
      expect(sections.sectionIds).toContain('stageOrder');

      const watch = tab.watch(protocolId);
      await until(
        () => watch.events.some((event) => event.type === 'presence'),
        'the watch to go live',
      );
      const created = await tab.run(
        tab.client('Create', {
          protocolId,
          requestId: randomUUID(),
          kind: 'stage',
          document: {
            type: 'Information',
            label: 'Made over the socket',
            title: 'Made over the socket',
            items: [],
          },
        }),
      );

      const revisions = () =>
        watch.events.filter(
          (event): event is Extract<ProtocolEvent, { type: 'revision' }> =>
            event.type === 'revision',
        );
      await until(() => revisions().length >= 2, 'the created stage');
      const live = revisions().slice(0, 2);
      await watch.stop();
      expect(live.map((event) => event.sectionId)).toEqual([
        created.sectionId,
        'stageOrder',
      ]);
      const resumeFrom = live[0]?.cursor;
      expect(resumeFrom).toBeDefined();

      const second = await connect();
      const replay = second.watch(protocolId, resumeFrom);
      await until(
        () => replay.events.some((event) => event.type === 'revision'),
        'the replayed revision',
      );
      await replay.stop();
      const first = replay.events.find((event) => event.type === 'revision');
      expect(first?.type).toBe('revision');
      if (first?.type !== 'revision') return;
      expect(first.sectionId).toBe('stageOrder');
      expect(first.cursor).toBe(live[1]?.cursor);
    });

    it('tells a second socket which connection took a section', async () => {
      const watcher = await connect();
      const holder = await connect();
      const watch = watcher.watch(protocolId);
      await until(
        () => watch.events.some((event) => event.type === 'presence'),
        'the watch to go live',
      );

      await watcher.run(
        watcher.client('AcquireLock', { protocolId, sectionId: ASSETS }),
      );
      await holder.run(
        holder.client('AcquireLock', { protocolId, sectionId: STAGE_ORDER }),
      );
      await until(
        () =>
          lockHolder(watch.events, 'assets') !== undefined &&
          lockHolder(watch.events, 'stageOrder') !== undefined,
        'both lock events',
      );

      const own = lockHolder(watch.events, 'assets');
      const theirs = lockHolder(watch.events, 'stageOrder');
      expect(own?.sessionId).toBeDefined();
      expect(theirs?.userId).toBe(ADA.userId);
      expect(theirs?.displayName).toBe(ADA.name);
      expect(theirs?.mode).toBe('editing');
      expect(theirs?.sectionId).toBe('stageOrder');
      expect(theirs?.sessionId).not.toBe(own?.sessionId);

      const behind = await watcher.run(
        watcher.client('AcquireLock', { protocolId, sectionId: STAGE_ORDER }),
      );
      expect(behind.lock).toBe('readOnly');
      if (behind.lock !== 'readOnly') return;
      expect(behind.holder.sessionId).toBe(theirs?.sessionId);

      await holder.run(
        holder.client('ReleaseLock', { protocolId, sectionId: STAGE_ORDER }),
      );
      await watcher.run(
        watcher.client('ReleaseLock', { protocolId, sectionId: ASSETS }),
      );
      await watch.stop();
    });

    it('keeps a section for the tab that took it when its socket dies', async () => {
      const tab = 'pb-ws-reconnecting-tab';
      const first = await connect({ tab });
      const stranger = await connect({ as: GRACE });
      const watched = stranger.watch(protocolId);
      const sectionId = await createStage(first, 'Held across a drop');
      const channel = first.watch(protocolId);
      await until(
        () => channel.events.some((event) => event.type === 'presence'),
        'the channel to go live',
      );

      const held = await first.run(
        first.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(held.lock).toBe('held');
      await until(
        () => lockHolder(watched.events, sectionId) !== undefined,
        'the lock event to reach the colleague',
      );
      const connection = lockHolder(watched.events, sectionId)?.sessionId;
      if (connection === undefined) throw new Error('the lock named no holder');
      await until(
        () => isPresent(watched.events, connection),
        'the first socket to be present',
      );

      first.socket().terminate();
      await until(
        () => !isPresent(watched.events, connection),
        'the server to notice the socket died',
      );
      await first.close();

      const behind = await stranger.run(
        stranger.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(behind.lock).toBe('readOnly');
      if (behind.lock !== 'readOnly') throw new Error('unreachable');
      expect(behind.holder.userId).toBe(ADA.userId);

      const second = await connect({ tab });
      second.watch(protocolId);
      const resumed = await second.run(
        second.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(resumed.lock).toBe('held');
      if (resumed.lock !== 'held') throw new Error('unreachable');
      const written = await second.run(
        second.client('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId,
          document: {
            ...resumed.document,
            label: 'Renamed after the reconnect',
          },
          revision: resumed.revision,
        }),
      );
      expect(written.revision.sequence).toBeGreaterThan(
        resumed.revision.sequence,
      );
      const read = await second.run(
        second.client('GetSection', { protocolId, sectionId }),
      );
      expect(read.document.label).toBe('Renamed after the reconnect');
      await second.run(second.client('ReleaseLock', { protocolId, sectionId }));
      await watched.stop();
    });

    it('falls back to the connection for a socket whose tab id it cannot use', async () => {
      const unusable = 'not a tab id!';
      const first = await connect({ tab: unusable });
      const second = await connect({ tab: unusable });
      const sectionId = await createStage(first, 'Named by no usable tab');

      const held = await first.run(
        first.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(held.lock).toBe('held');
      const behind = await second.run(
        second.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(behind.lock).toBe('readOnly');
      if (behind.lock !== 'readOnly') throw new Error('unreachable');
      expect(behind.holder.userId).toBe(ADA.userId);
      expect(behind.holder.displayName).toBe(ADA.name);
    });

    it('owns a lock by the tab its upgrade names', async () => {
      const tab = `pb-ws-tab-${randomUUID()}`;
      const first = await connect({ tab });
      const sectionId = await createStage(first, 'Owned by a named tab');
      const held = await first.run(
        first.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(held.lock).toBe('held');

      const again = await connect({ tab });
      const reopened = await again.run(
        again.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(reopened.lock).toBe('held');

      const other = await connect({ tab: `pb-ws-tab-${randomUUID()}` });
      const refused = await other.run(
        other.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(refused.lock).toBe('readOnly');
      await first.run(first.client('ReleaseLock', { protocolId, sectionId }));
    });

    const sameOwner = async (
      options: Parameters<typeof connect>[0],
      label: string,
    ) => {
      const first = await connect(options);
      const second = await connect(options);
      const sectionId = await createStage(first, label);
      const held = await first.run(
        first.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(held.lock).toBe('held');
      const again = await second.run(
        second.client('AcquireLock', { protocolId, sectionId }),
      );
      await first.run(first.client('ReleaseLock', { protocolId, sectionId }));
      return again.lock === 'held';
    };

    it('ignores a tab id a handshake supplied as a header', async () => {
      expect(
        await sameOwner(
          { handshake: { [CLIENT_SESSION_HEADER]: randomUUID() } },
          'Named by a handshake header',
        ),
      ).toBe(false);
    });

    it('names no tab for a socket that named two', async () => {
      const tab = randomUUID();
      expect(
        await sameOwner(
          {
            query: `?${CLIENT_SESSION_PARAM}=${tab}&${CLIENT_SESSION_PARAM}=${randomUUID()}`,
          },
          'Named twice',
        ),
      ).toBe(false);
      expect(await sameOwner({ tab }, 'Named once')).toBe(true);
    });

    it('fails a call that dies alone, leaving the socket’s watch running', async () => {
      const tab = await connect();
      const watch = tab.watch(protocolId);
      await until(
        () => watch.events.some((event) => event.type === 'presence'),
        'the watch to go live',
      );
      const died = await tab.runExit(
        tab.client('ListSections', { protocolId: 'not-a-protocol-id' }),
      );
      expect(Exit.isFailure(died)).toBe(true);
      if (Exit.isSuccess(died)) return;
      expect(Option.isNone(Cause.findErrorOption(died.cause))).toBe(true);
      const sectionId = await createStage(tab, 'Made after a defect');
      await until(
        () =>
          watch.events.some(
            (event) =>
              event.type === 'revision' && event.sectionId === sectionId,
          ),
        'the watch to see the write',
      );
      expect(watch.ended()).toBeUndefined();
      await watch.stop();
    });

    it('gives presence back when a socket closes, and its locks only after the reconnect grace', async () => {
      const observer = await connect({ as: GRACE });
      const seen = observer.watch(protocolId);
      const tab = `pb-ws-leaving-${randomUUID()}`;
      const leaving = await connect({ tab });
      const sectionId = await createStage(leaving, 'Held past a close');
      const channel = leaving.watch(protocolId);
      await leaving.run(
        leaving.client('AcquireLock', { protocolId, sectionId }),
      );
      await until(
        () => lockHolder(seen.events, sectionId) !== undefined,
        'the lock event',
      );
      const connection = lockHolder(seen.events, sectionId)?.sessionId;
      if (connection === undefined) throw new Error('the lock named no holder');
      await until(() => isPresent(seen.events, connection), 'the presence');

      await leaving.close();
      await until(
        () => !isPresent(seen.events, connection),
        'presence without the departed socket',
        2000,
      );
      await until(() => channel.ended() !== undefined, 'the watch to end');

      const during = await observer.run(
        observer.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(during.lock).toBe('readOnly');
      expect(released(seen.events, sectionId)).toBe(false);

      clock.advance(RECONNECT_GRACE_MS + 1);
      await until(
        () => released(seen.events, sectionId),
        'the lock to be given back',
      );
      const after = await observer.run(
        observer.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(after.lock).toBe('held');
      await observer.run(
        observer.client('ReleaseLock', { protocolId, sectionId }),
      );
      await seen.stop();
    });

    it('never lets a frame’s own headers name the caller or its tab', async () => {
      const tab = `pb-ws-honest-${randomUUID()}`;
      const forged = `pb-ws-forged-${randomUUID()}`;
      const honest = await connect({ as: ADA, tab });
      const sectionId = await createStage(honest, 'Held by the upgrade’s tab');
      const acquired = await honest.run(
        RpcClient.withHeaders(
          honest.client('AcquireLock', { protocolId, sectionId }),
          { cookie: cookieOf(GRACE), [CLIENT_SESSION_HEADER]: forged },
        ),
      );
      expect(acquired.lock).toBe('held');

      const grace = await connect({ as: GRACE, tab: forged });
      const behindGrace = await grace.run(
        grace.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(behindGrace.lock).toBe('readOnly');
      if (behindGrace.lock !== 'readOnly') throw new Error('unreachable');
      expect(behindGrace.holder.userId).toBe(ADA.userId);

      const adaForged = await connect({ as: ADA, tab: forged });
      const behindForged = await adaForged.run(
        adaForged.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(behindForged.lock).toBe('readOnly');
      await honest.run(honest.client('ReleaseLock', { protocolId, sectionId }));
    });

    it('carries a staged file’s bytes whole, as bytes', async () => {
      const tab = await connect();
      const editId = randomUUID();
      // Past `layerSchemaBinary`'s own 16 MiB default on both ends.
      const bytes = new Uint8Array(17 * 1024 * 1024);
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = (index * 31 + 7) % 251;
      }
      const staged = await tab.run(
        tab.client('ResourcesStage', {
          protocolId,
          editId,
          requestId: randomUUID(),
          request: {
            kind: 'content',
            contentKind: 'image',
            name: 'A large picture',
            source: 'large.png',
            contentType: 'image/png',
            bytes,
          },
        }),
      );
      expect(staged.status).toBe('ok');
      if (staged.status !== 'ok') return;
      expect(staged.data.descriptor.byteLength).toBe(bytes.length);
      const preview = await tab.run(
        tab.client('ResourcesPreview', {
          protocolId,
          editId,
          resourceId: staged.data.descriptor.id,
        }),
      );
      expect(preview.status).toBe('ok');
      if (preview.status !== 'ok') return;
      const [, encoded = ''] = preview.data.url.split(',');
      expect(Buffer.from(encoded, 'base64').equals(Buffer.from(bytes))).toBe(
        true,
      );
      await tab.run(tab.client('ResourcesDiscard', { protocolId, editId }));
    });

    it('closes a socket that sends a frame over the bound with 1009', async () => {
      const bounded = await startStudioServer(
        { ...env, deploymentMode: 'self-hosted' },
        createStudio(
          { ...env, deploymentMode: 'self-hosted' },
          {
            auth: authServiceStub({
              getSession: () => Effect.succeedSome(ADA),
            }),
          },
        ),
        undefined,
        undefined,
        { wsMaxPayload: 1024 * 1024 },
      );
      try {
        const tab = await connect({
          url: `${bounded.origin.replace('http://', 'ws://')}/ws`,
        });
        const exit = await tab.runExit(
          tab.client('ResourcesStage', {
            protocolId,
            editId: randomUUID(),
            requestId: randomUUID(),
            request: {
              kind: 'content',
              contentKind: 'image',
              name: 'Too large',
              source: 'too-large.png',
              contentType: 'image/png',
              bytes: new Uint8Array(2 * 1024 * 1024),
            },
          }),
        );
        expect(closeCodeOf(exit)).toBe(1009);
        await tab.close();
      } finally {
        await bounded.dispose();
      }
    });

    const overHttp = (who: SessionPrincipal, tab: string): Connected => {
      const runtime = ManagedRuntime.make(
        RpcClient.layerProtocolHttp({
          url: `${server.origin}${PROTOCOL_BUILDER_RPC_PATH}`,
          transformClient: HttpClient.mapRequest(
            HttpClientRequest.setHeaders({
              'cookie': cookieOf(who),
              'sec-fetch-site': 'same-origin',
              [CLIENT_SESSION_HEADER]: tab,
            }),
          ),
        }).pipe(
          Layer.provide(FetchHttpClient.layer),
          Layer.provide(RpcSerialization.layerNdjson),
        ),
      );
      const scope = Scope.makeUnsafe();
      const client = runtime.runSync(
        Scope.provide(
          RpcClient.make(ProtocolBuilderGroup, { flatten: true }),
          scope,
        ),
      );
      const connected: Connected = {
        client,
        run: (effect) => runtime.runPromise(effect),
        runExit: (effect) => runtime.runPromiseExit(effect),
        watch: () => {
          throw new Error('this case watches over a socket');
        },
        socket: () => {
          throw new Error('a unary caller has no socket');
        },
        close: async () => {
          await runtime.runPromise(Scope.close(scope, Exit.void));
          await runtime.dispose();
        },
      };
      connections.push(connected);
      return connected;
    };

    const inProcess = (
      host: ProtocolBuilderTestClient,
      who: SessionPrincipal,
      tab: string,
    ): Connected => ({
      client: host.rpc,
      run: (effect) => host.call({ principal: who, tab }, effect),
      runExit: (effect) => host.callExit({ principal: who, tab }, effect),
      watch: () => {
        throw new Error('this case watches over a socket');
      },
      socket: () => {
        throw new Error('an in-process caller has no socket');
      },
      close: () => Promise.resolve(),
    });

    const outcome = (exit: Exit.Exit<unknown, unknown>): unknown => {
      if (Exit.isSuccess(exit)) {
        const value = exit.value;
        return Predicate.hasProperty(value, 'lock')
          ? {
              lock: value.lock,
              holder: Predicate.hasProperty(value, 'holder')
                ? Predicate.hasProperty(value.holder, 'userId')
                  ? value.holder.userId
                  : undefined
                : undefined,
            }
          : 'ok';
      }
      const error = Cause.findErrorOption(exit.cause);
      return Option.isSome(error) && Predicate.hasProperty(error.value, '_tag')
        ? error.value._tag
        : 'defect';
    };

    const sequence = async (as: (who: SessionPrincipal) => Connected) => {
      const ada = as(ADA);
      const grace = as(GRACE);
      const sectionId = await createStage(ada, 'Made on one transport');
      const steps: unknown[] = [];
      const acquired = await ada.runExit(
        ada.client('AcquireLock', { protocolId, sectionId }),
      );
      steps.push(outcome(acquired));
      steps.push(
        outcome(
          await grace.runExit(
            grace.client('AcquireLock', { protocolId, sectionId }),
          ),
        ),
      );
      if (Exit.isFailure(acquired) || acquired.value.lock !== 'held') {
        return steps;
      }
      const write = (who: Connected) =>
        who.runExit(
          who.client('Submit', {
            protocolId,
            requestId: randomUUID(),
            sectionId,
            document: { ...acquired.value.document, label: 'Written' },
            revision: acquired.value.revision,
          }),
        );
      steps.push(outcome(await write(grace)));
      steps.push(outcome(await write(ada)));
      const read = await ada.run(
        ada.client('GetSection', { protocolId, sectionId }),
      );
      steps.push(read.document.label);
      steps.push(
        outcome(
          await ada.runExit(
            ada.client('GetSection', {
              protocolId,
              sectionId: makeSectionId({
                kind: 'stage',
                stageId: randomUUID(),
              }),
            }),
          ),
        ),
      );
      steps.push(
        outcome(
          await ada.runExit(
            ada.client('ReleaseLock', { protocolId, sectionId }),
          ),
        ),
      );
      return steps;
    };

    const EXPECTED = [
      { lock: 'held', holder: undefined },
      { lock: 'readOnly', holder: ADA.userId },
      'NotLockHolder',
      'ok',
      'Written',
      'SectionNotFound',
      'ok',
    ];

    it('answers one editing sequence the same in process, over /ws and over /rpc/protocol-builder', async () => {
      const host = await createProtocolBuilderClient(studio);
      try {
        const tabs = new Map<SessionPrincipal, string>();
        const tabOf = (who: SessionPrincipal) => {
          const tab = tabs.get(who) ?? randomUUID();
          tabs.set(who, tab);
          return tab;
        };
        expect(
          await sequence((who) => inProcess(host, who, tabOf(who))),
        ).toEqual(EXPECTED);
      } finally {
        await host.dispose();
      }
      const sockets = new Map<SessionPrincipal, Connected>();
      for (const who of [ADA, GRACE]) {
        sockets.set(who, await connect({ as: who, tab: randomUUID() }));
      }
      expect(
        await sequence((who) => {
          const socket = sockets.get(who);
          if (socket === undefined) throw new Error('unreachable');
          return socket;
        }),
      ).toEqual(EXPECTED);
      const unary = new Map([
        [ADA, overHttp(ADA, randomUUID())],
        [GRACE, overHttp(GRACE, randomUUID())],
      ]);
      expect(
        await sequence((who) => {
          const caller = unary.get(who);
          if (caller === undefined) throw new Error('unreachable');
          return caller;
        }),
      ).toEqual(EXPECTED);
    });

    const postFrame = async (
      headers: Record<string, string>,
      request: Record<string, unknown>,
    ) => {
      const response = await fetch(
        `${server.origin}${PROTOCOL_BUILDER_RPC_PATH}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/ndjson',
            'sec-fetch-site': 'same-origin',
            ...headers,
          },
          body: `${JSON.stringify({ _tag: 'Request', id: '1', headers: [], ...request })}\n`,
        },
      );
      const frames = (await response.text())
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line): unknown => JSON.parse(line));
      const exit = frames.find(
        (frame) =>
          Predicate.hasProperty(frame, '_tag') && frame._tag === 'Exit',
      );
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        exit: Predicate.hasProperty(exit, 'exit') ? exit.exit : undefined,
      };
    };

    it('answers a refusal on /rpc/protocol-builder as a failure frame on a 200, and a stranger with a 401', async () => {
      const missing = await postFrame(
        { cookie: cookieOf(ADA) },
        {
          tag: 'GetSection',
          payload: {
            protocolId,
            sectionId: makeSectionId({ kind: 'stage', stageId: randomUUID() }),
          },
        },
      );
      expect(missing.status).toBe(200);
      expect(missing.exit).toMatchObject({
        _tag: 'Failure',
        cause: [{ _tag: 'Fail', error: { _tag: 'SectionNotFound' } }],
      });

      const stranger = await postFrame(
        {},
        { tag: 'ListSections', payload: { protocolId } },
      );
      expect(stranger.status).toBe(401);
      expect(stranger.contentType).toBe('application/problem+json');
      expect(stranger.exit).toBeUndefined();
    });

    it('refuses an anonymous /rpc/protocol-builder body without reading it', async () => {
      const { hostname, port } = new URL(server.origin);
      const status = await new Promise<number | string>((settle) => {
        const pending = httpRequest(
          {
            hostname,
            port,
            path: PROTOCOL_BUILDER_RPC_PATH,
            method: 'POST',
            headers: {
              'content-type': 'application/ndjson',
              'sec-fetch-site': 'same-origin',
              'content-length': String(2 ** 30),
            },
          },
          (response) => {
            settle(response.statusCode ?? 0);
            response.resume();
            pending.destroy();
          },
        );
        pending.on('error', () => undefined);
        setTimeout(() => {
          settle('no response');
          pending.destroy();
        }, 2_000);
        pending.write('x'.repeat(1024));
      });
      expect(status).toBe(401);
    });

    it('refuses a cross-site call on /rpc/protocol-builder before any procedure runs', async () => {
      const crossSite = await postFrame(
        { 'cookie': cookieOf(ADA), 'sec-fetch-site': 'cross-site' },
        { tag: 'ListSections', payload: { protocolId } },
      );
      expect(crossSite.status).toBe(403);
      expect(crossSite.exit).toBeUndefined();
    });

    it('stops reading a /rpc/protocol-builder body over the bound', async () => {
      const bounded = await startStudioServer(
        { ...env, deploymentMode: 'self-hosted' },
        studio,
        undefined,
        undefined,
        { unaryBodyLimit: 64 * 1024 },
      );
      const post = (headers: Record<string, string>, padding: number) =>
        fetch(`${bounded.origin}${PROTOCOL_BUILDER_RPC_PATH}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/ndjson',
            'sec-fetch-site': 'same-origin',
            ...headers,
          },
          body: `${JSON.stringify({ _tag: 'Request', id: '1', tag: 'ListSections', payload: { protocolId }, headers: [], padding: 'x'.repeat(padding) })}\n`,
        }).then(
          async (response) => ({
            status: response.status,
            body: await response.text(),
          }),
          (error: unknown) => ({ refused: error }),
        );
      try {
        const oversized = await post({ cookie: cookieOf(ADA) }, 1024 * 1024);
        expect(oversized).toHaveProperty('refused');

        const normal = await post({ cookie: cookieOf(ADA) }, 0);
        expect(normal).toMatchObject({ status: 200 });
        expect(normal).toHaveProperty(
          'body',
          expect.stringContaining('"_tag":"Success"'),
        );
      } finally {
        await bounded.dispose();
      }
    });

    const routedTo = async (path: string): Promise<string> => {
      const response = await fetch(`${server.origin}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/ndjson',
          'sec-fetch-site': 'same-origin',
          'cookie': cookieOf(ADA),
        },
        body: `${JSON.stringify({ _tag: 'Request', id: '1', tag: 'ListSections', payload: { protocolId }, headers: [] })}\n`,
      });
      const body = await response.text();
      if (body.includes('"sectionIds"')) return 'protocol-builder';
      if (body.includes('Unknown request tag')) return 'rpc';
      return String(response.status);
    };

    const upgradeAt = (path: string) =>
      new Promise<number | string>((resolve) => {
        const socket = new NodeWS.WebSocket(
          `${server.origin.replace('http://', 'ws://')}${path}`,
          { headers: { origin, cookie: cookieOf(ADA) } },
        );
        socket.once('unexpected-response', (request, response) => {
          resolve(response.statusCode ?? 0);
          response.resume();
          request.destroy();
        });
        socket.once('open', () => {
          socket.close();
          resolve('upgraded');
        });
        socket.once('error', (error) => resolve(error.message));
      });

    it('routes the spellings the router folds to the mount they name, and no other', async () => {
      const observed: Record<string, string> = {};
      for (const path of [
        PROTOCOL_BUILDER_RPC_PATH,
        '/RPC/protocol-builder',
        '/rpc/Protocol-Builder',
        '//rpc/protocol-builder',
        '/rpc//protocol-builder',
        '/rpc/protocol-builder/',
        '/rpc%2Fprotocol-builder',
        '/%72pc/protocol-builder',
        '/rpc',
      ]) {
        observed[path] = await routedTo(path);
      }
      for (const path of ['/ws', '/WS', '//ws', '/ws/', '/%77s']) {
        observed[path] = String(await upgradeAt(path));
      }
      expect(observed).toEqual({
        [PROTOCOL_BUILDER_RPC_PATH]: 'protocol-builder',
        '/RPC/protocol-builder': 'protocol-builder',
        '/rpc/Protocol-Builder': 'protocol-builder',
        '//rpc/protocol-builder': 'protocol-builder',
        '/rpc//protocol-builder': 'protocol-builder',
        '/rpc/protocol-builder/': 'protocol-builder',
        '/rpc%2Fprotocol-builder': '404',
        '/%72pc/protocol-builder': 'protocol-builder',
        '/rpc': 'rpc',
        '/ws': 'upgraded',
        '/WS': 'upgraded',
        '//ws': 'upgraded',
        '/ws/': 'upgraded',
        '/%77s': 'upgraded',
      });
    });

    it('never lets a unary frame’s own headers name the caller or its tab', async () => {
      const tab = randomUUID();
      const forged = randomUUID();
      const owner = await connect({ tab });
      const sectionId = await createStage(owner, 'Taken over the unary plane');
      const taken = await postFrame(
        { cookie: cookieOf(ADA), [CLIENT_SESSION_HEADER]: tab },
        {
          tag: 'AcquireLock',
          payload: { protocolId, sectionId },
          headers: [
            ['cookie', cookieOf(GRACE)],
            [CLIENT_SESSION_HEADER, forged],
          ],
        },
      );
      expect(taken.exit).toMatchObject({
        _tag: 'Success',
        value: { lock: 'held' },
      });
      const same = await owner.run(
        owner.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(same.lock).toBe('held');
      const graceForged = await connect({ as: GRACE, tab: forged });
      const refused = await graceForged.run(
        graceForged.client('AcquireLock', { protocolId, sectionId }),
      );
      expect(refused.lock).toBe('readOnly');
      if (refused.lock !== 'readOnly') throw new Error('unreachable');
      expect(refused.holder.userId).toBe(ADA.userId);
      await owner.run(owner.client('ReleaseLock', { protocolId, sectionId }));
    });

    const failureTag = (exit: Exit.Exit<unknown, unknown>) => {
      if (Exit.isSuccess(exit)) return 'success';
      const error = Cause.findErrorOption(exit.cause);
      return Option.isSome(error) && Predicate.hasProperty(error.value, '_tag')
        ? error.value._tag
        : 'no declared error';
    };

    it('refuses the next call on an open socket once its session is revoked', async () => {
      const tab = await connect({ as: GRACE });
      expect(
        failureTag(
          await tab.runExit(tab.client('ListSections', { protocolId })),
        ),
      ).toBe('success');
      COOKIES.delete(cookieOf(GRACE));
      try {
        expect(
          failureTag(
            await tab.runExit(tab.client('ListSections', { protocolId })),
          ),
        ).toBe('HostUnauthorized');
      } finally {
        COOKIES.set(cookieOf(GRACE), GRACE);
      }
    });

    it('ends a watch over an open socket once its session is revoked', async () => {
      const watcher = await connect({ as: GRACE });
      const watch = watcher.watch(protocolId, undefined, {
        cookie: 'session=grace-elsewhere',
      });
      await until(
        () => watch.events.some((event) => event.type === 'presence'),
        'the watch to go live',
      );
      COOKIES.delete(cookieOf(GRACE));
      try {
        clock.advance(REAUTHORIZE_MS);
        const writer = await connect();
        const sectionId = await createStage(
          writer,
          'Written after a session was revoked',
        );
        await until(() => watch.ended() !== undefined, 'the watch to end');
        const ended = watch.ended();
        expect(ended !== undefined && Exit.isFailure(ended)).toBe(true);
        expect(
          watch.events.some(
            (event) =>
              event.type === 'revision' && event.sectionId === sectionId,
          ),
        ).toBe(false);
      } finally {
        COOKIES.set(cookieOf(GRACE), GRACE);
        await watch.stop();
      }
    });

    it('ends a /rpc/protocol-builder watch when a maintenance window opens', async () => {
      const flag = MutableRef.make(false);
      const gated = await startStudioServer(
        { ...env, deploymentMode: 'self-hosted' },
        studio,
        undefined,
        MaintenanceTriggers.layerWith({
          lockHeld: Effect.succeed(false),
          schema: Effect.succeed({ kind: 'current' }),
        }).pipe(Layer.provide(MaintenanceState.layerTest(flag))),
      );
      const response = await fetch(
        `${gated.origin}${PROTOCOL_BUILDER_RPC_PATH}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/ndjson',
            'sec-fetch-site': 'same-origin',
            'cookie': cookieOf(ADA),
          },
          body: `${JSON.stringify({ _tag: 'Request', id: '1', tag: 'WatchProtocol', payload: { protocolId }, headers: [] })}\n`,
        },
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('the watch has no body');
      const decoder = new TextDecoder();
      let received = '';
      const readUntil = async (
        done: (finished: boolean) => boolean,
        ms: number,
      ) => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          const next = await Promise.race([
            reader.read(),
            new Promise<'late'>((settle) =>
              setTimeout(() => settle('late'), deadline - Date.now()),
            ),
          ]);
          if (next === 'late') return false;
          if (next.value !== undefined) received += decoder.decode(next.value);
          if (done(next.done)) return true;
          if (next.done) return false;
        }
        return false;
      };
      try {
        expect(response.status).toBe(200);
        expect(
          await readUntil(() => received.includes('"presence"'), 5_000),
        ).toBe(true);
        MutableRef.set(flag, true);
        expect(await readUntil((finished) => finished, 3_000)).toBe(true);
      } finally {
        await reader.cancel().catch(() => undefined);
        await gated.dispose();
      }
    });

    it('ends a /rpc/protocol-builder watch as soon as the server stops', async () => {
      const stopping = await startStudioServer(
        { ...env, deploymentMode: 'self-hosted' },
        studio,
      );
      const response = await fetch(
        `${stopping.origin}${PROTOCOL_BUILDER_RPC_PATH}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/ndjson',
            'sec-fetch-site': 'same-origin',
            'cookie': cookieOf(ADA),
          },
          body: `${JSON.stringify({ _tag: 'Request', id: '1', tag: 'WatchProtocol', payload: { protocolId }, headers: [] })}\n`,
        },
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('the watch has no body');
      const decoder = new TextDecoder();
      let received = '';
      let finished = false;
      const reading = (async () => {
        for (;;) {
          const next = await reader.read();
          if (next.value !== undefined) received += decoder.decode(next.value);
          if (next.done) break;
        }
        finished = true;
      })().catch(() => undefined);
      try {
        expect(response.status).toBe(200);
        await until(
          () => received.includes('"presence"'),
          'the watch to go live',
        );
        const stopped = stopping.dispose();
        await until(() => finished, 'the watch to end with the stop', 2_000);
        await stopped;
      } finally {
        await reader.cancel().catch(() => undefined);
        await reading;
      }
    });
  },
);
