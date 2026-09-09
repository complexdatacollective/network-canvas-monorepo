// The protocol-builder host contract, served by Studio (#1483): the refusals
// that make a lock mean something, the pointer registration that makes a
// created stage reachable, and the replay that makes a dropped connection
// recoverable.
//
// Driven through `createRouterClient` rather than a transport, so what is
// under test is the router and its storage rather than a serialization: the
// WebSocket wiring is covered by ws-protocol-builder.test.ts.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getEventMeta, isDefinedError, safe } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolEvent } from '@codaco/studio-rpc/protocol-builder';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import type { SessionPrincipal } from '../auth/service.ts';
import {
  createProtocolBuilderRuntime,
  type ProtocolBuilderRuntime,
} from '../protocol-builder/runtime.ts';
import { ProtocolStore } from '../protocol/store.ts';
import { createRpcRouter } from '../rpc.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from './support/postgres.ts';

const db = await reachableDb();

const TEAM_ID = 'protocol-builder-team';

type Researcher = {
  principal: SessionPrincipal;
  memberId: string;
  /** The connection, which is what the host locks per. */
  connectionId: string;
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
  };
}

const ADA = researcher('ada');
const GRACE = researcher('grace');

/**
 * A variable one stage's prompt names, taken from the sample protocol rather
 * than written here: the refactor under test is "strip every reference", and a
 * hand-written pair could stop being a reference without the test noticing.
 */
function referencedVariable(protocol: CurrentProtocol): {
  typeId: string;
  variableId: string;
  stageId: string;
} {
  for (const stage of protocol.stages) {
    const prompts: unknown = (stage as { prompts?: unknown }).prompts;
    const subject: unknown = (stage as { subject?: unknown }).subject;
    if (!Array.isArray(prompts) || typeof subject !== 'object') continue;
    const type = (subject as { type?: unknown } | null)?.type;
    if (typeof type !== 'string') continue;
    for (const prompt of prompts) {
      const variable = (prompt as { variable?: unknown }).variable;
      if (typeof variable === 'string') {
        return { typeId: type, variableId: variable, stageId: stage.id };
      }
    }
  }
  throw new Error('the sample protocol names no variable from a prompt');
}

describe.skipIf(!db)('the protocol-builder host surface', () => {
  let dispose: () => Promise<void>;
  let clients: Map<Researcher, ReturnType<typeof clientFor>>;
  let protocolId: string;
  let draftId: string;
  let reference: ReturnType<typeof referencedVariable>;
  let router: ReturnType<typeof createRpcRouter>;
  let runtime: ProtocolBuilderRuntime;
  /**
   * The clock the lease keeper reads, so a test can reach the idle bound
   * without spending five minutes there. Timers are left real: this suite
   * drives Postgres and oRPC event iterators, both of which are timer-driven.
   */
  let now = Date.now();

  function clientFor(who: Researcher) {
    return createRouterClient(router, {
      context: {
        principal: who.principal,
        requestId: randomUUID(),
        connectionId: who.connectionId,
      },
    });
  }

  const asClient = (who: Researcher) => {
    const client = clients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

  const stageSection = (stageId: string) => `stage:${stageId}`;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    dispose = scratch.dispose;
    await provisionScratchSchema(scratch.pool);
    await seedTeam(scratch.pool, TEAM_ID);
    for (const who of [ADA, GRACE]) {
      await scratch.pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [who.principal.userId, who.principal.name, who.principal.email],
      );
      await scratch.pool.query(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, 'owner')`,
        [who.memberId, TEAM_ID, who.principal.userId],
      );
    }

    const protocol = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@codaco/protocols/sample')),
        'utf8',
      ),
    ) as CurrentProtocol;
    reference = referencedVariable(protocol);
    const store = new ProtocolStore(createTenantDb(scratch.app, TEAM_ID));
    const created = await store.createProtocol({ protocol });
    protocolId = created.protocolId;
    const draft = await store.latestDraftId(protocolId);
    if (draft === undefined) throw new Error('the new protocol has no draft');
    draftId = draft;

    runtime = createProtocolBuilderRuntime(() => now);
    router = createRpcRouter(
      {
        enabled: true,
        emailAndPassword: true,
        magicLink: false,
        socialProviders: [],
      },
      {
        auth: stubAuthService({
          listMemberships: () =>
            Promise.resolve([{ teamId: TEAM_ID, role: 'owner' }]),
        }),
        deployment: { mode: 'self-hosted', billing: false },
        telemetry: false,
        invitationDeliveryAvailable: false,
        pool: scratch.app,
        protocolBuilder: runtime,
      },
    );
    clients = new Map([
      [ADA, clientFor(ADA)],
      [GRACE, clientFor(GRACE)],
    ]);
  });

  afterAll(async () => {
    await dispose?.();
  });

  it('refuses a submit from a caller that does not hold the lock', async () => {
    const sectionId = stageSection(reference.stageId);
    const before = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId,
    });

    const { error } = await safe(
      asClient(ADA).protocolBuilder.submit({
        protocolId,
        sectionId,
        document: { ...before.document, label: 'Renamed without the lock' },
        revision: before.revision,
      }),
    );

    if (!isDefinedError(error)) {
      throw error ?? new Error('the submit was not refused at all');
    }
    expect(error.code).toBe('NOT_LOCK_HOLDER');
    // The refusal has to be a refusal: an error the host reports while having
    // written anyway would pass a code-only assertion.
    const after = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId,
    });
    expect(after.document).toEqual(before.document);
    expect(after.revision).toEqual(before.revision);
  });

  it('opens read-only behind the holder, and names them', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(held.lock).toBe('held');
    try {
      const second = await asClient(ADA).protocolBuilder.acquireLock({
        protocolId,
        sectionId,
      });
      expect(second.lock).toBe('readOnly');
      if (second.lock !== 'readOnly') throw new Error('unreachable');
      expect(second.holder.userId).toBe(GRACE.principal.userId);
      expect(second.holder.displayName).toBe(GRACE.principal.name);
      expect(second.holder.sessionId).toBe(GRACE.connectionId);
    } finally {
      await asClient(GRACE).protocolBuilder.releaseLock({
        protocolId,
        sectionId,
      });
    }
  });

  it('writes a submit from the holder, and lets the next editor take it', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    if (held.lock !== 'held') throw new Error('the section was already taken');
    const document = { ...held.document, label: 'Renamed by its holder' };
    const written = await asClient(ADA).protocolBuilder.submit({
      protocolId,
      sectionId,
      document,
      revision: held.revision,
    });
    expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);

    const read = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId,
    });
    expect(read.document.label).toBe('Renamed by its holder');
    expect(read.revision.sequence).toBe(written.revision.sequence);

    await asClient(ADA).protocolBuilder.releaseLock({ protocolId, sectionId });
    const next = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(next.lock).toBe('held');
    await asClient(GRACE).protocolBuilder.releaseLock({
      protocolId,
      sectionId,
    });
  });

  it('registers a created stage in the stage order at the same revision', async () => {
    const before = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    const orderBefore = before.document.stages;
    if (!Array.isArray(orderBefore))
      throw new Error('stageOrder is not a list');

    const created = await asClient(ADA).protocolBuilder.create({
      protocolId,
      kind: 'stage',
      document: {
        type: 'Information',
        label: 'Created by the host',
        title: 'Created by the host',
        items: [],
      },
      position: 1,
    });

    const order = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    const stageId = created.sectionId.slice('stage:'.length);
    expect(order.document.stages).toEqual([
      orderBefore[0],
      stageId,
      ...orderBefore.slice(1),
    ]);
    // One atomic operation, so both sections carry one sequence — that is what
    // makes "the stage and its pointer landed together" observable.
    expect(order.revision.sequence).toBe(created.revision.sequence);
    const stage = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: created.sectionId,
    });
    expect(stage.revision.sequence).toBe(created.revision.sequence);
    expect(stage.document.id).toBe(stageId);

    const listed = await asClient(ADA).protocolBuilder.listSections({
      protocolId,
    });
    expect(listed.sectionIds).toContain(created.sectionId);
  });

  it('refuses a refactor whose sections another editor holds, naming them', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(held.lock).toBe('held');
    const codebookSection = `codebook:node:${reference.typeId}`;
    const before = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: codebookSection,
    });
    try {
      const { error } = await safe(
        asClient(ADA).protocolBuilder.refactor.deleteVariable({
          protocolId,
          subject: { entity: 'node', type: reference.typeId },
          variableId: reference.variableId,
        }),
      );
      if (!isDefinedError(error) || error.code !== 'SECTIONS_LOCKED') {
        throw error ?? new Error('the refactor was not refused at all');
      }
      const blocked = error.data.blocked;
      expect(blocked.map((entry) => entry.sectionId)).toContain(sectionId);
      const holder = blocked.find(
        (entry) => entry.sectionId === sectionId,
      )?.holder;
      expect(holder?.userId).toBe(GRACE.principal.userId);
      expect(holder?.displayName).toBe(GRACE.principal.name);
    } finally {
      await asClient(GRACE).protocolBuilder.releaseLock({
        protocolId,
        sectionId,
      });
    }
    // Blocked means nothing was written, including the section nobody held.
    const after = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: codebookSection,
    });
    expect(after.document).toEqual(before.document);
  });

  it('applies a refactor once every section it writes is free', async () => {
    const sectionId = stageSection(reference.stageId);
    const stageBefore = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId,
    });
    const promptsBefore = stageBefore.document.prompts;
    if (!Array.isArray(promptsBefore)) throw new Error('stage has no prompts');
    expect(
      promptsBefore.filter(
        (prompt) =>
          (prompt as { variable?: unknown }).variable === reference.variableId,
      ),
    ).not.toHaveLength(0);

    const applied = await asClient(ADA).protocolBuilder.refactor.deleteVariable(
      {
        protocolId,
        subject: { entity: 'node', type: reference.typeId },
        variableId: reference.variableId,
      },
    );
    expect(applied.changedSections).toContain(sectionId);

    const codebook = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: `codebook:node:${reference.typeId}`,
    });
    expect(
      (codebook.document.variables as Record<string, unknown>)[
        reference.variableId
      ],
    ).toBeUndefined();
    const stage = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId,
    });
    expect(stage.document.prompts).toEqual(
      promptsBefore.filter(
        (prompt) =>
          (prompt as { variable?: unknown }).variable !== reference.variableId,
      ),
    );
    // Every section of one refactor carries one sequence.
    expect(stage.revision.sequence).toBe(applied.revision.sequence);
    expect(codebook.revision.sequence).toBe(applied.revision.sequence);
  });

  it('replays from a cursor with nothing missed and nothing repeated', async () => {
    // Two sections at one revision, so the tail this test resumes into
    // contains more than one event and an off-by-one replay cannot look right.
    await asClient(ADA).protocolBuilder.create({
      protocolId,
      kind: 'stage',
      document: {
        type: 'Information',
        label: 'Watched write',
        title: 'Watched write',
        items: [],
      },
    });

    const wholeLog = await drain(asClient(ADA), { protocolId });
    const cursors = wholeLog.map((entry) => entry.cursor);
    expect(cursors.filter((cursor) => cursor !== undefined)).not.toHaveLength(
      0,
    );
    expect(new Set(cursors).size).toBe(cursors.length);

    const resumeFrom = cursors.at(-2);
    if (resumeFrom === undefined) throw new Error('no cursor to resume from');
    const replayed = await drain(asClient(GRACE), {
      protocolId,
      since: resumeFrom,
    });

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
  });

  /**
   * A researcher with an editor open holds the lock for as long as they are
   * connected, however long they spend thinking. Studio's storage underneath is
   * a lease with an expiry, so the section is only theirs while the server
   * keeps renewing it: this is the test that the server keeps renewing behind
   * an open channel that has called nothing, and stops when it closes.
   */
  it('keeps a lock while its channel is open, and gives it back when it closes', async () => {
    const sectionId = stageSection(reference.stageId);
    const owner = `${ADA.principal.userId}:${ADA.connectionId}`;
    const watch = await watching(asClient(ADA), protocolId);
    try {
      await asClient(ADA).protocolBuilder.acquireLock({
        protocolId,
        sectionId,
      });
      expect(runtime.leases.heldSections(draftId, owner)).toContain(sectionId);

      // Long past the idle bound, with nothing called in between.
      now += 6 * 60_000;
      await runtime.leases.renewDue();

      expect(runtime.leases.heldSections(draftId, owner)).toContain(sectionId);
      const behind = await asClient(GRACE).protocolBuilder.acquireLock({
        protocolId,
        sectionId,
      });
      expect(behind.lock).toBe('readOnly');
    } finally {
      now = Date.now();
      await watch.close();
    }

    // The channel closing is what ends the lock, so the next editor takes it.
    const taken = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(taken.lock).toBe('held');
    await asClient(GRACE).protocolBuilder.releaseLock({
      protocolId,
      sectionId,
    });
  });
});

/**
 * An open channel, drained in the background.
 *
 * Resolves once the stream has published this watcher's own arrival, so
 * nothing after it can land in the gap before the handler subscribed.
 */
async function watching(
  client: {
    protocolBuilder: {
      watchProtocol: (
        input: { protocolId: string },
        options: { signal: AbortSignal },
      ) => Promise<AsyncIterable<ProtocolEvent>>;
    };
  },
  protocolId: string,
): Promise<{ close: () => Promise<void> }> {
  const controller = new AbortController();
  const stream = await client.protocolBuilder.watchProtocol(
    { protocolId },
    { signal: controller.signal },
  );
  let attached = (): void => undefined;
  const attach = new Promise<void>((resolve) => {
    attached = resolve;
  });
  const draining = (async () => {
    try {
      for await (const event of stream) {
        if (event.type === 'presence') attached();
      }
    } catch {
      // The abort below is the only way this stream ends.
    }
  })();
  await attach;
  return {
    close: async () => {
      controller.abort();
      await draining;
    },
  };
}

type WatchedEvent = { cursor: string | undefined; event: ProtocolEvent };

/**
 * The replayable events a watcher is handed before it goes live.
 *
 * Presence is dropped: it carries no cursor by design, arrives from process
 * memory rather than the log, and would make a replay comparison depend on who
 * happened to be watching.
 */
async function drain(
  client: {
    protocolBuilder: {
      watchProtocol: (input: {
        protocolId: string;
        since?: string;
      }) => Promise<AsyncIterable<ProtocolEvent>>;
    };
  },
  input: { protocolId: string; since?: string },
): Promise<WatchedEvent[]> {
  const events: WatchedEvent[] = [];
  const stream = await client.protocolBuilder.watchProtocol(input);
  for await (const event of stream) {
    const cursor = getEventMeta(event)?.id;
    if (cursor === undefined) break;
    events.push({ cursor, event });
  }
  return events;
}
