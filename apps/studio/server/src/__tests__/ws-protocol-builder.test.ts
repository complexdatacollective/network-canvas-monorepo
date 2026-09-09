// `/ws` serves the same RPC router as `/rpc` (#1483). The fetch transport
// answers one request with one response, so the host contract's only
// streaming procedure — `watchProtocol` — is unserveable there; this is the
// transport that carries it, and the wiring is what this file proves: a real
// socket, through the real origin and principal guards, to the real router.
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { createORPCClient, getEventMeta } from '@orpc/client';
import { RPCLink } from '@orpc/client/websocket';
import type { RouterContractClient } from '@orpc/contract';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { type contract } from '@codaco/studio-rpc';
import { CLIENT_SESSION_PARAM } from '@codaco/studio-rpc/client-session';
import type { ProtocolEvent } from '@codaco/studio-rpc/protocol-builder';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import { createApp } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { ProtocolStore } from '../protocol/store.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from './support/postgres.ts';

const db = await reachableDb();
const env = readEnv();

const TEAM_ID = 'protocol-builder-ws-team';

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'pb-ws-user',
  email: 'pb-ws@example.com',
  emailVerified: true,
  name: 'Socket Researcher',
  locale: null,
  sessionId: 'pb-ws-session',
};

type StudioClient = RouterContractClient<typeof contract>;

/** A client and the socket under it, which a test may kill without warning. */
type Connected = { client: StudioClient; socket: WebSocket };

describe.skipIf(!db || !env.auth)('the protocol-builder host over /ws', () => {
  let dispose: () => Promise<void>;
  let server: ReturnType<typeof serve>;
  let sockets: WebSocket[];
  let protocolId: string;
  let origin: string;
  let url: string;

  /** The proof the managed ingress boundary requires of every request. */
  function handshake(from: string) {
    return {
      origin: from,
      headers: {
        'x-studio-managed-ingress-proof': env.managedIngressSecret ?? '',
      },
    };
  }

  /**
   * A client on its own socket.
   *
   * A browser cannot put a header on a WebSocket handshake, so a tab names
   * itself on the upgrade URL and its locks belong to that name; a socket that
   * names no tab is its own owner, for as long as it is connected.
   */
  async function connect(tab?: string): Promise<Connected> {
    const socket = new WebSocket(
      tab === undefined
        ? url
        : `${url}?${CLIENT_SESSION_PARAM}=${encodeURIComponent(tab)}`,
      handshake(origin),
    );
    socket.binaryType = 'arraybuffer';
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const link = new RPCLink({
      // The `ws` client implements the event-target surface the adapter uses;
      // its declarations are Node's rather than the DOM's, and this test is
      // the only place the two meet.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      connect: () => socket as unknown as globalThis.WebSocket,
    });
    return { client: createORPCClient(link), socket };
  }

  /**
   * A stage section of the calling test's own, so nothing here locks a section
   * another test left held.
   */
  async function createStage(client: StudioClient, label: string) {
    const created = await client.protocolBuilder.create({
      protocolId,
      kind: 'stage',
      document: { type: 'Information', label, title: label, items: [] },
    });
    return created.sectionId;
  }

  /**
   * Everything a stream has delivered so far, collected in the background.
   *
   * A dropped socket is noticed by the server rather than reported to the
   * test, so the tests below wait for what the server publishes when it
   * notices — the presence list without the connection that died.
   */
  function collect(stream: AsyncIterable<ProtocolEvent>): ProtocolEvent[] {
    const events: ProtocolEvent[] = [];
    void (async () => {
      try {
        for await (const event of stream) events.push(event);
      } catch {
        // The socket closing is the only way these streams end.
      }
    })();
    return events;
  }

  /** Waits for something the server does of its own accord, or fails saying so. */
  async function until(
    predicate: () => boolean,
    what: string,
    timeoutMs = 10_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline)
        throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  beforeAll(async () => {
    if (!db || !env.auth) throw new Error('unreachable: guarded by skipIf');
    const scratch = await createScratchSchema(db);
    dispose = scratch.dispose;
    await provisionScratchSchema(scratch.pool);
    await seedTeam(scratch.pool, TEAM_ID);
    await scratch.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
    );
    await scratch.pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')`,
      ['pb-ws-member', TEAM_ID, PRINCIPAL.userId],
    );

    const protocol = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@codaco/protocols/sample')),
        'utf8',
      ),
    ) as CurrentProtocol;
    const created = await new ProtocolStore(
      createTenantDb(scratch.app, TEAM_ID),
    ).createProtocol({ protocol });
    protocolId = created.protocolId;

    // Self-hosted rather than the dev default: the managed topology refuses
    // anything that has not come through its proxy, and this suite is the
    // socket rather than the ingress boundary.
    const app = createApp(
      { ...env, deploymentMode: 'self-hosted' },
      {
        auth: stubAuthService({
          getSession: () => Promise.resolve(PRINCIPAL),
          listMemberships: () =>
            Promise.resolve([{ teamId: TEAM_ID, role: 'owner' }]),
        }),
        pool: scratch.app as pg.Pool,
      },
    );
    server = serve({
      fetch: app.fetch,
      port: 0,
      hostname: '127.0.0.1',
      websocket: { server: new WebSocketServer({ noServer: true }) },
    });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    origin = new URL(env.auth.baseUrl).origin;
    url = `ws://127.0.0.1:${address.port}/ws`;
    sockets = [];
  });

  afterAll(async () => {
    for (const socket of sockets ?? []) socket.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await dispose?.();
  });

  it('refuses a socket from another origin', async () => {
    const refused = new WebSocket(url, handshake('http://evil.example'));
    const code = await new Promise<number | string>((resolve) => {
      refused.once('unexpected-response', (_req, res) =>
        resolve(res.statusCode ?? 0),
      );
      refused.once('open', () => resolve('opened'));
      refused.once('error', (error) => resolve(error.message));
    });
    refused.close();
    expect(code).toBe(403);
  });

  it('serves unary calls and a resumable watch over one socket', async () => {
    const { client } = await connect();
    const sections = await client.protocolBuilder.listSections({ protocolId });
    expect(sections.sectionIds).toContain('stageOrder');

    const stream = await client.protocolBuilder.watchProtocol({ protocolId });
    const created = await client.protocolBuilder.create({
      protocolId,
      kind: 'stage',
      document: {
        type: 'Information',
        label: 'Made over the socket',
        title: 'Made over the socket',
        items: [],
      },
    });

    // The live half: the write above reaches the open stream, and its event
    // carries the cursor a dropped socket would resume from.
    const live: { cursor: string | undefined; sectionId: unknown }[] = [];
    for await (const event of stream) {
      if (event.type !== 'revision') continue;
      live.push({
        cursor: getEventMeta(event)?.id,
        sectionId: event.sectionId,
      });
      if (live.length === 2) break;
    }
    expect(live.map((entry) => entry.sectionId)).toEqual([
      created.sectionId,
      'stageOrder',
    ]);
    const resumeFrom = live[0]?.cursor;
    expect(resumeFrom).toBeDefined();

    // The resume half, on a second socket: from that cursor the stream starts
    // with the very next event and never repeats the one it resumed from.
    const { client: second } = await connect();
    const replay = await second.protocolBuilder.watchProtocol({
      protocolId,
      since: resumeFrom,
    });
    for await (const event of replay) {
      expect(event.type).toBe('revision');
      if (event.type !== 'revision') break;
      expect(event.sectionId).toBe('stageOrder');
      expect(getEventMeta(event)?.id).toBe(live[1]?.cursor);
      break;
    }
  });

  /**
   * Two tabs of one researcher are two connections, so the second has to be
   * able to say who has the section — and it learns that from the stream, on a
   * socket that served none of the calls that took the lock.
   */
  it('tells a second socket which connection took a section', async () => {
    const { client: watcher } = await connect();
    const { client: holder } = await connect();
    const stream = await watcher.protocolBuilder.watchProtocol({ protocolId });
    const locks: LockEvent[] = [];
    const draining = (async () => {
      for await (const event of stream) {
        if (event.type === 'lock') locks.push(event);
        if (locks.length === 2) break;
      }
    })();

    // The watcher takes one section itself first, so the lock event for the
    // other one can be compared against its own connection rather than merely
    // looking plausible.
    await watcher.protocolBuilder.acquireLock({
      protocolId,
      sectionId: 'assets',
    });
    await holder.protocolBuilder.acquireLock({
      protocolId,
      sectionId: 'stageOrder',
    });
    await draining;

    const own = locks.find((event) => event.sectionId === 'assets')?.holder;
    const theirs = locks.find(
      (event) => event.sectionId === 'stageOrder',
    )?.holder;
    expect(own?.sessionId).toBeDefined();
    expect(theirs?.userId).toBe(PRINCIPAL.userId);
    expect(theirs?.displayName).toBe(PRINCIPAL.name);
    expect(theirs?.mode).toBe('editing');
    expect(theirs?.sectionId).toBe('stageOrder');
    // Two tabs of one researcher are two owners, so the identity the event
    // carries is the socket's rather than the person's.
    expect(theirs?.sessionId).not.toBe(own?.sessionId);

    // The connection the event named is the one the lease is actually under:
    // asking for the same section answers read-only behind that same identity.
    const behind = await watcher.protocolBuilder.acquireLock({
      protocolId,
      sectionId: 'stageOrder',
    });
    expect(behind.lock).toBe('readOnly');
    if (behind.lock !== 'readOnly') return;
    expect(behind.holder.sessionId).toBe(theirs?.sessionId);

    // Given back before the test ends: the stage index and the asset manifest
    // are the sections a create and a promoting write have to take, so a test
    // that keeps them refuses every later one in this suite.
    await holder.protocolBuilder.releaseLock({
      protocolId,
      sectionId: 'stageOrder',
    });
    await watcher.protocolBuilder.releaseLock({
      protocolId,
      sectionId: 'assets',
    });
  });

  /**
   * A tab that loses its socket is the same tab when it comes back, and the
   * section it had open is still its own: the lock owner is the tab the client
   * names on its upgrade, never the connection that carried the call. A
   * network blip is a reconnection in progress, and losing a lock under an
   * open editor is not a thing that may happen.
   */
  it('keeps a section for the tab that took it when its socket dies', async () => {
    const tab = 'pb-ws-reconnecting-tab';
    const first = await connect(tab);
    // A colleague on a socket of its own: what it is refused after the drop is
    // what makes the section still the dead tab's rather than nobody's.
    const stranger = await connect();
    const watched = collect(
      await stranger.client.protocolBuilder.watchProtocol({ protocolId }),
    );
    const sectionId = await createStage(first.client, 'Held across a drop');
    // The channel is what renews this tab's lease, and what strands its owner
    // when the socket under it dies.
    collect(await first.client.protocolBuilder.watchProtocol({ protocolId }));

    const held = await first.client.protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(held.lock).toBe('held');
    if (held.lock !== 'held') throw new Error('unreachable');
    await until(
      () => lockHolder(watched, sectionId) !== undefined,
      'the lock event to reach the colleague',
    );
    const connection = lockHolder(watched, sectionId)?.sessionId;
    if (connection === undefined) throw new Error('the lock named no holder');
    await until(
      () => isPresent(watched, connection),
      'the first socket to be present',
    );

    // A drop rather than a close: no close frame, so the server learns of it
    // the way it learns of a network blip.
    first.socket.terminate();
    await until(
      () => !isPresent(watched, connection),
      'the server to notice the socket died',
    );

    const behind = await stranger.client.protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(behind.lock).toBe('readOnly');
    if (behind.lock !== 'readOnly') throw new Error('unreachable');
    expect(behind.holder.userId).toBe(PRINCIPAL.userId);

    // The tab comes back on a new socket, names itself, and finds the section
    // still its own — and writes it, which is the whole point of keeping it.
    const second = await connect(tab);
    collect(await second.client.protocolBuilder.watchProtocol({ protocolId }));
    const resumed = await second.client.protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(resumed.lock).toBe('held');
    if (resumed.lock !== 'held') throw new Error('unreachable');
    const written = await second.client.protocolBuilder.submit({
      protocolId,
      sectionId,
      document: { ...resumed.document, label: 'Renamed after the reconnect' },
      revision: resumed.revision,
    });
    expect(written.revision.sequence).toBeGreaterThan(
      resumed.revision.sequence,
    );
    const read = await second.client.protocolBuilder.getSection({
      protocolId,
      sectionId,
    });
    expect(read.document.label).toBe('Renamed after the reconnect');
  });

  /**
   * A tab id the server would not store is no identity at all: the caller
   * falls back to its connection, which is what a client naming nothing gets
   * (the test above), so two such sockets are two owners rather than one.
   */
  it('falls back to the connection for a socket whose tab id it cannot use', async () => {
    const unusable = 'not a tab id!';
    const first = await connect(unusable);
    const second = await connect(unusable);
    const sectionId = await createStage(first.client, 'Named by no usable tab');

    const held = await first.client.protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(held.lock).toBe('held');
    // Had the server taken the id, both sockets would be one owner and this
    // would have been the holder's own section handed back to it.
    const behind = await second.client.protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(behind.lock).toBe('readOnly');
    if (behind.lock !== 'readOnly') throw new Error('unreachable');
    expect(behind.holder.userId).toBe(PRINCIPAL.userId);
    expect(behind.holder.displayName).toBe(PRINCIPAL.name);
  });
});

type LockEvent = Extract<ProtocolEvent, { type: 'lock' }>;
type PresenceEvent = Extract<ProtocolEvent, { type: 'presence' }>;

/** The holder a lock event named for a section, out of what a stream saw. */
function lockHolder(
  events: readonly ProtocolEvent[],
  sectionId: string,
): LockEvent['holder'] | undefined {
  return events.findLast(
    (event): event is LockEvent =>
      event.type === 'lock' && event.sectionId === sectionId,
  )?.holder;
}

/** Whether the last presence a stream saw still contains this connection. */
function isPresent(
  events: readonly ProtocolEvent[],
  sessionId: string,
): boolean {
  const latest = events.findLast(
    (event): event is PresenceEvent => event.type === 'presence',
  );
  return (
    latest?.present.some((present) => present.sessionId === sessionId) ?? false
  );
}
