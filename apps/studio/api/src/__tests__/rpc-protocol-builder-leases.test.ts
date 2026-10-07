import { randomUUID } from 'node:crypto';

import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';

import { createStudio, type Studio } from '../app.ts';
import { Database } from '../db/client.ts';
import { resolve as resolveEnv } from '../env/resolve.ts';
import { REAUTHORIZE_MS } from '../protocol-builder/handlers.ts';
import {
  Leases,
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
} from '../protocol-builder/leases.ts';
import { Presence } from '../protocol-builder/presence.ts';
import { type StudioServices } from '../rpc/deps.ts';
import { authServiceStub } from './support/auth.ts';
import { testDb } from './support/database.ts';
import {
  ADA,
  callerOf,
  EDIT,
  GRACE,
  holdingLeases,
  revisionsOf,
  setupProtocolBuilderSuite,
  stageSection,
  until,
  type VariableReference,
} from './support/protocol-builder-suite.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  makeShiftableClock,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';
import { expectRpcFailure } from './support/rpc.ts';

describe.skipIf(!testDb)('the protocol-builder host surface', () => {
  const suite = setupProtocolBuilderSuite();
  const {
    clock,
    objectStore,
    revoked,
    memberships,
    membership,
    teamRows,
    call,
    callExit,
    createStage,
    heldSections,
    present,
    keeperTick,
    watch,
    watching,
    removedAfterOpening,
    createOn,
  } = suite;
  let host: ProtocolBuilderTestClient;
  let protocolId: string;
  let draftId: string;
  let reference: VariableReference;
  let studio: Studio;
  let services: Context.Context<StudioServices>;

  beforeAll(() => {
    host = suite.host;
    protocolId = suite.protocolId;
    draftId = suite.draftId;
    reference = suite.reference;
    studio = suite.studio;
    services = suite.services;
  });

  it('keeps a tab’s lock when its watch reconnects to a restarted server', async () => {
    const stage = await createStage(ADA, 'Edited across a restart');
    const sectionId = stage.sectionId;
    const tab: Caller = {
      principal: ADA.principal,
      connection: 'pb-ada-restart-connection',
      tab: 'pb-ada-restart-tab',
    };
    const otherTab: Caller = {
      principal: ADA.principal,
      connection: 'pb-ada-restart-other-connection',
      tab: 'pb-ada-restart-other-tab',
    };
    const owner = `${ADA.principal.userId}:pb-ada-restart-tab`;
    const otherOwner = `${ADA.principal.userId}:pb-ada-restart-other-tab`;
    const expiresAt = async () => {
      const [row] = await teamRows<{ expires_at: Date }>(
        `SELECT expires_at FROM leases
         WHERE draft_id = $1 AND section_id = $2 AND owner = $3`,
        [draftId, sectionId, owner],
      );
      if (row === undefined) throw new Error('the tab holds no lease row');
      return row.expires_at.getTime();
    };

    const held = await call(
      tab,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was already taken');
    // The process that granted the lease is gone, and its keeper with it.
    await host.run(
      Leases.use((leases) => leases.drop(draftId, sectionId, owner)),
    );

    const restartedClock = makeShiftableClock();
    const restarted = await createProtocolBuilderClient(studio, {
      clock: restartedClock.clock,
      objectStore,
    });
    const heldOnRestarted = (who: string) =>
      restarted.run(Leases.use((leases) => leases.heldSections(draftId, who)));
    const channels: { stop: () => Promise<void> }[] = [];
    try {
      const granted = await expiresAt();
      channels.push(await watching(otherTab, protocolId, restarted));
      expect(await heldOnRestarted(otherOwner)).toEqual([]);
      expect(await expiresAt()).toBe(granted);

      channels.push(await watching(tab, protocolId, restarted));
      expect(await heldOnRestarted(owner)).toEqual([sectionId]);
      const adopted = await expiresAt();
      expect(adopted).toBeGreaterThan(granted);
      const presentOnRestarted = await restarted.run(
        Presence.use((presence) => presence.list(draftId)),
      );
      expect(
        presentOnRestarted.find(
          (who) => who.sessionId === 'pb-ada-restart-connection',
        ),
      ).toMatchObject({ mode: 'editing', sectionId });

      await keeperTick(RENEW_INTERVAL_MS, restartedClock);
      expect(await expiresAt()).toBeGreaterThan(adopted);
      expect(await heldOnRestarted(owner)).toEqual([sectionId]);

      const written = await restarted.call(
        tab,
        restarted.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId,
          document: { ...held.document, label: 'Saved after the restart' },
          revision: held.revision,
        }),
      );
      expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);
      await restarted.call(
        tab,
        restarted.rpc('ReleaseLock', { protocolId, sectionId }),
      );
    } finally {
      for (const channel of channels) await channel.stop();
      await restarted.dispose();
    }
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
