import { createHash } from 'node:crypto';

import { configureStore } from '@reduxjs/toolkit';
import {
  Cause,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Stream,
} from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import type { RpcAdapter } from '@codaco/effect-query/types';
import {
  ProtocolBuilderGroup,
  type ProtocolBuilderClient,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import {
  InvalidShape,
  NotLockHolder,
  PromotionFailed,
  ProtocolNotFound,
  ReferencesRemain,
  SectionExists,
  SectionNotFound,
  SectionsLocked,
} from '@codaco/protocol-builder-core/contract/errors';
import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import {
  CurrentProtocolSchema,
  type Experiments,
  type ExtractedAsset,
} from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';
import { timelineActions } from '~/ducks/middleware/timeline';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { getAssetManifest, getProtocol } from '~/selectors/protocol';

import type { ArchitectStore } from '../architectStore.ts';
import { createArchitectClient } from '../client.ts';
import { ArchitectHandlers } from '../handlers.ts';
import { makeInProcessClient } from '../inProcessClient.ts';
import { ProtocolRevisions } from '../protocolRevisions.ts';
import { ASSETS_SECTION, STAGE_ORDER_SECTION } from '../protocolSections.ts';
import { ArchitectHostClient } from '../runtime.ts';
import { ArchitectHostSession } from '../session.ts';

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

/** What an editor calls the tab holding the saved copy, when it is not this one. */
const OTHER_TAB = 'Another tab';

/**
 * The edit these calls are made from: one stage editor or codebook dialog,
 * open from the moment it starts until its submit or its cancel.
 */
const EDIT = 'edit-1';

/** A second edit open beside it — a codebook dialog over a stage editor. */
const OTHER_EDIT = 'edit-2';

/** A fresh idempotency key: every write below is its own intent. */
let writes = 0;
const nextRequestId = (): string => `write-${++writes}`;
const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const EGO_FORM = sectionId({ kind: 'stage', stageId: 'ego-form-1' });
const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });
const SETTINGS = sectionId({ kind: 'settings' });

/** The language the all-interfaces protocol is written in. */
const FIXTURE_LANGUAGE = 'en-US';

type TestClient = Readonly<{
  call: RpcAdapter<ProtocolBuilderRpcs>['rpcCall'];
  runtime: ManagedRuntime.ManagedRuntime<ArchitectHostClient, never>;
}>;

type OpenProtocol = Readonly<{
  store: ArchitectStore;
  client: TestClient;
}>;

const runtimes: { dispose: () => Promise<void> }[] = [];

const clientOf = (store: ArchitectStore): TestClient => {
  const { adapter, runtime } = createArchitectClient(store, OTHER_TAB);
  runtimes.push(runtime);
  return { call: adapter.rpcCall, runtime };
};

async function safe(
  promise: Promise<unknown>,
): Promise<Readonly<{ error: unknown; isSuccess: boolean }>> {
  try {
    await promise;
    return { error: undefined, isSuccess: true };
  } catch (error) {
    return { error, isSuccess: false };
  }
}

const openProtocol = (
  options: Readonly<{ withEgo?: boolean; experiments?: Experiments }> = {},
): OpenProtocol => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setActiveProtocolId(PROTOCOL_ID));
  // Parsed rather than cast: a fixture that stopped being a schema-8 protocol
  // would otherwise reach the router as one and fail somewhere less obvious.
  const parsed = CurrentProtocolSchema.parse(allInterfaces);
  const protocol =
    options.experiments === undefined
      ? parsed
      : { ...parsed, experiments: options.experiments };
  const { ego: _ego, ...codebook } = protocol.codebook;
  store.dispatch(
    setActiveProtocol(
      options.withEgo === false ? { ...protocol, codebook } : protocol,
    ),
  );
  return { store, client: clientOf(store) };
};

/** A file imported through the resource lifecycle, as an open edit's own. */
async function importResource(
  client: TestClient,
  editId: string = EDIT,
): Promise<string> {
  const staged = await client.call('ResourcesStage', {
    protocolId: PROTOCOL_ID,
    editId,
    requestId: 'import-1',
    request: {
      kind: 'content',
      contentKind: 'image',
      name: 'A photograph',
      source: 'photo.png',
      contentType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    },
  });
  if (staged.status !== 'ok') throw new Error('staging failed');
  return staged.data.descriptor.id;
}

const stageLabel = (store: ArchitectStore, stageId: string): string =>
  getProtocol(store.getState())?.stages.find((stage) => stage.id === stageId)
    ?.label[FIXTURE_LANGUAGE] ?? '';

const stageIds = (store: ArchitectStore): string[] =>
  (getProtocol(store.getState())?.stages ?? []).map((stage) => stage.id);

const personVariables = (store: ArchitectStore): Record<string, unknown> =>
  getProtocol(store.getState())?.codebook.node?.person?.variables ?? {};

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
 * A live `WatchProtocol` consumer.
 *
 * Waits for the presence event the host publishes when a stream attaches, so
 * a write made after `open` resolves cannot land in the gap before the
 * generator has subscribed.
 */
async function open(
  client: TestClient,
  since?: string,
): Promise<Readonly<{ seen: Seen[]; close: () => Promise<void> }>> {
  const seen: Seen[] = [];
  const fiber = client.runtime.runFork(
    Effect.flatMap(ArchitectHostClient, (host) =>
      Stream.runForEach(
        host('WatchProtocol', {
          protocolId: PROTOCOL_ID,
          ...(since === undefined ? {} : { since }),
        }),
        (event) =>
          Effect.sync(() => {
            seen.push({
              event,
              cursor: event.type === 'presence' ? undefined : event.cursor,
            });
          }),
      ),
    ),
  );
  await waitFor(
    () => seen.some((entry) => entry.event.type === 'presence'),
    'the stream to attach',
  );
  return {
    seen,
    close: () => Effect.runPromise(Fiber.interrupt(fiber)),
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
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
});

const openStream = async (client: TestClient, since?: string) => {
  const stream = await open(client, since);
  streams.push(stream.close);
  return stream;
};

describe("Architect's in-process protocol-builder host", () => {
  it('writes the submitted stage and streams exactly that revision', async () => {
    const { store, client } = openProtocol();
    const stream = await openStream(client);

    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { revision } = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Renamed by the editor' },
      },
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
    expect(revisions[0]?.event.document?.label).toEqual({
      [FIXTURE_LANGUAGE]: 'Renamed by the editor',
    });
  });

  it('refuses a submit from an editor that never took the lock', async () => {
    const { store, client } = openProtocol();
    const before = await client.call('GetSection', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { error, isSuccess } = await safe(
      client.call('Submit', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: {
          ...before.document,
          label: { [FIXTURE_LANGUAGE]: 'Renamed without the lock' },
        },
        revision: before.revision,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(NotLockHolder);
    expect(stageLabel(store, 'information-1')).toBe('Information');
    const after = await client.call('GetSection', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    expect(after.revision).toEqual(before.revision);
  });

  it('registers a created stage in the stage index at the same revision', async () => {
    const { store, client } = openProtocol();
    const template = await client.call('GetSection', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { id: _id, ...withoutId } = template.document;

    const created = await client.call('Create', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      kind: 'stage',
      document: {
        ...withoutId,
        label: { [FIXTURE_LANGUAGE]: 'A created stage' },
      },
      position: 0,
    });

    const ref = parseSectionId(created.sectionId);
    expect(ref.kind).toBe('stage');
    const stageId = ref.kind === 'stage' ? ref.stageId : '';
    const order = await client.call('GetSection', {
      protocolId: PROTOCOL_ID,
      sectionId: STAGE_ORDER_SECTION,
    });
    const stage = await client.call('GetSection', {
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

    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Before the drop' },
      },
      revision: held.revision,
    });
    await waitFor(
      () => revisionsOf(first.seen).length > 0,
      'the first revision to reach the stream',
    );
    const cursor = revisionsOf(first.seen)[0]?.cursor;
    expect(cursor).toBeDefined();
    await first.close();

    const second = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: EGO_FORM,
    });
    await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: EGO_FORM,
      document: {
        ...second.document,
        label: { [FIXTURE_LANGUAGE]: 'After the drop' },
      },
      revision: second.revision,
    });

    const resumed = await openStream(client, cursor);
    await waitFor(
      () => revisionsOf(resumed.seen).length > 0,
      'the resumed stream to replay',
    );
    const replayed = revisionsOf(resumed.seen);
    expect(replayed.map((entry) => entry.event.sectionId)).toEqual([EGO_FORM]);
    expect(replayed[0]?.event.document?.label).toEqual({
      [FIXTURE_LANGUAGE]: 'After the drop',
    });

    const reached = replayed[0]?.cursor;
    expect(reached).toBeDefined();
    const again = await openStream(client, reached);
    expect(revisionsOf(again.seen)).toEqual([]);
  });

  it('records a submit and a create as one undoable step each', async () => {
    const { store, client } = openProtocol();
    expect(undoDepth(store)).toBe(0);

    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: { ...held.document, label: { [FIXTURE_LANGUAGE]: 'One step' } },
      revision: held.revision,
    });
    expect(undoDepth(store)).toBe(1);

    const { id: _id, ...withoutId } = held.document;
    await client.call('Create', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      kind: 'stage',
      document: {
        ...withoutId,
        label: { [FIXTURE_LANGUAGE]: 'Also one step' },
      },
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
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: PERSON,
    });
    const committed = getProtocol(store.getState())?.codebook.node?.person;
    await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: PERSON,
      document: {
        ...committed,
        variables: {
          ...committed?.variables,
          spare: {
            name: 'spare',
            label: 'Spare',
            type: 'text',
            component: 'Text',
          },
        },
      },
      revision: held.revision,
    });
    expect(personVariables(store).spare).toBeDefined();

    const result = await client.call('RefactorDeleteVariable', {
      protocolId: PROTOCOL_ID,
      subject: { entity: 'node', type: 'person' },
      variableId: 'spare',
    });

    expect(result.changedSections).toEqual([PERSON]);
    expect(personVariables(store).spare).toBeUndefined();
    expect(personVariables(store).name).toBeDefined();
  });

  it('keeps the experiments setting through a settings write, and clears it when the write leaves it out', async () => {
    const { store, client } = openProtocol({ experiments: {} });
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: SETTINGS,
    });
    expect(held.document).toHaveProperty('experiments', {});

    const renamed = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: SETTINGS,
      document: { ...held.document, name: 'Renamed' },
      revision: held.revision,
    });
    expect(getProtocol(store.getState())).toMatchObject({
      name: 'Renamed',
      experiments: {},
    });

    // The section is written whole, so a write without the setting clears it.
    const { experiments: _cleared, ...withoutExperiments } = held.document;
    await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: SETTINGS,
      document: { ...withoutExperiments, name: 'Renamed' },
      revision: renamed.revision,
    });
    expect(getProtocol(store.getState())?.experiments).toBeUndefined();
  });

  /**
   * Architect refuses to delete a variable a stage still names, where the
   * contract's other hosts strip the references and delete it instead. The
   * refusal names what is still using the variable, in the section coordinates
   * a codebook dialog shows the researcher.
   */
  it('refuses to delete a referenced codebook variable, naming what still uses it', async () => {
    const { store, client } = openProtocol();

    const { error } = await safe(
      client.call('RefactorDeleteVariable', {
        protocolId: PROTOCOL_ID,
        subject: { entity: 'node', type: 'person' },
        variableId: 'name',
      }),
    );

    expect(error).toBeInstanceOf(ReferencesRemain);
    if (!(error instanceof ReferencesRemain)) return;
    const { remaining } = error;
    expect(remaining.map((entry) => entry.sectionId)).toContain(
      sectionId({ kind: 'stage', stageId: 'name-generator-1' }),
    );
    // A section and a path inside it: "somewhere in this stage" is not
    // something a dialog can point at.
    expect(remaining.every((entry) => entry.path.length > 0)).toBe(true);
    expect(personVariables(store).name).toBeDefined();
  });

  it('holds the lock table on the handlers rather than on a client', async () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(setActiveProtocolId(PROTOCOL_ID));
    store.dispatch(
      setActiveProtocol(CurrentProtocolSchema.parse(allInterfaces)),
    );
    class Reader extends Context.Service<Reader, ProtocolBuilderClient>()(
      'test/Reader',
    ) {}
    class Writer extends Context.Service<Writer, ProtocolBuilderClient>()(
      'test/Writer',
    ) {}
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        Layer.effect(Reader)(makeInProcessClient(ProtocolBuilderGroup)),
        Layer.effect(Writer)(makeInProcessClient(ProtocolBuilderGroup)),
      ).pipe(
        Layer.provide(
          Layer.mergeAll(
            ArchitectHandlers(store, OTHER_TAB),
            ArchitectHostSession,
          ),
        ),
      ),
    );
    runtimes.push(runtime);
    const reading: RpcAdapter<ProtocolBuilderRpcs> = makeRpcAdapter({
      runtime,
      client: Reader,
    });
    const writing: RpcAdapter<ProtocolBuilderRpcs> = makeRpcAdapter({
      runtime,
      client: Writer,
    });
    const reader = { call: reading.rpcCall };
    const writer = { call: writing.rpcCall };

    const held = await reader.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await writer.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Written by the second client' },
      },
      revision: held.revision,
    });

    expect(stageLabel(store, 'information-1')).toBe(
      'Written by the second client',
    );
    const separate = clientOf(store);
    const { error } = await safe(
      separate.call('Submit', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        sectionId: EGO_FORM,
        document: {
          id: 'ego-form-1',
          type: 'EgoForm',
          label: { [FIXTURE_LANGUAGE]: 'No lock here' },
        },
        revision: held.revision,
      }),
    );
    expect(error).toBeInstanceOf(NotLockHolder);
  });

  /**
   * Architect has no staging area: `stage` imports and commits, and the
   * lifecycle's promise — that a cancelled edit leaves nothing behind — is kept
   * by `discard` taking back exactly what the edit brought in.
   */
  it('takes an imported resource back out when the edit is discarded', async () => {
    const { store, client } = openProtocol();
    const before = { ...getAssetManifest(store.getState()) };

    const staged = await client.call('ResourcesStage', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      requestId: 'import-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'A photograph',
        source: 'photo.png',
        contentType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
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

    const discarded = await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
    });

    // The whole answer is the status: a `data` key whose only value is
    // `undefined` is one a transport may drop and a schema then rejects.
    expect(discarded).toStrictEqual({ status: 'ok' });
    expect(getAssetManifest(store.getState())).toEqual(before);
    // Nothing in the protocol names the bytes any more, which is the condition
    // Architect's own orphan sweep collects them on.
    expect(Object.keys(getAssetManifest(store.getState()))).not.toContain(id);
  });

  /**
   * One researcher, one store — and still two edits: a codebook dialog over a
   * stage editor, or a second tab of the same protocol. Neither one's cancel
   * may take away the file the other is about to submit, so staging is scoped
   * to the edit here as it is on a multi-editor host.
   */
  it('keeps one edit’s imported resource out of the edit open beside it', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);

    const listed = await client.call('ResourcesList', {
      protocolId: PROTOCOL_ID,
      editId: OTHER_EDIT,
    });
    const inspected = await client.call('ResourcesInspect', {
      protocolId: PROTOCOL_ID,
      editId: OTHER_EDIT,
      resourceId: id,
    });
    const discarded = await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: OTHER_EDIT,
      resourceId: id,
    });
    // The other edit's own cancel, which drops everything IT imported.
    await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: OTHER_EDIT,
    });

    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(id);
    expect(inspected).toMatchObject({
      status: 'failed',
      failure: { reason: 'not-found' },
    });
    expect(discarded).toMatchObject({ status: 'failed' });
    // Still in the protocol, and still the importing edit's to take back.
    expect(getAssetManifest(store.getState())[id]).toBeDefined();
    const mine = await client.call('ResourcesList', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      status: 'staged',
    });
    if (mine.status !== 'ok') throw new Error('listing failed');
    expect(mine.data.resources.map((entry) => entry.id)).toContain(id);
  });

  it('refuses a promotion naming a resource another edit imported', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { error, isSuccess } = await safe(
      client.call('Submit', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: {
          ...held.document,
          label: { [FIXTURE_LANGUAGE]: 'Promotes another edit’s file' },
        },
        revision: held.revision,
        promote: { editId: OTHER_EDIT, resourceIds: [id] },
      }),
    );

    // A promotion takes the naming edit's own imports and no others: a dialog
    // saving over a stage editor must not commit what the editor imported and
    // has not saved.
    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(PromotionFailed);
    expect(error).toMatchObject({
      failure: { reason: 'not-found', resourceId: id },
    });
    expect(stageLabel(store, 'information-1')).toBe('Information');
    // And the file is still the importing edit's to take back.
    await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
    });
    expect(getAssetManifest(store.getState())[id]).toBeUndefined();
  });

  it('lists only what the protocol has committed when no edit is named', async () => {
    const { client } = openProtocol();
    const id = await importResource(client);

    const listed = await client.call('ResourcesList', {
      protocolId: PROTOCOL_ID,
    });

    // A caller that names no edit is asking what the protocol holds, and an
    // import nobody has saved yet is not part of it — however committed the
    // manifest underneath it happens to be.
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(id);
    expect(listed.data.resources.map((entry) => entry.status)).not.toContain(
      'staged',
    );
  });

  /**
   * Architect has one protocol open at a time, and a resource call names the
   * protocol it belongs to. A stage editor that closed with the protocol
   * behind it can still have an import or a cancel in flight, and the store it
   * would reach is whichever protocol the researcher opened next — so the call
   * is refused rather than served against the wrong protocol. Every other
   * procedure here refuses it already, and the contract declares the same
   * error on these five.
   */
  it('refuses a resource call naming a protocol that is no longer open', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const before = getAssetManifest(store.getState());

    store.dispatch(setActiveProtocolId('another-protocol'));

    const refused = await Promise.all([
      safe(
        client.call('ResourcesList', { protocolId: PROTOCOL_ID, editId: EDIT }),
      ),
      safe(
        client.call('ResourcesStage', {
          protocolId: PROTOCOL_ID,
          editId: EDIT,
          requestId: 'import-after-switch',
          request: {
            kind: 'content',
            contentKind: 'image',
            name: 'A second photograph',
            source: 'other.png',
            contentType: 'image/png',
            bytes: new Uint8Array([4, 5, 6]),
          },
        }),
      ),
      safe(
        client.call('ResourcesDiscard', {
          protocolId: PROTOCOL_ID,
          editId: EDIT,
        }),
      ),
      safe(
        client.call('ResourcesInspect', {
          protocolId: PROTOCOL_ID,
          editId: EDIT,
          resourceId: id,
        }),
      ),
      safe(
        client.call('ResourcesPreview', {
          protocolId: PROTOCOL_ID,
          editId: EDIT,
          resourceId: id,
        }),
      ),
    ]);

    expect(
      refused.map((outcome) => outcome.error instanceof ProtocolNotFound),
    ).toEqual([true, true, true, true, true]);
    // Neither the import nor the discard reached the protocol that is open
    // now: the manifest is exactly what the refused calls found.
    expect(getAssetManifest(store.getState())).toEqual(before);
  });

  /**
   * Committed bytes are named by their content, not by the file the
   * researcher picked: two imports called `photo.png` are two assets, and a
   * protocol that carried both under one name could only export one of them.
   */
  it('records an imported file under its content hash, keeping the display name', async () => {
    const { store, client } = openProtocol();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    const staged = await client.call('ResourcesStage', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      requestId: 'hashed-import',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Nook',
        source: 'nook.png',
        contentType: 'image/png',
        bytes,
      },
    });

    // Worked out from the bytes here rather than read back off the host: a
    // host still recording the caller's filename fails this instead of
    // agreeing with itself.
    const source = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    if (staged.status !== 'ok') throw new Error('staging failed');
    const id = staged.data.descriptor.id;
    expect(getAssetManifest(store.getState())[id]).toMatchObject({
      type: 'image',
      name: 'Nook',
      source,
    });
    const listed = await client.call('ResourcesList', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      status: 'staged',
    });
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(staged.data.descriptor.source).toBe('nook.png');
    expect(listed.data.resources).toContainEqual(
      expect.objectContaining({ id, name: 'Nook', source: 'nook.png' }),
    );

    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const written = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: held.document,
      revision: held.revision,
      promote: { editId: EDIT, resourceIds: [id] },
    });
    expect(written.promoted).toEqual([
      expect.objectContaining({ id, status: 'committed', source }),
    ]);
    const committed = await client.call('ResourcesList', {
      protocolId: PROTOCOL_ID,
      status: 'committed',
    });
    if (committed.status !== 'ok') throw new Error('listing failed');
    expect(committed.data.resources).toContainEqual(
      expect.objectContaining({ id, source }),
    );
  });

  /**
   * The retry a promotion-keyed record never covered: a write that promotes
   * nothing carried no key at all, so a second attempt wrote a second time.
   */
  it('replays a retried submit and a retried create that promote nothing', async () => {
    const { store, client } = openProtocol();
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const submitted = {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Saved without a promotion' },
      },
      revision: held.revision,
    };
    const written = await client.call('Submit', submitted);
    // The editor closed on the answer it never received, giving the lock back.
    await client.call('ReleaseLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const creating = {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      kind: 'stage' as const,
      document: {
        type: 'Information',
        label: { [FIXTURE_LANGUAGE]: 'Made without a promotion' },
        title: { [FIXTURE_LANGUAGE]: 'Made without a promotion' },
        items: [],
      },
    };
    const created = await client.call('Create', creating);
    const afterFirst = stageIds(store);
    const stepsAfterFirst = undoDepth(store);

    const retriedSubmit = await client.call('Submit', submitted);
    const retriedCreate = await client.call('Create', creating);

    // A second submit would make a revision nothing changed in — and, with the
    // lock given back, be refused outright; a second create would leave the
    // protocol holding the stage twice.
    expect(retriedSubmit.revision).toEqual(written.revision);
    expect(retriedCreate.sectionId).toBe(created.sectionId);
    expect(retriedCreate.revision).toEqual(created.revision);
    expect(stageIds(store)).toEqual(afterFirst);
    // Nor is a replay an undoable step: nothing happened to undo.
    expect(undoDepth(store)).toBe(stepsAfterFirst);
  });

  it('keeps an imported resource the submit that names it promoted', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);

    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const written = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Names the photograph' },
      },
      revision: held.revision,
      promote: { editId: EDIT, resourceIds: [id] },
    });

    // The edit that brought the file in has ended in a save, so cancelling a
    // later edit must not take the saved protocol's resource away with it.
    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
    });
    expect(getAssetManifest(store.getState())[id]).toBeDefined();
  });

  it('writes neither the stage nor the promotion when a promotion fails', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const manifest = { ...getAssetManifest(store.getState()) };

    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { error, isSuccess } = await safe(
      client.call('Submit', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: {
          ...held.document,
          label: { [FIXTURE_LANGUAGE]: 'Renamed beside a bad promotion' },
        },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: ['never-staged'] },
      }),
    );

    // The section and the resources it names are one revision or nothing.
    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(PromotionFailed);
    expect(error).toMatchObject({
      sectionId: INFORMATION,
      failure: { reason: 'not-found', resourceId: 'never-staged' },
    });
    expect(stageLabel(store, 'information-1')).toBe('Information');
    expect(getAssetManifest(store.getState())).toEqual(manifest);
    // The resource this edit imported is still the edit's to take back.
    await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
    });
    expect(getAssetManifest(store.getState())[id]).toBeUndefined();
  });

  it('replays what a retried promoting submit already wrote', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const promote = { editId: EDIT, resourceIds: [id] as const };
    // The id the retry repeats: one intent, asked twice, because the answer to
    // the first attempt can be lost on its way back.
    const requestId = nextRequestId();
    const written = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId,
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Saved once' },
      },
      revision: held.revision,
      promote,
    });
    // The editor closed on the answer it never received, giving the lock back.
    await client.call('ReleaseLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const retried = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId,
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Saved once' },
      },
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
    await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: STAGE_ORDER_SECTION,
    });

    const { error, isSuccess } = await safe(
      client.call('Create', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        kind: 'stage',
        document: {
          type: 'Information',
          label: { [FIXTURE_LANGUAGE]: 'Refused' },
          title: { [FIXTURE_LANGUAGE]: 'Refused' },
          items: [],
        },
      }),
    );

    // The editor holding the index has a whole-section draft that does not
    // know about the new stage, and its next submit would take the pointer out
    // while leaving the stage behind — a protocol that cannot be assembled.
    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(SectionsLocked);
    expect(error).toMatchObject({
      blocked: [{ sectionId: STAGE_ORDER_SECTION }],
    });
    expect(stageIds(store)).toEqual(before);
  });

  it('refuses a promoting submit while an editor holds the asset manifest', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: ASSETS_SECTION,
    });
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { error, isSuccess } = await safe(
      client.call('Submit', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: {
          ...held.document,
          label: { [FIXTURE_LANGUAGE]: 'Renamed beside a promotion' },
        },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [id] },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(SectionsLocked);
    expect(error).toMatchObject({
      blocked: [{ sectionId: ASSETS_SECTION }],
    });
    expect(stageLabel(store, 'information-1')).toBe('Information');
    // Nothing was promoted, so the resource is still the edit's to take back.
    await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
    });
    expect(getAssetManifest(store.getState())[id]).toBeUndefined();
  });

  /**
   * A stage being ADDED has no revision to submit, so the create is the only
   * place a file imported while composing it can become the protocol's.
   */
  it('promotes an imported resource with the stage being created', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const template = await client.call('GetSection', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const { id: _id, ...withoutId } = template.document;

    const created = await client.call('Create', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      kind: 'stage',
      document: {
        ...withoutId,
        label: { [FIXTURE_LANGUAGE]: 'Carries the photograph' },
      },
      promote: { editId: EDIT, resourceIds: [id] },
    });

    expect(created.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const stage = await client.call('GetSection', {
      protocolId: PROTOCOL_ID,
      sectionId: created.sectionId,
    });
    expect(stage.revision.sequence).toBe(created.revision.sequence);
    // The edit that brought the file in has ended in a create, so a later
    // cancel must not take the saved protocol's resource away with it.
    await client.call('ResourcesDiscard', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
    });
    expect(getAssetManifest(store.getState())[id]).toBeDefined();
  });

  it('replays the stage a retried create already made, rather than a second one', async () => {
    const { store, client } = openProtocol();
    const id = await importResource(client);
    const promote = { editId: EDIT, resourceIds: [id] as const };
    const document = {
      type: 'Information',
      label: { [FIXTURE_LANGUAGE]: 'Made once' },
      title: { [FIXTURE_LANGUAGE]: 'Made once' },
      items: [],
    };
    const requestId = nextRequestId();
    const created = await client.call('Create', {
      protocolId: PROTOCOL_ID,
      requestId,
      kind: 'stage',
      document,
      promote,
    });
    const afterFirst = stageIds(store);

    const retried = await client.call('Create', {
      protocolId: PROTOCOL_ID,
      requestId,
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

    const { error, isSuccess } = await safe(
      client.call('Create', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        kind: 'stage',
        document: {
          type: 'Information',
          label: { [FIXTURE_LANGUAGE]: 'Never made' },
          title: { [FIXTURE_LANGUAGE]: 'Never made' },
          items: [],
        },
        promote: { editId: EDIT, resourceIds: ['never-staged'] },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(PromotionFailed);
    // No section id: the host mints one only for a section it will write.
    expect(error).toEqual(
      new PromotionFailed({
        failure: {
          reason: 'not-found',
          message: 'no such staged resource',
          retryable: false,
          resourceId: 'never-staged',
        },
      }),
    );
    expect(stageIds(store)).toEqual(before);
  });

  it('removes a stage and its place in the stage index in one revision', async () => {
    const { store, client } = openProtocol();

    const deleted = await client.call('Delete', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    expect(stageIds(store)).not.toContain('information-1');
    expect(deleted.changedSections).toEqual([INFORMATION, STAGE_ORDER_SECTION]);
    const order = await client.call('GetSection', {
      protocolId: PROTOCOL_ID,
      sectionId: STAGE_ORDER_SECTION,
    });
    // A pointer left behind, or a stage left out of the order, is a protocol
    // that cannot be assembled at all.
    expect(order.document.stages).toEqual(stageIds(store));
    expect(order.revision.sequence).toBe(deleted.revision.sequence);
    const { error } = await safe(
      client.call('GetSection', {
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
      }),
    );
    expect(error).toBeInstanceOf(SectionNotFound);
  });

  it('refuses to delete a stage an editor still holds', async () => {
    const { store, client } = openProtocol();
    await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { error, isSuccess } = await safe(
      client.call('Delete', {
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
      }),
    );

    // The editor holding the stage would put it back with its next submit, so
    // its own session is no more allowed to delete it than anybody else is.
    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(SectionsLocked);
    expect(error).toMatchObject({
      blocked: [{ sectionId: INFORMATION }],
    });
    expect(stageIds(store)).toContain('information-1');
  });

  it('refuses to delete a stage another stage is built on, naming where', async () => {
    const { store, client } = openProtocol();

    const { error, isSuccess } = await safe(
      client.call('Delete', {
        protocolId: PROTOCOL_ID,
        sectionId: sectionId({ kind: 'stage', stageId: 'family-pedigree-1' }),
      }),
    );

    // Naming the section is not enough: the dialog telling the researcher what
    // is in the way points at the field, so the path is part of the refusal.
    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(ReferencesRemain);
    expect(error).toEqual(
      new ReferencesRemain({
        remaining: [
          {
            sectionId: sectionId({
              kind: 'stage',
              stageId: 'narrative-pedigree-1',
            }),
            path: ['sourceStageId'],
          },
        ],
      }),
    );
    expect(stageIds(store)).toContain('family-pedigree-1');
  });

  /**
   * The dependants come from the schema's stage-reference tags rather than
   * from the two the timeline happens to guard, so a reference reached from a
   * path this host never enumerated refuses the deletion just the same.
   */
  it('refuses to delete a stage a skip destination points at', async () => {
    const { store, client } = openProtocol();
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
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
    await client.call('ReleaseLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });

    const { error, isSuccess } = await safe(
      client.call('Delete', {
        protocolId: PROTOCOL_ID,
        sectionId: sectionId({ kind: 'stage', stageId: 'geospatial-1' }),
      }),
    );

    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(ReferencesRemain);
    expect(error).toEqual(
      new ReferencesRemain({
        remaining: [
          {
            sectionId: INFORMATION,
            path: ['skipLogic', 'destination', 'stageId'],
          },
        ],
      }),
    );
    expect(stageIds(store)).toContain('geospatial-1');
  });

  // The interview has to end at a finish stage, so its only one stays; the
  // refusal names the stage order, the reference that is not taken out.
  it('refuses to delete the stage that ends the interview', async () => {
    const { store, client } = openProtocol();
    const finishIndex = stageIds(store).indexOf('finish');
    expect(finishIndex).toBe(stageIds(store).length - 1);

    const { error, isSuccess } = await safe(
      client.call('Delete', {
        protocolId: PROTOCOL_ID,
        sectionId: sectionId({ kind: 'stage', stageId: 'finish' }),
      }),
    );

    expect(isSuccess).toBe(false);
    expect(error).toEqual(
      new ReferencesRemain({
        remaining: [
          {
            sectionId: sectionId({ kind: 'stageOrder' }),
            path: ['stages', finishIndex],
          },
        ],
      }),
    );
    expect(stageIds(store)).toContain('finish');
  });

  // A protocol always ends at its one finish stage, so a submit never turns a
  // stage into one or the finish stage into something else, and a create
  // never adds a second one.
  it.each([
    {
      direction: 'the finish stage into another kind of stage',
      stageId: 'finish',
      rewrite: (document: Record<string, unknown>) => ({
        id: document.id,
        type: 'Information',
        label: { [FIXTURE_LANGUAGE]: 'No longer the end' },
        title: { [FIXTURE_LANGUAGE]: 'No longer the end' },
        items: [],
      }),
    },
    {
      direction: 'another stage into a second finish stage',
      stageId: 'information-1',
      rewrite: (document: Record<string, unknown>) => ({
        id: document.id,
        type: 'FinishSession',
        label: { [FIXTURE_LANGUAGE]: 'A second end' },
        title: { [FIXTURE_LANGUAGE]: 'A second end' },
        content: { [FIXTURE_LANGUAGE]: 'Thank you.' },
        outcome: 'completed',
      }),
    },
  ])(
    'refuses a submit that changes $direction',
    async ({ stageId, rewrite }) => {
      const { store, client } = openProtocol();
      const target = sectionId({ kind: 'stage', stageId });
      const before = getProtocol(store.getState())?.stages;
      const held = await client.call('AcquireLock', {
        protocolId: PROTOCOL_ID,
        sectionId: target,
      });

      const { error, isSuccess } = await safe(
        client.call('Submit', {
          protocolId: PROTOCOL_ID,
          requestId: nextRequestId(),
          sectionId: target,
          document: rewrite(held.document),
          revision: held.revision,
        }),
      );

      expect(isSuccess).toBe(false);
      expect(error).toEqual(
        new InvalidShape({
          sectionId: target,
          issues: [
            {
              path: ['type'],
              message:
                'A stage cannot be changed into the finish stage, or the finish stage into another kind of stage.',
            },
          ],
        }),
      );
      expect(getProtocol(store.getState())?.stages).toEqual(before);
    },
  );

  it('refuses to create a second finish stage', async () => {
    const { store, client } = openProtocol();
    const before = getProtocol(store.getState())?.stages;

    const { error, isSuccess } = await safe(
      client.call('Create', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        kind: 'stage',
        document: {
          type: 'FinishSession',
          label: { [FIXTURE_LANGUAGE]: 'A second end' },
          title: { [FIXTURE_LANGUAGE]: 'A second end' },
          content: { [FIXTURE_LANGUAGE]: 'Thank you.' },
          outcome: 'completed',
        },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(InvalidShape);
    expect(error).toMatchObject({
      issues: [
        {
          path: ['type'],
          message:
            'A protocol has exactly one finish stage, and this one already has it.',
        },
      ],
    });
    expect(getProtocol(store.getState())?.stages).toEqual(before);
  });

  it('creates the ego codebook a protocol does not have yet', async () => {
    const { store, client } = openProtocol({ withEgo: false });
    expect(getProtocol(store.getState())?.codebook.ego).toBeUndefined();

    const created = await client.call('Create', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      kind: 'codebookEgo',
      document: {
        variables: {
          ego_age: {
            name: 'ego_age',
            label: 'Age',
            type: 'number',
            component: 'Number',
          },
        },
      },
    });

    // Adding the first ego attribute is what creates the section, and there is
    // no other way to bring one into being.
    expect(created.sectionId).toBe(sectionId({ kind: 'codebookEgo' }));
    expect(
      getProtocol(store.getState())?.codebook.ego?.variables,
    ).toMatchObject({ ego_age: { name: 'ego_age' } });
  });

  it('writes an attribute onto a connection type created moments earlier, and names a list of values too short to hold', async () => {
    const { store, client } = openProtocol();
    const created = await client.call('Create', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      kind: 'codebookEdge',
      document: {
        name: 'Edge',
        label: { [FIXTURE_LANGUAGE]: 'Edge' },
        color: 'edge-color-seq-2',
        variables: {},
      },
    });
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: created.sectionId,
    });
    const withScale = (options: readonly unknown[]) => ({
      ...held.document,
      variables: {
        f: {
          name: 'f',
          label: 'F',
          type: 'ordinal',
          options,
        },
      },
    });

    const refused = await safe(
      client.call('Submit', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        sectionId: created.sectionId,
        document: withScale([]),
        revision: held.revision,
      }),
    );
    expect(refused.isSuccess).toBe(false);
    expect(refused.error).toBeInstanceOf(InvalidShape);

    await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: created.sectionId,
      document: withScale([
        { label: { [FIXTURE_LANGUAGE]: 'Some' }, value: 1 },
        { label: { [FIXTURE_LANGUAGE]: 'Lots' }, value: 2 },
      ]),
      revision: held.revision,
    });
    expect(
      Object.values(getProtocol(store.getState())?.codebook.edge ?? {}).find(
        (definition) => definition.name === 'Edge',
      )?.variables,
    ).toMatchObject({ f: { name: 'f', type: 'ordinal' } });
  });

  it('refuses to create an ego codebook the protocol already has', async () => {
    const { store, client } = openProtocol();
    const before = getProtocol(store.getState())?.codebook.ego;

    const { error, isSuccess } = await safe(
      client.call('Create', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        kind: 'codebookEgo',
        document: { variables: {} },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(error).toBeInstanceOf(SectionExists);
    expect(error).toMatchObject({
      sectionId: sectionId({ kind: 'codebookEgo' }),
    });
    expect(getProtocol(store.getState())?.codebook.ego).toEqual(before);
  });

  it('keeps a lock when the stream that reported it ends', async () => {
    const { store, client } = openProtocol();
    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const stream = await open(client);

    // The stream ends, as a dropped socket ends it; the channel resumes on a
    // new one, and the editor behind it never stopped holding its draft.
    await stream.close();

    const written = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Saved after the stream ended' },
      },
      revision: held.revision,
    });
    expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);
    expect(stageLabel(store, 'information-1')).toBe(
      'Saved after the stream ended',
    );
  });

  it('lists the committed asset manifest as resources', async () => {
    const { client } = openProtocol();

    const listed = await client.call('ResourcesList', {
      protocolId: PROTOCOL_ID,
    });

    expect(listed.status).toBe('ok');
    if (listed.status !== 'ok') return;
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

  /**
   * `resourceIds` is the whole of what a write promotes, so a second secret
   * staged in the same edit and not named is still that edit's to take back —
   * which is what stops a cancelled edit leaving a credential behind.
   */
  it('promotes a staged secret once, and only what the write names', async () => {
    const { store, client } = openProtocol();
    const named = await client.call('ResourcesStage', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      requestId: 'named-secret',
      request: { kind: 'secret', name: 'Mapbox token', value: 'pk.named' },
    });
    const unnamed = await client.call('ResourcesStage', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      requestId: 'unnamed-secret',
      request: { kind: 'secret', name: 'Another token', value: 'pk.unnamed' },
    });
    if (named.status !== 'ok' || unnamed.status !== 'ok') {
      throw new Error('staging failed');
    }

    const held = await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const written = await client.call('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { [FIXTURE_LANGUAGE]: 'Names one of two secrets' },
      },
      revision: held.revision,
      promote: { editId: EDIT, resourceIds: [named.data.descriptor.id] },
    });

    expect(written.promoted?.map((entry) => entry.id)).toEqual([
      named.data.descriptor.id,
    ]);
    // The secret the write did not name is still this edit's to take back,
    // which is what stops a cancelled edit leaving a credential behind.
    expect(
      await client.call('ResourcesDiscard', {
        protocolId: PROTOCOL_ID,
        editId: EDIT,
        resourceId: unnamed.data.descriptor.id,
      }),
    ).toEqual({ status: 'ok' });
    const manifest = getAssetManifest(store.getState());
    expect(manifest[unnamed.data.descriptor.id]).toBeUndefined();
    expect(manifest[named.data.descriptor.id]).toMatchObject({
      type: 'apikey',
      name: 'Mapbox token',
      value: 'pk.named',
    });

    // And the editor can read the promoted key back, which is how the map
    // preview draws the map the participant will see.
    const inspected = await client.call('ResourcesInspect', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      resourceId: named.data.descriptor.id,
    });
    expect(inspected.status === 'ok' && inspected.data.value).toBe('pk.named');
  });

  it('takes nothing from the last protocol into the next one opened', async () => {
    const { store, client } = openProtocol();
    // Held when the researcher goes back to the library — the release names
    // the protocol it was taken in, so once that protocol is closed there is
    // no call left that could give it back.
    await client.call('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: STAGE_ORDER_SECTION,
    });
    const stream = await openStream(client);
    const before = revisionsOf(stream.seen).length;

    const next = 'library-row-2';
    store.dispatch(setActiveProtocolId(next));
    store.dispatch(
      setActiveProtocol(CurrentProtocolSchema.parse(allInterfaces)),
    );

    const template = await client.call('GetSection', {
      protocolId: next,
      sectionId: INFORMATION,
    });
    const { id: _id, ...withoutId } = template.document;
    const created = await client.call('Create', {
      protocolId: next,
      requestId: nextRequestId(),
      kind: 'stage',
      document: {
        ...withoutId,
        label: { [FIXTURE_LANGUAGE]: 'Added in the protocol opened next' },
      },
    });

    const ref = parseSectionId(created.sectionId);
    expect(stageIds(store)).toContain(ref.kind === 'stage' ? ref.stageId : '');
    // The watcher of the protocol before this one was ended rather than
    // handed this one's revisions.
    expect(revisionsOf(stream.seen)).toHaveLength(before);
  });

  it('refuses an import whose protocol was closed while its bytes were read', async () => {
    const { store, client } = openProtocol();
    const before = getAssetManifest(store.getState());
    const digest = globalThis.crypto.subtle.digest.bind(
      globalThis.crypto.subtle,
    );
    // The researcher closes the protocol while the file is being hashed,
    // which is the one part of an import long enough for them to. Pinned to
    // that moment rather than raced for it.
    const hashing = vi
      .spyOn(globalThis.crypto.subtle, 'digest')
      .mockImplementation((algorithm, data) => {
        store.dispatch(setActiveProtocolId('another-protocol'));
        return digest(algorithm as AlgorithmIdentifier, data as BufferSource);
      });

    try {
      const staged = await client.call('ResourcesStage', {
        protocolId: PROTOCOL_ID,
        editId: EDIT,
        requestId: 'import-across-a-switch',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph',
          source: 'photo.png',
          contentType: 'image/png',
          bytes: new Uint8Array([7, 7, 7]),
        },
      });
      expect(staged).toMatchObject({
        status: 'failed',
        failure: { reason: 'invalid-request' },
      });
    } finally {
      hashing.mockRestore();
    }

    // Nothing reached the protocol that is open now.
    expect(getAssetManifest(store.getState())).toEqual(before);
  });
  /**
   * Architect's saved copy is a library row one tab holds at a time. A tab that
   * has been demoted may read the protocol and may not write it: a write taken
   * here would look saved and be dropped, and — while a reclaim is blocked —
   * would additionally replace the codebook from a snapshot taken before the
   * other tab's edits.
   *
   * The lock table cannot answer for this on its own. It records the editors of
   * THIS tab, and every one of these calls is made by an editor that either
   * holds its own section or needs no lock at all, so each refusal below is
   * about the protocol rather than about the section.
   */
  describe('a tab that no longer holds the saved copy', () => {
    it('opens a stage read-only, naming the tab that has it', async () => {
      const { store, client } = openProtocol();
      store.dispatch(setProtocolLockState('open-elsewhere'));

      const opened = await client.call('AcquireLock', {
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
      });

      expect(opened.lock).toBe('readOnly');
      if (opened.lock !== 'readOnly') return;
      expect(opened.holder.displayName).toBe(OTHER_TAB);
      // The document still arrives: a demoted tab shows the researcher the
      // stage, it just cannot write it.
      expect(opened.document.id).toBe('information-1');
    });

    it('refuses a submit raised by an editor opened before the demotion', async () => {
      const { store, client } = openProtocol();
      const held = await client.call('AcquireLock', {
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
      });
      store.dispatch(setProtocolLockState('open-elsewhere'));

      const { error, isSuccess } = await safe(
        client.call('Submit', {
          protocolId: PROTOCOL_ID,
          requestId: nextRequestId(),
          sectionId: INFORMATION,
          document: {
            ...held.document,
            label: { [FIXTURE_LANGUAGE]: 'Saved by a demoted tab' },
          },
          revision: held.revision,
        }),
      );

      expect(isSuccess).toBe(false);
      expect(error).toBeInstanceOf(NotLockHolder);
      expect(error).toMatchObject({
        holder: { displayName: OTHER_TAB },
      });
      expect(stageLabel(store, 'information-1')).not.toBe(
        'Saved by a demoted tab',
      );
    });

    it('refuses a create, so no stage is added the other tab would never see', async () => {
      const { store, client } = openProtocol();
      const before = stageIds(store);
      const template = await client.call('GetSection', {
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
      });
      const { id: _id, ...withoutId } = template.document;
      store.dispatch(setProtocolLockState('reclaim-blocked'));

      const { error, isSuccess } = await safe(
        client.call('Create', {
          protocolId: PROTOCOL_ID,
          requestId: nextRequestId(),
          kind: 'stage',
          document: {
            ...withoutId,
            label: { [FIXTURE_LANGUAGE]: 'Added by a demoted tab' },
          },
          position: 0,
        }),
      );

      expect(isSuccess).toBe(false);
      expect(error).toBeInstanceOf(SectionsLocked);
      expect(error).toMatchObject({
        blocked: [{ holder: { displayName: OTHER_TAB } }],
      });
      expect(stageIds(store)).toEqual(before);
    });

    it('refuses a delete, so no stage is removed from a copy it cannot write', async () => {
      const { store, client } = openProtocol();
      store.dispatch(setProtocolLockState('open-elsewhere'));

      const { error, isSuccess } = await safe(
        client.call('Delete', {
          protocolId: PROTOCOL_ID,
          sectionId: INFORMATION,
        }),
      );

      expect(isSuccess).toBe(false);
      expect(error).toBeInstanceOf(SectionsLocked);
      expect(stageIds(store)).toContain('information-1');
    });

    it('refuses a refactor, so the codebook keeps what it had', async () => {
      const { store, client } = openProtocol();
      store.dispatch(setProtocolLockState('open-elsewhere'));

      const { error, isSuccess } = await safe(
        client.call('RefactorDeleteVariable', {
          protocolId: PROTOCOL_ID,
          subject: { entity: 'node', type: 'person' },
          variableId: 'unused-by-any-stage',
        }),
      );

      expect(isSuccess).toBe(false);
      expect(error).toBeInstanceOf(SectionsLocked);
      expect(personVariables(store).name).toBeDefined();
    });

    it('refuses an import, so no bytes are left behind for a save that cannot happen', async () => {
      const { store, client } = openProtocol();
      const before = getAssetManifest(store.getState());
      store.dispatch(setProtocolLockState('open-elsewhere'));

      const staged = await client.call('ResourcesStage', {
        protocolId: PROTOCOL_ID,
        editId: EDIT,
        requestId: 'import-while-demoted',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph',
          source: 'photo.png',
          contentType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        },
      });

      expect(staged).toMatchObject({
        status: 'failed',
        failure: { reason: 'read-only', retryable: false },
      });
      expect(getAssetManifest(store.getState())).toEqual(before);
    });
  });

  describe('the in-process client', () => {
    const run = <A, E>(
      client: TestClient,
      call: (host: ProtocolBuilderClient) => Effect.Effect<A, E>,
    ) =>
      client.runtime.runPromiseExit(Effect.flatMap(ArchitectHostClient, call));

    it('hands a refusal back as the instance the handler raised, and streams the protocol', async () => {
      const { client } = openProtocol();
      const stream = await openStream(client);
      await client.call('AcquireLock', {
        protocolId: PROTOCOL_ID,
        sectionId: STAGE_ORDER_SECTION,
      });

      const exit = await run(client, (host) =>
        host('Create', {
          protocolId: PROTOCOL_ID,
          requestId: nextRequestId(),
          kind: 'stage',
          document: {
            type: 'Information',
            label: { [FIXTURE_LANGUAGE]: 'Refused' },
            title: { [FIXTURE_LANGUAGE]: 'Refused' },
            items: [],
          },
        }),
      );

      const refusal = Exit.isFailure(exit)
        ? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
        : undefined;
      expect(refusal).toBeInstanceOf(SectionsLocked);
      expect(refusal).toMatchObject({
        _tag: 'SectionsLocked',
        blocked: [{ sectionId: STAGE_ORDER_SECTION }],
      });
      await waitFor(
        () => stream.seen.some((entry) => entry.event.type === 'lock'),
        'the lock to reach the stream',
      );
      const lock = stream.seen.find((entry) => entry.event.type === 'lock');
      expect(lock?.event).toMatchObject({ sectionId: STAGE_ORDER_SECTION });
      expect(lock?.cursor).toEqual(expect.any(String));
    });

    it('dies, rather than refuses, on a Delete naming a section that is not a stage', async () => {
      const { store, client } = openProtocol();

      const exit = await run(client, (host) =>
        host('Delete', { protocolId: PROTOCOL_ID, sectionId: PERSON }),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;
      expect(Cause.hasDies(exit.cause)).toBe(true);
      expect(Cause.hasFails(exit.cause)).toBe(false);
      expect(String(Cause.squash(exit.cause))).toContain(
        'Schema validation failed',
      );
      expect(
        getProtocol(store.getState())?.codebook.node?.person,
      ).toBeDefined();
    });

    it('stops listening to the store once its runtime is disposed', async () => {
      const { store, client } = openProtocol();
      const subscribe = store.subscribe;
      const released = vi.fn();
      const subscribed = vi
        .spyOn(store, 'subscribe')
        .mockImplementation((listener) => {
          const unsubscribe = subscribe(listener);
          return () => {
            released();
            unsubscribe();
          };
        });

      await client.call('ListSections', { protocolId: PROTOCOL_ID });
      expect(subscribed).toHaveBeenCalled();
      expect(released).not.toHaveBeenCalled();

      await client.runtime.dispose();
      expect(released).toHaveBeenCalledTimes(subscribed.mock.calls.length);
    });

    it('fails the stream when the protocol watch it reads from fails', async () => {
      const watch = vi
        .spyOn(ProtocolRevisions.prototype, 'watch')
        // oxlint-disable-next-line require-yield
        .mockImplementation(async function* () {
          throw new Error('the watch failed');
        });
      const { client } = openProtocol();

      const exit = await run(client, (host) =>
        Stream.runDrain(
          host('WatchProtocol', { protocolId: PROTOCOL_ID }),
        ).pipe(Effect.timeoutOption('2 seconds')),
      );
      watch.mockRestore();

      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;
      expect(String(Cause.squash(exit.cause))).toContain('the watch failed');
    });

    it('keeps a defect on the call that raised it, leaving the stream open', async () => {
      const { store, client } = openProtocol();
      const stream = await openStream(client);

      const exit = await run(client, (host) =>
        host('RefactorDeleteEntityType', {
          protocolId: PROTOCOL_ID,
          entity: 'node',
          typeId: 'no-such-type',
        }),
      );
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);

      const held = await client.call('AcquireLock', {
        protocolId: PROTOCOL_ID,
        sectionId: INFORMATION,
      });
      await client.call('Submit', {
        protocolId: PROTOCOL_ID,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: {
          ...held.document,
          label: { [FIXTURE_LANGUAGE]: 'Written after a defect' },
        },
        revision: held.revision,
      });

      expect(stageLabel(store, 'information-1')).toBe('Written after a defect');
      await waitFor(
        () => revisionsOf(stream.seen).length > 0,
        'the revision to reach the stream',
      );
    });
  });
});
