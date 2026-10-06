import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Scope,
  Stream,
} from 'effect';
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
import { Database } from '../db/client.ts';
import {
  type TeamAccess,
  TenantScope,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import { resolve as resolveEnv } from '../env/resolve.ts';
import { collectLogs } from '../platform/__tests__/support/logs.ts';
import type { LoggedProtocolEvent } from '../protocol-builder/events.ts';
import { REAUTHORIZE_MS } from '../protocol-builder/handlers.ts';
import {
  IDLE_MS,
  Leases,
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
} from '../protocol-builder/leases.ts';
import { Presence } from '../protocol-builder/presence.ts';
import { ProtocolEvents } from '../protocol-builder/publisher.ts';
import { StagedImports } from '../protocol-builder/resources.ts';
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

const limiterUrl = await reachableRedis(REDIS_DATABASES.protocolBuilder);

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

const EDIT = 'edit-1';

const OTHER_EDIT = 'edit-2';

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

function latch() {
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
    around: <B>(input: A, self: Effect.Effect<B>): Effect.Effect<B> =>
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

function holdingEvents() {
  const hold = holdOnce<ReadonlyArray<LoggedProtocolEvent>>();
  const layer = Layer.effect(
    ProtocolEvents,
    Effect.gen(function* () {
      const real = yield* ProtocolEvents;
      return ProtocolEvents.of({
        ...real,
        publish: (draft, entries) =>
          hold.around(entries, real.publish(draft, entries)),
      });
    }),
  ).pipe(Layer.provide(ProtocolEvents.layer));
  return { layer, next: hold.next };
}

function holdingLeases() {
  const hold = holdOnce<undefined>();
  const layer = Layer.effect(
    Leases,
    Effect.gen(function* () {
      const real = yield* Leases;
      return Leases.of({
        ...real,
        hold: (lease) => hold.around(undefined, real.hold(lease)),
      });
    }),
  ).pipe(Layer.provide(Leases.layer));
  return { layer, next: hold.next };
}

function holdingStaging() {
  const hold = holdOnce<string>();
  const layer = Layer.effect(
    StagedImports,
    Effect.gen(function* () {
      const real = yield* StagedImports;
      return StagedImports.of({
        ...real,
        opened: (key) => hold.around(key, real.opened(key)),
      });
    }),
  ).pipe(Layer.provide(StagedImports.layer));
  return { layer, next: hold.next };
}

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
  let services: Context.Context<StudioServices>;
  let runEffect: <A, E>(
    effect: Effect.Effect<A, E, StudioServices>,
  ) => Promise<A>;
  const access: TeamAccess = unsafeMakeTeamAccess(TEAM_ID, 'owner');
  const teamRows = <A extends object = Record<string, unknown>>(
    text: string,
    params: ReadonlyArray<unknown> = [],
  ) => database.run(tenantRows<A>(TEAM_ID, text, params));
  let reference: VariableReference;
  let unstrippable: VariableReference;
  let egolessProtocolId: string;
  let adaRpc: RpcTestClient;
  const stored = new Map<string, { bytes: Uint8Array; mediaType: string }>();
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

  const stagedIds = async (editId: string) => {
    const listed = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId, status: 'staged' }),
    );
    if (listed.status !== 'ok') throw new Error('listing failed');
    return listed.data.resources.map((resource) => resource.id);
  };

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
      services,
    });
    host = await createProtocolBuilderClient(studio, {
      clock: clock.clock,
      objectStore,
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

  it.skipIf(!limiterUrl)(
    "logs a spent rpc_user budget through the program's logger",
    async () => {
      const logs = collectLogs();
      const store = await openRateLimitStore(limiterUrl);
      const limited = await createProtocolBuilderClient(
        createStudio(resolveEnv({ NODE_ENV: 'test' }), {
          auth: authServiceStub({
            listMemberships: memberships,
            getMembership: membership,
          }),
          limiter: store.limiter({ rpc_user: { max: 1, windowMs: 60_000 } }),
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
        expect(Option.isNone(Cause.findErrorOption(refused.cause))).toBe(true);
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
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: codebookSection }),
    );
    expect(after.document).toEqual(before.document);
  });

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
    expect(assets.revision.sequence).toBe(written.revision.sequence);
    expect(await stagedIds(EDIT)).not.toContain(staged.data.descriptor.id);
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
    // every tracked file for `<pk|sk|tk>.eyJ….…`.
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

    const manifest = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    const entry = (manifest?.document as Record<string, unknown> | undefined)?.[
      resourceId
    ];
    expect(entry).toEqual({ name: 'Sealed token', type: 'apikey' });

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

    const sections = await teamRows<{ doc: string }>(
      `SELECT doc::text AS doc FROM sections`,
    );
    for (const row of sections) {
      expect(row.doc).not.toContain(SECRET);
      expect(row.doc).not.toContain(ASSET_KEY_PLACEHOLDER);
    }
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
    expect(assets.revision.sequence).toBe(created.revision.sequence);
    expect(order.revision.sequence).toBe(created.revision.sequence);
    expect(await stagedIds(EDIT)).not.toContain(staged.data.descriptor.id);
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

    expect(retried.revision).toEqual(written.revision);
    expect(retried.promoted?.map((entry) => entry.id)).toEqual([
      staged.data.descriptor.id,
    ]);
  });

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

    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.status)).not.toContain(
      'staged',
    );
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(
      staged.data.descriptor.id,
    );
  });

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

  it('drops what a caller with no channel staged once the idle bound passes', async () => {
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

    const tail = wholeLog.slice(
      wholeLog.findIndex((entry) => entry.cursor === resumeFrom) + 1,
    );
    expect(replayed.map((entry) => entry.cursor)).toEqual(
      tail.map((entry) => entry.cursor),
    );
    expect(replayed.map((entry) => entry.event)).toEqual(
      tail.map((entry) => entry.event),
    );

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
    expect(
      channel.events.filter(
        (delivered) =>
          delivered.type !== 'presence' && delivered.cursor === cursor,
      ),
    ).toHaveLength(1);
  });

  it('refuses a second tab of the same researcher, and names the tab holding it', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(held.lock).toBe('held');
    try {
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
      expect(sessions).toContain(GRACE.connectionId);
      expect(sessions).not.toContain(ADA.principal.sessionId);
    } finally {
      await call(unary, host.rpc('ReleaseLock', { protocolId, sectionId }));
      await channel.stop();
    }
  });

  it('keeps a lock past the channel that took it, and gives it back when the reconnect grace runs out', async () => {
    const sectionId = stageSection(reference.stageId);
    const owner = `${ADA.principal.userId}:${ADA.clientSessionId}`;
    const channel = await watching(ADA, protocolId);
    let gracesBefore = 0;
    try {
      await call(ADA, host.rpc('AcquireLock', { protocolId, sectionId }));
      expect(await heldSections(owner)).toContain(sectionId);

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
    await until(
      () => clock.pending(RECONNECT_GRACE_MS) > gracesBefore,
      'the reconnect grace to start',
    );

    await keeperTick(RECONNECT_GRACE_MS - 1_000);
    expect(await heldSections(owner)).toContain(sectionId);
    const tooSoon = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(tooSoon.lock).toBe('readOnly');
    if (tooSoon.lock !== 'readOnly') throw new Error('unreachable');
    expect(tooSoon.holder.userId).toBe(ADA.principal.userId);

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

  it('keeps a lease the database never answered a renewal for', async () => {
    const sectionId = stageSection(reference.stageId);
    const owner = `${ADA.principal.userId}:${ADA.clientSessionId}`;
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(held.lock).toBe('held');
    expect(await heldSections(owner)).toContain(sectionId);

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
    await keeperTick();
    expect(attempts).toBe(2);
    expect(await heldSections(owner)).toContain(sectionId);

    await call(ADA, host.rpc('ReleaseLock', { protocolId, sectionId }));
    expect(await heldSections(owner)).not.toContain(sectionId);
  });

  it('answers a write with the written section’s own content hash', async () => {
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

      revoked.add(GRACE.principal.userId);
      clock.advance(REAUTHORIZE_MS);
      gracesBefore = clock.pending(RECONNECT_GRACE_MS);
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

  const removedReads: ReadonlyArray<
    readonly [string, () => Effect.Effect<unknown, unknown>]
  > = [
    [
      'GetSection',
      () =>
        host.rpc('GetSection', {
          protocolId,
          sectionId: stageSection(reference.stageId),
        }),
    ],
    ['ListSections', () => host.rpc('ListSections', { protocolId })],
    ['ResourcesList', () => host.rpc('ResourcesList', { protocolId })],
    [
      'ResourcesInspect',
      () => host.rpc('ResourcesInspect', { protocolId, resourceId: 'no-such' }),
    ],
    [
      'ResourcesPreview',
      () => host.rpc('ResourcesPreview', { protocolId, resourceId: 'no-such' }),
    ],
    [
      'ResourcesStage',
      () =>
        host.rpc('ResourcesStage', {
          protocolId,
          editId: EDIT,
          requestId: randomUUID(),
          request: { kind: 'secret', name: 'Staged', value: 'pk.removed' },
        }),
    ],
    [
      'ResourcesDiscard',
      () =>
        host.rpc('ResourcesDiscard', {
          protocolId,
          editId: EDIT,
          resourceId: 'no-such',
        }),
    ],
  ];

  it.each(removedReads)(
    'refuses a %s from a caller removed after its session was opened',
    async (name, read) => {
      const { who, remove } = await removedAfterOpening(`removed-${name}`);
      await remove();
      await expectRpcFailure(callExit(who, read()), 'ProtocolNotFound');
    },
  );

  it('refuses a watch from a caller removed after its session was opened', async () => {
    const { who, remove } = await removedAfterOpening('removed-watch');
    await remove();
    const channel = watch(who, protocolId);
    const ended = await Promise.race([
      channel.ended,
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), 2_000),
      ),
    ]);
    if (ended === undefined) {
      await channel.stop();
      throw new Error('the watch replayed the protocol to a removed caller');
    }
    await expectRpcFailure(Promise.resolve(ended), 'ProtocolNotFound');
  });

  it('never shows a caller removed after its session was opened in presence', async () => {
    const { who, remove } = await removedAfterOpening('removed-presence');
    const colleague = await watching(GRACE, protocolId);
    try {
      await remove();
      const refused = watch(who, protocolId);
      await expectRpcFailure(refused.ended, 'ProtocolNotFound');
      const written = await createStage(ADA, 'Written after a refused watch');
      await until(
        () => revisionsOf(colleague.events, written.sectionId).length > 0,
        'the colleague to see the write',
      );
      const listed = colleague.events.flatMap((event) =>
        event.type === 'presence'
          ? event.present.map((entry) => entry.userId)
          : [],
      );
      expect(listed).not.toContain(who.principal.userId);
    } finally {
      await colleague.stop();
    }
  });

  it('ends a watch at its next reauthorization once the locked role no longer reaches the protocol', async () => {
    const { who, remove, restore } = await removedAfterOpening('demoted-watch');
    const channel = await watching(who, protocolId);
    let ended: Exit.Exit<void, unknown> | undefined;
    try {
      await database.run(
        ownerAffected(`UPDATE team_members SET role = 'member' WHERE id = $1`, [
          who.memberId,
        ]),
      );
      clock.advance(REAUTHORIZE_MS);
      await createStage(ADA, 'Written after the demotion');
      ended = await Promise.race([
        channel.ended,
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), 2_000),
        ),
      ]);
    } finally {
      await channel.stop();
      await remove();
      await restore();
    }
    if (ended === undefined) {
      throw new Error('the watch went on delivering to a demoted caller');
    }
    await expectRpcFailure(Promise.resolve(ended), 'ProtocolNotFound');
  });

  it('hands no committed API key to a caller removed while the inspection runs', async () => {
    const { who, remove, restore } =
      await removedAfterOpening('removed-inspect');
    const stage = await createStage(ADA, 'Commits a key');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: OTHER_EDIT,
        requestId: randomUUID(),
        request: { kind: 'secret', name: 'Committed', value: 'pk.committed' },
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
        document: held.document,
        revision: held.revision,
        promote: { editId: OTHER_EDIT, resourceIds: [resourceId] },
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    const staging = holdingStaging();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      staged: staging.layer,
    });
    try {
      const reading = staging.next();
      const inspected = other.callExit(
        callerOf(who),
        other.rpc('ResourcesInspect', { protocolId, editId: EDIT, resourceId }),
      );
      await reading.reached;
      await remove();
      reading.release();
      await expectRpcFailure(inspected, 'ProtocolNotFound');
    } finally {
      await restore();
      await other.dispose();
    }
  });

  it('gives back the lock of a removed caller whose connection drops', async () => {
    const { who, remove, restore } =
      await removedAfterOpening('removed-disconnect');
    const owner = `${who.principal.userId}:${who.clientSessionId}`;
    const stage = await createStage(ADA, 'Held by a caller who disconnects');
    const sectionId = stage.sectionId;
    const channel = await watching(who, protocolId);
    let gracesBefore = 0;
    try {
      await call(who, host.rpc('AcquireLock', { protocolId, sectionId }));
      expect(await heldSections(owner)).toContain(sectionId);
      await remove();
      gracesBefore = clock.pending(RECONNECT_GRACE_MS);
      await channel.stop();
      await until(
        () => clock.pending(RECONNECT_GRACE_MS) > gracesBefore,
        'the reconnect grace to start',
      );
      clock.advance(RECONNECT_GRACE_MS + 1);
      await until(
        async () => !(await heldSections(owner)).includes(sectionId),
        'the removed caller’s lease to be given back',
      );
      expect((await present()).map((entry) => entry.userId)).not.toContain(
        who.principal.userId,
      );
      const taken = await call(
        GRACE,
        host.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(taken.lock).toBe('held');
      await call(GRACE, host.rpc('ReleaseLock', { protocolId, sectionId }));
    } finally {
      await restore();
    }
  });

  it('refuses a retried submit from a caller removed since it wrote', async () => {
    const { who, remove, restore } = await removedAfterOpening('removed-retry');
    const stage = await createStage(ADA, 'Written before a removal');
    const sectionId = stage.sectionId;
    const requestId = randomUUID();
    const held = await call(
      who,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    const submit = host.rpc('Submit', {
      protocolId,
      requestId,
      sectionId,
      document: { ...held.document, label: 'Renamed before the removal' },
      revision: held.revision,
    });
    try {
      await call(who, submit);
      await remove();
      await expectRpcFailure(callExit(who, submit), 'ProtocolNotFound');
    } finally {
      await restore();
      await call(who, host.rpc('ReleaseLock', { protocolId, sectionId }));
    }
  });

  it('refuses a retried create from a caller removed since it wrote', async () => {
    const { who, remove, restore } =
      await removedAfterOpening('removed-create');
    const label = 'Created before a removal';
    const create = host.rpc('Create', {
      protocolId,
      requestId: randomUUID(),
      kind: 'stage',
      document: { type: 'Information', label, title: label, items: [] },
    });
    try {
      await call(who, create);
      await remove();
      await expectRpcFailure(callExit(who, create), 'ProtocolNotFound');
    } finally {
      await restore();
    }
  });

  it('refuses a release from a caller removed after its session was opened', async () => {
    const { who, remove, restore } =
      await removedAfterOpening('removed-release');
    const owner = `${who.principal.userId}:${who.clientSessionId}`;
    const stage = await createStage(ADA, 'Held by a caller who is removed');
    const sectionId = stage.sectionId;
    await call(who, host.rpc('AcquireLock', { protocolId, sectionId }));
    try {
      await remove();
      await expectRpcFailure(
        callExit(who, host.rpc('ReleaseLock', { protocolId, sectionId })),
        'ProtocolNotFound',
      );
      expect(await heldSections(owner)).toContain(sectionId);
    } finally {
      await restore();
      await call(who, host.rpc('ReleaseLock', { protocolId, sectionId }));
    }
  });

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

  const revisionsOf = (events: readonly ProtocolEvent[], sectionId: string) =>
    events.filter(
      (event): event is Extract<ProtocolEvent, { type: 'revision' }> =>
        event.type === 'revision' && event.sectionId === sectionId,
    );

  const cursorOf = (event: ProtocolEvent) =>
    event.type === 'presence' ? undefined : event.cursor;

  it('drops a live event whose cursor is the last one it delivered', async () => {
    const channel = await watching(GRACE, protocolId);
    try {
      const first = await createStage(ADA, 'Delivered last');
      const sequence = first.revision.sequence;
      await until(
        () =>
          revisionsOf(channel.events, first.sectionId).length > 0 &&
          revisionsOf(channel.events, STAGE_ORDER).some(
            (revision) => revision.revision.sequence === sequence,
          ),
        'the create',
      );
      const newest = channel.events
        .filter((event) => cursorOf(event) !== undefined)
        .reduce((a, b) =>
          BigInt(cursorOf(a) ?? 0) >= BigInt(cursorOf(b) ?? 0) ? a : b,
        );
      if (newest.type === 'presence' || newest.cursor === undefined) {
        throw new Error('nothing with a cursor was delivered');
      }
      const { cursor, ...logged } = newest;
      await host.run(
        ProtocolEvents.use((events) =>
          events.publish(draftId, [{ cursor, event: logged }]),
        ),
      );
      const second = await createStage(ADA, 'Delivered after it');
      await until(
        () => revisionsOf(channel.events, second.sectionId).length > 0,
        'the second create',
      );
      expect(
        channel.events.filter((event) => cursorOf(event) === cursor),
      ).toHaveLength(1);
    } finally {
      await channel.stop();
    }
  });

  it('delivers a write committed while a watch reads its backlog exactly once', async () => {
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    try {
      const gap = events.next((entries) =>
        entries.some(
          (entry) =>
            entry.event.type === 'presence' &&
            entry.event.present.some(
              (who) => who.sessionId === GRACE.connectionId,
            ),
        ),
      );
      const channel = watch(GRACE, protocolId, other);
      try {
        await gap.reached;
        const written = await createOn(other, 'Committed in the gap');
        gap.release();
        const after = await createOn(other, 'Committed after the gap');
        await until(
          () => revisionsOf(channel.events, after.sectionId).length > 0,
          'the write after the gap',
        );
        expect(revisionsOf(channel.events, written.sectionId)).toHaveLength(1);
        const cursors = channel.events.flatMap((event) => {
          const cursor = cursorOf(event);
          return cursor === undefined ? [] : [cursor];
        });
        expect(new Set(cursors).size).toBe(cursors.length);
      } finally {
        gap.release();
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('ends a watcher too far behind with a failure, for the replay path', async () => {
    const stalled = latch();
    let delivered = 0;
    const ended = callExit(
      GRACE,
      host.rpc('WatchProtocol', { protocolId }).pipe(
        Stream.runForEach(() =>
          Effect.promise(async () => {
            delivered += 1;
            if (delivered === 1) await stalled.opened;
          }),
        ),
      ),
    );
    await until(() => delivered === 1, 'the first event');
    await host.run(
      ProtocolEvents.use((events) =>
        events.publish(
          draftId,
          Array.from({ length: 1100 }, () => ({
            event: { type: 'presence' as const, present: [] },
          })),
        ),
      ),
    );
    stalled.open();
    const exit = await ended;
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    expect(Cause.hasDies(exit.cause)).toBe(true);
    expect(Cause.hasInterruptsOnly(exit.cause)).toBe(false);
  });

  it('publishes a committed submit to its watchers when the caller goes away', async () => {
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    try {
      const stage = await createOn(other, 'Submitted by a closing tab');
      const sectionId = stage.sectionId;
      const held = await other.call(
        callerOf(ADA),
        other.rpc('AcquireLock', { protocolId, sectionId }),
      );
      if (held.lock !== 'held') throw new Error('the section was taken');
      const channel = await watching(GRACE, protocolId, other);
      try {
        const committed = events.next((entries) =>
          entries.some(
            (entry) =>
              entry.event.type === 'revision' &&
              entry.event.sectionId === sectionId,
          ),
        );
        const leaving = new AbortController();
        const submitting = other.callExit(
          callerOf(ADA),
          other.rpc('Submit', {
            protocolId,
            requestId: randomUUID(),
            sectionId,
            document: { ...held.document, label: 'Written as the tab closed' },
            revision: held.revision,
          }),
          { signal: leaving.signal },
        );
        await committed.reached;
        leaving.abort();
        await new Promise((settle) => setTimeout(settle, 50));
        committed.release();
        await until(
          () =>
            revisionsOf(channel.events, sectionId).some(
              (revision) => revision.revision.sequence > held.revision.sequence,
            ),
          'the committed submit to reach the watcher',
        );
        await submitting;
      } finally {
        await channel.stop();
        await other.call(
          callerOf(ADA),
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      }
    } finally {
      await other.dispose();
    }
  });

  it('keeps renewing a lock whose caller went away as it was taken', async () => {
    const leases = holdingLeases();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      leases: leases.layer,
    });
    const owner = `${ADA.principal.userId}:${ADA.clientSessionId}`;
    try {
      const stage = await createOn(other, 'Taken by a closing tab');
      const sectionId = stage.sectionId;
      const taken = leases.next();
      const leaving = new AbortController();
      const acquiring = other.callExit(
        callerOf(ADA),
        other.rpc('AcquireLock', { protocolId, sectionId }),
        { signal: leaving.signal },
      );
      await taken.reached;
      leaving.abort();
      await new Promise((settle) => setTimeout(settle, 50));
      taken.release();
      await acquiring;
      await until(
        async () =>
          (
            await other.run(
              Leases.use((keeper) => keeper.heldSections(draftId, owner)),
            )
          ).includes(sectionId),
        'the keeper to hold the lease',
      );
      await other.call(
        callerOf(ADA),
        other.rpc('ReleaseLock', { protocolId, sectionId }),
      );
    } finally {
      await other.dispose();
    }
  });

  const leavingAfterCommit = async <A, E>(
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

  it('publishes a committed create to its watchers when the caller goes away', async () => {
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    try {
      const order = await other.call(
        callerOf(ADA),
        other.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
      );
      const channel = await watching(GRACE, protocolId, other);
      try {
        await leavingAfterCommit(
          other,
          events,
          (entry) =>
            entry.event.type === 'revision' &&
            entry.event.sectionId === STAGE_ORDER,
          other.rpc('Create', {
            protocolId,
            requestId: randomUUID(),
            kind: 'stage',
            document: {
              type: 'Information',
              label: 'Created as the tab closed',
              title: 'Created as the tab closed',
              items: [],
            },
          }),
        );
        await until(
          () =>
            revisionsOf(channel.events, STAGE_ORDER).some(
              (revision) =>
                revision.revision.sequence > order.revision.sequence,
            ),
          'the committed create to reach the watcher',
        );
      } finally {
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('publishes a committed delete to its watchers when the caller goes away', async () => {
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    try {
      const stage = await createOn(other, 'Deleted by a closing tab');
      const channel = await watching(GRACE, protocolId, other);
      try {
        await leavingAfterCommit(
          other,
          events,
          (entry) =>
            entry.event.type === 'revision' &&
            entry.event.sectionId === stage.sectionId,
          other.rpc('Delete', { protocolId, sectionId: stage.sectionId }),
        );
        await until(
          () =>
            revisionsOf(channel.events, stage.sectionId).some(
              (revision) =>
                revision.revision.sequence > stage.revision.sequence &&
                revision.document === undefined,
            ),
          'the committed delete to reach the watcher',
        );
      } finally {
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('publishes a committed release to its watchers when the caller goes away', async () => {
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    try {
      const stage = await createOn(other, 'Given back by a closing tab');
      const sectionId = stage.sectionId;
      const channel = await watching(GRACE, protocolId, other);
      try {
        const held = await other.call(
          callerOf(ADA),
          other.rpc('AcquireLock', { protocolId, sectionId }),
        );
        if (held.lock !== 'held') throw new Error('the section was taken');
        const isLock = (event: ProtocolEvent) =>
          event.type === 'lock' && event.sectionId === sectionId;
        await until(
          () => channel.events.some(isLock),
          'the lock to reach the watcher',
        );
        await leavingAfterCommit(
          other,
          events,
          (entry) => isLock(entry.event),
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
        await until(() => {
          const last = channel.events.findLast(isLock);
          return (
            last !== undefined && last.type === 'lock' && !('holder' in last)
          );
        }, 'the committed release to reach the watcher');
      } finally {
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('publishes a committed refactor to its watchers when the caller goes away', async () => {
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    const codebookSection = sid(`codebook:node:${reference.typeId}`);
    const variableId = `interrupted_${randomUUID().replaceAll('-', '')}`;
    try {
      const held = await other.call(
        callerOf(ADA),
        other.rpc('AcquireLock', { protocolId, sectionId: codebookSection }),
      );
      if (held.lock !== 'held') throw new Error('the codebook was taken');
      const added = await other.call(
        callerOf(ADA),
        other.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: codebookSection,
          document: {
            ...held.document,
            variables: {
              ...(held.document.variables as Record<string, unknown>),
              [variableId]: { name: variableId, type: 'text' },
            },
          },
          revision: held.revision,
        }),
      );
      await other.call(
        callerOf(ADA),
        other.rpc('ReleaseLock', { protocolId, sectionId: codebookSection }),
      );
      const channel = await watching(GRACE, protocolId, other);
      try {
        await leavingAfterCommit(
          other,
          events,
          (entry) =>
            entry.event.type === 'revision' &&
            entry.event.sectionId === codebookSection,
          other.rpc('RefactorDeleteVariable', {
            protocolId,
            subject: { entity: 'node', type: reference.typeId },
            variableId,
          }),
        );
        await until(
          () =>
            revisionsOf(channel.events, codebookSection).some(
              (revision) =>
                revision.revision.sequence > added.revision.sequence,
            ),
          'the committed refactor to reach the watcher',
        );
      } finally {
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('stops renewing a stranded owner’s leases even when giving them back fails', async () => {
    const stranded = makeShiftableClock();
    let databaseDown = false;
    const real = Context.get(services, Database);
    const downScope = await Effect.runPromise(Scope.make());
    // A client whose connections resolve no table: the search path is a
    // startup parameter, so the fault is a second client, not a setting.
    const down = Context.get(
      await Effect.runPromise(
        Layer.buildWithScope(
          Database.layer({
            url: testDb!.url,
            maxConnections: 1,
            searchPath: 'pb_unreachable',
          }),
          downScope,
        ),
      ),
      Database,
    );
    const faulty: Database['Service'] = {
      identity: real.identity,
      get sql() {
        return databaseDown ? down.sql : real.sql;
      },
      get db() {
        return databaseDown ? down.db : real.db;
      },
    };
    let renewals = 0;
    const counting = Layer.effect(
      Leases,
      Effect.gen(function* () {
        const keeper = yield* Leases;
        return Leases.of({
          ...keeper,
          hold: (lease) =>
            keeper.hold({
              ...lease,
              renew: Effect.suspend(() => {
                renewals += 1;
                return lease.renew;
              }),
            }),
        });
      }),
    ).pipe(Layer.provide(Leases.layer));
    const other = await createProtocolBuilderClient(
      createStudio(resolveEnv({ NODE_ENV: 'test' }), {
        auth: authServiceStub({
          listMemberships: memberships,
          getMembership: membership,
        }),
        services: Context.add(services, Database, faulty),
      }),
      { clock: stranded.clock, objectStore, leases: counting },
    );
    const owner = `${ADA.principal.userId}:${ADA.clientSessionId}`;
    const heldHere = () =>
      other.run(Leases.use((keeper) => keeper.heldSections(draftId, owner)));
    const tick = async () => {
      await until(
        () => stranded.pending(RENEW_INTERVAL_MS) > 0,
        'the lease keeper to be waiting',
      );
      stranded.advance(RENEW_INTERVAL_MS);
    };
    try {
      const stage = await createOn(other, 'Held by a tab that never returns');
      const channel = await watching(ADA, protocolId, other);
      await other.call(
        callerOf(ADA),
        other.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
      );
      expect(await heldHere()).toContain(stage.sectionId);
      const staged = await other.call(
        callerOf(ADA),
        other.rpc('ResourcesStage', {
          protocolId,
          editId: EDIT,
          requestId: randomUUID(),
          request: { kind: 'secret', name: 'Stranded token', value: 'pk.gone' },
        }),
      );
      if (staged.status !== 'ok') throw new Error('staging failed');
      const stagedHere = async () => {
        const listed = await other.call(
          callerOf(ADA),
          other.rpc('ResourcesList', {
            protocolId,
            editId: EDIT,
            status: 'staged',
          }),
        );
        if (listed.status !== 'ok') throw new Error('listing failed');
        return listed.data.resources.map((resource) => resource.id);
      };
      expect(await stagedHere()).toContain(staged.data.descriptor.id);
      await channel.stop();
      await until(
        () => stranded.pending(RECONNECT_GRACE_MS) > 0,
        'the reconnect grace to start',
      );

      databaseDown = true;
      stranded.advance(RECONNECT_GRACE_MS);
      await until(
        async () => !(await heldHere()).includes(stage.sectionId),
        'the stranded lease to leave the keeper',
      );
      const before = renewals;
      await tick();
      await tick();
      await until(
        () => stranded.pending(RENEW_INTERVAL_MS) > 0,
        'the lease keeper to finish its tick',
      );
      expect(renewals).toBe(before);
      databaseDown = false;
      expect(await stagedHere()).not.toContain(staged.data.descriptor.id);
    } finally {
      databaseDown = false;
      await other.dispose();
      await Effect.runPromise(Scope.close(downScope, Exit.void));
    }
  });
});
