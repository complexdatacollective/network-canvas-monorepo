import { Redacted, Schema } from 'effect';
// @vitest-environment node
// jsdom's realm has a `Uint8Array` of its own, which the contract's
// `instanceof` check refuses.
import { afterEach, describe, expect, it } from 'vitest';

import {
  ResourceDescriptorSchema,
  type ProtocolEvent,
} from '@codaco/protocol-builder-core/contract/schemas';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { committedSource } from '../../testing/host/__tests__/committedSource.ts';
import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { createWebSocketHost } from '../../testing/host/websocketHost.ts';
import { attempt } from '../attempt.ts';
import { streamProtocolEvents } from '../channel.ts';
import type { ProtocolBuilderAdapter } from '../context.ts';

/** The edit these calls are made from: one editor, open throughout. */
const EDIT = 'edit-1';

/** A fresh idempotency key: every write below is its own intent. */
let writes = 0;
const nextRequestId = (): string => `write-${++writes}`;

const FIXTURE: Record<string, unknown> = allInterfaces;
const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });
const ASSETS = sectionId({ kind: 'assets' });

function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Everything a procedure answered with, as text a secret could hide in. */
function wholeAnswer(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint'
      ? item.toString()
      : Redacted.isRedacted(item)
        ? Redacted.value(item)
        : item,
  );
}

const plainDescriptor = Schema.encodeSync(ResourceDescriptorSchema);

const HOLDER = {
  sessionId: 'holder-session',
  userId: 'holder',
  displayName: 'Grace',
};

type Served = Readonly<{
  host: InMemoryHost;
  adapter: ProtocolBuilderAdapter;
  close(): Promise<void>;
}>;

const teardown: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of teardown.splice(0)) await close();
});

/**
 * The same contract served two ways. Every assertion below runs against both,
 * so a claim that holds in process and not across the socket protocol and
 * serialization Studio's editor uses — or the other way round — fails here
 * rather than in a host.
 */
const hosts: readonly Readonly<{ name: string; serve(): Promise<Served> }>[] = [
  {
    name: 'in process',
    serve: () => {
      const host = createInMemoryHost({
        sections: sectionsFromProtocol(FIXTURE),
      });
      return Promise.resolve({
        host,
        adapter: host.adapter,
        close: () => Promise.resolve(),
      });
    },
  },
  {
    name: 'over a WebSocket',
    serve: async () => {
      const served = await createWebSocketHost({
        sections: sectionsFromProtocol(FIXTURE),
      });
      return {
        host: served.host,
        adapter: served.adapter,
        close: served.close,
      };
    },
  },
];

describe.each(hosts)('one contract, served $name', ({ serve }) => {
  const open = async (): Promise<Served> => {
    const served = await serve();
    teardown.push(served.close);
    return served;
  };

  it('refuses a submit from a caller that does not hold the lock', async () => {
    const { host, adapter } = await open();
    const before = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    const { refusal, isSuccess } = await attempt(adapter, 'Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: Redacted.make({
        ...Redacted.value(before.document),
        label: 'Renamed without the lock',
      }),
      revision: before.revision,
    });

    expect(isSuccess).toBe(false);
    expect(refusal?._tag).toBe('NotLockHolder');
    const after = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    expect(Redacted.value(after.document).label).toBe(
      Redacted.value(before.document).label,
    );
  });

  it('opens read-only behind a holder, and names them', async () => {
    const { host, adapter } = await open();
    await host.asCollaborator(HOLDER).rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    const result = await adapter.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    expect(result.lock).toBe('readOnly');
    expect(
      result.lock === 'readOnly' && Redacted.value(result.holder.displayName),
    ).toBe('Grace');
  });

  it('registers a created stage in the stage order', async () => {
    const { host, adapter } = await open();
    const template = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const { id: _id, ...withoutId } = Redacted.value(template.document);

    const created = await adapter.rpcCall('Create', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      kind: 'stage',
      document: Redacted.make(withoutId),
      position: 0,
    });
    const stage = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: created.sectionId,
    });
    const order = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: STAGE_ORDER,
    });

    const stageDocument = Redacted.value(stage.document);
    const stages = Redacted.value(order.document).stages;
    expect(stageDocument.id).toBe(String(stageDocument.id));
    expect(stages).toContain(stageDocument.id);
    expect(Array.isArray(stages) && stages[0]).toBe(stageDocument.id);
  });

  it('replays the revisions after a cursor', async () => {
    const { host, adapter } = await open();
    const writer = host.asCollaborator(HOLDER);
    const held = await writer.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await writer.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: 'Written before anyone watched',
      }),
      revision: held.revision,
    });

    const seen: ProtocolEvent[] = [];
    const controller = new AbortController();
    const channel = streamProtocolEvents(
      adapter,
      host.protocolId,
      (event) => seen.push(event),
      controller.signal,
    );
    const deadline = Date.now() + 5_000;
    while (!seen.some((event) => event.type === 'revision')) {
      if (Date.now() > deadline) throw new Error('no revision was replayed');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    controller.abort();
    await channel;

    const revision = seen.find((event) => event.type === 'revision');
    expect(revision?.type === 'revision' && revision.sectionId).toBe(
      INFORMATION,
    );
    expect(
      revision?.type === 'revision' &&
        revision.document !== undefined &&
        Redacted.value(revision.document).label,
    ).toBe('Written before anyone watched');
  });

  it('removes a stage and its place in the stage order in one revision', async () => {
    const { host, adapter } = await open();
    const before = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: STAGE_ORDER,
    });

    const deleted = await adapter.rpcCall('Delete', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    const order = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: STAGE_ORDER,
    });
    expect(deleted.changedSections).toEqual([INFORMATION, STAGE_ORDER]);
    expect(Redacted.value(order.document).stages).not.toContain(
      'information-1',
    );
    const stagesBefore = Redacted.value(before.document).stages;
    expect(Array.isArray(stagesBefore) && stagesBefore).toContain(
      'information-1',
    );
    expect(order.revision.sequence).toBe(deleted.revision.sequence);
    const { refusal } = await attempt(adapter, 'GetSection', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    expect(refusal?._tag).toBe('SectionNotFound');
  });

  it('stages a file, promotes it with the section that names it, and hands its bytes back', async () => {
    const { host, adapter } = await open();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    const staged = await adapter.rpcCall('ResourcesStage', {
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: Redacted.make('Nook'),
        source: Redacted.make('nook.png'),
        contentType: 'image/png',
        bytes: Redacted.make(bytes),
      },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;
    expect(plainDescriptor(staged.data.descriptor)).toMatchObject({
      kind: 'image',
      name: 'Nook',
      status: 'staged',
      source: 'nook.png',
      byteLength: bytes.byteLength,
    });

    const inspected = await adapter.rpcCall('ResourcesInspect', {
      protocolId: host.protocolId,
      editId: EDIT,
      resourceId,
    });
    expect(
      inspected.status === 'ok' &&
        Redacted.value(inspected.data.descriptor.name),
    ).toBe('Nook');

    // The section naming the resource and the resource itself are one
    // revision: promotion happens as part of the submit that references it.
    const held = await adapter.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const written = await adapter.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: held.document,
      revision: held.revision,
      promote: { editId: EDIT, resourceIds: [resourceId] },
    });
    expect(written.promoted).toHaveLength(1);
    expect(written.revision.sequence).toBeGreaterThan(0n);

    const listed = await adapter.rpcCall('ResourcesList', {
      protocolId: host.protocolId,
    });
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    // The manifest records a name, a type and a source; what the researcher
    // imported it as is the host's to keep, and a committed image a media
    // element is handed as `application/octet-stream` can be refused.
    // The manifest names the bytes by their content, not by the filename the
    // researcher picked: two imports called `nook.png` are two assets, and a
    // protocol that carried both under one name could only export one of them.
    const committed = committedSource(bytes, 'nook.png');
    expect(
      listed.data.resources.map((descriptor) => plainDescriptor(descriptor)),
    ).toContainEqual(
      expect.objectContaining({
        id: resourceId,
        name: 'Nook',
        status: 'committed',
        source: committed,
        contentType: 'image/png',
        byteLength: bytes.byteLength,
      }),
    );
    const manifest = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: ASSETS,
    });
    expect(Redacted.value(manifest.document)[resourceId]).toMatchObject({
      name: 'Nook',
      type: 'image',
      source: committed,
    });
    expect(manifest.revision.sequence).toBe(written.revision.sequence);

    // The whole point of the wire leg: the bytes the researcher imported are
    // the bytes the host committed, having crossed a real socket.
    const preview = await adapter.rpcCall('ResourcesPreview', {
      protocolId: host.protocolId,
      editId: EDIT,
      resourceId,
    });
    if (preview.status !== 'ok') throw new Error(preview.failure.message);
    expect(Redacted.value(preview.data.url).endsWith(base64Of(bytes))).toBe(
      true,
    );
    expect(
      Redacted.value(preview.data.url).startsWith('data:image/png;base64,'),
    ).toBe(true);
  });

  it('promotes a staged file with the stage being created, not a later submit', async () => {
    const { host, adapter } = await open();
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const staged = await adapter.rpcCall('ResourcesStage', {
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: Redacted.make('Nook'),
        source: Redacted.make('nook.png'),
        contentType: 'image/png',
        bytes: Redacted.make(bytes),
      },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;

    // A stage being ADDED has no revision to submit, so the create is the only
    // place its imported file can become part of the protocol.
    const created = await adapter.rpcCall('Create', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      kind: 'stage',
      document: Redacted.make({
        type: 'Information',
        label: 'Information',
        title: 'Welcome',
        items: [{ id: 'item-1', type: 'asset', content: resourceId }],
      }),
      promote: { editId: EDIT, resourceIds: [resourceId] },
    });
    expect(created.promoted).toEqual([
      expect.objectContaining({ id: resourceId, status: 'committed' }),
    ]);

    const manifest = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: ASSETS,
    });
    expect(Redacted.value(manifest.document)[resourceId]).toMatchObject({
      name: 'Nook',
      type: 'image',
      source: committedSource(bytes, 'nook.png'),
    });
    expect(manifest.revision.sequence).toBe(created.revision.sequence);

    const section = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: created.sectionId,
    });
    expect(section.revision.sequence).toBe(created.revision.sequence);

    const preview = await adapter.rpcCall('ResourcesPreview', {
      protocolId: host.protocolId,
      editId: EDIT,
      resourceId,
    });
    if (preview.status !== 'ok') throw new Error(preview.failure.message);
    expect(Redacted.value(preview.data.url).endsWith(base64Of(bytes))).toBe(
      true,
    );
  });

  it('forgets a staged resource that is discarded', async () => {
    const { host, adapter } = await open();
    const staged = await adapter.rpcCall('ResourcesStage', {
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'network',
        name: Redacted.make('A roster'),
        source: Redacted.make('roster.csv'),
        contentType: 'text/csv',
        bytes: Redacted.make(new TextEncoder().encode('name\nAda\n')),
      },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;

    const discarded = await adapter.rpcCall('ResourcesDiscard', {
      protocolId: host.protocolId,
      editId: EDIT,
      resourceId,
    });
    // The whole answer is the status: a `data` key whose only value is
    // `undefined` is one a transport may drop and a schema then rejects,
    // leaving a result no branch of the union matches.
    expect(discarded).toStrictEqual({ status: 'ok' });

    const again = await adapter.rpcCall('ResourcesDiscard', {
      protocolId: host.protocolId,
      editId: EDIT,
      resourceId,
    });
    expect(again).toStrictEqual({
      status: 'failed',
      failure: {
        reason: 'not-found',
        message: 'no such staged resource',
        retryable: false,
        resourceId,
      },
    });

    const listed = await adapter.rpcCall('ResourcesList', {
      protocolId: host.protocolId,
      editId: EDIT,
      status: 'staged',
    });
    expect(listed.status === 'ok' && listed.data.resources).toEqual([]);
    const inspected = await adapter.rpcCall('ResourcesInspect', {
      protocolId: host.protocolId,
      editId: EDIT,
      resourceId,
    });
    expect(inspected.status === 'failed' && inspected.failure.reason).toBe(
      'not-found',
    );
  });

  /**
   * An API key comes back the way every other resource fact does — through
   * `inspect`, both while it is staged and once it is promoted.
   *
   * There is nothing to keep from the editor: promotion writes the value into
   * the asset manifest, which is the file the researcher sends to other
   * people, and the interview runtime reads it from there to build the map.
   * The stage editor's own map preview reads it for the same reason, so an
   * editor that could not would only be able to draw a map the participant
   * will never see. Asserted over both transports, because a value that
   * survives an in-process call and not a serialized one is the same bug
   * either way.
   */
  it('hands an API key back through inspect, staged and promoted alike', async () => {
    const { host, adapter } = await open();
    const value = 'pk.a-key-a-researcher-pasted';

    const staged = await adapter.rpcCall('ResourcesStage', {
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'secret',
        name: Redacted.make('Mapbox token'),
        value: Redacted.make(value),
      },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;
    // Staging answers with the descriptor alone: what a stage field stores is
    // the id, and a picker has no use for the value.
    expect(wholeAnswer(staged)).not.toContain(value);

    const stagedInspection = await adapter.rpcCall('ResourcesInspect', {
      protocolId: host.protocolId,
      editId: EDIT,
      resourceId,
    });
    expect(
      stagedInspection.status === 'ok' &&
        stagedInspection.data.value !== undefined &&
        Redacted.value(stagedInspection.data.value),
    ).toBe(value);

    const held = await adapter.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const promoted = await adapter.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: held.document,
      revision: held.revision,
      promote: { editId: EDIT, resourceIds: [resourceId] },
    });
    // A promotion needs nothing but the resource ids the write names.
    expect(promoted.promoted).toHaveLength(1);

    const listed = await adapter.rpcCall('ResourcesList', {
      protocolId: host.protocolId,
    });
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(
      listed.data.resources.map((descriptor) => plainDescriptor(descriptor)),
    ).toContainEqual(
      expect.objectContaining({
        id: resourceId,
        kind: 'apikey',
        name: 'Mapbox token',
        status: 'committed',
      }),
    );
    // The library listing is a catalogue and stays one: a value nobody asked
    // for is not carried to every picker that lists the protocol's resources.
    expect(wholeAnswer(listed)).not.toContain(value);

    const committedInspection = await adapter.rpcCall('ResourcesInspect', {
      protocolId: host.protocolId,
      resourceId,
    });
    expect(
      committedInspection.status === 'ok' &&
        committedInspection.data.value !== undefined &&
        Redacted.value(committedInspection.data.value),
    ).toBe(value);
  });
});
