import { randomUUID } from 'node:crypto';

import { Context, type Exit } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';

import { createStudio, type Studio } from '../app.ts';
import { Database } from '../db/client.ts';
import { resolve as resolveEnv } from '../env/resolve.ts';
import { REAUTHORIZE_MS } from '../protocol-builder/handlers.ts';
import {
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
  RETRY_BASE_MS,
  RETRY_TIMES,
} from '../protocol-builder/leases.ts';
import { type StudioServices } from '../rpc/deps.ts';
import { authServiceStub } from './support/auth.ts';
import { testDb } from './support/database.ts';
import {
  ADA,
  callerOf,
  EDIT,
  enUS,
  GRACE,
  holdingPresence,
  revisionsOf,
  setupProtocolBuilderSuite,
  stageSection,
  until,
  type VariableReference,
} from './support/protocol-builder-suite.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  faultyDatabase,
  makeShiftableClock,
  makeSpanCounter,
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
    liveLeases,
    leaseExpiry,
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

  /** A Studio on the suite's database, refusing transactions while it is down. */
  const faultyStudio = () => {
    const fault = faultyDatabase(Context.get(services, Database));
    return {
      studio: createStudio(resolveEnv({ NODE_ENV: 'test' }), {
        auth: authServiceStub({
          listMemberships: memberships,
          getMembership: membership,
        }),
        services: Context.add(services, Database, fault.service),
      }),
      setDown: fault.setDown,
    };
  };

  /** A tab no other test uses, so no other client's keeper renews it. */
  const tabOf = (slug: string) => {
    const caller: Caller = {
      principal: ADA.principal,
      connection: `pb-ada-${slug}-connection`,
      tab: `pb-ada-${slug}-tab`,
    };
    return { caller, owner: `${ADA.principal.userId}:pb-ada-${slug}-tab` };
  };

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

    // Taken through a server of its own, gone before the restart, so only the
    // restarted server's keeper can renew the lease.
    const granting = await createProtocolBuilderClient(studio, {
      clock: makeShiftableClock().clock,
      objectStore,
    });
    const held = await granting
      .call(tab, granting.rpc('AcquireLock', { protocolId, sectionId }))
      .finally(() => granting.dispose());
    if (held.lock !== 'held') throw new Error('the section was already taken');

    const restartedClock = makeShiftableClock();
    const restarted = await createProtocolBuilderClient(studio, {
      clock: restartedClock.clock,
      objectStore,
    });
    const channels: { stop: () => Promise<void> }[] = [];
    try {
      const granted = await expiresAt();
      channels.push(await watching(otherTab, protocolId, restarted));
      expect(await liveLeases(otherOwner)).toEqual([]);
      expect(await expiresAt()).toBe(granted);

      channels.push(await watching(tab, protocolId, restarted));
      expect(await liveLeases(owner)).toEqual([sectionId]);
      const adopted = await expiresAt();
      expect(adopted).toBeGreaterThan(granted);
      expect(
        (await present()).find(
          (who) => who.sessionId === 'pb-ada-restart-connection',
        ),
      ).toMatchObject({ mode: 'editing', sectionId });

      await keeperTick(RENEW_INTERVAL_MS, restartedClock);
      expect(await expiresAt()).toBeGreaterThan(adopted);
      expect(await liveLeases(owner)).toEqual([sectionId]);

      const written = await restarted.call(
        tab,
        restarted.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId,
          document: {
            ...held.document,
            label: enUS('Saved after the restart'),
          },
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
              label: enUS('Renamed by the second tab'),
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
      expect(await liveLeases(owner)).toContain(sectionId);

      await keeperTick(6 * 60_000);

      expect(await liveLeases(owner)).toContain(sectionId);
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
    expect(await liveLeases(owner)).toContain(sectionId);
    const tooSoon = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(tooSoon.lock).toBe('readOnly');
    if (tooSoon.lock !== 'readOnly') throw new Error('unreachable');
    expect(tooSoon.holder.userId).toBe(ADA.principal.userId);

    clock.advance(1_001);
    await until(
      async () => !(await liveLeases(owner)).includes(sectionId),
      'the stranded lease to be given back',
    );
    const taken = await call(
      GRACE,
      host.rpc('AcquireLock', { protocolId, sectionId }),
    );
    expect(taken.lock).toBe('held');
    await call(GRACE, host.rpc('ReleaseLock', { protocolId, sectionId }));
  });

  it('keeps renewing a connection after a liveness pass the database never answered', async () => {
    const fault = faultyStudio();
    const replica = makeShiftableClock();
    const other = await createProtocolBuilderClient(fault.studio, {
      clock: replica.clock,
      objectStore,
    });
    const { caller, owner } = tabOf('unanswered');
    try {
      const stage = await createOn(other, 'Renewed after an unanswered pass');
      const sectionId = stage.sectionId;
      const channel = await watching(caller, protocolId, other);
      try {
        await other.call(
          caller,
          other.rpc('AcquireLock', { protocolId, sectionId }),
        );
        const granted = await leaseExpiry(owner);
        if (granted === undefined) throw new Error('the tab holds no lease');

        fault.setDown(true);
        await keeperTick(RENEW_INTERVAL_MS, replica);
        fault.setDown(false);
        expect(await leaseExpiry(owner)).toBe(granted);

        await keeperTick(RENEW_INTERVAL_MS, replica);
        expect(await leaseExpiry(owner)).toBeGreaterThan(granted);
        expect(await liveLeases(owner)).toEqual([sectionId]);
        await other.call(
          caller,
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      } finally {
        fault.setDown(false);
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
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

      await until(
        async () =>
          (await present()).some(
            (who) =>
              who.sessionId === ADA.connectionId &&
              who.mode === 'editing' &&
              who.sectionId === editor.sectionId,
          ),
        'the tab to show the section it still holds',
      );
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
      expect(await liveLeases(owner)).toContain(stage.sectionId);

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
      async () => !(await liveLeases(owner)).includes(stage.sectionId),
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
      expect(await liveLeases(owner)).toContain(sectionId);
      await remove();
      gracesBefore = clock.pending(RECONNECT_GRACE_MS);
      await channel.stop();
      await until(
        () => clock.pending(RECONNECT_GRACE_MS) > gracesBefore,
        'the reconnect grace to start',
      );
      clock.advance(RECONNECT_GRACE_MS + 1);
      await until(
        async () => !(await liveLeases(owner)).includes(sectionId),
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

  it('tells watchers of a lock whose caller went away as it was taken', async () => {
    const presence = holdingPresence();
    const other = await createProtocolBuilderClient(studio, {
      clock: makeShiftableClock().clock,
      objectStore,
      presence: presence.layer,
    });
    const { caller, owner } = tabOf('leaving');
    try {
      const stage = await createOn(other, 'Taken by a closing tab');
      const sectionId = stage.sectionId;
      const colleague = await watching(GRACE, protocolId, other);
      try {
        const taken = presence.next();
        const leaving = new AbortController();
        const acquiring = other.callExit(
          caller,
          other.rpc('AcquireLock', { protocolId, sectionId }),
          { signal: leaving.signal },
        );
        await taken.reached;
        leaving.abort();
        await new Promise((settle) => setTimeout(settle, 50));
        taken.release();
        await acquiring;
        expect(await liveLeases(owner)).toEqual([sectionId]);
        await until(
          () =>
            colleague.events.some(
              (event) => event.type === 'lock' && event.sectionId === sectionId,
            ),
          'the colleague to hear the lock was taken',
        );
        await other.call(
          caller,
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      } finally {
        await colleague.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('shows the section a socket took although recording that failed at first', async () => {
    const fault = faultyStudio();
    const presence = holdingPresence();
    const replica = makeShiftableClock();
    const other = await createProtocolBuilderClient(fault.studio, {
      clock: replica.clock,
      objectStore,
      presence: presence.layer,
    });
    const { caller } = tabOf('mode-retried');
    try {
      const stage = await createOn(other, 'Shown after a retried mode');
      const sectionId = stage.sectionId;
      const channel = await watching(caller, protocolId, other);
      try {
        const recording = presence.next();
        const acquiring = other.call(
          caller,
          other.rpc('AcquireLock', { protocolId, sectionId }),
        );
        await recording.reached;
        fault.setDown(true);
        recording.release();
        await until(
          () => replica.pending(RETRY_BASE_MS) > 0,
          'the mode to be retried',
        );
        fault.setDown(false);
        replica.advance(RETRY_BASE_MS);
        expect((await acquiring).lock).toBe('held');

        await until(
          async () =>
            (await present()).some(
              (who) =>
                who.sessionId === caller.connection &&
                who.mode === 'editing' &&
                who.sectionId === sectionId,
            ),
          'the retried mode to be recorded',
        );
        await other.call(
          caller,
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      } finally {
        fault.setDown(false);
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('publishes a lock and replies before its holder’s mode is recorded', async () => {
    const presence = holdingPresence();
    const other = await createProtocolBuilderClient(studio, {
      clock: makeShiftableClock().clock,
      objectStore,
      presence: presence.layer,
    });
    const { caller } = tabOf('mode-after');
    try {
      const stage = await createOn(other, 'Published before its mode');
      const sectionId = stage.sectionId;
      const channel = await watching(caller, protocolId, other);
      const colleague = await watching(GRACE, protocolId, other);
      try {
        const recording = presence.next();
        let replied = false;
        const acquiring = other
          .call(caller, other.rpc('AcquireLock', { protocolId, sectionId }))
          .finally(() => {
            replied = true;
          });
        await recording.reached;
        try {
          await until(() => replied, 'the reply while the mode is recorded');
          await until(
            () =>
              colleague.events.some(
                (event) =>
                  event.type === 'lock' &&
                  event.sectionId === sectionId &&
                  event.holder !== undefined,
              ),
            'the lock to reach a colleague while the mode is recorded',
          );
        } finally {
          recording.release();
        }
        expect((await acquiring).lock).toBe('held');
        await until(
          async () =>
            (await present()).some(
              (who) =>
                who.sessionId === caller.connection && who.mode === 'editing',
            ),
          'the mode to be recorded',
        );
        await other.call(
          caller,
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      } finally {
        await colleague.stop();
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('records the mode a tab holds now when an earlier update lands late', async () => {
    const presence = holdingPresence();
    const spans = makeSpanCounter();
    const other = await createProtocolBuilderClient(studio, {
      clock: makeShiftableClock().clock,
      objectStore,
      presence: presence.layer,
      tracer: spans.tracer,
    });
    const { caller } = tabOf('mode-late');
    try {
      const stage = await createOn(other, 'Released before its mode landed');
      const sectionId = stage.sectionId;
      const channel = await watching(caller, protocolId, other);
      try {
        const recording = presence.next();
        const acquiring = other.call(
          caller,
          other.rpc('AcquireLock', { protocolId, sectionId }),
        );
        await recording.reached;
        const recorded = spans.ended('protocolBuilder.setMode');
        try {
          await other.call(
            caller,
            other.rpc('ReleaseLock', { protocolId, sectionId }),
          );
          await until(
            () => spans.ended('protocolBuilder.setMode') > recorded,
            'the release’s mode to be recorded',
          );
        } finally {
          recording.release();
        }
        expect((await acquiring).lock).toBe('held');
        await until(
          () => spans.ended('protocolBuilder.setMode') > recorded + 1,
          'the acquire’s late mode to be recorded',
        );
        expect(
          (await present()).find((who) => who.sessionId === caller.connection),
        ).toMatchObject({ mode: 'viewing' });
        expect(
          (await present()).find((who) => who.sessionId === caller.connection)
            ?.sectionId,
        ).toBeUndefined();
      } finally {
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('records no mode for a release that gave nothing back', async () => {
    const spans = makeSpanCounter();
    const other = await createProtocolBuilderClient(studio, {
      clock: makeShiftableClock().clock,
      objectStore,
      tracer: spans.tracer,
    });
    const { caller } = tabOf('mode-unreleased');
    try {
      const stage = await createOn(other, 'Released without being held');
      const sectionId = stage.sectionId;
      const channel = await watching(caller, protocolId, other);
      try {
        const before = spans.count('protocolBuilder.setMode');
        await other.call(
          caller,
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
        // The acquire's own update marks when a forked update would have run.
        await other.call(
          caller,
          other.rpc('AcquireLock', { protocolId, sectionId }),
        );
        await until(
          () => spans.ended('protocolBuilder.setMode') > before,
          'the acquire’s mode to be recorded',
        );
        await new Promise((settle) => setTimeout(settle, 50));
        expect(spans.count('protocolBuilder.setMode')).toBe(before + 1);
        await other.call(
          caller,
          other.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      } finally {
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('stops renewing a stranded owner’s leases even when giving them back fails', async () => {
    const fault = faultyStudio();
    const stranded = makeShiftableClock();
    const spans = makeSpanCounter();
    const other = await createProtocolBuilderClient(fault.studio, {
      clock: stranded.clock,
      objectStore,
      tracer: spans.tracer,
    });
    const { caller, owner } = tabOf('stranded');
    try {
      // Made through the suite's client, so the only owner this replica has
      // seen is the stranded one, and every renewal it makes is that owner's.
      const stage = await createStage(ADA, 'Held by a tab that never returns');
      const channel = await watching(caller, protocolId, other);
      await other.call(
        caller,
        other.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
      );
      expect(await liveLeases(owner)).toContain(stage.sectionId);
      const staged = await other.call(
        caller,
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
          caller,
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

      const attempts = spans.ended('protocolBuilder.releaseOwner');
      const failed = () => spans.ended('protocolBuilder.releaseOwner');
      fault.setDown(true);
      stranded.advance(RECONNECT_GRACE_MS);
      for (let retry = 0; retry < RETRY_TIMES; retry += 1) {
        const wait = RETRY_BASE_MS * 2 ** retry;
        // A real timer under the shifted clock may have run the retry already.
        await until(
          () => stranded.pending(wait) > 0 || failed() > attempts + retry + 1,
          'the release to be retried',
        );
        stranded.advance(wait);
      }
      await until(
        () => failed() === attempts + RETRY_TIMES + 1,
        'every attempt to give the leases back to fail',
      );
      stranded.advance(RECONNECT_GRACE_MS);
      expect(spans.count('protocolBuilder.releaseOwner')).toBe(
        attempts + RETRY_TIMES + 1,
      );
      fault.setDown(false);
      const renewals = spans.count('sync.renewHeld');
      const expiry = await leaseExpiry(owner);
      await keeperTick(RENEW_INTERVAL_MS, stranded);
      await keeperTick(RENEW_INTERVAL_MS, stranded);
      expect(spans.count('sync.renewHeld')).toBe(renewals);
      expect(await leaseExpiry(owner)).toBe(expiry);
      // Staging goes back only with the leases; what a failed release leaves
      // behind waits for the sweep.
      expect(await stagedHere()).toContain(staged.data.descriptor.id);
    } finally {
      fault.setDown(false);
      await other.dispose();
    }
  });
});
