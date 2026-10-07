import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Scope,
  Stream,
} from 'effect';
import { afterAll, beforeAll } from 'vitest';

import { type ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import { type CurrentProtocol } from '@codaco/protocol-validation';
import { TEAM_GUC } from '@codaco/studio-sync/rls';
import {
  sectionId as makeSectionId,
  parseSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { createStudio, type Studio } from '../../app.ts';
import { type SessionPrincipal } from '../../auth/service.ts';
import { Database } from '../../db/client.ts';
import {
  type TeamAccess,
  TenantScope,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import { resolve as resolveEnv } from '../../env/resolve.ts';
import { readRelay } from '../../protocol-builder/connections.ts';
import { type LoggedProtocolEvent } from '../../protocol-builder/events.ts';
import { type ProtocolBuilderSession } from '../../protocol-builder/host.ts';
import { RENEW_INTERVAL_MS } from '../../protocol-builder/leases.ts';
import { Presence } from '../../protocol-builder/presence.ts';
import { ProtocolEvents } from '../../protocol-builder/publisher.ts';
import { StagedImports } from '../../protocol-builder/resources.ts';
import { createProtocol, latestDraftId } from '../../protocol/store.ts';
import { type StudioServices } from '../../rpc/deps.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { authServiceStub } from './auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  tenantRows,
  testDb,
  type TestDatabaseRuntime,
} from './database.ts';
import { memoryObjectStore } from './object-store.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  makeShiftableClock,
  makeSpanCounter,
  type ProtocolBuilderTestClient,
} from './protocol-builder.ts';
import { createRpcClient, type RpcTestClient } from './rpc.ts';
import { testCipher, testKeyringEntry } from './secrets.ts';

export const TEAM_ID = 'protocol-builder-team';

type Researcher = {
  principal: SessionPrincipal;
  memberId: string;
  connectionId: string;
  clientSessionId: string;
};

function researcher(slug: string): Researcher {
  return {
    principal: {
      kind: 'user',
      userId: `pb-${slug}-user`,
      email: `pb-${slug}@example.com`,
      emailVerified: true,
      name: `Researcher ${slug}`,
      locale: null,
      sessionId: `pb-${slug}-session`,
    },
    memberId: `pb-${slug}-member`,
    connectionId: `pb-${slug}-connection`,
    clientSessionId: `pb-${slug}-tab`,
  };
}

export const callerOf = (who: Researcher | Caller): Caller =>
  'memberId' in who
    ? {
        principal: who.principal,
        connection: who.connectionId,
        tab: who.clientSessionId,
      }
    : who;

export const ADA = researcher('ada');
export const GRACE = researcher('grace');

export const EDIT = 'edit-1';

export const OTHER_EDIT = 'edit-2';

export const sid = (id: string): ProtocolSectionId =>
  makeSectionId(parseSectionId(id));

export type VariableReference = {
  typeId: string;
  variableId: string;
  stageId: string;
};

function subjectTypeOf(stage: unknown): string | undefined {
  const subject: unknown = (stage as { subject?: unknown }).subject;
  const type = (subject as { type?: unknown } | null | undefined)?.type;
  return typeof type === 'string' ? type : undefined;
}

export function formFields(stage: unknown): unknown[] | undefined {
  const form: unknown = (stage as { form?: unknown }).form;
  const fields = (form as { fields?: unknown } | null | undefined)?.fields;
  return Array.isArray(fields) ? fields : undefined;
}

function strippableVariable(protocol: CurrentProtocol): VariableReference {
  for (const stage of protocol.stages) {
    const type = subjectTypeOf(stage);
    const fields = formFields(stage);
    if (type === undefined || fields === undefined || fields.length < 2) {
      continue;
    }
    const variable = (fields[0] as { variable?: unknown }).variable;
    if (typeof variable === 'string') {
      return { typeId: type, variableId: variable, stageId: stage.id };
    }
  }
  throw new Error('the sample protocol names no variable from a form field');
}

function soleVariablePrompt(protocol: CurrentProtocol): VariableReference {
  for (const stage of protocol.stages) {
    const prompts: unknown = (stage as { prompts?: unknown }).prompts;
    const type = subjectTypeOf(stage);
    if (type === undefined || !Array.isArray(prompts) || prompts.length !== 1) {
      continue;
    }
    const variable = (prompts[0] as { variable?: unknown }).variable;
    if (typeof variable === 'string') {
      return { typeId: type, variableId: variable, stageId: stage.id };
    }
  }
  throw new Error('the sample protocol has no stage with one variable prompt');
}

export function latch() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((settle) => {
    open = settle;
  });
  return { opened, open };
}

type Hold = {
  readonly reached: Promise<void>;
  readonly release: () => void;
};

function holdOnce<A>() {
  let pending:
    | {
        readonly matches: (input: A) => boolean;
        readonly reached: () => void;
        readonly released: Promise<void>;
      }
    | undefined;
  return {
    next: (matches: (input: A) => boolean = () => true): Hold => {
      const reached = latch();
      const released = latch();
      pending = { matches, reached: reached.open, released: released.opened };
      return { reached: reached.opened, release: released.open };
    },
    around: <B, E, R>(
      input: A,
      self: Effect.Effect<B, E, R>,
    ): Effect.Effect<B, E, R> =>
      Effect.suspend(() => {
        const current = pending;
        if (current === undefined || !current.matches(input)) return self;
        pending = undefined;
        current.reached();
        return Effect.andThen(
          Effect.promise(() => current.released),
          self,
        );
      }),
  };
}

/**
 * The relay with its publish, presence change or subscribe held once on
 * request. Its safety poll is a minute apart unless asked otherwise, so that
 * only the hold's own publish can bring a held event to a watcher in time.
 */
export function holdingEvents(safetyPollMs = 60_000) {
  const hold = holdOnce<ReadonlyArray<LoggedProtocolEvent>>();
  const presence = holdOnce<ProtocolBuilderSession>();
  const subscribed = holdOnce<ProtocolBuilderSession>();
  const layer = Layer.effect(
    ProtocolEvents,
    Effect.gen(function* () {
      const real = yield* ProtocolEvents;
      return ProtocolEvents.of({
        ...real,
        publish: (session, entries) =>
          hold.around(entries, real.publish(session, entries)),
        presenceChanged: (session) =>
          presence.around(session, real.presenceChanged(session)),
        subscribe: (session) =>
          Effect.tap(real.subscribe(session), () =>
            subscribed.around(session, Effect.void),
          ),
      });
    }),
  ).pipe(Layer.provide(ProtocolEvents.layerWith({ safetyPollMs })));
  return {
    layer,
    next: hold.next,
    nextPresence: presence.next,
    nextSubscribed: subscribed.next,
  };
}

export function holdingPresence() {
  const hold = holdOnce<undefined>();
  const layer = Layer.effect(
    Presence,
    Effect.gen(function* () {
      const real = yield* Presence;
      return Presence.of({
        ...real,
        setMode: (session) => hold.around(undefined, real.setMode(session)),
      });
    }),
  ).pipe(Layer.provide(Presence.layer));
  return { layer, next: hold.next };
}

/**
 * Staging with an inspection or a promotion's plan held once it has answered,
 * so what follows it — the committed read, the write — runs after whatever
 * the test does meanwhile. Held on the first resource id the call names.
 */
export function holdingStaging() {
  const hold = holdOnce<string>();
  const layer = Layer.effect(
    StagedImports,
    Effect.gen(function* () {
      const real = yield* StagedImports;
      return StagedImports.of({
        ...real,
        inspect: (edit, resourceId) =>
          Effect.flatMap(real.inspect(edit, resourceId), (found) =>
            hold.around(resourceId, Effect.succeed(found)),
          ),
        plan: (edit, resourceIds) =>
          Effect.flatMap(real.plan(edit, resourceIds), (planned) =>
            hold.around(resourceIds[0] ?? '', Effect.succeed(planned)),
          ),
      });
    }),
  ).pipe(Layer.provide(StagedImports.layer));
  return { layer, next: hold.next };
}

export async function until(
  predicate: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const stageSection = (stageId: string) => sid(`stage:${stageId}`);
export const STAGE_ORDER = sid('stageOrder');
export const ASSETS = sid('assets');

export const revisionsOf = (
  events: readonly ProtocolEvent[],
  sectionId: string,
) =>
  events.filter(
    (event): event is Extract<ProtocolEvent, { type: 'revision' }> =>
      event.type === 'revision' && event.sectionId === sectionId,
  );

export const leavingAfterCommit = async <A, E>(
  over: ProtocolBuilderTestClient,
  events: ReturnType<typeof holdingEvents>,
  matches: (entry: LoggedProtocolEvent) => boolean,
  effect: Effect.Effect<A, E>,
) => {
  const committed = events.next((entries) => entries.some(matches));
  const leaving = new AbortController();
  const running = over.callExit(callerOf(ADA), effect, {
    signal: leaving.signal,
  });
  await committed.reached;
  leaving.abort();
  await new Promise((settle) => setTimeout(settle, 50));
  committed.release();
  return running;
};

export function setupProtocolBuilderSuite() {
  let database: TestDatabaseRuntime;
  let studio: Studio;
  let host: ProtocolBuilderTestClient;
  let protocolId: string;
  let draftId: string;
  let services: Context.Context<StudioServices>;
  const runEffect = <A, E>(effect: Effect.Effect<A, E, StudioServices>) =>
    Effect.runPromiseWith(services)(effect);
  const access: TeamAccess = unsafeMakeTeamAccess(TEAM_ID, 'owner');
  const teamRows = <A extends object = Record<string, unknown>>(
    text: string,
    params: ReadonlyArray<unknown> = [],
  ) => database.run(tenantRows<A>(TEAM_ID, text, params));
  let reference: VariableReference;
  let unstrippable: VariableReference;
  let egolessProtocolId: string;
  let adaRpc: RpcTestClient;
  const objects = memoryObjectStore();
  const objectStore = objects.store;
  const clock = makeShiftableClock();

  const call = <A, E>(who: Researcher | Caller, effect: Effect.Effect<A, E>) =>
    host.call(callerOf(who), effect);
  const callExit = <A, E>(
    who: Researcher | Caller,
    effect: Effect.Effect<A, E>,
  ) => host.callExit(callerOf(who), effect);

  const createStage = (who: Researcher, label: string) =>
    call(
      who,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: { type: 'Information', label, title: label, items: [] },
      }),
    );

  // Database time is real, so these age rows rather than wait out a TTL.
  const liveLeases = async (owner: string) =>
    (
      await teamRows<{ section_id: string }>(
        `SELECT section_id FROM leases
          WHERE draft_id = $1 AND owner = $2
            AND expires_at > clock_timestamp()
          ORDER BY section_id`,
        [draftId, owner],
      )
    ).map((row) => row.section_id);

  /** The latest expiry among the owner's lease rows, live or not. */
  const leaseExpiry = async (owner: string) => {
    const [row] = await teamRows<{ at: number | null }>(
      `SELECT (extract(epoch from max(expires_at)) * 1000)::float8 AS at
         FROM leases WHERE draft_id = $1 AND owner = $2`,
      [draftId, owner],
    );
    return row?.at ?? undefined;
  };

  /** Sets every live lease of the owner to expire `expiresInMs` from now. */
  const ageLeases = (owner: string, expiresInMs: number) =>
    teamRows(
      `UPDATE leases
          SET expires_at = clock_timestamp()
                + make_interval(secs => $3::float / 1000)
        WHERE draft_id = $1 AND owner = $2
          AND expires_at > clock_timestamp()
        RETURNING section_id`,
      [draftId, owner, expiresInMs],
    );

  type ConnectionMatch = {
    readonly owner?: string;
    readonly socketId?: string;
    readonly kind?: 'socket' | 'contact';
  };

  /** Sets every live matching connection to expire `expiresInMs` from now. */
  const ageConnections = (match: ConnectionMatch, expiresInMs: number) =>
    teamRows(
      `UPDATE protocol_connections
          SET expires_at = clock_timestamp()
                + make_interval(secs => $2::float / 1000)
        WHERE draft_id = $1
          AND expires_at > clock_timestamp()
          AND ($3::text IS NULL OR owner = $3)
          AND ($4::text IS NULL OR socket_id = $4)
          AND ($5::text IS NULL OR kind = $5)
        RETURNING connection_id`,
      [
        draftId,
        expiresInMs,
        match.owner ?? null,
        match.socketId ?? null,
        match.kind ?? null,
      ],
    );

  type ConnectionRow = {
    connection_id: string;
    socket_id: string | null;
    kind: 'socket' | 'contact';
    owner: string;
    mode: 'viewing' | 'editing';
    section_id: string | null;
    replica_id: string;
    live: boolean;
  };

  const connectionRows = (forDraft: string = draftId) =>
    teamRows<ConnectionRow>(
      `SELECT connection_id, socket_id, kind, owner, mode, section_id,
              replica_id, expires_at > clock_timestamp() AS live
         FROM protocol_connections WHERE draft_id = $1
        ORDER BY created_at, connection_id`,
      [forDraft],
    );

  const present = async () =>
    (
      await runEffect(
        readRelay(access, draftId, { next: undefined, presence: true }),
      )
    ).presence.get(draftId) ?? [];

  /**
   * Locks one row from a connection of the suite's own, as another replica's
   * transaction would, until `release`.
   */
  const holdRow = async (
    statement: string,
    params: ReadonlyArray<unknown> = [],
  ) => {
    const client = await database.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        TEAM_GUC,
        TEAM_ID,
      ]);
      const locked = await client.query(statement, [...params]);
      if (locked.rowCount !== 1) throw new Error('no row to hold');
      const [backend] = (
        await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows;
      if (backend === undefined) throw new Error('no backend pid');
      return {
        pid: backend.pid,
        release: async () => {
          await client.query('ROLLBACK');
          client.release();
        },
      };
    } catch (error) {
      client.release();
      throw error;
    }
  };

  /**
   * The backends waiting on `pid`, each with the connection and lease tables
   * it already holds a lock on.
   */
  const blockedBehind = async (pid: number) =>
    (
      await database.appPool.query<{ pid: number; holds: string[] }>(
        `SELECT a.pid,
                array(SELECT DISTINCT c.relname::text
                        FROM pg_locks l
                        JOIN pg_class c ON c.oid = l.relation
                       WHERE l.pid = a.pid AND l.granted
                         AND c.relnamespace = current_schema()::regnamespace
                         AND c.relname IN ('protocol_connections', 'leases')
                       ORDER BY 1) AS holds
           FROM pg_stat_activity a
          WHERE $1 = ANY(pg_blocking_pids(a.pid))`,
        [pid],
      )
    ).rows;

  const spans = makeSpanCounter();

  const stagedIds = async (editId: string) => {
    const listed = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId, status: 'staged' }),
    );
    if (listed.status !== 'ok') throw new Error('listing failed');
    return listed.data.resources.map((resource) => resource.id);
  };

  const keeperTick = async (
    millis: number = RENEW_INTERVAL_MS,
    over: ReturnType<typeof makeShiftableClock> = clock,
  ) => {
    await until(
      () => over.pending(RENEW_INTERVAL_MS) > 0,
      'the lease keeper to be waiting',
    );
    over.advance(millis);
    await until(
      () => over.pending(RENEW_INTERVAL_MS) > 0,
      'the lease keeper to finish its tick',
    );
  };

  const revoked = new Set<string>();
  const memberships = (userId: string) =>
    Effect.succeed(
      revoked.has(userId) ? [] : [{ teamId: TEAM_ID, role: 'owner' as const }],
    );
  const membership = (userId: string) =>
    Effect.succeed(
      revoked.has(userId) ? Option.none() : Option.some({ role: 'owner' }),
    );

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(insertTeam(TEAM_ID));
    services = Context.add(database.services, SecretsCipher, testCipher());
    for (const who of [ADA, GRACE]) {
      await database.run(
        ownerAffected(
          `INSERT INTO "user" (id, name, email, "emailVerified")
           VALUES ($1, $2, $3, true)`,
          [who.principal.userId, who.principal.name, who.principal.email],
        ),
      );
      await database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, 'owner')`,
          [who.memberId, TEAM_ID, who.principal.userId],
        ),
      );
    }

    const protocol = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@codaco/protocols/sample')),
        'utf8',
      ),
    ) as CurrentProtocol;
    reference = strippableVariable(protocol);
    unstrippable = soleVariablePrompt(protocol);
    const created = await runEffect(
      TenantScope.open(
        access,
        createProtocol(TEAM_ID, testCipher(), { protocol }),
      ),
    );
    protocolId = created.protocolId;
    const { ego: _ego, ...codebook } = protocol.codebook;
    egolessProtocolId = (
      await runEffect(
        TenantScope.open(
          access,
          createProtocol(TEAM_ID, testCipher(), {
            protocol: { ...protocol, name: 'No ego yet', codebook },
          }),
        ),
      )
    ).protocolId;
    const draft = await runEffect(
      TenantScope.open(access, latestDraftId(TEAM_ID, protocolId)),
    );
    if (draft === undefined) throw new Error('the new protocol has no draft');
    draftId = draft;

    studio = createStudio(resolveEnv({ NODE_ENV: 'test' }), {
      auth: authServiceStub({
        listMemberships: memberships,
        getMembership: membership,
      }),
      services,
    });
    host = await createProtocolBuilderClient(studio, {
      clock: clock.clock,
      objectStore,
      tracer: spans.tracer,
    });
    adaRpc = await createRpcClient(
      createStudio(
        resolveEnv({
          NODE_ENV: 'test',
          STUDIO_SECRETS_KEY: ['test-1', 'test-2']
            .map(testKeyringEntry)
            .join(','),
        }),
        {
          auth: authServiceStub({
            getSession: () => Effect.succeedSome(ADA.principal),
            listMemberships: memberships,
            getMembership: membership,
          }),
          services,
        },
      ),
    );
  });

  afterAll(async () => {
    await adaRpc?.dispose();
    await host?.dispose();
    await database?.dispose();
  });

  const watch = (
    who: Researcher | Caller,
    watched: string,
    over: ProtocolBuilderTestClient = host,
  ) => {
    const events: ProtocolEvent[] = [];
    const stop = Deferred.makeUnsafe<void>();
    const ended = over.callExit(
      callerOf(who),
      over.rpc('WatchProtocol', { protocolId: watched }).pipe(
        Stream.interruptWhen(Deferred.await(stop)),
        Stream.runForEach((event) =>
          Effect.sync(() => {
            events.push(event);
          }),
        ),
      ),
    );
    return {
      events,
      ended,
      stop: async () => {
        Deferred.doneUnsafe(stop, Effect.void);
        await ended;
      },
    };
  };

  const watching = async (
    who: Researcher | Caller,
    watched: string,
    over: ProtocolBuilderTestClient = host,
  ) => {
    const channel = watch(who, watched, over);
    await until(
      () => channel.events.some((event) => event.type === 'presence'),
      'the watcher’s own arrival',
    );
    return channel;
  };

  type WatchedEvent = { cursor: string; event: ProtocolEvent };

  const drain = async (
    who: Researcher,
    input: { protocolId: string; since?: string },
  ): Promise<WatchedEvent[]> => {
    const events = await call(
      who,
      Stream.runCollect(
        host
          .rpc('WatchProtocol', input)
          .pipe(
            Stream.takeWhile(
              (event) =>
                event.type !== 'presence' && event.cursor !== undefined,
            ),
          ),
      ),
    );
    return events.flatMap((event) =>
      event.type !== 'presence' && event.cursor !== undefined
        ? [{ cursor: event.cursor, event }]
        : [],
    );
  };

  /**
   * A Studio on an application pool of its own: on the suite's single
   * connection, a transaction blocked in the database holds back every other
   * one in the pool rather than in the code under test.
   */
  const ownPool = async (maxConnections: number) => {
    if (!testDb) throw new Error('no test database');
    const url = testDb.url;
    const scope = await Effect.runPromise(Scope.make());
    const service = Context.get(
      await Effect.runPromise(
        Layer.buildWithScope(
          Database.layer({
            url,
            maxConnections,
            applicationName: 'studio-test-own-pool',
            searchPath: database.harness.schema,
          }),
          scope,
        ),
      ),
      Database,
    );
    return {
      service,
      close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
    };
  };

  const studioOnOwnPool = async (maxConnections: number) => {
    const pool = await ownPool(maxConnections);
    return {
      studio: createStudio(resolveEnv({ NODE_ENV: 'test' }), {
        auth: authServiceStub({
          listMemberships: memberships,
          getMembership: membership,
        }),
        services: Context.add(services, Database, pool.service),
      }),
      close: pool.close,
    };
  };

  const removedAfterOpening = async (slug: string) => {
    const who = researcher(slug);
    await database.run(
      ownerAffected(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING`,
        [who.principal.userId, who.principal.name, who.principal.email],
      ),
    );
    const restore = () =>
      database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, 'owner') ON CONFLICT (id) DO NOTHING`,
          [who.memberId, TEAM_ID, who.principal.userId],
        ),
      );
    const remove = () =>
      database.run(
        ownerAffected(`DELETE FROM team_members WHERE id = $1`, [who.memberId]),
      );
    await restore();
    return { who, remove, restore };
  };

  const createOn = (over: ProtocolBuilderTestClient, label: string) =>
    over.call(
      callerOf(ADA),
      over.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: { type: 'Information', label, title: label, items: [] },
      }),
    );

  return {
    get host() {
      return host;
    },
    get protocolId() {
      return protocolId;
    },
    get draftId() {
      return draftId;
    },
    get reference() {
      return reference;
    },
    get unstrippable() {
      return unstrippable;
    },
    get egolessProtocolId() {
      return egolessProtocolId;
    },
    get adaRpc() {
      return adaRpc;
    },
    get database() {
      return database;
    },
    get studio() {
      return studio;
    },
    get services() {
      return services;
    },
    runEffect,
    access,
    clock,
    objectStore,
    revoked,
    memberships,
    membership,
    objects,
    setStoreUnreachable: (down: boolean) => {
      objects.setUnreachable(down);
    },
    teamRows,
    call,
    callExit,
    createStage,
    liveLeases,
    leaseExpiry,
    ageLeases,
    ageConnections,
    connectionRows,
    present,
    holdRow,
    blockedBehind,
    spans,
    stagedIds,
    keeperTick,
    watch,
    watching,
    drain,
    removedAfterOpening,
    ownPool,
    studioOnOwnPool,
    createOn,
  };
}
