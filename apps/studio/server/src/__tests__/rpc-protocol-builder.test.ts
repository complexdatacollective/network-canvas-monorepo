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
  let reference: VariableReference;
  let unstrippable: VariableReference;
  /** A protocol whose researcher has given the participant no attributes. */
  let egolessProtocolId: string;
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
      kind: 'stage',
      document: { type: 'Information', label, title: label, items: [] },
    });

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
    const store = new ProtocolStore(createTenantDb(scratch.app, TEAM_ID));
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
      sectionId: stage.sectionId,
      document: { ...held.document, label: 'Names a secret' },
      revision: held.revision,
      promote: {
        promotionId: 'promotion-1',
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
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Renamed' },
        revision: held.revision,
        promote: { promotionId: 'promotion-2', resourceIds: ['never-staged'] },
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
        sectionId: stage.sectionId,
        document: held.document,
        revision: held.revision,
        promote: {
          promotionId: 'promotion-3',
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
      requestId: 'discarded-secret',
      request: { kind: 'secret', name: 'Throwaway', value: 'pk.throwaway' },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');

    const discarded = await asClient(GRACE).protocolBuilder.resources.discard({
      protocolId,
      resourceId: staged.data.descriptor.id,
    });

    // The whole answer is the status: a `data` key whose only value is
    // `undefined` is one a transport may drop and a schema then rejects.
    expect(discarded).toStrictEqual({ status: 'ok' });
    const again = await asClient(GRACE).protocolBuilder.resources.discard({
      protocolId,
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
    let strandedAt = Date.now();
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
