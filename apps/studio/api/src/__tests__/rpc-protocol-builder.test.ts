import { randomUUID } from 'node:crypto';

import {
  Cause,
  type Context,
  type Effect,
  Exit,
  Option,
  Redacted,
} from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';

import { createStudio, type Studio } from '../app.ts';
import { resolve as resolveEnv } from '../env/resolve.ts';
import { collectLogs } from '../platform/__tests__/support/logs.ts';
import { REAUTHORIZE_MS } from '../protocol-builder/handlers.ts';
import { type StudioServices } from '../rpc/deps.ts';
import { authServiceStub } from './support/auth.ts';
import {
  ownerAffected,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  ADA,
  ASSETS,
  callerOf,
  EDIT,
  enUS,
  formFields,
  GRACE,
  setupProtocolBuilderSuite,
  sid,
  STAGE_ORDER,
  stageSection,
  until,
  type VariableReference,
} from './support/protocol-builder-suite.ts';
import {
  createProtocolBuilderClient,
  makeShiftableClock,
  makeSpanCounter,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';
import { expectRpcFailure } from './support/rpc.ts';
import {
  limiterWithoutStore,
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

const limiterUrl = await reachableRedis(REDIS_DATABASES.protocolBuilder);

describe.skipIf(!testDb)('the protocol-builder host surface', () => {
  const suite = setupProtocolBuilderSuite();
  const {
    clock,
    objectStore,
    memberships,
    membership,
    call,
    callExit,
    createStage,
    liveLeases,
    watch,
    watching,
    removedAfterOpening,
  } = suite;
  let host: ProtocolBuilderTestClient;
  let protocolId: string;
  let reference: VariableReference;
  let unstrippable: VariableReference;
  let egolessProtocolId: string;
  let database: TestDatabaseRuntime;
  let studio: Studio;
  let services: Context.Context<StudioServices>;

  beforeAll(() => {
    host = suite.host;
    protocolId = suite.protocolId;
    reference = suite.reference;
    unstrippable = suite.unstrippable;
    egolessProtocolId = suite.egolessProtocolId;
    database = suite.database;
    studio = suite.studio;
    services = suite.services;
  });

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
          logs.records
            .filter(({ message }) => message.startsWith('Rate limit reached'))
            .map(({ annotations }) => annotations),
        ).toEqual([{ scope: 'rpc_user', retry_after_seconds: 60 }]);
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
          document: Redacted.make({
            ...Redacted.value(before.document),
            label: enUS('Renamed without the lock'),
          }),
          revision: before.revision,
        }),
      ),
      'NotLockHolder',
    );

    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );
    expect(Redacted.value(after.document)).toEqual(
      Redacted.value(before.document),
    );
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
      expect(Redacted.value(second.holder.displayName)).toBe(
        Redacted.value(GRACE.principal.name),
      );
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
    const document = Redacted.make({
      ...Redacted.value(held.document),
      label: enUS('Renamed by its holder'),
    });
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
    expect(Redacted.value(read.document).label).toEqual(
      enUS('Renamed by its holder'),
    );
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
    const orderBefore = Redacted.value(before.document).stages;
    if (!Array.isArray(orderBefore))
      throw new Error('stageOrder is not a list');

    const created = await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: Redacted.make({
          type: 'Information',
          label: enUS('Created by the host'),
          title: enUS('Created by the host'),
          items: [],
        }),
        position: 1,
      }),
    );

    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    const stageId = created.sectionId.slice('stage:'.length);
    expect(Redacted.value(order.document).stages).toEqual([
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
    expect(Redacted.value(stage.document).id).toBe(stageId);

    const listed = await call(ADA, host.rpc('ListSections', { protocolId }));
    expect(listed.sectionIds).toContain(created.sectionId);
  });

  it('puts a created stage in front of the finish stage, wherever it was asked to go', async () => {
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    const orderBefore = Redacted.value(before.document).stages;
    if (!Array.isArray(orderBefore))
      throw new Error('stageOrder is not a list');
    expect(orderBefore.at(-1)).toBe('finish');

    const unplaced = await createStage(ADA, 'Created with no position');
    const pastTheEnd = await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: Redacted.make({
          type: 'Information',
          label: enUS('Created past the end'),
          title: enUS('Created past the end'),
          items: [],
        }),
        position: orderBefore.length + 5,
      }),
    );

    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(Redacted.value(order.document).stages).toEqual([
      ...orderBefore.slice(0, -1),
      unplaced.sectionId.slice('stage:'.length),
      pastTheEnd.sectionId.slice('stage:'.length),
      'finish',
    ]);
  });

  it('refuses to delete the only finish stage, naming its place in the stage order', async () => {
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    const orderBefore = Redacted.value(before.document).stages;
    if (!Array.isArray(orderBefore))
      throw new Error('stageOrder is not a list');

    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Delete', { protocolId, sectionId: stageSection('finish') }),
      ),
      'ReferencesRemain',
    );
    expect(error.remaining).toEqual([
      {
        sectionId: 'stageOrder',
        path: ['stages', orderBefore.indexOf('finish')],
      },
    ]);
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(Redacted.value(after.document).stages).toEqual(orderBefore);
    expect(after.revision).toEqual(before.revision);
  });

  // A protocol always ends at its one finish stage, so a submit never turns a
  // stage into one or the finish stage into something else.
  it.each([
    {
      direction: 'the finish stage into another kind of stage',
      stageId: () => 'finish',
      rewrite: (document: Readonly<Record<string, unknown>>) => ({
        id: document.id,
        type: 'Information',
        label: enUS('No longer the end'),
        title: enUS('No longer the end'),
        items: [],
      }),
    },
    {
      direction: 'another stage into a second finish stage',
      stageId: () => reference.stageId,
      rewrite: (document: Readonly<Record<string, unknown>>) => ({
        id: document.id,
        type: 'FinishSession',
        label: enUS('A second end'),
        title: enUS('A second end'),
        content: enUS('Thank you.'),
        outcome: 'completed',
      }),
    },
  ])(
    'refuses a submit that changes $direction',
    async ({ stageId, rewrite }) => {
      const sectionId = stageSection(stageId());
      const held = await call(
        ADA,
        host.rpc('AcquireLock', { protocolId, sectionId }),
      );
      if (held.lock !== 'held')
        throw new Error('the section was already taken');
      try {
        const error = await expectRpcFailure(
          callExit(
            ADA,
            host.rpc('Submit', {
              protocolId,
              requestId: randomUUID(),
              sectionId,
              document: Redacted.make(rewrite(Redacted.value(held.document))),
              revision: held.revision,
            }),
          ),
          'InvalidShape',
        );
        expect(error.issues).toEqual([
          {
            path: ['type'],
            message:
              'A stage cannot be changed into the finish stage, or the finish stage into another kind of stage.',
          },
        ]);
        const read = await call(
          ADA,
          host.rpc('GetSection', { protocolId, sectionId }),
        );
        expect(Redacted.value(read.document)).toEqual(
          Redacted.value(held.document),
        );
        expect(read.revision).toEqual(held.revision);
      } finally {
        await call(ADA, host.rpc('ReleaseLock', { protocolId, sectionId }));
      }
    },
  );

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
      expect(holder && Redacted.value(holder.displayName)).toBe(
        Redacted.value(GRACE.principal.name),
      );
    } finally {
      await call(GRACE, host.rpc('ReleaseLock', { protocolId, sectionId }));
    }
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: codebookSection }),
    );
    expect(Redacted.value(after.document)).toEqual(
      Redacted.value(before.document),
    );
  });

  it('applies a refactor once every section it writes is free', async () => {
    const sectionId = stageSection(reference.stageId);
    const stageBefore = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );
    const fieldsBefore = formFields(Redacted.value(stageBefore.document));
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
      (Redacted.value(codebook.document).variables as Record<string, unknown>)[
        reference.variableId
      ],
    ).toBeUndefined();
    const stage = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId }),
    );
    expect(formFields(Redacted.value(stage.document))).toEqual(
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
    expect(Redacted.value(after.document)).toEqual(
      Redacted.value(before.document),
    );
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
    expect(Redacted.value(order.document).stages).not.toContain(stageId);
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
    expect(Redacted.value(order.document).stages).toContain(
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
        document: Redacted.make({
          ...Redacted.value(held.document),
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
        }),
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
    expect(Redacted.value(order.document).stages).toContain(
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
        request: {
          kind: 'secret',
          name: Redacted.make('Blocked token'),
          value: Redacted.make('pk.blocked'),
        },
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
            document: Redacted.make({
              ...Redacted.value(held.document),
              label: enUS('Renamed'),
            }),
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
      expect(
        Redacted.value(manifest.document)[staged.data.descriptor.id],
      ).toBeUndefined();
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
            document: Redacted.make({
              type: 'Information',
              label: enUS('Never registered'),
              title: enUS('Never registered'),
              items: [],
            }),
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
    expect(Redacted.value(after.document).stages).toEqual(
      Redacted.value(before.document).stages,
    );
  });

  it('replays the stage a retried create already made, rather than a second one', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'retried-create-secret',
        request: {
          kind: 'secret',
          name: Redacted.make('Retried token'),
          value: Redacted.make('pk.retried'),
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const document = Redacted.make({
      type: 'Information',
      label: enUS('Made once'),
      title: enUS('Made once'),
      items: [],
    });
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
    expect(Redacted.value(order.document).stages).toEqual(
      Redacted.value(afterFirst.document).stages,
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
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: enUS('Saved without a promotion'),
      }),
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
      document: Redacted.make({
        type: 'Information',
        label: enUS('Made without a promotion'),
        title: enUS('Made without a promotion'),
        items: [],
      }),
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
    expect(Redacted.value(order.document).stages).toEqual(
      Redacted.value(afterFirst.document).stages,
    );
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
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: enUS('Saved before the restart'),
      }),
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
        document: Redacted.make({
          variables: {
            ego_age: {
              name: 'ego_age',
              label: 'Age',
              type: 'number',
              component: 'Number',
            },
          },
        }),
      }),
    );
    expect(created.sectionId).toBe('codebook:ego');
    const ego = await call(
      ADA,
      host.rpc('GetSection', { protocolId: egolessProtocolId, sectionId: EGO }),
    );
    expect(Redacted.value(ego.document).variables).toMatchObject({
      ego_age: { name: 'ego_age' },
    });

    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Create', {
          protocolId: egolessProtocolId,
          requestId: randomUUID(),
          kind: 'codebookEgo',
          document: Redacted.make({ variables: {} }),
        }),
      ),
      'SectionExists',
    );
    expect(error.sectionId).toBe('codebook:ego');
    const unchanged = await call(
      ADA,
      host.rpc('GetSection', { protocolId: egolessProtocolId, sectionId: EGO }),
    );
    expect(Redacted.value(unchanged.document)).toEqual(
      Redacted.value(ego.document),
    );
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
        document: Redacted.make({
          ...Redacted.value(held.document),
          label: enUS('Renamed, and hashed as itself'),
        }),
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
          request: {
            kind: 'secret',
            name: Redacted.make('Staged'),
            value: Redacted.make('pk.removed'),
          },
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

  const REMOVED_EDIT = 'edit-staged-before-removal';

  const removedStagedReads: ReadonlyArray<
    readonly [string, (resourceId: string) => Effect.Effect<unknown, unknown>]
  > = [
    [
      'ResourcesList',
      () => host.rpc('ResourcesList', { protocolId, editId: REMOVED_EDIT }),
    ],
    [
      'ResourcesInspect',
      (resourceId) =>
        host.rpc('ResourcesInspect', {
          protocolId,
          editId: REMOVED_EDIT,
          resourceId,
        }),
    ],
    [
      'ResourcesPreview',
      (resourceId) =>
        host.rpc('ResourcesPreview', {
          protocolId,
          editId: REMOVED_EDIT,
          resourceId,
        }),
    ],
  ];

  it.each(removedStagedReads)(
    'refuses a %s of what a caller staged once it is removed',
    async (name, read) => {
      const { who, remove } = await removedAfterOpening(
        `removed-staged-${name}`,
      );
      const staged = await call(
        who,
        host.rpc('ResourcesStage', {
          protocolId,
          editId: REMOVED_EDIT,
          requestId: randomUUID(),
          request: {
            kind: 'secret',
            name: Redacted.make('Staged before removal'),
            value: Redacted.make('pk.removed'),
          },
        }),
      );
      if (staged.status !== 'ok') throw new Error('staging failed');
      await remove();
      await expectRpcFailure(
        callExit(who, read(staged.data.descriptor.id)),
        'ProtocolNotFound',
      );
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

  it('ends an idle watch once the locked role no longer reaches the protocol, with nothing written', async () => {
    const { who, remove, restore } = await removedAfterOpening('demoted-idle');
    const channel = await watching(who, protocolId);
    let ended: Exit.Exit<void, unknown> | undefined;
    try {
      await database.run(
        ownerAffected(`UPDATE team_members SET role = 'member' WHERE id = $1`, [
          who.memberId,
        ]),
      );
      // Past the longest jittered wait, so the timer has fired.
      clock.advance(2 * REAUTHORIZE_MS);
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
      throw new Error('the idle watch stayed open to a demoted caller');
    }
    await expectRpcFailure(Promise.resolve(ended), 'ProtocolNotFound');
  });

  it('reauthorizes an idle watch on its timer without charging a rate limit', async () => {
    const charged: string[] = [];
    const time = makeShiftableClock();
    const spans = makeSpanCounter();
    const counted = await createProtocolBuilderClient(
      createStudio(resolveEnv({ NODE_ENV: 'test' }), {
        auth: authServiceStub({
          listMemberships: memberships,
          getMembership: membership,
        }),
        limiter: {
          ...limiterWithoutStore,
          check: (scope, subject) => {
            charged.push(scope);
            return limiterWithoutStore.check(scope, subject);
          },
        },
        services,
      }),
      { clock: time.clock, objectStore, tracer: spans.tracer },
    );
    const reauthorized = () => spans.ended('protocolBuilder.authorizeCaller');
    try {
      const channel = await watching(ADA, protocolId, counted);
      let ended = false;
      void channel.ended.then(() => {
        ended = true;
      });
      try {
        const before = charged.length;
        for (const round of [1, 2, 3]) {
          // Past the longest jittered wait, until the timer has asked.
          await until(async () => {
            time.advance(2 * REAUTHORIZE_MS);
            await new Promise((settle) => setTimeout(settle, 200));
            return reauthorized() >= round;
          }, `the timer's reauthorization ${round}`);
        }
        expect(ended).toBe(false);
        expect(charged.slice(before)).toEqual([]);
      } finally {
        await channel.stop();
      }
    } finally {
      await counted.dispose();
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
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: enUS('Renamed before the removal'),
      }),
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
      document: Redacted.make({
        type: 'Information',
        label: enUS(label),
        title: enUS(label),
        items: [],
      }),
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
      expect(await liveLeases(owner)).toContain(sectionId);
    } finally {
      await restore();
      await call(who, host.rpc('ReleaseLock', { protocolId, sectionId }));
    }
  });
});
