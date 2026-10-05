import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { ProtocolEventSchema } from '@codaco/protocol-builder-core/contract/schemas';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import {
  lockQueryKey,
  presenceQueryKey,
  useProtocolBuilderContext,
  type ProtocolBuilderAdapter,
  type ProtocolBuilderContextValue,
} from '../context.ts';
import { useEntityTypes, useSection } from '../hooks.ts';

/** A fresh idempotency key: every write below is its own intent. */
let writes = 0;
const nextRequestId = (): string => `write-${++writes}`;

const FIXTURE: Record<string, unknown> = allInterfaces;

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const PLACE = sectionId({ kind: 'codebookNode', typeId: 'place' });

const COLLABORATOR = {
  sessionId: 'session-2',
  userId: 'user-2',
  displayName: 'Grace',
};

/** Which read is held open while the event arrives. */
type Read = 'GetSection' | 'ListSections';

type Cache = Readonly<{
  client: QueryClient;
  context: ProtocolBuilderContextValue;
}>;

/**
 * One event kind against a read of the thing it changes.
 *
 * The read is answered by the host before the event happens, so the event is
 * always the newer state — whichever of the two reaches the cache last.
 */
type Race = Readonly<{
  name: string;
  read: Read;
  cause: (host: InMemoryHost) => Promise<void>;
  /** The event the channel has to have finished with before anything is read. */
  event: string;
  /** What the cache holds for the thing the event changed. */
  cached: (cache: Cache) => unknown;
  newer: unknown;
}>;

function fixtureHost(): InMemoryHost {
  return createInMemoryHost({
    sections: sectionsFromProtocol(FIXTURE),
    nextId: () => 'place',
  });
}

function sectionEntry(cache: Cache, id: ProtocolSectionId): unknown {
  return cache.client.getQueryData(
    cache.context.adapter.rpcKey('GetSection', {
      protocolId: cache.context.protocolId,
      sectionId: id,
    }),
  );
}

function labelOf(cache: Cache, id: ProtocolSectionId): unknown {
  const entry = sectionEntry(cache, id) as
    | { document?: Record<string, unknown> }
    | undefined;
  return entry?.document?.label;
}

function sectionIds(cache: Cache): readonly string[] | undefined {
  const list = cache.client.getQueryData(
    cache.context.adapter.rpcKey('ListSections', {
      protocolId: cache.context.protocolId,
    }),
  );
  return (list as { sectionIds?: string[] } | undefined)?.sectionIds;
}

function holderName(cache: Cache): unknown {
  const lock = cache.client.getQueryData(
    lockQueryKey(cache.context.protocolId, INFORMATION),
  );
  return (lock as { holder?: { displayName?: string } } | undefined)?.holder
    ?.displayName;
}

function presentNames(cache: Cache): string[] {
  const present = cache.client.getQueryData(
    presenceQueryKey(cache.context.protocolId),
  );
  return Array.isArray(present)
    ? present
        .map((entry: unknown) =>
          typeof entry === 'object' && entry !== null
            ? String((entry as { displayName?: unknown }).displayName)
            : '',
        )
        .sort()
    : [];
}

async function deleteInformation(host: InMemoryHost): Promise<void> {
  await host.adapter.rpcCall('Delete', {
    protocolId: host.protocolId,
    sectionId: INFORMATION,
  });
}

async function renameInformation(
  host: InMemoryHost,
  label: string,
): Promise<void> {
  const collaborator = host.asCollaborator(COLLABORATOR);
  const held = await collaborator.rpcCall('AcquireLock', {
    protocolId: host.protocolId,
    sectionId: INFORMATION,
  });
  await collaborator.rpcCall('Submit', {
    protocolId: host.protocolId,
    requestId: nextRequestId(),
    sectionId: INFORMATION,
    document: { ...held.document, label },
    revision: held.revision,
  });
}

const RACES: readonly Race[] = [
  {
    name: 'a revision of the section being read',
    read: 'GetSection',
    cause: (host) => renameInformation(host, 'Renamed by Grace'),
    event: `revision:${INFORMATION}`,
    cached: (cache) => labelOf(cache, INFORMATION),
    newer: 'Renamed by Grace',
  },
  {
    name: 'the deletion of the section being read',
    read: 'GetSection',
    cause: deleteInformation,
    event: `revision:${INFORMATION}`,
    cached: (cache) => labelOf(cache, INFORMATION),
    newer: undefined,
  },
  {
    name: 'a lock taken on the section being read',
    read: 'GetSection',
    cause: async (host) => {
      await host.asCollaborator(COLLABORATOR).rpcCall('AcquireLock', {
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      });
    },
    event: `lock:${INFORMATION}`,
    cached: holderName,
    newer: 'Grace',
  },
  {
    name: 'presence arriving while a section is being read',
    read: 'GetSection',
    cause: async (host) => {
      await new Promise<void>((joined) => {
        void host
          .asCollaborator(COLLABORATOR)
          .rpcStream('WatchProtocol', { protocolId: host.protocolId }, () =>
            joined(),
          )
          .catch(() => undefined);
      });
    },
    event: 'presence:',
    cached: presentNames,
    newer: ['Ada', 'Grace'],
  },
  {
    name: 'a section created while the list is being read',
    read: 'ListSections',
    cause: async (host) => {
      await host.adapter.rpcCall('Create', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        kind: 'codebookNode',
        document: {
          name: 'Place',
          color: 'node-color-seq-3',
          shape: { default: 'circle' },
          variables: {},
        },
      });
    },
    event: `revision:${PLACE}`,
    cached: (cache) => sectionIds(cache)?.includes(PLACE),
    newer: true,
  },
  {
    name: 'a section deleted while the list is being read',
    read: 'ListSections',
    cause: deleteInformation,
    event: `revision:${INFORMATION}`,
    cached: (cache) => sectionIds(cache)?.includes(INFORMATION),
    newer: false,
  },
];

describe('an event arriving around an answer that is still in flight', () => {
  for (const race of RACES) {
    it(`ends with the newer state when ${race.name} lands first`, async () => {
      const { host, cache, gate, channel } = await mount(race);
      await race.cause(host);
      await waitFor(() => {
        expect(channel.handled()).toContain(race.event);
      });

      // The host answered this read before any of that happened, and it lands
      // last. Nothing refetches it, so whatever it leaves in the cache is what
      // every reader of that key sees from here on.
      gate.release();
      await settle();

      expect(race.cached(cache)).toEqual(race.newer);
    });

    it(`ends with the newer state when ${race.name} lands last`, async () => {
      const { host, cache, gate, channel } = await mount(race);
      gate.release();
      await settle();

      await race.cause(host);
      await waitFor(() => {
        expect(channel.handled()).toContain(race.event);
      });

      expect(race.cached(cache)).toEqual(race.newer);
    });
  }

  it('ends with the newer state when the event lands while the stream is down', async () => {
    const race = RACES[0];
    if (race === undefined) throw new Error('no revision race');
    const { host, cache, gate, channel } = await mount(race);
    const revisions = () =>
      channel.handled().filter((handled) => handled === race.event).length;

    await renameInformation(host, 'Before the drop');
    await waitFor(() => {
      expect(revisions()).toBe(1);
    });
    host.store.disconnectWatchers();
    await renameInformation(host, 'While the stream was down');
    await waitFor(() => {
      expect(revisions()).toBeGreaterThanOrEqual(2);
    });

    gate.release();
    await settle();
    // Past the channel's first reconnect delay.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(labelOf(cache, INFORMATION)).toBe('While the stream was down');
    expect(revisions()).toBe(2);
  });
});

/** The observers mounted, the read held open, and the cache to read after. */
async function mount(race: Race) {
  const host = fixtureHost();
  const gate = gatedRead(host, race.read);
  const channel = handledEvents(gate.adapter);
  let cache: Cache | undefined;
  render(
    <ProtocolBuilder adapter={channel.adapter} protocolId={host.protocolId}>
      <Capture onCache={(value) => (cache = value)} />
      <Reader />
    </ProtocolBuilder>,
  );
  await waitFor(() => {
    expect(gate.waiting()).toBeGreaterThan(0);
    expect(cache).toBeDefined();
  });
  if (cache === undefined) throw new Error('the cache was never captured');
  return { host, cache, gate, channel };
}

/** Lets the gated answers and the channel's writes land. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

function Capture({ onCache }: Readonly<{ onCache: (cache: Cache) => void }>) {
  onCache({ client: useQueryClient(), context: useProtocolBuilderContext() });
  return null;
}

/** Reads a section and the node types, so both queries have an observer. */
function Reader() {
  const label = useSection(INFORMATION, (section) =>
    String(section.document.label),
  );
  const types = useEntityTypes('node');
  return (
    <output aria-label="reader">
      {label ?? 'gone'}: {types.map((type) => type.name).join(', ')}
    </output>
  );
}

function gatedRead(host: InMemoryHost, procedure: Read) {
  const gates: (() => void)[] = [];
  const held = <A,>(answer: A) =>
    Effect.as(
      Effect.promise(() => new Promise<void>((open) => gates.push(open))),
      answer,
    );
  const adapter =
    procedure === 'GetSection'
      ? host.adapterWith({
          GetSection: (input) =>
            Effect.flatMap(host.handle.GetSection(input), held),
        })
      : host.adapterWith({
          ListSections: (input) =>
            Effect.flatMap(host.handle.ListSections(input), held),
        });
  return {
    adapter,
    waiting: () => gates.length,
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

function handledEvents(adapter: ProtocolBuilderAdapter) {
  const handled: string[] = [];
  return {
    adapter: {
      ...adapter,
      rpcStream: (tag, payload, onChunk, signal) =>
        adapter.rpcStream(
          tag,
          payload,
          (chunk) => {
            onChunk(chunk);
            handled.push(keyOf(chunk));
          },
          signal,
        ),
    } satisfies ProtocolBuilderAdapter,
    handled: () => handled,
  };
}

const isProtocolEvent = Schema.is(ProtocolEventSchema);

function keyOf(chunk: unknown): string {
  if (!isProtocolEvent(chunk)) return 'unknown:';
  return `${chunk.type}:${chunk.type === 'presence' ? '' : chunk.sectionId}`;
}
