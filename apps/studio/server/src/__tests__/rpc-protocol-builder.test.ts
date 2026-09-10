// The protocol-builder host contract, served by Studio (#1483): the refusals
// that make a lock mean something, the pointer registration that makes a
// created stage reachable, and the replay that makes a dropped connection
// recoverable.
//
// Driven through `createRouterClient` rather than a transport, so what is
// under test is the router and its storage rather than a serialization: the
// WebSocket wiring is covered by ws-protocol-builder.test.ts.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getEventMeta, isDefinedError, ORPCError, safe } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolEvent } from '@codaco/studio-rpc/protocol-builder';
import { SyncServer } from '@codaco/studio-sync/server';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import { MAX_UPLOAD_BYTES, type AssetStore } from '../assets.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import {
  createProtocolBuilderRuntime,
  IDLE_MS,
  REAUTHORIZE_MS,
  RECONNECT_GRACE_MS,
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

const ADA = researcher('ada');
const GRACE = researcher('grace');

/**
 * The edit these calls are made from: one stage editor or codebook dialog,
 * open from the moment it starts until its submit or its cancel.
 */
const EDIT = 'edit-1';

/** A second edit open beside it — a codebook dialog over a stage editor. */
const OTHER_EDIT = 'edit-2';

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

describe.skipIf(!db)('the protocol-builder host surface', () => {
  let dispose: () => Promise<void>;
  let clients: Map<Researcher, ReturnType<typeof clientFor>>;
  let protocolId: string;
  let draftId: string;
  /** The team's database, as the host's own sessions reach it. */
  let tenantDb: TenantDb;
  let reference: VariableReference;
  let unstrippable: VariableReference;
  /** A protocol whose researcher has given the participant no attributes. */
  let egolessProtocolId: string;
  let router: ReturnType<typeof createRpcRouter>;
  let buildRouter: () => ReturnType<typeof createRpcRouter>;
  let runtime: ProtocolBuilderRuntime;
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
  const assetStore: AssetStore = {
    checkHealth: () => Promise.resolve(),
    put: (bytes, mediaType) => {
      if (storeUnreachable) {
        return Promise.reject(new Error('the object store is unreachable'));
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (!stored.has(hash)) stored.set(hash, { bytes, mediaType });
      const existing = stored.get(hash);
      if (existing === undefined) throw new Error('unreachable');
      return Promise.resolve({
        hash,
        size: existing.bytes.byteLength,
        mediaType: existing.mediaType,
      });
    },
    get: () => Promise.resolve(null),
  };
  /**
   * The clock the lease keeper reads, so a test can reach the idle bound
   * without spending five minutes there. Timers are left real: this suite
   * drives Postgres and oRPC event iterators, both of which are timer-driven.
   */
  let now = Date.now();

  function clientFor(who: Researcher) {
    return clientOn(router, who);
  }

  /** The same researcher, on whichever router is serving them. */
  function clientOn(
    served: ReturnType<typeof createRpcRouter>,
    who: Researcher,
  ) {
    return createRouterClient(served, {
      context: {
        principal: who.principal,
        requestId: randomUUID(),
        connectionId: who.connectionId,
        clientSessionId: who.clientSessionId,
      },
    });
  }

  const asClient = (who: Researcher) => {
    const client = clients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

  const stageSection = (stageId: string) => `stage:${stageId}`;

  /** A stage of this test's own, so nothing here reads another test's edit. */
  const createStage = (who: Researcher, label: string) =>
    asClient(who).protocolBuilder.create({
      protocolId,
      requestId: randomUUID(),
      kind: 'stage',
      document: { type: 'Information', label, title: label, items: [] },
    });

  /** Researchers whose membership the team has taken away. */
  const revoked = new Set<string>();
  const memberships = (userId: string) =>
    Promise.resolve(
      revoked.has(userId) ? [] : [{ teamId: TEAM_ID, role: 'owner' as const }],
    );

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
    reference = strippableVariable(protocol);
    unstrippable = soleVariablePrompt(protocol);
    tenantDb = createTenantDb(scratch.app, TEAM_ID);
    const store = new ProtocolStore(tenantDb);
    const created = await store.createProtocol({ protocol });
    protocolId = created.protocolId;
    const { ego: _ego, ...codebook } = protocol.codebook;
    egolessProtocolId = (
      await store.createProtocol({
        protocol: { ...protocol, name: 'No ego yet', codebook },
      })
    ).protocolId;
    const draft = await store.latestDraftId(protocolId);
    if (draft === undefined) throw new Error('the new protocol has no draft');
    draftId = draft;

    runtime = createProtocolBuilderRuntime(() => now);
    // A factory rather than one router: everything a host keeps in memory —
    // its staging areas, its lease keeper — is built here, so calling it again
    // is a restarted server serving the same database.
    buildRouter = () =>
      createRpcRouter(
        {
          enabled: true,
          emailAndPassword: true,
          magicLink: false,
          socialProviders: [],
        },
        {
          auth: stubAuthService({ listMemberships: memberships }),
          deployment: { mode: 'self-hosted', billing: false },
          telemetry: false,
          invitationDeliveryAvailable: false,
          pool: scratch.app,
          protocolBuilder: createProtocolBuilderRuntime(() => now),
          assetStore,
        },
      );
    router = createRpcRouter(
      {
        enabled: true,
        emailAndPassword: true,
        magicLink: false,
        socialProviders: [],
      },
      {
        auth: stubAuthService({ listMemberships: memberships }),
        deployment: { mode: 'self-hosted', billing: false },
        telemetry: false,
        invitationDeliveryAvailable: false,
        pool: scratch.app,
        protocolBuilder: runtime,
        assetStore,
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
        requestId: randomUUID(),
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
      requestId: randomUUID(),
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
      requestId: randomUUID(),
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

  /**
   * The sweep is the schema's, not a list of paths this host happens to know:
   * the variable it removes here is named by a form field and by nothing else,
   * so a host that only stripped prompts would delete it and leave the stage
   * pointing at a variable that is gone.
   */
  it('applies a refactor once every section it writes is free', async () => {
    const sectionId = stageSection(reference.stageId);
    const stageBefore = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId,
    });
    const fieldsBefore = formFields(stageBefore.document);
    if (fieldsBefore === undefined) throw new Error('stage has no form');
    expect(
      fieldsBefore.filter(
        (field) =>
          (field as { variable?: unknown }).variable === reference.variableId,
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
    const codebookSection = `codebook:node:${unstrippable.typeId}`;
    const before = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: codebookSection,
    });

    const { error } = await safe(
      asClient(ADA).protocolBuilder.refactor.deleteVariable({
        protocolId,
        subject: { entity: 'node', type: unstrippable.typeId },
        variableId: unstrippable.variableId,
      }),
    );

    // Dropping the prompt would leave a stage with none, and no other reading
    // of "remove this reference" is one the researcher asked for — so the
    // change is refused whole, naming what is still using the variable.
    if (!isDefinedError(error) || error.code !== 'REFERENCES_REMAIN') {
      throw error ?? new Error('the deletion was not refused at all');
    }
    expect(error.data.remaining).toContainEqual({
      sectionId,
      path: ['prompts', 0, 'variable'],
    });
    const after = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: codebookSection,
    });
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
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'promoted-secret',
      request: { kind: 'secret', name: 'Mapbox token', value: 'pk.secret' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const handle = staged.data.handle;
    if (handle === undefined) throw new Error('a secret has no handle');

    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });
    const written = await asClient(ADA).protocolBuilder.submit({
      protocolId,
      requestId: randomUUID(),
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Names a secret' },
      revision: held.revision,
      promote: {
        editId: EDIT,
        resourceIds: [staged.data.descriptor.id],
        secretHandles: [handle],
      },
    });

    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const assets = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'assets',
    });
    expect(assets.document[staged.data.descriptor.id]).toMatchObject({
      name: 'Mapbox token',
      type: 'apikey',
    });
    // One sequence across both sections is what "atomic" means to a watcher
    // reading the stream in order.
    expect(assets.revision.sequence).toBe(written.revision.sequence);
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  it('writes neither the section nor the manifest when a promotion fails', async () => {
    const stage = await createStage(ADA, 'Renamed beside a bad promotion');
    const assetsBefore = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'assets',
    });
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });

    const { error } = await safe(
      asClient(ADA).protocolBuilder.submit({
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Renamed' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: ['never-staged'] },
      }),
    );

    if (!isDefinedError(error) || error.code !== 'PROMOTION_FAILED') {
      throw error ?? new Error('the submit was not refused at all');
    }
    expect(error.data).toMatchObject({
      sectionId: stage.sectionId,
      failure: { reason: 'not-found', resourceId: 'never-staged' },
    });
    const after = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: stage.sectionId,
    });
    expect(after.document.label).toBe('Renamed beside a bad promotion');
    expect(after.revision).toEqual(held.revision);
    const assets = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'assets',
    });
    expect(assets.document).toEqual(assetsBefore.document);
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  it('promotes a staged secret only for the handle staging answered with', async () => {
    const stage = await createStage(ADA, 'Promotes a secret it cannot name');
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'unhandled-secret',
      request: { kind: 'secret', name: 'Another token', value: 'pk.other' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });

    const { error } = await safe(
      asClient(ADA).protocolBuilder.submit({
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: held.document,
        revision: held.revision,
        promote: {
          editId: EDIT,
          resourceIds: [staged.data.descriptor.id],
        },
      }),
    );

    // The staged id is listed to everyone in the protocol; the value it stands
    // for is not, and writing it into the manifest is what puts a credential
    // into the file the researcher sends on.
    if (!isDefinedError(error) || error.code !== 'PROMOTION_FAILED') {
      throw error ?? new Error('the submit was not refused at all');
    }
    expect(error.data.failure.reason).toBe('invalid-request');
    const assets = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'assets',
    });
    expect(assets.document[staged.data.descriptor.id]).toBeUndefined();
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  it('answers a discard with the status alone', async () => {
    const staged = await asClient(GRACE).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'discarded-secret',
      request: { kind: 'secret', name: 'Throwaway', value: 'pk.throwaway' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');

    const discarded = await asClient(GRACE).protocolBuilder.resources.discard({
      protocolId,
      editId: EDIT,
      resourceId: staged.data.descriptor.id,
    });

    // The whole answer is the status: a `data` key whose only value is
    // `undefined` is one a transport may drop and a schema then rejects.
    expect(discarded).toStrictEqual({ status: 'ok' });
    const again = await asClient(GRACE).protocolBuilder.resources.discard({
      protocolId,
      editId: EDIT,
      resourceId: staged.data.descriptor.id,
    });
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

    const deleted = await asClient(ADA).protocolBuilder.delete({
      protocolId,
      sectionId: created.sectionId,
    });

    expect(deleted.changedSections).toEqual([created.sectionId, 'stageOrder']);
    const order = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    // A pointer left behind, or a section left out of the order, is a protocol
    // that cannot be assembled at all.
    expect(order.document.stages).not.toContain(stageId);
    expect(order.revision.sequence).toBe(deleted.revision.sequence);
    const { error } = await safe(
      asClient(ADA).protocolBuilder.getSection({
        protocolId,
        sectionId: created.sectionId,
      }),
    );
    expect(isDefinedError(error) && error.code).toBe('SECTION_NOT_FOUND');
    const listed = await asClient(ADA).protocolBuilder.listSections({
      protocolId,
    });
    expect(listed.sectionIds).not.toContain(created.sectionId);
  });

  it('refuses to delete a stage an editor holds, and names them', async () => {
    const created = await createStage(ADA, 'Held while someone deletes it');
    const held = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId: created.sectionId,
    });
    expect(held.lock).toBe('held');

    try {
      const { error } = await safe(
        asClient(ADA).protocolBuilder.delete({
          protocolId,
          sectionId: created.sectionId,
        }),
      );

      if (!isDefinedError(error) || error.code !== 'SECTIONS_LOCKED') {
        throw error ?? new Error('the deletion was not refused at all');
      }
      expect(error.data.blocked.map((entry) => entry.sectionId)).toEqual([
        created.sectionId,
      ]);
      expect(error.data.blocked[0]?.holder?.userId).toBe(
        GRACE.principal.userId,
      );
    } finally {
      await asClient(GRACE).protocolBuilder.releaseLock({
        protocolId,
        sectionId: created.sectionId,
      });
    }
    const order = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
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
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: source.sectionId,
    });
    await asClient(ADA).protocolBuilder.submit({
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
    });
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: source.sectionId,
    });

    const { error } = await safe(
      asClient(ADA).protocolBuilder.delete({
        protocolId,
        sectionId: destination.sectionId,
      }),
    );

    // Rewriting a collaborator's skip logic as a side effect of removing
    // something else is not a deletion anybody asked for, so the dependants are
    // named — with the field, which is what a dialog points the researcher at.
    if (!isDefinedError(error) || error.code !== 'REFERENCES_REMAIN') {
      throw error ?? new Error('the deletion was not refused at all');
    }
    expect(error.data.remaining).toEqual([
      {
        sectionId: source.sectionId,
        path: ['skipLogic', 'destination', 'stageId'],
      },
    ]);
    const order = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    expect(order.document.stages).toContain(
      destination.sectionId.slice('stage:'.length),
    );
  });

  it('refuses a promoting submit while an editor holds the asset manifest', async () => {
    const stage = await createStage(ADA, 'Promotes behind a held manifest');
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'blocked-manifest-secret',
      request: { kind: 'secret', name: 'Blocked token', value: 'pk.blocked' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const handle = staged.data.handle;
    if (handle === undefined) throw new Error('a secret has no handle');
    const manifest = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId: 'assets',
    });
    expect(manifest.lock).toBe('held');
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });

    try {
      const { error } = await safe(
        asClient(ADA).protocolBuilder.submit({
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: { ...held.document, label: 'Renamed' },
          revision: held.revision,
          promote: {
            editId: EDIT,
            resourceIds: [staged.data.descriptor.id],
            secretHandles: [handle],
          },
        }),
      );

      // The editor holding the manifest would submit its own whole manifest
      // next, over the entry this promotion added — leaving the saved section
      // naming a resource the protocol no longer has.
      if (!isDefinedError(error) || error.code !== 'SECTIONS_LOCKED') {
        throw error ?? new Error('the submit was not refused at all');
      }
      expect(error.data.blocked.map((entry) => entry.sectionId)).toEqual([
        'assets',
      ]);
      expect(error.data.blocked[0]?.holder?.userId).toBe(
        GRACE.principal.userId,
      );
      const after = await asClient(ADA).protocolBuilder.getSection({
        protocolId,
        sectionId: stage.sectionId,
      });
      expect(after.revision).toEqual(held.revision);
      expect(manifest.document[staged.data.descriptor.id]).toBeUndefined();
    } finally {
      await asClient(GRACE).protocolBuilder.releaseLock({
        protocolId,
        sectionId: 'assets',
      });
      await asClient(ADA).protocolBuilder.releaseLock({
        protocolId,
        sectionId: stage.sectionId,
      });
    }
  });

  it('refuses a create while an editor holds the stage index', async () => {
    const before = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    const held = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId: 'stageOrder',
    });
    expect(held.lock).toBe('held');

    try {
      const { error } = await safe(createStage(ADA, 'Never registered'));

      // The editor holding the index has a whole-section draft that does not
      // know about the new stage: its next submit would take the pointer out
      // and leave the section behind, which is a protocol that cannot be
      // assembled.
      if (!isDefinedError(error) || error.code !== 'SECTIONS_LOCKED') {
        throw error ?? new Error('the create was not refused at all');
      }
      expect(error.data.blocked.map((entry) => entry.sectionId)).toEqual([
        'stageOrder',
      ]);
      expect(error.data.blocked[0]?.holder?.userId).toBe(
        GRACE.principal.userId,
      );
    } finally {
      await asClient(GRACE).protocolBuilder.releaseLock({
        protocolId,
        sectionId: 'stageOrder',
      });
    }
    const after = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    expect(after.document.stages).toEqual(before.document.stages);
  });

  /**
   * A stage being ADDED has no revision to submit, so the create is the only
   * place a resource imported while composing it can become the protocol's.
   */
  it('promotes a staged resource with the stage being created', async () => {
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'created-with-secret',
      request: { kind: 'secret', name: 'Created token', value: 'pk.created' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const handle = staged.data.handle;
    if (handle === undefined) throw new Error('a secret has no handle');

    const created = await asClient(ADA).protocolBuilder.create({
      protocolId,
      requestId: randomUUID(),
      kind: 'stage',
      document: {
        type: 'Information',
        label: 'Carries a secret',
        title: 'Carries a secret',
        items: [],
      },
      promote: {
        editId: EDIT,
        resourceIds: [staged.data.descriptor.id],
        secretHandles: [handle],
      },
    });

    expect(created.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const assets = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'assets',
    });
    expect(assets.document[staged.data.descriptor.id]).toMatchObject({
      name: 'Created token',
      type: 'apikey',
    });
    const order = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    // The section, its pointer and the manifest entry are one revision, which
    // is what a watcher reading the stream in order sees.
    expect(assets.revision.sequence).toBe(created.revision.sequence);
    expect(order.revision.sequence).toBe(created.revision.sequence);
  });

  it('creates no stage when the promotion it carries cannot be committed', async () => {
    const before = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });

    const { error } = await safe(
      asClient(ADA).protocolBuilder.create({
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
    );

    if (!isDefinedError(error) || error.code !== 'PROMOTION_FAILED') {
      throw error ?? new Error('the create was not refused at all');
    }
    // No section id: the host mints one only for a section it will write.
    expect(error.data.sectionId).toBeUndefined();
    expect(error.data.failure).toMatchObject({
      reason: 'not-found',
      resourceId: 'never-staged',
    });
    const after = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    expect(after.document.stages).toEqual(before.document.stages);
  });

  it('replays the stage a retried create already made, rather than a second one', async () => {
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'retried-create-secret',
      request: { kind: 'secret', name: 'Retried token', value: 'pk.retried' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const handle = staged.data.handle;
    if (handle === undefined) throw new Error('a secret has no handle');
    const document = {
      type: 'Information',
      label: 'Made once',
      title: 'Made once',
      items: [],
    };
    const promote = {
      editId: EDIT,
      resourceIds: [staged.data.descriptor.id],
      secretHandles: [handle],
    };
    // The id the retry repeats: one intent, asked twice, because the answer
    // to the first attempt can be lost on its way back.
    const requestId = randomUUID();
    const created = await asClient(ADA).protocolBuilder.create({
      protocolId,
      requestId,
      kind: 'stage',
      document,
      promote,
    });
    const afterFirst = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });

    const retried = await asClient(ADA).protocolBuilder.create({
      protocolId,
      requestId,
      kind: 'stage',
      document,
      promote,
    });

    // A second create would mint a second stage id, and the retry would be
    // told about a stage its first attempt never made.
    expect(retried.sectionId).toBe(created.sectionId);
    expect(retried.revision).toEqual(created.revision);
    const order = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    expect(order.document.stages).toEqual(afterFirst.document.stages);
  });

  it('replays what a retried promoting submit already wrote', async () => {
    const stage = await createStage(ADA, 'Saved once');
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'retried-submit-secret',
      request: { kind: 'secret', name: 'Resubmitted', value: 'pk.resubmitted' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const handle = staged.data.handle;
    if (handle === undefined) throw new Error('a secret has no handle');
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });
    const promote = {
      editId: EDIT,
      resourceIds: [staged.data.descriptor.id],
      secretHandles: [handle],
    };
    const requestId = randomUUID();
    const written = await asClient(ADA).protocolBuilder.submit({
      protocolId,
      requestId,
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Saved once' },
      revision: held.revision,
      promote,
    });
    // The editor closed on the answer it never received, giving the lock back.
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });

    const retried = await asClient(ADA).protocolBuilder.submit({
      protocolId,
      requestId,
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Saved once' },
      revision: held.revision,
      promote,
    });

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
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'two-edits-secret',
      request: { kind: 'secret', name: 'One edit’s token', value: 'pk.one' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const listed = await asClient(ADA).protocolBuilder.resources.list({
      protocolId,
      editId: OTHER_EDIT,
      status: 'staged',
    });
    const inspected = await asClient(ADA).protocolBuilder.resources.inspect({
      protocolId,
      editId: OTHER_EDIT,
      resourceId,
    });
    const discarded = await asClient(ADA).protocolBuilder.resources.discard({
      protocolId,
      editId: OTHER_EDIT,
      resourceId,
    });
    // The other edit's own cancel, which drops everything IT staged.
    await asClient(ADA).protocolBuilder.resources.discard({
      protocolId,
      editId: OTHER_EDIT,
    });

    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(
      resourceId,
    );
    expect(inspected).toMatchObject({
      status: 'failed',
      failure: { reason: 'not-found' },
    });
    expect(discarded).toMatchObject({ status: 'failed' });
    const mine = await asClient(ADA).protocolBuilder.resources.list({
      protocolId,
      editId: EDIT,
      status: 'staged',
    });
    if (mine.status !== 'ok') throw new Error('listing failed');
    expect(mine.data.resources.map((entry) => entry.id)).toContain(resourceId);
  });

  it('refuses a promotion naming a resource another edit staged', async () => {
    const stage = await createStage(ADA, 'Promotes what it never staged');
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'not-this-edits-secret',
      request: { kind: 'secret', name: 'Not yours', value: 'pk.notyours' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });

    const { error } = await safe(
      asClient(ADA).protocolBuilder.submit({
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: held.document,
        revision: held.revision,
        promote: {
          editId: OTHER_EDIT,
          resourceIds: [staged.data.descriptor.id],
          ...(staged.data.handle === undefined
            ? {}
            : { secretHandles: [staged.data.handle] }),
        },
      }),
    );

    // A promotion takes the naming edit's own files and no others: a dialog
    // saving over a stage editor must not commit what the editor imported and
    // has not saved.
    if (!isDefinedError(error) || error.code !== 'PROMOTION_FAILED') {
      throw error ?? new Error('the submit was not refused at all');
    }
    expect(error.data.failure).toMatchObject({
      reason: 'not-found',
      resourceId: staged.data.descriptor.id,
    });
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  it('lists only what the protocol has committed when no edit is named', async () => {
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'unnamed-edit-secret',
      request: { kind: 'secret', name: 'Still an import', value: 'pk.import' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');

    const listed = await asClient(ADA).protocolBuilder.resources.list({
      protocolId,
    });

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
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });
    const submitId = randomUUID();
    const submitted = {
      protocolId,
      requestId: submitId,
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Saved without a promotion' },
      revision: held.revision,
    };
    const written = await asClient(ADA).protocolBuilder.submit(submitted);
    // The editor closed on the answer it never received, giving the lock back.
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
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
    const created = await asClient(ADA).protocolBuilder.create(creating);
    const afterFirst = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });

    const retriedSubmit = await asClient(ADA).protocolBuilder.submit(submitted);
    const retriedCreate = await asClient(ADA).protocolBuilder.create(creating);

    // A second submit would make a revision nothing changed in — and, with
    // the lock given back, be refused outright; a second create would leave
    // the protocol holding the stage twice.
    expect(retriedSubmit.revision).toEqual(written.revision);
    expect(retriedCreate.sectionId).toBe(created.sectionId);
    expect(retriedCreate.revision).toEqual(created.revision);
    const order = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'stageOrder',
    });
    expect(order.document.stages).toEqual(afterFirst.document.stages);
  });

  it('replays a retried write against a server that restarted in between', async () => {
    const stage = await createStage(ADA, 'Saved before the restart');
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });
    const call = {
      protocolId,
      requestId: randomUUID(),
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Saved before the restart' },
      revision: held.revision,
    };
    const written = await asClient(ADA).protocolBuilder.submit(call);
    const afterFirst = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: stage.sectionId,
    });

    // A new router is a new process: its staging areas and its lease keeper
    // are empty, and the database is all it has. The client whose answer went
    // missing is exactly the client that reconnects to a server that came
    // back up, so a record kept only in memory would answer nothing.
    const restarted = clientOn(buildRouter(), ADA);
    const retried = await restarted.protocolBuilder.submit(call);

    expect(retried.revision).toEqual(written.revision);
    // And wrote nothing on its way to that answer: the section is where the
    // first attempt left it.
    const section = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: stage.sectionId,
    });
    expect(section.revision).toEqual(afterFirst.revision);
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  /**
   * Committed bytes are named by their content, not by the file the
   * researcher picked: two imports called `portrait.png` are two assets, and a
   * protocol that carried both under one name could only export one of them.
   */
  it('commits promoted bytes under their content hash, keeping the display name', async () => {
    const stage = await createStage(ADA, 'Names a photograph');
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'promoted-portrait',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Nook',
        source: 'nook.png',
        contentType: 'image/png',
        bytes: new Blob([bytes], { type: 'image/png' }),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });

    const written = await asClient(ADA).protocolBuilder.submit({
      protocolId,
      requestId: randomUUID(),
      sectionId: stage.sectionId,
      document: held.document,
      revision: held.revision,
      promote: { editId: EDIT, resourceIds: [resourceId] },
    });

    // Worked out from the bytes here rather than read back off the host: a
    // host still committing them under the caller's filename fails this
    // instead of agreeing with itself.
    const digest = createHash('sha256').update(bytes).digest('hex');
    const source = `${digest}.png`;
    const assets = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: 'assets',
    });
    expect(assets.document[resourceId]).toEqual({
      name: 'Nook',
      type: 'image',
      source,
    });
    expect(written.promoted).toEqual([
      expect.objectContaining({ id: resourceId, status: 'committed', source }),
    ]);
    const listed = await asClient(ADA).protocolBuilder.resources.list({
      protocolId,
    });
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
    const preview = await asClient(ADA).protocolBuilder.resources.preview({
      protocolId,
      resourceId,
    });
    expect(preview).toMatchObject({
      status: 'ok',
      data: { url: `/storage/${digest}` },
    });
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  it('keeps a staged resource out of another editor’s discard', async () => {
    const staged = await asClient(GRACE).protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'grace-keeps-this',
      request: { kind: 'secret', name: 'Grace’s token', value: 'pk.grace' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const byId = await asClient(ADA).protocolBuilder.resources.discard({
      protocolId,
      editId: EDIT,
      resourceId,
    });
    const wholesale = await asClient(ADA).protocolBuilder.resources.discard({
      protocolId,
      editId: EDIT,
    });

    // A protocol has as many edits open as it has editors, and cancelling one
    // must not take away the file another is about to submit.
    expect(byId).toMatchObject({ status: 'failed' });
    expect(wholesale).toStrictEqual({ status: 'ok' });
    const listed = await asClient(GRACE).protocolBuilder.resources.list({
      protocolId,
      editId: EDIT,
    });
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
    const unary = clientOn(router, {
      ...ADA,
      connectionId: 'pb-ada-unary-connection',
      clientSessionId: 'pb-ada-unary-tab',
    });
    const abandoned = await unary.protocolBuilder.resources.stage({
      protocolId,
      editId: EDIT,
      requestId: 'unary-import',
      request: {
        kind: 'secret',
        name: 'A token nobody saved',
        value: 'pk.gone',
      },
    });
    const watch = await watching(asClient(GRACE), protocolId);
    try {
      const watched = await asClient(GRACE).protocolBuilder.resources.stage({
        protocolId,
        editId: OTHER_EDIT,
        requestId: 'watched-import',
        request: {
          kind: 'secret',
          name: 'A token being thought about',
          value: 'pk.kept',
        },
      });
      if (abandoned.status !== 'ok' || watched.status !== 'ok') {
        throw new Error('staging failed');
      }

      now += IDLE_MS + 1;
      // Somebody else's call, so neither of the two above is refreshed by
      // being the one that asked.
      await asClient(ADA).protocolBuilder.listSections({ protocolId });

      const gone = await unary.protocolBuilder.resources.list({
        protocolId,
        editId: EDIT,
        status: 'staged',
      });
      const kept = await asClient(GRACE).protocolBuilder.resources.list({
        protocolId,
        editId: OTHER_EDIT,
        status: 'staged',
      });
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
      await watch.close();
      now = Date.now();
    }
  });

  it('creates the ego codebook a protocol does not have yet, once', async () => {
    const { error: gone } = await safe(
      asClient(ADA).protocolBuilder.getSection({
        protocolId: egolessProtocolId,
        sectionId: 'codebook:ego',
      }),
    );
    expect(isDefinedError(gone) && gone.code).toBe('SECTION_NOT_FOUND');

    const created = await asClient(ADA).protocolBuilder.create({
      protocolId: egolessProtocolId,
      requestId: randomUUID(),
      kind: 'codebookEgo',
      document: {
        variables: {
          ego_age: { name: 'ego_age', type: 'number', component: 'Number' },
        },
      },
    });
    expect(created.sectionId).toBe('codebook:ego');
    const ego = await asClient(ADA).protocolBuilder.getSection({
      protocolId: egolessProtocolId,
      sectionId: 'codebook:ego',
    });
    expect(ego.document.variables).toMatchObject({
      ego_age: { name: 'ego_age' },
    });

    // Adding the first ego attribute is what creates the section, and a second
    // create is a mistake rather than a way to replace what is there.
    const { error } = await safe(
      asClient(ADA).protocolBuilder.create({
        protocolId: egolessProtocolId,
        requestId: randomUUID(),
        kind: 'codebookEgo',
        document: { variables: {} },
      }),
    );
    if (!isDefinedError(error) || error.code !== 'SECTION_EXISTS') {
      throw error ?? new Error('the second create was not refused');
    }
    expect(error.data.sectionId).toBe('codebook:ego');
    const unchanged = await asClient(ADA).protocolBuilder.getSection({
      protocolId: egolessProtocolId,
      sectionId: 'codebook:ego',
    });
    expect(unchanged.document).toEqual(ego.document);
  });

  it('replays from a cursor with nothing missed and nothing repeated', async () => {
    // Two sections at one revision, so the tail this test resumes into
    // contains more than one event and an off-by-one replay cannot look right.
    await asClient(ADA).protocolBuilder.create({
      protocolId,
      requestId: randomUUID(),
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

    // A transport resuming a dropped iterator re-invokes it with the same
    // input and the cursor this connection actually reached. Starting from the
    // input would hand the client the whole tail a second time, on every
    // reconnect, so the resume reads whichever of the two is further on.
    const resumed = await drain(
      asClient(GRACE),
      { protocolId, since: resumeFrom },
      cursors.at(-1),
    );
    expect(resumed).toEqual([]);
  });

  /**
   * Two tabs of one researcher are two editors: the lock belongs to the tab
   * rather than to the person, so the second opens read-only behind the first
   * (#1275) and is refused the write it would otherwise land on top of it.
   */
  it('refuses a second tab of the same researcher, and names the tab holding it', async () => {
    const sectionId = stageSection(reference.stageId);
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(held.lock).toBe('held');
    try {
      // The same person on the same cookie session, in a second tab: a
      // different tab id, and so a different owner.
      const secondTab = clientFor({
        ...ADA,
        connectionId: 'pb-ada-second-connection',
        clientSessionId: 'pb-ada-second-tab',
      });
      const behind = await secondTab.protocolBuilder.acquireLock({
        protocolId,
        sectionId,
      });
      expect(behind.lock).toBe('readOnly');
      if (behind.lock !== 'readOnly') throw new Error('unreachable');
      expect(behind.holder.userId).toBe(ADA.principal.userId);
      expect(behind.holder.sessionId).toBe(ADA.connectionId);

      // The refusal has to be a refusal: the second tab cannot write the
      // section it is reading.
      const { error } = await safe(
        secondTab.protocolBuilder.submit({
          protocolId,
          requestId: randomUUID(),
          sectionId,
          document: { ...behind.document, label: 'Renamed by the second tab' },
          revision: behind.revision,
        }),
      );
      if (!isDefinedError(error)) {
        throw error ?? new Error('the second tab was allowed to write');
      }
      expect(error.code).toBe('NOT_LOCK_HOLDER');
    } finally {
      await asClient(ADA).protocolBuilder.releaseLock({
        protocolId,
        sectionId,
      });
    }
  });

  /**
   * Presence is a connection's: a colleague's cursor is drawn from a socket
   * and goes when that socket does. A unary call has no connection at all, and
   * the cookie session it falls back to for ownership is shared by every tab
   * of a browser and never ends — so a lock taken over `/rpc` adds no
   * participant, because nothing would ever be able to remove it.
   */
  it('adds no participant for a lock taken without a connection', async () => {
    const sectionId = stageSection(reference.stageId);
    const unary = createRouterClient(router, {
      context: {
        principal: ADA.principal,
        requestId: randomUUID(),
        clientSessionId: 'pb-ada-unary-tab',
      },
    });
    const watch = await watching(asClient(GRACE), protocolId);
    try {
      const taken = await unary.protocolBuilder.acquireLock({
        protocolId,
        sectionId,
      });
      expect(taken.lock).toBe('held');

      const present = runtime.presence
        .list(draftId)
        .map((who) => who.sessionId);
      // The socket is here; the unary caller is not.
      expect(present).toContain(GRACE.connectionId);
      expect(present).not.toContain(ADA.principal.sessionId);
    } finally {
      await unary.protocolBuilder.releaseLock({ protocolId, sectionId });
      await watch.close();
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
    const watch = await watching(asClient(ADA), protocolId);
    /** When the channel ended, which is when the reconnect grace starts. */
    let strandedAt: number;
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
      strandedAt = Date.now();
      now = strandedAt;
      await watch.close();
    }

    // The channel has closed and the section is still ADA's tab's: the whole
    // of the grace is a reconnection in progress.
    now = strandedAt + RECONNECT_GRACE_MS;
    await runtime.leases.renewDue();
    expect(runtime.leases.heldSections(draftId, owner)).toContain(sectionId);
    const tooSoon = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(tooSoon.lock).toBe('readOnly');
    if (tooSoon.lock !== 'readOnly') throw new Error('unreachable');
    expect(tooSoon.holder.userId).toBe(ADA.principal.userId);

    // Nothing came back, so the tab has gone rather than blinked: the lease
    // ends here rather than at its own expiry, so the section is free the
    // moment the grace is up and the next editor takes it.
    now = strandedAt + RECONNECT_GRACE_MS + 1;
    await runtime.leases.renewDue();
    expect(runtime.leases.heldSections(draftId, owner)).not.toContain(
      sectionId,
    );
    const taken = await asClient(GRACE).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(taken.lock).toBe('held');
    await asClient(GRACE).protocolBuilder.releaseLock({
      protocolId,
      sectionId,
    });
    now = Date.now();
  });

  /**
   * A renewal that could not be made says nothing about whose lease it is. A
   * database briefly out of reach used to be read as the same answer an
   * expiry gives, and the section was dropped from the keeper while the
   * researcher's editor was still open on it: the lease then ran out at its
   * own expiry and their next submit was refused as `NOT_LOCK_HOLDER`.
   */
  it('keeps a lease the database never answered a renewal for', async () => {
    const sectionId = stageSection(reference.stageId);
    const owner = `${ADA.principal.userId}:${ADA.clientSessionId}`;
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    expect(held.lock).toBe('held');
    expect(runtime.leases.heldSections(draftId, owner)).toContain(sectionId);

    // Postgres briefly unreachable: the renewal is not refused, it is never
    // made. Put where the acquire above put the keeper's own sync server.
    let attempts = 0;
    const unreachable = new SyncServer(tenantDb, () => {
      attempts += 1;
      return Promise.reject(new Error('ECONNREFUSED'));
    });
    runtime.leases.hold({
      sync: unreachable,
      draftId,
      sectionId,
      owner,
      epoch: 1n,
    });

    await runtime.leases.renewDue();
    expect(attempts).toBe(1);
    expect(runtime.leases.heldSections(draftId, owner)).toContain(sectionId);
    // The next tick asks again rather than having given the section up, which
    // is what the renewal interval being a third of the TTL is for.
    await runtime.leases.renewDue();
    expect(attempts).toBe(2);
    expect(runtime.leases.heldSections(draftId, owner)).toContain(sectionId);

    await asClient(ADA).protocolBuilder.releaseLock({ protocolId, sectionId });
    expect(runtime.leases.heldSections(draftId, owner)).not.toContain(
      sectionId,
    );
  });

  it('answers a write with the written section’s own content hash', async () => {
    // `Revision.contentHash` is the hash the sectioned store keys documents
    // by, so a caller that took a write’s answer as the section’s next base
    // — or compared it with the revision the event channel carried — would be
    // comparing it with something else entirely.
    const stage = await createStage(ADA, 'Answers with its own hash');
    const created = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: stage.sectionId,
    });
    expect(stage.revision).toEqual(created.revision);

    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });
    const written = await asClient(ADA).protocolBuilder.submit({
      protocolId,
      requestId: randomUUID(),
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Renamed, and hashed as itself' },
      revision: held.revision,
    });
    const after = await asClient(ADA).protocolBuilder.getSection({
      protocolId,
      sectionId: stage.sectionId,
    });
    expect(written.revision).toEqual(after.revision);
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  it('refuses an empty file, and keeps nothing staged for it', async () => {
    const edit = 'edit-empty';
    const empty = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: edit,
      requestId: 'empty',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'A photograph with no pixels',
        source: 'blank.png',
        contentType: 'image/png',
        bytes: new Blob([], { type: 'image/png' }),
      },
    });

    // What the contract's own host answers: an empty file promoted into the
    // manifest is an asset the interview would try to show and could not.
    expect(empty).toMatchObject({
      status: 'failed',
      failure: { reason: 'invalid-content' },
    });
    const listed = await asClient(ADA).protocolBuilder.resources.list({
      protocolId,
      editId: edit,
      status: 'staged',
    });
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toEqual([]);
  });

  it('refuses a resource larger than this deployment stores, and keeps none of it', async () => {
    const edit = 'edit-oversize';
    const oversized = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: edit,
      requestId: 'oversized',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'A photograph nobody can send',
        source: 'huge.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)], {
          type: 'image/png',
        }),
      },
    });

    expect(oversized).toMatchObject({
      status: 'failed',
      failure: { reason: 'too-large' },
    });
    // Refused before the bytes were kept: an authenticated caller cannot make
    // the process hold what it will not store.
    const listed = await asClient(ADA).protocolBuilder.resources.list({
      protocolId,
      editId: edit,
      status: 'staged',
    });
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toEqual([]);
  });

  it('answers an unreachable object store with a failure the editor can retry', async () => {
    const edit = 'edit-store-down';
    const stage = await createStage(ADA, 'Names a file the store cannot take');
    const staged = await asClient(ADA).protocolBuilder.resources.stage({
      protocolId,
      editId: edit,
      requestId: 'store-down',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'A photograph',
        source: 'photo.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }),
      },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const held = await asClient(ADA).protocolBuilder.acquireLock({
      protocolId,
      sectionId: stage.sectionId,
    });
    const promote = {
      editId: edit,
      resourceIds: [staged.data.descriptor.id],
    };

    storeUnreachable = true;
    let refused;
    try {
      refused = await safe(
        asClient(ADA).protocolBuilder.submit({
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
    const { error } = refused;
    if (!isDefinedError(error) || error.code !== 'PROMOTION_FAILED') {
      throw error ?? new Error('the submit was not refused at all');
    }
    expect(error.data.failure).toMatchObject({
      reason: 'unavailable',
      retryable: true,
      resourceId: staged.data.descriptor.id,
    });

    // Retryable is a promise about what is still there: the resource is
    // staged, the section is unwritten, and the same submit lands once the
    // store is back.
    const written = await asClient(ADA).protocolBuilder.submit({
      protocolId,
      requestId: randomUUID(),
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Renamed with a file' },
      revision: held.revision,
      promote,
    });
    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    await asClient(ADA).protocolBuilder.releaseLock({
      protocolId,
      sectionId: stage.sectionId,
    });
  });

  it('keeps a tab editing the section it still holds when it gives the other back', async () => {
    // A codebook dialog over a stage editor: one tab, two sections, and
    // closing the dialog is not the researcher stopping editing.
    const editor = await createStage(ADA, 'Held while a dialog is open');
    const dialog = await createStage(ADA, 'The dialog over it');
    const watch = await watching(asClient(ADA), protocolId);
    try {
      for (const sectionId of [editor.sectionId, dialog.sectionId]) {
        await asClient(ADA).protocolBuilder.acquireLock({
          protocolId,
          sectionId,
        });
      }
      await asClient(ADA).protocolBuilder.releaseLock({
        protocolId,
        sectionId: dialog.sectionId,
      });

      expect(
        runtime.presence
          .list(draftId)
          .find((who) => who.sessionId === ADA.connectionId),
      ).toMatchObject({ mode: 'editing', sectionId: editor.sectionId });
    } finally {
      await asClient(ADA).protocolBuilder.releaseLock({
        protocolId,
        sectionId: editor.sectionId,
      });
      await watch.close();
    }
  });

  it('ends a watch whose membership was taken away, and gives back what it held', async () => {
    const owner = `${GRACE.principal.userId}:${GRACE.clientSessionId}`;
    const stage = await createStage(
      ADA,
      'Watched by a colleague who is removed',
    );
    const controller = new AbortController();
    const stream = await asClient(GRACE).protocolBuilder.watchProtocol(
      { protocolId },
      { signal: controller.signal },
    );
    /** Whatever ends the stream, or nothing if it is still running. */
    const ending = (async () => {
      try {
        for await (const event of stream) void event;
        return new Error('the stream ended without saying why');
      } catch (error: unknown) {
        return error;
      }
    })();

    let ended: unknown;
    try {
      await asClient(GRACE).protocolBuilder.acquireLock({
        protocolId,
        sectionId: stage.sectionId,
      });
      expect(runtime.leases.heldSections(draftId, owner)).toContain(
        stage.sectionId,
      );

      // The team takes GRACE off the study while her socket is open.
      revoked.add(GRACE.principal.userId);
      now += REAUTHORIZE_MS;
      // ADA goes on working, and none of it is GRACE's to receive.
      await createStage(ADA, 'Written after the membership was revoked');
      ended = await Promise.race([
        ending,
        new Promise((resolve) => setTimeout(() => resolve(undefined), 2_000)),
      ]);
    } finally {
      revoked.delete(GRACE.principal.userId);
      controller.abort();
      await ending;
    }

    if (!(ended instanceof ORPCError) || ended.code !== 'PROTOCOL_NOT_FOUND') {
      throw ended ?? new Error('the watch went on delivering the protocol');
    }
    // The channel was also what kept her leases renewed, so the section goes
    // back to the team once the reconnect grace has run out.
    now += RECONNECT_GRACE_MS + 1;
    await runtime.leases.renewDue();
    expect(runtime.leases.heldSections(draftId, owner)).not.toContain(
      stage.sectionId,
    );
    now = Date.now();
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
      watchProtocol: (
        input: { protocolId: string; since?: string },
        options?: { lastEventId?: string },
      ) => Promise<AsyncIterable<ProtocolEvent>>;
    };
  },
  input: { protocolId: string; since?: string },
  /** What a resumed iterator carries: the cursor this connection reached. */
  lastEventId?: string,
): Promise<WatchedEvent[]> {
  const events: WatchedEvent[] = [];
  const stream = await client.protocolBuilder.watchProtocol(
    input,
    lastEventId === undefined ? {} : { lastEventId },
  );
  for await (const event of stream) {
    const cursor = getEventMeta(event)?.id;
    if (cursor === undefined) break;
    events.push({ cursor, event });
  }
  return events;
}
