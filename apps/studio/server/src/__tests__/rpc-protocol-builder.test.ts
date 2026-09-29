// The protocol-builder host contract, served by Studio (#1483): the refusals
// that make a lock mean something, the pointer registration that makes a
// created stage reachable, and the replay that makes a dropped connection
// recoverable.
//
// These procedures are served at `/ws` and `/rpc/protocol-builder` by the
// Effect rpc host. Driven through the handlers in process
// (`support/protocol-builder.ts`) rather than a transport, so what is under
// test is the handlers and their storage rather than a serialization: the
// WebSocket wiring is covered by ws-protocol-builder.test.ts.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cause, Context, Deferred, Effect, Exit, Option, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { MAX_UPLOAD_BYTES } from '@codaco/studio-contract/limits';
import {
  DraftId,
  ProtocolId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';
import {
  parseSectionId,
  sectionId as makeSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { createStudio, type Studio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import {
  type TeamAccess,
  TenantScope,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import { resolve as resolveEnv } from '../env/resolve.ts';
import { collectLogs } from '../platform/__tests__/support/logs.ts';
import { REAUTHORIZE_MS } from '../protocol-builder/handlers.ts';
import {
  IDLE_MS,
  Leases,
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
} from '../protocol-builder/leases.ts';
import { Presence } from '../protocol-builder/presence.ts';
import { ProtocolEvents } from '../protocol-builder/publisher.ts';
import { ASSET_KEY_PLACEHOLDER, openAssetKey } from '../protocol/asset-keys.ts';
import { createProtocol, latestDraftId } from '../protocol/store.ts';
import type { StudioServices } from '../rpc/deps.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { ObjectStore, ObjectStoreError } from '../storage/object-store.ts';
import { authServiceStub } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  type TestDatabaseRuntime,
  testDb,
  tenantRows,
} from './support/database.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  makeShiftableClock,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { testCipher, testKeyringEntry } from './support/secrets.ts';
import {
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

const TEAM_ID = 'protocol-builder-team';

/** The limiter's store, for the one case whose subject is a denial. */
const limiterUrl = await reachableRedis(REDIS_DATABASES.protocolBuilder);

type Researcher = {
  principal: SessionPrincipal;
  memberId: string;
  /** The connection, which is what the host draws presence from. */
  connectionId: string;
  /** The browser tab, which is what the host locks per. */
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

/** A researcher's calls, made over their socket from their tab. */
const callerOf = (who: Researcher | Caller): Caller =>
  'memberId' in who
    ? {
        principal: who.principal,
        connection: who.connectionId,
        tab: who.clientSessionId,
      }
    : who;

const ADA = researcher('ada');
const GRACE = researcher('grace');

/**
 * The edit these calls are made from: one stage editor or codebook dialog,
 * open from the moment it starts until its submit or its cancel.
 */
const EDIT = 'edit-1';

/** A second edit open beside it — a codebook dialog over a stage editor. */
const OTHER_EDIT = 'edit-2';

/** A section id as the contract takes it, checked against the taxonomy. */
const sid = (id: string): ProtocolSectionId =>
  makeSectionId(parseSectionId(id));

type VariableReference = {
  typeId: string;
  variableId: string;
  stageId: string;
};

function subjectTypeOf(stage: unknown): string | undefined {
  const subject: unknown = (stage as { subject?: unknown }).subject;
  const type = (subject as { type?: unknown } | null | undefined)?.type;
  return typeof type === 'string' ? type : undefined;
}

function formFields(stage: unknown): unknown[] | undefined {
  const form: unknown = (stage as { form?: unknown }).form;
  const fields = (form as { fields?: unknown } | null | undefined)?.fields;
  return Array.isArray(fields) ? fields : undefined;
}

/**
 * A variable one stage's form names, alongside other fields.
 *
 * Taken from the sample protocol rather than written here: the refactor under
 * test sweeps every reference the schema declares, and a hand-written pair
 * could stop being a reference without the test noticing. A form field is the
 * reference to pick because it is one the host can remove — the field goes and
 * the stage is still a stage — and because nothing in the sample protocol
 * reaches this variable from a prompt, which is all the host used to look at.
 */
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

/**
 * A variable that is a stage's only prompt: removing the prompt would leave a
 * stage with none, so this is a reference no host can sweep away.
 */
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

/** Polls until `predicate` holds, for state a fiber settles after a call. */
async function until(
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

describe.skipIf(!testDb)('the protocol-builder host surface', () => {
  let database: TestDatabaseRuntime;
  let studio: Studio;
  let host: ProtocolBuilderTestClient;
  let protocolId: string;
  let draftId: string;
  /**
   * The Effect half of the suite's own setup and reads: the same context the
   * Studio is built over, so everything that seals or opens a key agrees.
   */
  let services: Context.Context<StudioServices>;
  let runEffect: <A, E>(
    effect: Effect.Effect<A, E, StudioServices>,
  ) => Promise<A>;
  /** The team this suite acts in, as a proved access. */
  const access: TeamAccess = unsafeMakeTeamAccess(TEAM_ID, 'owner');
  /** Rows as the host's own sessions reach them: the app role, in this team. */
  const teamRows = <A extends object = Record<string, unknown>>(
    text: string,
    params: ReadonlyArray<unknown> = [],
  ) => database.run(tenantRows<A>(TEAM_ID, text, params));
  let reference: VariableReference;
  let unstrippable: VariableReference;
  /** A protocol whose researcher has given the participant no attributes. */
  let egolessProtocolId: string;
  /**
   * The researcher-facing plane beside the host: `protocols.draft` is served
   * by the Effect rpc server at `/rpc`, so the one case that reads a whole
   * draft back drives it through that client rather than this host.
   */
  let adaRpc: RpcTestClient;
  /**
   * The object store a content promotion writes through, in memory.
   *
   * Studio names committed bytes by their content hash, and only a promotion
   * that reaches storage produces that name — without a store, every content
   * promotion is refused `unavailable` and the manifest is never written.
   */
  const stored = new Map<string, { bytes: Uint8Array; mediaType: string }>();
  /** Set while a test needs the object store to be the thing that is down. */
  let storeUnreachable = false;
  const unreachable = (operation: 'put' | 'head') =>
    new ObjectStoreError({
      operation,
      cause: new Error('the object store is unreachable'),
    });
  const objectStore: ObjectStore['Service'] = ObjectStore.of({
    configured: true,
    put: (bytes, mediaType) =>
      Effect.suspend(() => {
        if (storeUnreachable) return Effect.fail(unreachable('put'));
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (!stored.has(hash)) stored.set(hash, { bytes, mediaType });
        const existing = stored.get(hash);
        if (existing === undefined) return Effect.die(new Error('unreachable'));
        return Effect.succeed({
          hash,
          size: existing.bytes.byteLength,
          mediaType: existing.mediaType,
        });
      }),
    get: () => Effect.succeed(Option.none()),
    head: Effect.suspend(() =>
      storeUnreachable ? Effect.fail(unreachable('head')) : Effect.void,
    ),
  });
  /**
   * The clock the handlers and the lease keeper read, so a test can reach the
   * idle bound without spending five minutes there. Sleeps are left real
   * otherwise: this suite drives Postgres and rpc streams, both of which are
   * timer-driven.
   */
  const clock = makeShiftableClock();

  const call = <A, E>(who: Researcher | Caller, effect: Effect.Effect<A, E>) =>
    host.call(callerOf(who), effect);
  const callExit = <A, E>(
    who: Researcher | Caller,
    effect: Effect.Effect<A, E>,
  ) => host.callExit(callerOf(who), effect);

  const stageSection = (stageId: string) => sid(`stage:${stageId}`);
  const STAGE_ORDER = sid('stageOrder');
  const ASSETS = sid('assets');

  /** A stage of this test's own, so nothing here reads another test's edit. */
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

  const heldSections = (owner: string) =>
    host.run(Leases.use((leases) => leases.heldSections(draftId, owner)));

  const present = () =>
    host.run(Presence.use((presence) => presence.list(draftId)));

  /**
   * One renewal tick of the lease keeper: waits for it to be sleeping, moves
   * the clock `millis` on, and waits for it to be sleeping again — which it is
   * only once every lease it holds has been asked about.
   */
  const keeperTick = async (millis: number = RENEW_INTERVAL_MS) => {
    await until(
      () => clock.pending(RENEW_INTERVAL_MS) > 0,
      'the lease keeper to be waiting',
    );
    clock.advance(millis);
    await until(
      () => clock.pending(RENEW_INTERVAL_MS) > 0,
      'the lease keeper to finish its tick',
    );
  };

  /** Researchers whose membership the team has taken away. */
  const revoked = new Set<string>();
  const memberships = (userId: string) =>
    Effect.succeed(
      revoked.has(userId) ? [] : [{ teamId: TEAM_ID, role: 'owner' as const }],
    );
  /**
   * The same answer for the team-scoped procedures, which resolve a named team
   * rather than searching the caller's memberships — `protocols.draft` is the
   * one this suite reaches, to read back what a promotion stored.
   */
  const membership = (userId: string) =>
    Effect.succeed(
      revoked.has(userId) ? Option.none() : Option.some({ role: 'owner' }),
    );

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(insertTeam(TEAM_ID));
    // The services carry the test keyring the host and the rpc plane below
    // are built with, so everything that seals or opens a key agrees on it.
    services = Context.add(database.services, SecretsCipher, testCipher());
    runEffect = (effect) => Effect.runPromiseWith(services)(effect);
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
      pool: database.appPool,
      services,
    });
    // Everything a host keeps in memory — its staging areas, its lease keeper
    // — is built here, so building another over the same Studio is a
    // restarted server serving the same database.
    host = await createProtocolBuilderClient(studio, {
      clock: clock.clock,
      objectStore,
    });
    // The same keyring the host above is built with, so a draft read back
    // through the rpc plane opens the rows this suite sealed.
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
          pool: database.appPool,
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

  /**
   * An open channel, drained in the background into `events`. `stop` is the
   * client going away: it interrupts the watch, which is what ends the
   * connection on the host. `ended` settles with how the watch finished.
   */
  const watch = (who: Researcher | Caller, watched: string) => {
    const events: ProtocolEvent[] = [];
    const stop = Deferred.makeUnsafe<void>();
    const ended = callExit(
      who,
      host.rpc('WatchProtocol', { protocolId: watched }).pipe(
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

  /**
   * A watch that has published this watcher's own arrival, so nothing after it
   * can land in the gap before the handler subscribed.
   */
  const watching = async (who: Researcher | Caller, watched: string) => {
    const channel = watch(who, watched);
    await until(
      () => channel.events.some((event) => event.type === 'presence'),
      'the watcher’s own arrival',
    );
    return channel;
  };

  type WatchedEvent = { cursor: string; event: ProtocolEvent };

  /**
   * The replayable events a watcher is handed before it goes live.
   *
   * Presence is dropped: it carries no cursor by design, arrives from process
   * memory rather than the log, and would make a replay comparison depend on
   * who happened to be watching.
   */
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

  it.skipIf(!limiterUrl)(
    "logs a spent rpc_user budget through the program's logger",
    async () => {
      // The handlers run on the runtime the program builds; a denial's warning
      // must reach the logger that runtime carries, not Effect's default one —
      // in a deployment the difference between a JSON line and plain text
      // nothing reads.
      const logs = collectLogs();
      const store = await openRateLimitStore(limiterUrl);
      const limited = await createProtocolBuilderClient(
        createStudio(resolveEnv({ NODE_ENV: 'test' }), {
          auth: authServiceStub({
            listMemberships: memberships,
            getMembership: membership,
          }),
          limiter: store.limiter({ rpc_user: { max: 1, windowMs: 60_000 } }),
          pool: database.appPool,
          services,
        }),
        { objectStore, layer: logs.layer },
      );
      try {
        const read = () =>
          limited.callExit(
            callerOf(ADA),
            limited.rpc('GetSection', {
              protocolId,
              sectionId: stageSection(reference.stageId),
            }),
          );

        expect(Exit.isSuccess(await read())).toBe(true);
        const refused = await read();
        expect(Exit.isFailure(refused)).toBe(true);
        if (Exit.isSuccess(refused)) return;
        // Not one of the group's declared errors: `RateLimited` is not on the
        // contract, so the refusal is a defect the client cannot name.
        expect(Option.isNone(Cause.findErrorOption(refused.cause))).toBe(true);
        // Mutation: run the check with `Effect.runPromise` → the warning goes
        // to the default logger and nothing is captured.
        expect(
          logs.messages.filter((line) => line.startsWith('Rate limit reached')),
        ).toEqual([
          'Rate limit reached for rpc_user; callers are refused for up to 60s.',
        ]);
      } finally {
        await limited.dispose();
        await store.dispose();
      }
    },
  );

  it('refuses a submit from a caller that does not hold the lock', async () => {
    const sectionId = stageSection(reference.stageId);
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );

    await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId,
          document: { ...before.document, label: 'Renamed without the lock' },
          revision: before.revision,
        }),
      ),
      'NotLockHolder',
    );

    // The refusal has to be a refusal: an error the host reports while having
    // written anyway would pass a code-only assertion.
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );
    expect(after.document).toEqual(before.document);
    expect(after.revision).toEqual(before.revision);
  });

  it('opens read-only behind the holder, and names them', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(held.lock).toBe('held');
    try {
      const second = await call(
        ADA,
        host.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(second.lock).toBe('readOnly');
      if (second.lock !== 'readOnly') throw new Error('unreachable');
      expect(second.holder.userId).toBe(GRACE.principal.userId);
      expect(second.holder.displayName).toBe(GRACE.principal.name);
      expect(second.holder.sessionId).toBe(GRACE.connectionId);
    } finally {
      await call(GRACE, host.rpc('ReleaseLock', { protocolId, sectionId }));
    }
  });

  it('writes a submit from the holder, and lets the next editor take it', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was already taken');
    const document = { ...held.document, label: 'Renamed by its holder' };
    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId,
        document,
        revision: held.revision,
      }),
    );
    expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);

    const read = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );
    expect(read.document.label).toBe('Renamed by its holder');
    expect(read.revision.sequence).toBe(written.revision.sequence);

    await call(ADA, host.rpc('ReleaseLock', { protocolId, sectionId }));
    const next = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(next.lock).toBe('held');
    await call(GRACE, host.rpc('ReleaseLock', { protocolId, sectionId }));
  });

  it('registers a created stage in the stage order at the same revision', async () => {
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    const orderBefore = before.document.stages;
    if (!Array.isArray(orderBefore))
      throw new Error('stageOrder is not a list');

    const created = await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: {
          type: 'Information',
          label: 'Created by the host',
          title: 'Created by the host',
          items: [],
        },
        position: 1,
      }),
    );

    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    const stageId = created.sectionId.slice('stage:'.length);
    expect(order.document.stages).toEqual([
      orderBefore[0],
      stageId,
      ...orderBefore.slice(1),
    ]);
    // One atomic operation, so both sections carry one sequence — that is what
    // makes "the stage and its pointer landed together" observable.
    expect(order.revision.sequence).toBe(created.revision.sequence);
    const stage = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: created.sectionId }),
    );
    expect(stage.revision.sequence).toBe(created.revision.sequence);
    expect(stage.document.id).toBe(stageId);

    const listed = await call(ADA, host.rpc('ListSections', { protocolId }));
    expect(listed.sectionIds).toContain(created.sectionId);
  });

  it('refuses a refactor whose sections another editor holds, naming them', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(held.lock).toBe('held');
    const codebookSection = sid(`codebook:node:${reference.typeId}`);
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: codebookSection }),
    );
    try {
      const error = await expectRpcFailure(
        callExit(
          ADA,
          host.rpc('RefactorDeleteVariable', {
            protocolId,
            subject: { entity: 'node', type: reference.typeId },
            variableId: reference.variableId,
          }),
        ),
        'SectionsLocked',
      );
      const blocked = error.blocked;
      expect(blocked.map((entry) => entry.sectionId)).toContain(sectionId);
      const holder = blocked.find(
        (entry) => entry.sectionId === sectionId,
      )?.holder;
      expect(holder?.userId).toBe(GRACE.principal.userId);
      expect(holder?.displayName).toBe(GRACE.principal.name);
    } finally {
      await call(GRACE, host.rpc('ReleaseLock', { protocolId, sectionId }));
    }
    // Blocked means nothing was written, including the section nobody held.
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: codebookSection }),
    );
    expect(after.document).toEqual(before.document);
  });

  /**
   * The sweep is the schema's, not a list of paths this host happens to know:
   * the variable it removes here is named by a form field and by nothing else,
   * so a host that only stripped prompts would delete it and leave the stage
   * pointing at a variable that is gone.
   */
  it('applies a refactor once every section it writes is free', async () => {
    const sectionId = stageSection(reference.stageId);
    const stageBefore = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );
    const fieldsBefore = formFields(stageBefore.document);
    if (fieldsBefore === undefined) throw new Error('stage has no form');
    expect(
      fieldsBefore.filter(
        (field) =>
          (field as { variable?: unknown }).variable === reference.variableId,
      ),
    ).not.toHaveLength(0);

    const applied = await call(
      ADA,
      host.rpc('RefactorDeleteVariable', {
        protocolId,
        subject: { entity: 'node', type: reference.typeId },
        variableId: reference.variableId,
      }),
    );
    expect(applied.changedSections).toContain(sectionId);

    const codebook = await call(
      ADA,
      host.rpc('GetSection', {
        protocolId,
        sectionId: sid(`codebook:node:${reference.typeId}`),
      }),
    );
    expect(
      (codebook.document.variables as Record<string, unknown>)[
        reference.variableId
      ],
    ).toBeUndefined();
    const stage = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );
    expect(formFields(stage.document)).toEqual(
      fieldsBefore.filter(
        (field) =>
          (field as { variable?: unknown }).variable !== reference.variableId,
      ),
    );
    // Every section of one refactor carries one sequence.
    expect(stage.revision.sequence).toBe(applied.revision.sequence);
    expect(codebook.revision.sequence).toBe(applied.revision.sequence);
  });

  it('refuses a deletion whose references it cannot remove, and names them', async () => {
    const sectionId = stageSection(unstrippable.stageId);
    const codebookSection = sid(`codebook:node:${unstrippable.typeId}`);
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: codebookSection }),
    );

    // Dropping the prompt would leave a stage with none, and no other reading
    // of "remove this reference" is one the researcher asked for — so the
    // change is refused whole, naming what is still using the variable.
    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('RefactorDeleteVariable', {
          protocolId,
          subject: { entity: 'node', type: unstrippable.typeId },
          variableId: unstrippable.variableId,
        }),
      ),
      'ReferencesRemain',
    );
    expect(error.remaining).toContainEqual({
      sectionId,
      path: ['prompts', 0, 'variable'],
    });
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: codebookSection }),
    );
    expect(after.document).toEqual(before.document);
  });

  /**
   * The bytes and the section naming them are one revision, so the two states
   * a separate promotion procedure made reachable — a manifest entry nothing
   * points at, a section pointing at bytes that were never committed — are not
   * states this host can be left in.
   */
  it('promotes a staged resource in the submitting section’s own revision', async () => {
    const stage = await createStage(ADA, 'Names a secret');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'promoted-secret',
        request: { kind: 'secret', name: 'Mapbox token', value: 'pk.secret' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Names a secret' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [staged.data.descriptor.id] },
      }),
    );

    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document[staged.data.descriptor.id]).toMatchObject({
      name: 'Mapbox token',
      type: 'apikey',
    });
    // One sequence across both sections is what "atomic" means to a watcher
    // reading the stream in order.
    expect(assets.revision.sequence).toBe(written.revision.sequence);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('writes neither the section nor the manifest when a promotion fails', async () => {
    const stage = await createStage(ADA, 'Renamed beside a bad promotion');
    const assetsBefore = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );

    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: { ...held.document, label: 'Renamed' },
          revision: held.revision,
          promote: { editId: EDIT, resourceIds: ['never-staged'] },
        }),
      ),
      'PromotionFailed',
    );

    expect(error).toMatchObject({
      sectionId: stage.sectionId,
      failure: { reason: 'not-found', resourceId: 'never-staged' },
    });
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
    );
    expect(after.document.label).toBe('Renamed beside a bad promotion');
    expect(after.revision).toEqual(held.revision);
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document).toEqual(assetsBefore.document);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  /**
   * A staged key is still in the host's memory; a promoted one has been sealed
   * into `protocol_asset_keys` and is opened again here (#1900). Either way
   * `inspect` answers with the value, because that is what the stage editor's
   * map preview frames its view on.
   */
  it('hands a staged and a promoted API key back through inspect', async () => {
    const stage = await createStage(ADA, 'Reads its key back');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'readable-secret',
        request: {
          kind: 'secret',
          name: 'Readable token',
          value: 'pk.readable',
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const whileStaged = await call(
      ADA,
      host.rpc('ResourcesInspect', { protocolId, editId: EDIT, resourceId }),
    );
    expect(whileStaged.status === 'ok' && whileStaged.data.value).toBe(
      'pk.readable',
    );

    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Reads its key back' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );

    const committed = await call(
      ADA,
      host.rpc('ResourcesInspect', { protocolId, resourceId }),
    );
    expect(committed.status === 'ok' && committed.data.value).toBe(
      'pk.readable',
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('seals a promoted API key instead of writing it into the protocol', async () => {
    // Deliberately not Mapbox-token shaped: `pnpm check:mapbox-tokens` scans
    // every tracked file for `<pk|sk|tk>.eyJ….…`, and a fixture wearing that
    // shape fails the repository-wide guard whether or not it is a real token.
    const SECRET = 'map-key-never-at-rest';
    const stage = await createStage(ADA, 'Seals its key');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'sealed-secret',
        request: { kind: 'secret', name: 'Sealed token', value: SECRET },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Seals its key' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    // The manifest entry names the asset and carries no value.
    const manifest = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    const entry = (manifest?.document as Record<string, unknown> | undefined)?.[
      resourceId
    ];
    expect(entry).toEqual({ name: 'Sealed token', type: 'apikey' });

    // Exactly one sealed row, and it opens to what was staged.
    const sealed = await teamRows(
      `SELECT key_id FROM protocol_asset_keys
       WHERE team_id = $1 AND protocol_id = $2 AND asset_id = $3`,
      [TEAM_ID, protocolId, resourceId],
    );
    expect(sealed).toHaveLength(1);
    await expect(
      runEffect(
        TenantScope.open(
          access,
          openAssetKey(testCipher(), {
            teamId: TEAM_ID,
            protocolId,
            assetId: resourceId,
          }),
        ),
      ),
    ).resolves.toBe(SECRET);

    // No section row anywhere holds it — not the head manifest, not the
    // revision the promotion replaced, and not the event log a watcher
    // replays from.
    const sections = await teamRows<{ doc: string }>(
      `SELECT doc::text AS doc FROM sections`,
    );
    for (const row of sections) {
      expect(row.doc).not.toContain(SECRET);
    }
    const events = await teamRows<{ doc: string }>(
      `SELECT doc::text AS doc FROM protocol_events WHERE doc IS NOT NULL`,
    );
    for (const row of events) {
      expect(row.doc).not.toContain(SECRET);
    }

    // And the researcher-facing read of the whole draft carries none of it.
    const draft = await adaRpc.call(
      adaRpc.rpc('protocols.draft', {
        teamId: TeamId.make(TEAM_ID),
        protocolId: ProtocolId.make(protocolId),
        draftId: DraftId.make(draftId),
      }),
    );
    expect(JSON.stringify(draft)).not.toContain(SECRET);
  });

  it('admits a submit of the assets section carrying a redacted API key', async () => {
    // A stored `apikey` entry has no `value`, which the shared assets schema
    // requires, so the host's shape check refused every later edit of the
    // manifest once a key had been promoted into it (#1900) — adding a file
    // asset beside one, or renaming anything in it.
    const SECRET = 'map-key-submitted-beside';
    const stage = await createStage(ADA, 'Keeps its key');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'redacted-beside',
        request: { kind: 'secret', name: 'Beside token', value: SECRET },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Keeps its key' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    // The manifest as the editor now reads it: the key entry, redacted.
    const manifest = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: ASSETS }),
    );
    expect((manifest.document as Record<string, unknown>)[resourceId]).toEqual({
      name: 'Beside token',
      type: 'apikey',
    });

    const submitted = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: ASSETS,
        document: {
          ...manifest.document,
          districts: {
            name: 'Districts',
            type: 'geojson',
            source: 'districts.geojson',
          },
        },
        revision: manifest.revision,
      }),
    );
    expect(submitted.revision).toBeDefined();
    await call(ADA, host.rpc('ReleaseLock', { protocolId, sectionId: ASSETS }));

    // The placeholder the shape check was given is never written.
    const sections = await teamRows<{ doc: string }>(
      `SELECT doc::text AS doc FROM sections`,
    );
    for (const row of sections) {
      expect(row.doc).not.toContain(SECRET);
      expect(row.doc).not.toContain(ASSET_KEY_PLACEHOLDER);
    }
    // And the key is still sealed and still opens under the same asset id.
    await expect(
      runEffect(
        TenantScope.open(
          access,
          openAssetKey(testCipher(), {
            teamId: TEAM_ID,
            protocolId,
            assetId: resourceId,
          }),
        ),
      ),
    ).resolves.toBe(SECRET);
  });

  it('answers a discard with the status alone', async () => {
    const staged = await call(
      GRACE,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'discarded-secret',
        request: { kind: 'secret', name: 'Throwaway', value: 'pk.throwaway' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const discarded = await call(
      GRACE,
      host.rpc('ResourcesDiscard', {
        protocolId,
        editId: EDIT,
        resourceId: staged.data.descriptor.id,
      }),
    );

    // The whole answer is the status: a `data` key whose only value is
    // `undefined` is one a transport may drop and a schema then rejects.
    expect(discarded).toStrictEqual({ status: 'ok' });
    const again = await call(
      GRACE,
      host.rpc('ResourcesDiscard', {
        protocolId,
        editId: EDIT,
        resourceId: staged.data.descriptor.id,
      }),
    );
    expect(again).toStrictEqual({
      status: 'failed',
      failure: {
        reason: 'not-found',
        message: 'no such staged resource',
        retryable: false,
        resourceId: staged.data.descriptor.id,
      },
    });
  });

  it('removes a stage and its place in the stage order in one revision', async () => {
    const created = await createStage(ADA, 'Created to be deleted');
    const stageId = created.sectionId.slice('stage:'.length);

    const deleted = await call(
      ADA,
      host.rpc('Delete', { protocolId, sectionId: created.sectionId }),
    );

    expect(deleted.changedSections).toEqual([created.sectionId, 'stageOrder']);
    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    // A pointer left behind, or a section left out of the order, is a protocol
    // that cannot be assembled at all.
    expect(order.document.stages).not.toContain(stageId);
    expect(order.revision.sequence).toBe(deleted.revision.sequence);
    await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('GetSection', { protocolId, sectionId: created.sectionId }),
      ),
      'SectionNotFound',
    );
    const listed = await call(ADA, host.rpc('ListSections', { protocolId }));
    expect(listed.sectionIds).not.toContain(created.sectionId);
  });

  it('refuses to delete a stage an editor holds, and names them', async () => {
    const created = await createStage(ADA, 'Held while someone deletes it');
    const held = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId: created.sectionId }),
    );
    expect(held.lock).toBe('held');

    try {
      const error = await expectRpcFailure(
        callExit(
          ADA,
          host.rpc('Delete', { protocolId, sectionId: created.sectionId }),
        ),
        'SectionsLocked',
      );
      expect(error.blocked.map((entry) => entry.sectionId)).toEqual([
        created.sectionId,
      ]);
      expect(error.blocked[0]?.holder?.userId).toBe(GRACE.principal.userId);
    } finally {
      await call(
        GRACE,
        host.rpc('ReleaseLock', { protocolId, sectionId: created.sectionId }),
      );
    }
    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(order.document.stages).toContain(
      created.sectionId.slice('stage:'.length),
    );
  });

  /**
   * The dependants come from the schema's own stage-reference tags, so a stage
   * naming another one from a path this host never enumerated refuses the
   * deletion just the same.
   */
  it('refuses to delete a stage another stage jumps to, naming where', async () => {
    const destination = await createStage(ADA, 'Jumped to');
    const source = await createStage(ADA, 'Jumps somewhere');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: source.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: source.sectionId,
        document: {
          ...held.document,
          skipLogic: {
            action: 'SKIP',
            filter: {
              rules: [
                { type: 'node', id: 'rule-1', options: { operator: 'EXISTS' } },
              ],
            },
            destination: {
              type: 'stage',
              stageId: destination.sectionId.slice('stage:'.length),
            },
          },
        },
        revision: held.revision,
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: source.sectionId }),
    );

    // Rewriting a collaborator's skip logic as a side effect of removing
    // something else is not a deletion anybody asked for, so the dependants are
    // named — with the field, which is what a dialog points the researcher at.
    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Delete', { protocolId, sectionId: destination.sectionId }),
      ),
      'ReferencesRemain',
    );
    expect(error.remaining).toEqual([
      {
        sectionId: source.sectionId,
        path: ['skipLogic', 'destination', 'stageId'],
      },
    ]);
    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(order.document.stages).toContain(
      destination.sectionId.slice('stage:'.length),
    );
  });

  it('refuses a promoting submit while an editor holds the asset manifest', async () => {
    const stage = await createStage(ADA, 'Promotes behind a held manifest');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'blocked-manifest-secret',
        request: { kind: 'secret', name: 'Blocked token', value: 'pk.blocked' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const manifest = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId: ASSETS }),
    );
    expect(manifest.lock).toBe('held');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );

    try {
      // The editor holding the manifest would submit its own whole manifest
      // next, over the entry this promotion added — leaving the saved section
      // naming a resource the protocol no longer has.
      const error = await expectRpcFailure(
        callExit(
          ADA,
          host.rpc('Submit', {
            protocolId,
            requestId: randomUUID(),
            sectionId: stage.sectionId,
            document: { ...held.document, label: 'Renamed' },
            revision: held.revision,
            promote: {
              editId: EDIT,
              resourceIds: [staged.data.descriptor.id],
            },
          }),
        ),
        'SectionsLocked',
      );
      expect(error.blocked.map((entry) => entry.sectionId)).toEqual(['assets']);
      expect(error.blocked[0]?.holder?.userId).toBe(GRACE.principal.userId);
      const after = await call(
        ADA,
        host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
      );
      expect(after.revision).toEqual(held.revision);
      expect(manifest.document[staged.data.descriptor.id]).toBeUndefined();
    } finally {
      await call(
        GRACE,
        host.rpc('ReleaseLock', { protocolId, sectionId: ASSETS }),
      );
      await call(
        ADA,
        host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
      );
    }
  });

  it('refuses a create while an editor holds the stage index', async () => {
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    const held = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(held.lock).toBe('held');

    try {
      // The editor holding the index has a whole-section draft that does not
      // know about the new stage: its next submit would take the pointer out
      // and leave the section behind, which is a protocol that cannot be
      // assembled.
      const error = await expectRpcFailure(
        callExit(
          ADA,
          host.rpc('Create', {
            protocolId,
            requestId: randomUUID(),
            kind: 'stage',
            document: {
              type: 'Information',
              label: 'Never registered',
              title: 'Never registered',
              items: [],
            },
          }),
        ),
        'SectionsLocked',
      );
      expect(error.blocked.map((entry) => entry.sectionId)).toEqual([
        'stageOrder',
      ]);
      expect(error.blocked[0]?.holder?.userId).toBe(GRACE.principal.userId);
    } finally {
      await call(
        GRACE,
        host.rpc('ReleaseLock', { protocolId, sectionId: STAGE_ORDER }),
      );
    }
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(after.document.stages).toEqual(before.document.stages);
  });

  /**
   * A stage being ADDED has no revision to submit, so the create is the only
   * place a resource imported while composing it can become the protocol's.
   */
  it('promotes a staged resource with the stage being created', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'created-with-secret',
        request: { kind: 'secret', name: 'Created token', value: 'pk.created' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const created = await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: {
          type: 'Information',
          label: 'Carries a secret',
          title: 'Carries a secret',
          items: [],
        },
        promote: { editId: EDIT, resourceIds: [staged.data.descriptor.id] },
      }),
    );

    expect(created.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document[staged.data.descriptor.id]).toMatchObject({
      name: 'Created token',
      type: 'apikey',
    });
    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    // The section, its pointer and the manifest entry are one revision, which
    // is what a watcher reading the stream in order sees.
    expect(assets.revision.sequence).toBe(created.revision.sequence);
    expect(order.revision.sequence).toBe(created.revision.sequence);
  });

  it('creates no stage when the promotion it carries cannot be committed', async () => {
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );

    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Create', {
          protocolId,
          requestId: randomUUID(),
          kind: 'stage',
          document: {
            type: 'Information',
            label: 'Never made',
            title: 'Never made',
            items: [],
          },
          promote: { editId: EDIT, resourceIds: ['never-staged'] },
        }),
      ),
      'PromotionFailed',
    );

    // No section id: the host mints one only for a section it will write.
    expect(error.sectionId).toBeUndefined();
    expect(error.failure).toMatchObject({
      reason: 'not-found',
      resourceId: 'never-staged',
    });
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(after.document.stages).toEqual(before.document.stages);
  });

  it('replays the stage a retried create already made, rather than a second one', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'retried-create-secret',
        request: { kind: 'secret', name: 'Retried token', value: 'pk.retried' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const document = {
      type: 'Information',
      label: 'Made once',
      title: 'Made once',
      items: [],
    };
    const promote = {
      editId: EDIT,
      resourceIds: [staged.data.descriptor.id] as const,
    };
    // The id the retry repeats: one intent, asked twice, because the answer
    // to the first attempt can be lost on its way back.
    const requestId = randomUUID();
    const created = await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId,
        kind: 'stage',
        document,
        promote,
      }),
    );
    const afterFirst = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );

    const retried = await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId,
        kind: 'stage',
        document,
        promote,
      }),
    );

    // A second create would mint a second stage id, and the retry would be
    // told about a stage its first attempt never made.
    expect(retried.sectionId).toBe(created.sectionId);
    expect(retried.revision).toEqual(created.revision);
    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(order.document.stages).toEqual(afterFirst.document.stages);
  });

  it('replays what a retried promoting submit already wrote', async () => {
    const stage = await createStage(ADA, 'Saved once');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'retried-submit-secret',
        request: {
          kind: 'secret',
          name: 'Resubmitted',
          value: 'pk.resubmitted',
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const promote = {
      editId: EDIT,
      resourceIds: [staged.data.descriptor.id] as const,
    };
    const requestId = randomUUID();
    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId,
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Saved once' },
        revision: held.revision,
        promote,
      }),
    );
    // The editor closed on the answer it never received, giving the lock back.
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    const retried = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId,
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Saved once' },
        revision: held.revision,
        promote,
      }),
    );

    // Refusing here would turn a save that succeeded into one the researcher
    // is told to discard a draft over.
    expect(retried.revision).toEqual(written.revision);
    expect(retried.promoted?.map((entry) => entry.id)).toEqual([
      staged.data.descriptor.id,
    ]);
  });

  /**
   * A researcher can have two edits open at once — a codebook dialog over a
   * stage editor, or two tabs — and one edit's cancel must not take away the
   * file the other is about to submit. So staging belongs to the edit, not to
   * the session: every way of reaching a staged resource is asked here from
   * the edit beside the one that staged it.
   */
  it('keeps one edit’s staged resource out of the edit open beside it', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'two-edits-secret',
        request: { kind: 'secret', name: 'One edit’s token', value: 'pk.one' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const listed = await call(
      ADA,
      host.rpc('ResourcesList', {
        protocolId,
        editId: OTHER_EDIT,
        status: 'staged',
      }),
    );
    const inspected = await call(
      ADA,
      host.rpc('ResourcesInspect', {
        protocolId,
        editId: OTHER_EDIT,
        resourceId,
      }),
    );
    const discarded = await call(
      ADA,
      host.rpc('ResourcesDiscard', {
        protocolId,
        editId: OTHER_EDIT,
        resourceId,
      }),
    );
    // The other edit's own cancel, which drops everything IT staged.
    await call(
      ADA,
      host.rpc('ResourcesDiscard', { protocolId, editId: OTHER_EDIT }),
    );

    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(
      resourceId,
    );
    expect(inspected).toMatchObject({
      status: 'failed',
      failure: { reason: 'not-found' },
    });
    expect(discarded).toMatchObject({ status: 'failed' });
    const mine = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId: EDIT, status: 'staged' }),
    );
    if (mine.status !== 'ok') throw new Error('listing failed');
    expect(mine.data.resources.map((entry) => entry.id)).toContain(resourceId);
  });

  it('refuses a promotion naming a resource another edit staged', async () => {
    const stage = await createStage(ADA, 'Promotes what it never staged');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'not-this-edits-secret',
        request: { kind: 'secret', name: 'Not yours', value: 'pk.notyours' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );

    // A promotion takes the naming edit's own files and no others: a dialog
    // saving over a stage editor must not commit what the editor imported and
    // has not saved.
    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: held.document,
          revision: held.revision,
          promote: {
            editId: OTHER_EDIT,
            resourceIds: [staged.data.descriptor.id],
          },
        }),
      ),
      'PromotionFailed',
    );
    expect(error.failure).toMatchObject({
      reason: 'not-found',
      resourceId: staged.data.descriptor.id,
    });
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('lists only what the protocol has committed when no edit is named', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'unnamed-edit-secret',
        request: {
          kind: 'secret',
          name: 'Still an import',
          value: 'pk.import',
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const listed = await call(ADA, host.rpc('ResourcesList', { protocolId }));

    // A caller that names no edit is asking what the protocol holds, and an
    // import nobody has saved yet is not part of it.
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.status)).not.toContain(
      'staged',
    );
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(
      staged.data.descriptor.id,
    );
  });

  /**
   * The retry a promotion-keyed record never covered: a write that promotes
   * nothing carried no key at all, so a second attempt wrote a second time.
   */
  it('replays a retried submit and a retried create that promote nothing', async () => {
    const stage = await createStage(ADA, 'Saved without a promotion');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const submitId = randomUUID();
    const submitted = {
      protocolId,
      requestId: submitId,
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Saved without a promotion' },
      revision: held.revision,
    };
    const written = await call(ADA, host.rpc('Submit', submitted));
    // The editor closed on the answer it never received, giving the lock back.
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
    const createId = randomUUID();
    const creating = {
      protocolId,
      requestId: createId,
      kind: 'stage' as const,
      document: {
        type: 'Information',
        label: 'Made without a promotion',
        title: 'Made without a promotion',
        items: [],
      },
    };
    const created = await call(ADA, host.rpc('Create', creating));
    const afterFirst = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );

    const retriedSubmit = await call(ADA, host.rpc('Submit', submitted));
    const retriedCreate = await call(ADA, host.rpc('Create', creating));

    // A second submit would make a revision nothing changed in — and, with
    // the lock given back, be refused outright; a second create would leave
    // the protocol holding the stage twice.
    expect(retriedSubmit.revision).toEqual(written.revision);
    expect(retriedCreate.sectionId).toBe(created.sectionId);
    expect(retriedCreate.revision).toEqual(created.revision);
    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(order.document.stages).toEqual(afterFirst.document.stages);
  });

  it('replays a retried write against a server that restarted in between', async () => {
    const stage = await createStage(ADA, 'Saved before the restart');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const payload = {
      protocolId,
      requestId: randomUUID(),
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Saved before the restart' },
      revision: held.revision,
    };
    const written = await call(ADA, host.rpc('Submit', payload));
    const afterFirst = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
    );

    // A new host is a new process: its staging areas and its lease keeper
    // are empty, and the database is all it has. The client whose answer went
    // missing is exactly the client that reconnects to a server that came
    // back up, so a record kept only in memory would answer nothing.
    const restarted = await createProtocolBuilderClient(studio, {
      objectStore,
    });
    try {
      const retried = await restarted.call(
        callerOf(ADA),
        restarted.rpc('Submit', payload),
      );

      expect(retried.revision).toEqual(written.revision);
    } finally {
      await restarted.dispose();
    }
    // And wrote nothing on its way to that answer: the section is where the
    // first attempt left it.
    const section = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
    );
    expect(section.revision).toEqual(afterFirst.revision);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  /**
   * Committed bytes are named by their content, not by the file the
   * researcher picked: two imports called `portrait.png` are two assets, and a
   * protocol that carried both under one name could only export one of them.
   */
  it('commits promoted bytes under their content hash, keeping the display name', async () => {
    const stage = await createStage(ADA, 'Names a photograph');
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'promoted-portrait',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'Nook',
          source: 'nook.png',
          contentType: 'image/png',
          bytes,
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );

    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: held.document,
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );

    // Worked out from the bytes here rather than read back off the host: a
    // host still committing them under the caller's filename fails this
    // instead of agreeing with itself.
    const digest = createHash('sha256').update(bytes).digest('hex');
    const source = `${digest}.png`;
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document[resourceId]).toEqual({
      name: 'Nook',
      type: 'image',
      source,
    });
    expect(written.promoted).toEqual([
      expect.objectContaining({ id: resourceId, status: 'committed', source }),
    ]);
    const listed = await call(ADA, host.rpc('ResourcesList', { protocolId }));
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources).toContainEqual(
      expect.objectContaining({
        id: resourceId,
        name: 'Nook',
        status: 'committed',
        source,
      }),
    );
    // The bytes are reachable at the hash the manifest names them by.
    const preview = await call(
      ADA,
      host.rpc('ResourcesPreview', { protocolId, resourceId }),
    );
    expect(preview).toMatchObject({
      status: 'ok',
      data: { url: `/storage/${digest}` },
    });
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('keeps a staged resource out of another editor’s discard', async () => {
    const staged = await call(
      GRACE,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'grace-keeps-this',
        request: { kind: 'secret', name: 'Grace’s token', value: 'pk.grace' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const byId = await call(
      ADA,
      host.rpc('ResourcesDiscard', { protocolId, editId: EDIT, resourceId }),
    );
    const wholesale = await call(
      ADA,
      host.rpc('ResourcesDiscard', { protocolId, editId: EDIT }),
    );

    // A protocol has as many edits open as it has editors, and cancelling one
    // must not take away the file another is about to submit.
    expect(byId).toMatchObject({ status: 'failed' });
    expect(wholesale).toStrictEqual({ status: 'ok' });
    const listed = await call(
      GRACE,
      host.rpc('ResourcesList', { protocolId, editId: EDIT }),
    );
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.id)).toContain(
      resourceId,
    );
  });

  /**
   * A staging area is this process's memory, and the unary plane — a client
   * whose network refuses WebSockets — has no close to observe: a tab that
   * imports a file and then goes away leaves nothing behind to say so. The
   * same idle bound that ends such a caller's leases ends what it staged, and
   * an owner with a channel open keeps every import it made however long the
   * researcher spends not calling anything.
   */
  it('drops what a caller with no channel staged once the idle bound passes', async () => {
    // A tab of Ada's that never opens one, which is the whole population this
    // bound is for.
    const unary = callerOf({
      ...ADA,
      connectionId: 'pb-ada-unary-connection',
      clientSessionId: 'pb-ada-unary-tab',
    });
    const abandoned = await call(
      unary,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'unary-import',
        request: {
          kind: 'secret',
          name: 'A token nobody saved',
          value: 'pk.gone',
        },
      }),
    );
    const channel = await watching(GRACE, protocolId);
    try {
      const watched = await call(
        GRACE,
        host.rpc('ResourcesStage', {
          protocolId,
          editId: OTHER_EDIT,
          requestId: 'watched-import',
          request: {
            kind: 'secret',
            name: 'A token being thought about',
            value: 'pk.kept',
          },
        }),
      );
      if (abandoned.status !== 'ok' || watched.status !== 'ok') {
        throw new Error('staging failed');
      }

      clock.advance(IDLE_MS + 1);
      // Somebody else's call, so neither of the two above is refreshed by
      // being the one that asked.
      await call(ADA, host.rpc('ListSections', { protocolId }));

      const gone = await call(
        unary,
        host.rpc('ResourcesList', {
          protocolId,
          editId: EDIT,
          status: 'staged',
        }),
      );
      const kept = await call(
        GRACE,
        host.rpc('ResourcesList', {
          protocolId,
          editId: OTHER_EDIT,
          status: 'staged',
        }),
      );
      if (gone.status !== 'ok' || kept.status !== 'ok') {
        throw new Error('listing failed');
      }
      expect(gone.data.resources.map((entry) => entry.id)).not.toContain(
        abandoned.data.descriptor.id,
      );
      // Losing an import under an open editor is not a thing that may happen:
      // a channel keeps the staging as it keeps the lease.
      expect(kept.data.resources.map((entry) => entry.id)).toContain(
        watched.data.descriptor.id,
      );
    } finally {
      await channel.stop();
    }
  });

  it('creates the ego codebook a protocol does not have yet, once', async () => {
    const EGO = sid('codebook:ego');
    await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('GetSection', {
          protocolId: egolessProtocolId,
          sectionId: EGO,
        }),
      ),
      'SectionNotFound',
    );

    const created = await call(
      ADA,
      host.rpc('Create', {
        protocolId: egolessProtocolId,
        requestId: randomUUID(),
        kind: 'codebookEgo',
        document: {
          variables: {
            ego_age: { name: 'ego_age', type: 'number', component: 'Number' },
          },
        },
      }),
    );
    expect(created.sectionId).toBe('codebook:ego');
    const ego = await call(
      ADA,
      host.rpc('GetSection', { protocolId: egolessProtocolId, sectionId: EGO }),
    );
    expect(ego.document.variables).toMatchObject({
      ego_age: { name: 'ego_age' },
    });

    // Adding the first ego attribute is what creates the section, and a second
    // create is a mistake rather than a way to replace what is there.
    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Create', {
          protocolId: egolessProtocolId,
          requestId: randomUUID(),
          kind: 'codebookEgo',
          document: { variables: {} },
        }),
      ),
      'SectionExists',
    );
    expect(error.sectionId).toBe('codebook:ego');
    const unchanged = await call(
      ADA,
      host.rpc('GetSection', { protocolId: egolessProtocolId, sectionId: EGO }),
    );
    expect(unchanged.document).toEqual(ego.document);
  });

  it('replays from a cursor with nothing missed and nothing repeated', async () => {
    // Two sections at one revision, so the tail this test resumes into
    // contains more than one event and an off-by-one replay cannot look right.
    await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: {
          type: 'Information',
          label: 'Watched write',
          title: 'Watched write',
          items: [],
        },
      }),
    );

    const wholeLog = await drain(ADA, { protocolId });
    const cursors = wholeLog.map((entry) => entry.cursor);
    expect(cursors).not.toHaveLength(0);
    expect(new Set(cursors).size).toBe(cursors.length);

    const resumeFrom = cursors.at(-2);
    if (resumeFrom === undefined) throw new Error('no cursor to resume from');
    const replayed = await drain(GRACE, { protocolId, since: resumeFrom });

    // Exactly the tail: a replay that dropped an event, or repeated the one it
    // resumed from, fails here rather than looking plausible.
    const tail = wholeLog.slice(
      wholeLog.findIndex((entry) => entry.cursor === resumeFrom) + 1,
    );
    expect(replayed.map((entry) => entry.cursor)).toEqual(
      tail.map((entry) => entry.cursor),
    );
    expect(replayed.map((entry) => entry.event)).toEqual(
      tail.map((entry) => entry.event),
    );

    // A client resuming a dropped watch asks again from the cursor its
    // connection actually reached, which the event itself carries. Resuming
    // from there hands it nothing it already has.
    const resumed = await drain(GRACE, {
      protocolId,
      since: cursors.at(-1) ?? resumeFrom,
    });
    expect(resumed).toEqual([]);
  });

  it('never hands a live watcher an event at or before one it already has', async () => {
    const channel = await watching(GRACE, protocolId);
    const createOne = (label: string) =>
      call(
        ADA,
        host.rpc('Create', {
          protocolId,
          requestId: randomUUID(),
          kind: 'stage',
          document: { type: 'Information', label, title: label, items: [] },
        }),
      );
    const revisions = () =>
      channel.events.filter(
        (event): event is Extract<ProtocolEvent, { type: 'revision' }> =>
          event.type === 'revision',
      );
    const first = await createOne('Seen once');
    await until(
      () =>
        revisions().some((revision) => revision.sectionId === first.sectionId),
      'the first write',
    );
    const seen = revisions().find(
      (revision) => revision.sectionId === first.sectionId,
    );
    if (seen?.cursor === undefined)
      throw new Error('the revision had no cursor');
    // The same logged event again, as a subscription that went live before
    // the backlog it overlaps was read would hand it over a second time.
    const { cursor, ...logged } = seen;
    await host.run(
      ProtocolEvents.use((events) =>
        events.publish(draftId, [{ cursor, event: logged }]),
      ),
    );
    const second = await createOne('Seen after');
    await until(
      () =>
        revisions().some((revision) => revision.sectionId === second.sectionId),
      'the second write',
    );
    await channel.stop();
    // Mutation: drop the cursor check from `WatchProtocol` → the duplicate is
    // delivered and this counts two.
    expect(
      channel.events.filter(
        (delivered) =>
          delivered.type !== 'presence' && delivered.cursor === cursor,
      ),
    ).toHaveLength(1);
  });

  /**
   * Two tabs of one researcher are two editors: the lock belongs to the tab
   * rather than to the person, so the second opens read-only behind the first
   * (#1275) and is refused the write it would otherwise land on top of it.
   */
  it('refuses a second tab of the same researcher, and names the tab holding it', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(held.lock).toBe('held');
    try {
      // The same person on the same cookie session, in a second tab: a
      // different tab id, and so a different owner.
      const secondTab = callerOf({
        ...ADA,
        connectionId: 'pb-ada-second-connection',
        clientSessionId: 'pb-ada-second-tab',
      });
      const behind = await call(
        secondTab,
        host.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(behind.lock).toBe('readOnly');
      if (behind.lock !== 'readOnly') throw new Error('unreachable');
      expect(behind.holder.userId).toBe(ADA.principal.userId);
      expect(behind.holder.sessionId).toBe(ADA.connectionId);

      // The refusal has to be a refusal: the second tab cannot write the
      // section it is reading.
      await expectRpcFailure(
        callExit(
          secondTab,
          host.rpc('Submit', {
            protocolId,
            requestId: randomUUID(),
            sectionId,
            document: {
              ...behind.document,
              label: 'Renamed by the second tab',
            },
            revision: behind.revision,
          }),
        ),
        'NotLockHolder',
      );
    } finally {
      await call(ADA, host.rpc('ReleaseLock', { protocolId, sectionId }));
    }
  });

  /**
   * Presence is a connection's: a colleague's cursor is drawn from a socket
   * and goes when that socket does. A call that names no connection has none,
   * and the cookie session it falls back to for ownership is shared by every
   * tab of a browser and never ends — so such a lock adds no participant,
   * because nothing would ever be able to remove it.
   */
  it('adds no participant for a lock taken without a connection', async () => {
    const sectionId = stageSection(reference.stageId);
    const unary: Caller = {
      principal: ADA.principal,
      tab: 'pb-ada-unary-tab',
    };
    const channel = await watching(GRACE, protocolId);
    try {
      const taken = await call(
        unary,
        host.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(taken.lock).toBe('held');

      const sessions = (await present()).map((who) => who.sessionId);
      // The socket is here; the unary caller is not.
      expect(sessions).toContain(GRACE.connectionId);
      expect(sessions).not.toContain(ADA.principal.sessionId);
    } finally {
      await call(unary, host.rpc('ReleaseLock', { protocolId, sectionId }));
      await channel.stop();
    }
  });

  /**
   * A researcher with an editor open holds the lock for as long as they are
   * connected, however long they spend thinking, and keeps it across the
   * socket that took it: a blip is a reconnection, not a departure. Studio's
   * storage underneath is a lease with an expiry, so the section is only
   * theirs while the server keeps renewing it. This is the test that the
   * server keeps renewing behind an open channel that has called nothing,
   * keeps renewing through the reconnect grace once that channel has gone, and
   * gives the section back the moment the grace runs out with nothing back.
   */
  it('keeps a lock past the channel that took it, and gives it back when the reconnect grace runs out', async () => {
    const sectionId = stageSection(reference.stageId);
    const owner = `${ADA.principal.userId}:${ADA.clientSessionId}`;
    const channel = await watching(ADA, protocolId);
    let gracesBefore = 0;
    try {
      await call(ADA, host.rpc('AcquireLock', { protocolId, sectionId }));
      expect(await heldSections(owner)).toContain(sectionId);

      // Long past the idle bound, with nothing called in between.
      await keeperTick(6 * 60_000);

      expect(await heldSections(owner)).toContain(sectionId);
      const behind = await call(
        GRACE,
        host.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(behind.lock).toBe('readOnly');
    } finally {
      gracesBefore = clock.pending(RECONNECT_GRACE_MS);
      await channel.stop();
    }
    // The channel has ended, which is when the reconnect grace starts.
    await until(
      () => clock.pending(RECONNECT_GRACE_MS) > gracesBefore,
      'the reconnect grace to start',
    );

    // The channel has closed and the section is still ADA's tab's: the whole
    // of the grace is a reconnection in progress, renewed all the way.
    await keeperTick(RECONNECT_GRACE_MS - 1_000);
    expect(await heldSections(owner)).toContain(sectionId);
    const tooSoon = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(tooSoon.lock).toBe('readOnly');
    if (tooSoon.lock !== 'readOnly') throw new Error('unreachable');
    expect(tooSoon.holder.userId).toBe(ADA.principal.userId);

    // Nothing came back, so the tab has gone rather than blinked: the lease
    // ends here rather than at its own expiry, so the section is free the
    // moment the grace is up and the next editor takes it.
    clock.advance(1_001);
    await until(
      async () => !(await heldSections(owner)).includes(sectionId),
      'the stranded lease to be given back',
    );
    const taken = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(taken.lock).toBe('held');
    await call(GRACE, host.rpc('ReleaseLock', { protocolId, sectionId }));
  });

  /**
   * A renewal that could not be made says nothing about whose lease it is. A
   * database briefly out of reach used to be read as the same answer an
   * expiry gives, and the section was dropped from the keeper while the
   * researcher's editor was still open on it: the lease then ran out at its
   * own expiry and their next submit was refused as `NotLockHolder`.
   */
  it('keeps a lease the database never answered a renewal for', async () => {
    const sectionId = stageSection(reference.stageId);
    const owner = `${ADA.principal.userId}:${ADA.clientSessionId}`;
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(held.lock).toBe('held');
    expect(await heldSections(owner)).toContain(sectionId);

    // Postgres briefly unreachable: the renewal is not refused, it is never
    // made. Put where the acquire above put the keeper's own renewal, which is
    // what this case has always been about: a renewal that could not be MADE,
    // told apart from one the storage answered.
    let attempts = 0;
    await host.run(
      Leases.use((leases) =>
        leases.hold({
          renew: Effect.suspend(() => {
            attempts += 1;
            return Effect.fail(new Error('ECONNREFUSED'));
          }),
          draftId,
          sectionId,
          owner,
        }),
      ),
    );

    await keeperTick();
    expect(attempts).toBe(1);
    expect(await heldSections(owner)).toContain(sectionId);
    // The next tick asks again rather than having given the section up, which
    // is what the renewal interval being a third of the TTL is for.
    await keeperTick();
    expect(attempts).toBe(2);
    expect(await heldSections(owner)).toContain(sectionId);

    await call(ADA, host.rpc('ReleaseLock', { protocolId, sectionId }));
    expect(await heldSections(owner)).not.toContain(sectionId);
  });

  it('answers a write with the written section’s own content hash', async () => {
    // `Revision.contentHash` is the hash the sectioned store keys documents
    // by, so a caller that took a write’s answer as the section’s next base
    // — or compared it with the revision the event channel carried — would be
    // comparing it with something else entirely.
    const stage = await createStage(ADA, 'Answers with its own hash');
    const created = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
    );
    expect(stage.revision).toEqual(created.revision);

    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Renamed, and hashed as itself' },
        revision: held.revision,
      }),
    );
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
    );
    expect(written.revision).toEqual(after.revision);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('refuses an empty file, and keeps nothing staged for it', async () => {
    const edit = 'edit-empty';
    const empty = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: edit,
        requestId: 'empty',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph with no pixels',
          source: 'blank.png',
          contentType: 'image/png',
          bytes: new Uint8Array(0),
        },
      }),
    );

    // What the contract's own host answers: an empty file promoted into the
    // manifest is an asset the interview would try to show and could not.
    expect(empty).toMatchObject({
      status: 'failed',
      failure: { reason: 'invalid-content' },
    });
    const listed = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId: edit, status: 'staged' }),
    );
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toEqual([]);
  });

  it('refuses a resource larger than this deployment stores, and keeps none of it', async () => {
    const edit = 'edit-oversize';
    const oversized = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: edit,
        requestId: 'oversized',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph nobody can send',
          source: 'huge.png',
          contentType: 'image/png',
          bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1),
        },
      }),
    );

    expect(oversized).toMatchObject({
      status: 'failed',
      failure: { reason: 'too-large' },
    });
    // Refused before the bytes were kept: an authenticated caller cannot make
    // the process hold what it will not store.
    const listed = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId: edit, status: 'staged' }),
    );
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toEqual([]);
  });

  it('answers an unreachable object store with a failure the editor can retry', async () => {
    const edit = 'edit-store-down';
    const stage = await createStage(ADA, 'Names a file the store cannot take');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: edit,
        requestId: 'store-down',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph',
          source: 'photo.png',
          contentType: 'image/png',
          bytes: new Uint8Array([9, 9, 9]),
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const promote = {
      editId: edit,
      resourceIds: [staged.data.descriptor.id] as const,
    };

    storeUnreachable = true;
    let refused;
    try {
      refused = await callExit(
        ADA,
        host.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: { ...held.document, label: 'Renamed with a file' },
          revision: held.revision,
          promote,
        }),
      );
    } finally {
      storeUnreachable = false;
    }
    const error = await expectRpcFailure(
      Promise.resolve(refused),
      'PromotionFailed',
    );
    expect(error.failure).toMatchObject({
      reason: 'unavailable',
      retryable: true,
      resourceId: staged.data.descriptor.id,
    });

    // Retryable is a promise about what is still there: the resource is
    // staged, the section is unwritten, and the same submit lands once the
    // store is back.
    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Renamed with a file' },
        revision: held.revision,
        promote,
      }),
    );
    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('keeps a tab editing the section it still holds when it gives the other back', async () => {
    // A codebook dialog over a stage editor: one tab, two sections, and
    // closing the dialog is not the researcher stopping editing.
    const editor = await createStage(ADA, 'Held while a dialog is open');
    const dialog = await createStage(ADA, 'The dialog over it');
    const channel = await watching(ADA, protocolId);
    try {
      for (const sectionId of [editor.sectionId, dialog.sectionId]) {
        await call(ADA, host.rpc('AcquireLock', { protocolId, sectionId }));
      }
      await call(
        ADA,
        host.rpc('ReleaseLock', { protocolId, sectionId: dialog.sectionId }),
      );

      expect(
        (await present()).find((who) => who.sessionId === ADA.connectionId),
      ).toMatchObject({ mode: 'editing', sectionId: editor.sectionId });
    } finally {
      await call(
        ADA,
        host.rpc('ReleaseLock', { protocolId, sectionId: editor.sectionId }),
      );
      await channel.stop();
    }
  });

  it('ends a watch whose membership was taken away, and gives back what it held', async () => {
    const owner = `${GRACE.principal.userId}:${GRACE.clientSessionId}`;
    const stage = await createStage(
      ADA,
      'Watched by a colleague who is removed',
    );
    const channel = await watching(GRACE, protocolId);
    let gracesBefore = 0;

    let ended: Exit.Exit<void, unknown> | undefined;
    try {
      await call(
        GRACE,
        host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
      );
      expect(await heldSections(owner)).toContain(stage.sectionId);

      // The team takes GRACE off the study while her socket is open.
      revoked.add(GRACE.principal.userId);
      clock.advance(REAUTHORIZE_MS);
      gracesBefore = clock.pending(RECONNECT_GRACE_MS);
      // ADA goes on working, and none of it is GRACE's to receive.
      await createStage(ADA, 'Written after the membership was revoked');
      ended = await Promise.race([
        channel.ended,
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), 2_000),
        ),
      ]);
    } finally {
      revoked.delete(GRACE.principal.userId);
      await channel.stop();
    }

    if (ended === undefined) {
      throw new Error('the watch went on delivering the protocol');
    }
    await expectRpcFailure(Promise.resolve(ended), 'ProtocolNotFound');
    // The channel was also what kept her leases renewed, so the section goes
    // back to the team once the reconnect grace has run out.
    await until(
      () => clock.pending(RECONNECT_GRACE_MS) > gracesBefore,
      'the reconnect grace to start',
    );
    clock.advance(RECONNECT_GRACE_MS + 1);
    await until(
      async () => !(await heldSections(owner)).includes(stage.sectionId),
      'the stranded lease to be given back',
    );
  });
});
