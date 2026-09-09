import { getEventMeta, safe } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolBuilderClient } from '@codaco/protocol-builder/contract';
import type { ProtocolEvent } from '@codaco/protocol-builder/contract/schemas';
import {
  CurrentProtocolSchema,
  type ExtractedAsset,
} from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';
import { timelineActions } from '~/ducks/middleware/timeline';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { getAssetManifest, getCanonicalProtocol } from '~/selectors/protocol';

import type { ArchitectStore } from '../architectStore.ts';
import {
  createArchitectClient,
  createArchitectRouter,
} from '../createArchitectRouter.ts';
import { ASSETS_SECTION, STAGE_ORDER_SECTION } from '../protocolSections.ts';

/**
 * The bytes an import wrote, standing in for Architect's IndexedDB asset
 * store: the store itself is out of this host's reach, and what the resource
 * lifecycle has to be shown doing is what it leaves in the protocol.
 */
const storedAssets = new Map<string, ExtractedAsset>();

vi.mock('~/utils/assetUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/assetUtils')>()),
  saveAssetWithFallback: (asset: ExtractedAsset) => {
    storedAssets.set(asset.id, asset);
    return Promise.resolve({ persisted: true });
  },
}));

const PROTOCOL_ID = 'library-row-1';
const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const EGO_FORM = sectionId({ kind: 'stage', stageId: 'ego-form-1' });
const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });

type OpenProtocol = Readonly<{
  store: ArchitectStore;
  client: ProtocolBuilderClient;
}>;

const openProtocol = (
  options: Readonly<{ withEgo?: boolean }> = {},
): OpenProtocol => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setActiveProtocolId(PROTOCOL_ID));
  // Parsed rather than cast: a fixture that stopped being a schema-8 protocol
  // would otherwise reach the router as one and fail somewhere less obvious.
  const protocol = CurrentProtocolSchema.parse(allInterfaces);
  const { ego: _ego, ...codebook } = protocol.codebook;
  store.dispatch(
    setActiveProtocol(
      options.withEgo === false ? { ...protocol, codebook } : protocol,
    ),
  );
  return { store, client: createArchitectClient(store) };
};

/** A file imported through the resource lifecycle, as an open edit's own. */
async function importResource(client: ProtocolBuilderClient): Promise<string> {
  const staged = await client.resources.stage({
    protocolId: PROTOCOL_ID,
    requestId: 'import-1',
    request: {
      kind: 'content',
      contentKind: 'image',
      name: 'A photograph',
      source: 'photo.png',
      contentType: 'image/png',
      bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    },
  });
  if (staged.status !== 'ok') throw new Error('staging failed');
  return staged.data.descriptor.id;
}

const stageLabel = (store: ArchitectStore, stageId: string): string =>
  getCanonicalProtocol(store.getState())?.stages.find(
    (stage) => stage.id === stageId,
  )?.label ?? '';

const stageIds = (store: ArchitectStore): string[] =>
  (getCanonicalProtocol(store.getState())?.stages ?? []).map(
    (stage) => stage.id,
  );

const personVariables = (store: ArchitectStore): Record<string, unknown> =>
  getCanonicalProtocol(store.getState())?.codebook.node?.person?.variables ??
  {};

const undoDepth = (store: ArchitectStore): number =>
  store.getState().activeProtocol.past.length;

async function waitFor(
  condition: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error(`timed out waiting: ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

type Seen = Readonly<{ event: ProtocolEvent; cursor: string | undefined }>;

/**
 * A live `watchProtocol` consumer.
 *
 * Waits for the presence event the host publishes when a stream attaches, so
 * a write made after `open` resolves cannot land in the gap before the
 * generator has subscribed.
 */
async function open(
  client: ProtocolBuilderClient,
  since?: string,
): Promise<Readonly<{ seen: Seen[]; close: () => Promise<void> }>> {
  const seen: Seen[] = [];
  const controller = new AbortController();
  const events = await client.watchProtocol(
    { protocolId: PROTOCOL_ID, ...(since === undefined ? {} : { since }) },
    { signal: controller.signal },
  );
  const draining = (async () => {
    try {
      for await (const event of events) {
        seen.push({ event, cursor: getEventMeta(event)?.id });
      }
    } catch {
      // The abort below ends the stream; nothing else can fail it here.
    }
  })();
  await waitFor(
    () => seen.some((entry) => entry.event.type === 'presence'),
    'the stream to attach',
  );
  return {
    seen,
    close: async () => {
      controller.abort();
      await draining;
    },
  };
}

const revisionsOf = (seen: readonly Seen[]) =>
  seen.filter(
    (
      entry,
    ): entry is Seen & {
      event: Extract<ProtocolEvent, { type: 'revision' }>;
    } => entry.event.type === 'revision',
  );

const streams: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of streams.splice(0)) await close();
});

const openStream = async (client: ProtocolBuilderClient, since?: string) => {
  const stream = await open(client, since);
  streams.push(stream.close);
  return stream;
};

describe("Architect's in-process protocol-builder host", () => {
  it('writes the submitted stage and streams exactly that revision', async () => {
    const { store, client } = openProtocol();
    const stream = await openStream(client);

    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { revision } = await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Renamed by the editor' },
      revision: held.revision,
    });

    expect(stageLabel(store, 'information-1')).toBe('Renamed by the editor');
    await waitFor(
      () => revisionsOf(stream.seen).length > 0,
      'the revision to reach the stream',
    );
    const revisions = revisionsOf(stream.seen);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.event.sectionId).toBe(INFORMATION);
    expect(revisions[0]?.event.revision).toEqual(revision);
    expect(revisions[0]?.event.document?.label).toBe('Renamed by the editor');
  });

  it('refuses a submit from an editor that never took the lock', async () => {
    const { store, client } = openProtocol();
    const before = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { definedError, isSuccess } = await safe(
      client.submit({
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
        document: { ...before.document, label: 'Renamed without the lock' },
        revision: before.revision,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('NOT_LOCK_HOLDER');
    expect(stageLabel(store, 'information-1')).toBe('Information');
    const after = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    expect(after.revision).toEqual(before.revision);
  });

  it('registers a created stage in the stage index at the same revision', async () => {
    const { store, client } = openProtocol();
    const template = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { id: _id, ...withoutId } = template.document;

    const created = await client.create({
      protocolId: PROTOCOL_ID,
      kind: 'stage',
      document: { ...withoutId, label: 'A created stage' },
      position: 0,
    });

    const ref = parseSectionId(created.sectionId);
    expect(ref.kind).toBe('stage');
    const stageId = ref.kind === 'stage' ? ref.stageId : '';
    const order = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: STAGE_ORDER_SECTION,
    });
    const stage = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: created.sectionId,
    });

    expect(order.document.stages).toEqual(stageIds(store));
    expect(stageIds(store)[0]).toBe(stageId);
    // The stage and the pointer to it move together: a pointer registered by a
    // second dispatch would carry a later sequence, and one never registered
    // would leave the created stage out of the order entirely.
    expect(order.revision.sequence).toBe(created.revision.sequence);
    expect(stage.revision.sequence).toBe(created.revision.sequence);
  });

  it('replays only what followed the cursor a stream was resumed from', async () => {
    const { client } = openProtocol();
    const first = await openStream(client);

    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Before the drop' },
      revision: held.revision,
    });
    await waitFor(
      () => revisionsOf(first.seen).length > 0,
      'the first revision to reach the stream',
    );
    const cursor = revisionsOf(first.seen)[0]?.cursor;
    expect(cursor).toBeDefined();
    await first.close();

    const second = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: EGO_FORM,
    });
    await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: EGO_FORM,
      document: { ...second.document, label: 'After the drop' },
      revision: second.revision,
    });

    const resumed = await openStream(client, cursor);
    await waitFor(
      () => revisionsOf(resumed.seen).length > 0,
      'the resumed stream to replay',
    );
    const replayed = revisionsOf(resumed.seen);
    expect(replayed.map((entry) => entry.event.sectionId)).toEqual([EGO_FORM]);
    expect(replayed[0]?.event.document?.label).toBe('After the drop');
  });

  it('records a submit and a create as one undoable step each', async () => {
    const { store, client } = openProtocol();
    expect(undoDepth(store)).toBe(0);

    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'One step' },
      revision: held.revision,
    });
    expect(undoDepth(store)).toBe(1);

    const { id: _id, ...withoutId } = held.document;
    await client.create({
      protocolId: PROTOCOL_ID,
      kind: 'stage',
      document: { ...withoutId, label: 'Also one step' },
      position: 0,
    });
    expect(undoDepth(store)).toBe(2);

    store.dispatch(timelineActions.undo());
    expect(stageIds(store)).not.toContain('');
    expect(stageLabel(store, 'information-1')).toBe('One step');
    store.dispatch(timelineActions.undo());
    expect(stageLabel(store, 'information-1')).toBe('Information');
    expect(undoDepth(store)).toBe(0);
  });

  it('writes a codebook entity type whole, and refactors an unused variable out of it', async () => {
    const { store, client } = openProtocol();
    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: PERSON,
    });
    const committed = getCanonicalProtocol(store.getState())?.codebook.node
      ?.person;
    await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: PERSON,
      document: {
        ...committed,
        variables: {
          ...committed?.variables,
          spare: { name: 'spare', type: 'text', component: 'Text' },
        },
      },
      revision: held.revision,
    });
    expect(personVariables(store).spare).toBeDefined();

    const result = await client.refactor.deleteVariable({
      protocolId: PROTOCOL_ID,
      subject: { entity: 'node', type: 'person' },
      variableId: 'spare',
    });

    expect(result.changedSections).toEqual([PERSON]);
    expect(personVariables(store).spare).toBeUndefined();
    expect(personVariables(store).name).toBeDefined();
  });

  /**
   * Architect refuses to delete a variable a stage still names, where the
   * contract's other hosts strip the references and delete it instead. The
   * refusal names what is still using the variable, in the section coordinates
   * a codebook dialog shows the researcher.
   */
  it('refuses to delete a referenced codebook variable, naming what still uses it', async () => {
    const { store, client } = openProtocol();

    const { definedError } = await safe(
      client.refactor.deleteVariable({
        protocolId: PROTOCOL_ID,
        subject: { entity: 'node', type: 'person' },
        variableId: 'name',
      }),
    );

    expect(definedError?.code).toBe('REFERENCES_REMAIN');
    if (definedError?.code !== 'REFERENCES_REMAIN') return;
    const { remaining } = definedError.data;
    expect(remaining.map((entry) => entry.sectionId)).toContain(
      sectionId({ kind: 'stage', stageId: 'name-generator-1' }),
    );
    // A section and a path inside it: "somewhere in this stage" is not
    // something a dialog can point at.
    expect(remaining.every((entry) => entry.path.length > 0)).toBe(true);
    expect(personVariables(store).name).toBeDefined();
  });

  /**
   * The lock table and the revision log belong to the router, not to a client
   * over it — so an open protocol takes one router, however many clients read
   * it, and two routers over one store would each grant the same lock.
   */
  it('holds the lock table on the router rather than on a client', async () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(setActiveProtocolId(PROTOCOL_ID));
    store.dispatch(
      setActiveProtocol(CurrentProtocolSchema.parse(allInterfaces)),
    );
    const router = createArchitectRouter(store);
    const reader: ProtocolBuilderClient = createRouterClient(router);
    const writer: ProtocolBuilderClient = createRouterClient(router);

    const held = await reader.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await writer.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Written by the second client' },
      revision: held.revision,
    });

    expect(stageLabel(store, 'information-1')).toBe(
      'Written by the second client',
    );
    const separate = createArchitectClient(store);
    const { definedError } = await safe(
      separate.submit({
        protocolId: PROTOCOL_ID,
        sectionId: EGO_FORM,
        document: { id: 'ego-form-1', type: 'EgoForm', label: 'No lock here' },
        revision: held.revision,
      }),
    );
    expect(definedError?.code).toBe('NOT_LOCK_HOLDER');
  });

  /**
   * Architect has no staging area: `stage` imports and commits, and the
   * lifecycle's promise — that a cancelled edit leaves nothing behind — is kept
   * by `discard` taking back exactly what the edit brought in.
   */
  it('takes an imported resource back out when the edit is discarded', async () => {
    const { store, client } = openProtocol();
    const before = { ...getAssetManifest(store.getState()) };

    const staged = await client.resources.stage({
      protocolId: PROTOCOL_ID,
      requestId: 'import-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'A photograph',
        source: 'photo.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      },
    });

    expect(staged.status).toBe('ok');
    if (staged.status !== 'ok') return;
    const { id } = staged.data.descriptor;
    // Staged, not committed: the edit can still take it back, and a picker
    // asking which resources are the edit's own is asking about that.
    expect(staged.data.descriptor.status).toBe('staged');
    expect(getAssetManifest(store.getState())[id]).toBeDefined();
    expect(storedAssets.has(id)).toBe(true);

    const discarded = await client.resources.discard({
      protocolId: PROTOCOL_ID,
    });

    // The whole answer is the status: a `data` key whose only value is
    // `undefined` is one a transport may drop and a schema then rejects.
    expect(discarded).toStrictEqual({ status: 'ok' });
    expect(getAssetManifest(store.getState())).toEqual(before);
    // Nothing in the protocol names the bytes any more, which is the condition
    // Architect's own orphan sweep collects them on.
    expect(Object.keys(getAssetManifest(store.getState()))).not.toContain(id);
  });

  it('keeps an imported resource the submit that names it promoted', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);

    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const written = await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Names the photograph' },
      revision: held.revision,
      promote: { promotionId: 'promotion-1', resourceIds: [id] },
    });

    // The edit that brought the file in has ended in a save, so cancelling a
    // later edit must not take the saved protocol's resource away with it.
    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    await client.resources.discard({ protocolId: PROTOCOL_ID });
    expect(getAssetManifest(store.getState())[id]).toBeDefined();
  });

  it('writes neither the stage nor the promotion when a promotion fails', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const manifest = { ...getAssetManifest(store.getState()) };

    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { definedError, isSuccess } = await safe(
      client.submit({
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
        document: { ...held.document, label: 'Renamed beside a bad promotion' },
        revision: held.revision,
        promote: { promotionId: 'promotion-1', resourceIds: ['never-staged'] },
      }),
    );

    // The section and the resources it names are one revision or nothing.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('PROMOTION_FAILED');
    expect(definedError?.data).toMatchObject({
      sectionId: INFORMATION,
      failure: { reason: 'not-found', resourceId: 'never-staged' },
    });
    expect(stageLabel(store, 'information-1')).toBe('Information');
    expect(getAssetManifest(store.getState())).toEqual(manifest);
    // The resource this edit imported is still the edit's to take back.
    await client.resources.discard({ protocolId: PROTOCOL_ID });
    expect(getAssetManifest(store.getState())[id]).toBeUndefined();
  });

  it('replays what a retried promoting submit already wrote', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const promote = { promotionId: 'promotion-1', resourceIds: [id] };
    const written = await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Saved once' },
      revision: held.revision,
      promote,
    });
    // The editor closed on the answer it never received, giving the lock back.
    await client.releaseLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const retried = await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Saved once' },
      revision: held.revision,
      promote,
    });

    // Refusing here would turn a save that succeeded into one the researcher
    // is told to discard a draft over.
    expect(retried.revision).toEqual(written.revision);
    expect(retried.promoted?.map((entry) => entry.id)).toEqual([id]);
    expect(stageLabel(store, 'information-1')).toBe('Saved once');
  });

  it('refuses a create while an editor holds the stage index', async () => {
    const { store, client } = openProtocol();
    const before = stageIds(store);
    await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: STAGE_ORDER_SECTION,
    });

    const { definedError, isSuccess } = await safe(
      client.create({
        protocolId: PROTOCOL_ID,
        kind: 'stage',
        document: {
          type: 'Information',
          label: 'Refused',
          title: 'Refused',
          items: [],
        },
      }),
    );

    // The editor holding the index has a whole-section draft that does not
    // know about the new stage, and its next submit would take the pointer out
    // while leaving the stage behind — a protocol that cannot be assembled.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: STAGE_ORDER_SECTION }],
    });
    expect(stageIds(store)).toEqual(before);
  });

  it('refuses a promoting submit while an editor holds the asset manifest', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: ASSETS_SECTION,
    });
    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { definedError, isSuccess } = await safe(
      client.submit({
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
        document: { ...held.document, label: 'Renamed beside a promotion' },
        revision: held.revision,
        promote: { promotionId: 'promotion-1', resourceIds: [id] },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: ASSETS_SECTION }],
    });
    expect(stageLabel(store, 'information-1')).toBe('Information');
    // Nothing was promoted, so the resource is still the edit's to take back.
    await client.resources.discard({ protocolId: PROTOCOL_ID });
    expect(getAssetManifest(store.getState())[id]).toBeUndefined();
  });

  /**
   * A stage being ADDED has no revision to submit, so the create is the only
   * place a file imported while composing it can become the protocol's.
   */
  it('promotes an imported resource with the stage being created', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const template = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { id: _id, ...withoutId } = template.document;

    const created = await client.create({
      protocolId: PROTOCOL_ID,
      kind: 'stage',
      document: { ...withoutId, label: 'Carries the photograph' },
      promote: { promotionId: 'promotion-1', resourceIds: [id] },
    });

    expect(created.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const stage = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: created.sectionId,
    });
    expect(stage.revision.sequence).toBe(created.revision.sequence);
    // The edit that brought the file in has ended in a create, so a later
    // cancel must not take the saved protocol's resource away with it.
    await client.resources.discard({ protocolId: PROTOCOL_ID });
    expect(getAssetManifest(store.getState())[id]).toBeDefined();
  });

  it('replays the stage a retried create already made, rather than a second one', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const promote = { promotionId: 'promotion-1', resourceIds: [id] };
    const document = {
      type: 'Information',
      label: 'Made once',
      title: 'Made once',
      items: [],
    };
    const created = await client.create({
      protocolId: PROTOCOL_ID,
      kind: 'stage',
      document,
      promote,
    });
    const afterFirst = stageIds(store);

    const retried = await client.create({
      protocolId: PROTOCOL_ID,
      kind: 'stage',
      document,
      promote,
    });

    // A second create would mint a second stage id, and the retry would be
    // told about a stage its first attempt never made.
    expect(retried.sectionId).toBe(created.sectionId);
    expect(retried.revision).toEqual(created.revision);
    expect(stageIds(store)).toEqual(afterFirst);
  });

  it('creates no stage when the promotion it carries cannot be committed', async () => {
    const { store, client } = openProtocol();
    const before = stageIds(store);

    const { definedError, isSuccess } = await safe(
      client.create({
        protocolId: PROTOCOL_ID,
        kind: 'stage',
        document: {
          type: 'Information',
          label: 'Never made',
          title: 'Never made',
          items: [],
        },
        promote: { promotionId: 'promotion-1', resourceIds: ['never-staged'] },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('PROMOTION_FAILED');
    // No section id: the host mints one only for a section it will write.
    expect(definedError?.data).toEqual({
      failure: {
        reason: 'not-found',
        message: 'no such staged resource',
        retryable: false,
        resourceId: 'never-staged',
      },
    });
    expect(stageIds(store)).toEqual(before);
  });

  it('removes a stage and its place in the stage index in one revision', async () => {
    const { store, client } = openProtocol();

    const deleted = await client.delete({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    expect(stageIds(store)).not.toContain('information-1');
    expect(deleted.changedSections).toEqual([INFORMATION, STAGE_ORDER_SECTION]);
    const order = await client.getSection({
      protocolId: PROTOCOL_ID,
      sectionId: STAGE_ORDER_SECTION,
    });
    // A pointer left behind, or a stage left out of the order, is a protocol
    // that cannot be assembled at all.
    expect(order.document.stages).toEqual(stageIds(store));
    expect(order.revision.sequence).toBe(deleted.revision.sequence);
    const { definedError } = await safe(
      client.getSection({ protocolId: PROTOCOL_ID, sectionId: INFORMATION }),
    );
    expect(definedError?.code).toBe('SECTION_NOT_FOUND');
  });

  it('refuses to delete a stage an editor still holds', async () => {
    const { store, client } = openProtocol();
    await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { definedError, isSuccess } = await safe(
      client.delete({ protocolId: PROTOCOL_ID, sectionId: INFORMATION }),
    );

    // The editor holding the stage would put it back with its next submit, so
    // its own session is no more allowed to delete it than anybody else is.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: INFORMATION }],
    });
    expect(stageIds(store)).toContain('information-1');
  });

  it('refuses to delete a stage another stage is built on, naming where', async () => {
    const { store, client } = openProtocol();

    const { definedError, isSuccess } = await safe(
      client.delete({
        protocolId: PROTOCOL_ID,
        sectionId: sectionId({ kind: 'stage', stageId: 'family-pedigree-1' }),
      }),
    );

    // Naming the section is not enough: the dialog telling the researcher what
    // is in the way points at the field, so the path is part of the refusal.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('REFERENCES_REMAIN');
    expect(definedError?.data).toEqual({
      remaining: [
        {
          sectionId: sectionId({
            kind: 'stage',
            stageId: 'narrative-pedigree-1',
          }),
          path: ['sourceStageId'],
        },
      ],
    });
    expect(stageIds(store)).toContain('family-pedigree-1');
  });

  /**
   * The dependants come from the schema's stage-reference tags rather than
   * from the two the timeline happens to guard, so a reference reached from a
   * path this host never enumerated refuses the deletion just the same.
   */
  it('refuses to delete a stage a skip destination points at', async () => {
    const { store, client } = openProtocol();
    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: {
        ...held.document,
        skipLogic: {
          action: 'SKIP',
          filter: {
            rules: [
              { type: 'node', id: 'rule-1', options: { operator: 'EXISTS' } },
            ],
          },
          destination: { type: 'stage', stageId: 'geospatial-1' },
        },
      },
      revision: held.revision,
    });
    await client.releaseLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { definedError, isSuccess } = await safe(
      client.delete({
        protocolId: PROTOCOL_ID,
        sectionId: sectionId({ kind: 'stage', stageId: 'geospatial-1' }),
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('REFERENCES_REMAIN');
    expect(definedError?.data).toEqual({
      remaining: [
        {
          sectionId: INFORMATION,
          path: ['skipLogic', 'destination', 'stageId'],
        },
      ],
    });
    expect(stageIds(store)).toContain('geospatial-1');
  });

  it('creates the ego codebook a protocol does not have yet', async () => {
    const { store, client } = openProtocol({ withEgo: false });
    expect(
      getCanonicalProtocol(store.getState())?.codebook.ego,
    ).toBeUndefined();

    const created = await client.create({
      protocolId: PROTOCOL_ID,
      kind: 'codebookEgo',
      document: {
        variables: {
          ego_age: { name: 'ego_age', type: 'number', component: 'Number' },
        },
      },
    });

    // Adding the first ego attribute is what creates the section, and there is
    // no other way to bring one into being.
    expect(created.sectionId).toBe(sectionId({ kind: 'codebookEgo' }));
    expect(
      getCanonicalProtocol(store.getState())?.codebook.ego?.variables,
    ).toMatchObject({ ego_age: { name: 'ego_age' } });
  });

  it('refuses to create an ego codebook the protocol already has', async () => {
    const { store, client } = openProtocol();
    const before = getCanonicalProtocol(store.getState())?.codebook.ego;

    const { definedError, isSuccess } = await safe(
      client.create({
        protocolId: PROTOCOL_ID,
        kind: 'codebookEgo',
        document: { variables: {} },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTION_EXISTS');
    expect(definedError?.data).toMatchObject({
      sectionId: sectionId({ kind: 'codebookEgo' }),
    });
    expect(getCanonicalProtocol(store.getState())?.codebook.ego).toEqual(
      before,
    );
  });

  it('keeps a lock when the stream that reported it ends', async () => {
    const { store, client } = openProtocol();
    const held = await client.acquireLock({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const stream = await open(client);

    // The stream ends, as a dropped socket ends it; the channel resumes on a
    // new one, and the editor behind it never stopped holding its draft.
    await stream.close();

    const written = await client.submit({
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Saved after the stream ended' },
      revision: held.revision,
    });
    expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);
    expect(stageLabel(store, 'information-1')).toBe(
      'Saved after the stream ended',
    );
  });

  it('lists the committed asset manifest as resources', async () => {
    const { client } = openProtocol();

    const listed = await client.resources.list({ protocolId: PROTOCOL_ID });

    expect(listed.status).toBe('ok');
    if (listed.status !== 'ok') return;
    expect(listed.data.secretStorage).toBe('plaintext');
    expect(
      listed.data.resources.map(({ id, kind, status }) => ({
        id,
        kind,
        status,
      })),
    ).toEqual([
      { id: 'mapbox_token', kind: 'apikey', status: 'committed' },
      { id: 'geo_data', kind: 'geojson', status: 'committed' },
      { id: 'roster_data', kind: 'network', status: 'committed' },
    ]);
  });
});
