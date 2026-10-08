import { randomUUID } from 'node:crypto';

import { Cause, Effect, Exit, Redacted, Stream } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';

import { type ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';

import { type Studio } from '../app.ts';
import { TenantScope } from '../db/tenant.ts';
import { ProtocolEvents } from '../protocol-builder/publisher.ts';
import { latestDraftId } from '../protocol/store.ts';
import { testDb } from './support/database.ts';
import {
  ADA,
  callerOf,
  GRACE,
  holdingEvents,
  latch,
  leavingAfterCommit,
  revisionsOf,
  setupProtocolBuilderSuite,
  sid,
  STAGE_ORDER,
  TEAM_ID,
  until,
  type VariableReference,
} from './support/protocol-builder-suite.ts';
import {
  createProtocolBuilderClient,
  makeSpanCounter,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';

describe.skipIf(!testDb)('the protocol-builder host surface', () => {
  const suite = setupProtocolBuilderSuite();
  const { objectStore, call, callExit, watch, watching, drain, createOn } =
    suite;
  let host: ProtocolBuilderTestClient;
  let protocolId: string;
  let reference: VariableReference;
  let studio: Studio;

  beforeAll(() => {
    host = suite.host;
    protocolId = suite.protocolId;
    reference = suite.reference;
    studio = suite.studio;
  });

  it('replays from a cursor with nothing missed and nothing repeated', async () => {
    await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: Redacted.make({
          type: 'Information',
          label: 'Watched write',
          title: 'Watched write',
          items: [],
        }),
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

  const cursorOf = (event: ProtocolEvent) =>
    event.type === 'presence' ? undefined : event.cursor;

  const cursorsOf = (events: readonly ProtocolEvent[]) =>
    events.flatMap((event) => {
      const cursor = cursorOf(event);
      return cursor === undefined ? [] : [cursor];
    });

  it('never hands a live watcher an event its backlog already gave it', async () => {
    const events = holdingEvents();
    const spans = makeSpanCounter();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
      tracer: spans.tracer,
    });
    try {
      // Held once the relay has fixed its cursor and before the backlog is
      // read, so both the relay and the backlog carry what commits here.
      const overlap = events.nextSubscribed(
        (session) => session.connectionId === GRACE.connectionId,
      );
      const channel = watch(GRACE, protocolId, other);
      try {
        await overlap.reached;
        const reads = spans.ended('protocolBuilder.relayRead');
        const first = await createOn(other, 'Read by both, once');
        const second = await createOn(other, 'Read by both, last');
        await until(
          () => spans.ended('protocolBuilder.relayRead') > reads,
          'the relay to read the overlap',
        );
        overlap.release();
        const after = await createOn(other, 'Written after the backlog');
        await until(
          () => revisionsOf(channel.events, after.sectionId).length > 0,
          'the write after the backlog',
        );
        expect(revisionsOf(channel.events, first.sectionId)).toHaveLength(1);
        expect(revisionsOf(channel.events, second.sectionId)).toHaveLength(1);
        const cursors = cursorsOf(channel.events);
        expect(new Set(cursors).size).toBe(cursors.length);
      } finally {
        overlap.release();
        await channel.stop();
      }
    } finally {
      await other.dispose();
    }
  });

  it('delivers a write committed while a watch reads its backlog exactly once', async () => {
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    try {
      // Held after the backlog is read and before the live stream starts.
      const gap = events.nextPresence(
        (session) => session.connectionId === GRACE.connectionId,
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
        const cursors = cursorsOf(channel.events);
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
    const egolessDraft = await suite.runEffect(
      TenantScope.open(
        suite.access,
        latestDraftId(TEAM_ID, suite.egolessProtocolId),
      ),
    );
    if (egolessDraft === undefined) throw new Error('no egoless draft');
    const stalled = latch();
    let delivered = 0;
    const ended = callExit(
      GRACE,
      host.rpc('WatchProtocol', { protocolId: suite.egolessProtocolId }).pipe(
        Stream.runForEach(() =>
          Effect.promise(async () => {
            delivered += 1;
            if (delivered === 1) await stalled.opened;
          }),
        ),
      ),
    );
    await until(() => delivered === 1, 'the first event');
    // Past its cursor, and more releases than the watcher's queue and the
    // chunk its stream has already taken hold between them.
    await suite.teamRows(
      `INSERT INTO protocol_events (draft_id, team_id, cursor, kind, section_id)
       SELECT $1, $2, last.cursor + n, 'lock', 'settings'
         FROM (SELECT coalesce(max(cursor), 0) AS cursor FROM protocol_events
                WHERE draft_id = $1) AS last,
              generate_series(1, 2500) AS n`,
      [egolessDraft, TEAM_ID],
    );
    await call(
      ADA,
      host.rpc('Create', {
        protocolId: suite.egolessProtocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: Redacted.make({
          type: 'Information',
          label: 'Past the bound',
          title: 'Past the bound',
          items: [],
        }),
      }),
    );
    // An overflowing watcher leaves the relay, though its stream has yet to
    // drain what it was given.
    await until(
      async () =>
        (await host.run(
          ProtocolEvents.use((events) => events.subscribers(egolessDraft)),
        )) === 0,
      'the stalled watcher to overflow',
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
            document: Redacted.make({
              ...Redacted.value(held.document),
              label: 'Written as the tab closed',
            }),
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
            document: Redacted.make({
              type: 'Information',
              label: 'Created as the tab closed',
              title: 'Created as the tab closed',
              items: [],
            }),
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
          document: Redacted.make({
            ...Redacted.value(held.document),
            variables: {
              ...(Redacted.value(held.document).variables as Record<
                string,
                unknown
              >),
              [variableId]: { name: variableId, type: 'text' },
            },
          }),
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
});
