// @vitest-environment node
// A staged file crosses the wire as multipart form data, and jsdom's
// `FormData` is invisible to Node's `Response`: encoding one there yields the
// string "[object FormData]" and the host refuses the request as malformed.
// Nothing here renders.
import { safe } from '@orpc/client';
import { afterEach, describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { streamProtocolEvents } from '../../state/channel.ts';
import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { createWebSocketHost } from '../../testing/host/websocketHost.ts';
import type { ProtocolBuilderClient } from '../contract.ts';
import type { ProtocolEvent } from '../schemas.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;
const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });
const ASSETS = sectionId({ kind: 'assets' });

async function base64Of(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString('base64');
}

/** Everything a procedure answered with, as text a secret could hide in. */
function wholeAnswer(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

const HOLDER = {
  sessionId: 'holder-session',
  userId: 'holder',
  displayName: 'Grace',
};

type Served = Readonly<{
  host: InMemoryHost;
  client: ProtocolBuilderClient;
  close(): Promise<void>;
}>;

const teardown: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of teardown.splice(0)) await close();
});

/**
 * The same contract served two ways. Every assertion below runs against both,
 * so a claim that holds in Architect's in-process router and not over Studio's
 * wire — or the other way round — fails here rather than in a host.
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
        client: host.client,
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
      return { host: served.host, client: served.client, close: served.close };
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
    const { host, client } = await open();
    const before = await client.getSection({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    const { definedError, isSuccess } = await safe(
      client.submit({
        protocolId: host.protocolId,
        sectionId: INFORMATION,
        document: { ...before.document, label: 'Renamed without the lock' },
        revision: before.revision,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('NOT_LOCK_HOLDER');
    const after = await client.getSection({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    expect(after.document.label).toBe(before.document.label);
  });

  it('opens read-only behind a holder, and names them', async () => {
    const { host, client } = await open();
    await host.asCollaborator(HOLDER).acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    const result = await client.acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    expect(result.lock).toBe('readOnly');
    expect(result.lock === 'readOnly' && result.holder.displayName).toBe(
      'Grace',
    );
  });

  it('registers a created stage in the stage order', async () => {
    const { host, client } = await open();
    const template = await client.getSection({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const { id: _id, ...withoutId } = template.document;

    const created = await client.create({
      protocolId: host.protocolId,
      kind: 'stage',
      document: withoutId,
      position: 0,
    });
    const stage = await client.getSection({
      protocolId: host.protocolId,
      sectionId: created.sectionId,
    });
    const order = await client.getSection({
      protocolId: host.protocolId,
      sectionId: STAGE_ORDER,
    });

    expect(stage.document.id).toBe(String(stage.document.id));
    expect(order.document.stages).toContain(stage.document.id);
    expect(
      Array.isArray(order.document.stages) && order.document.stages[0],
    ).toBe(stage.document.id);
  });

  it('replays the revisions after a cursor', async () => {
    const { host, client } = await open();
    const writer = host.asCollaborator(HOLDER);
    const held = await writer.acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await writer.submit({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Written before anyone watched' },
      revision: held.revision,
    });

    const seen: ProtocolEvent[] = [];
    const controller = new AbortController();
    const channel = streamProtocolEvents(
      client,
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
    expect(revision?.type === 'revision' && revision.document?.label).toBe(
      'Written before anyone watched',
    );
  });

  it('stages a file, promotes it into the manifest, and hands its bytes back', async () => {
    const { host, client } = await open();
    const bytes = new Blob(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      {
        type: 'image/png',
      },
    );

    const staged = await client.resources.stage({
      protocolId: host.protocolId,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Nook',
        source: 'nook.png',
        contentType: 'image/png',
        bytes,
      },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;
    expect(staged.data.descriptor).toMatchObject({
      kind: 'image',
      name: 'Nook',
      status: 'staged',
      source: 'nook.png',
      byteLength: bytes.size,
    });

    const inspected = await client.resources.inspect({
      protocolId: host.protocolId,
      resourceId,
    });
    expect(inspected.status === 'ok' && inspected.data.descriptor.name).toBe(
      'Nook',
    );

    const promoted = await client.resources.promote({
      protocolId: host.protocolId,
      promotionId: 'promotion-1',
      resourceIds: [resourceId],
    });
    if (promoted.status !== 'ok') throw new Error(promoted.failure.message);
    expect(promoted.data.promoted).toHaveLength(1);
    expect(promoted.data.revision.sequence).toBeGreaterThan(0n);

    const listed = await client.resources.list({ protocolId: host.protocolId });
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toContainEqual(
      expect.objectContaining({
        id: resourceId,
        name: 'Nook',
        status: 'committed',
        source: 'nook.png',
      }),
    );
    const manifest = await client.getSection({
      protocolId: host.protocolId,
      sectionId: ASSETS,
    });
    expect(manifest.document[resourceId]).toMatchObject({
      name: 'Nook',
      type: 'image',
      source: 'nook.png',
    });

    // The whole point of the wire leg: the bytes the researcher imported are
    // the bytes the host committed, having crossed a real socket.
    const preview = await client.resources.preview({
      protocolId: host.protocolId,
      resourceId,
    });
    if (preview.status !== 'ok') throw new Error(preview.failure.message);
    expect(preview.data.url.endsWith(await base64Of(bytes))).toBe(true);
  });

  it('forgets a staged resource that is discarded', async () => {
    const { host, client } = await open();
    const staged = await client.resources.stage({
      protocolId: host.protocolId,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'network',
        name: 'A roster',
        source: 'roster.csv',
        contentType: 'text/csv',
        bytes: new Blob(['name\nAda\n'], { type: 'text/csv' }),
      },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;

    const discarded = await client.resources.discard({
      protocolId: host.protocolId,
      resourceId,
    });
    expect(discarded.status).toBe('ok');

    const listed = await client.resources.list({
      protocolId: host.protocolId,
      status: 'staged',
    });
    expect(listed.status === 'ok' && listed.data.resources).toEqual([]);
    const inspected = await client.resources.inspect({
      protocolId: host.protocolId,
      resourceId,
    });
    expect(inspected.status === 'failed' && inspected.failure.reason).toBe(
      'not-found',
    );
  });

  it('never hands a staged or promoted secret back', async () => {
    const { host, client } = await open();
    const value = 'pk.a-key-a-researcher-pasted';

    const staged = await client.resources.stage({
      protocolId: host.protocolId,
      requestId: 'request-1',
      request: { kind: 'secret', name: 'Mapbox token', value },
    });
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    expect(staged.data.handle).toBeDefined();
    expect(wholeAnswer(staged)).not.toContain(value);

    const promoted = await client.resources.promote({
      protocolId: host.protocolId,
      promotionId: 'promotion-1',
      resourceIds: [staged.data.descriptor.id],
      ...(staged.data.handle === undefined
        ? {}
        : { secretHandles: [staged.data.handle] }),
    });
    if (promoted.status !== 'ok') throw new Error(promoted.failure.message);
    expect(wholeAnswer(promoted)).not.toContain(value);

    const listed = await client.resources.list({ protocolId: host.protocolId });
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toContainEqual(
      expect.objectContaining({
        id: staged.data.descriptor.id,
        kind: 'apikey',
        name: 'Mapbox token',
        status: 'committed',
      }),
    );
    expect(wholeAnswer(listed)).not.toContain(value);
  });
});
