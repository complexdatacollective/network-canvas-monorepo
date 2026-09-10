import { AsyncIteratorClass } from '@orpc/client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderClient } from '../../contract/contract.ts';
import type { ProtocolEvent } from '../../contract/schemas.ts';
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
type Read = 'getSection' | 'listSections';

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
    cache.context.utils.getSection.queryKey({
      input: { protocolId: cache.context.protocolId, sectionId: id },
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
    cache.context.utils.listSections.queryOptions({
      input: { protocolId: cache.context.protocolId },
    }).queryKey,
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
  await host.client.delete({
    protocolId: host.protocolId,
    sectionId: INFORMATION,
  });
}

const RACES: readonly Race[] = [
  {
    name: 'a revision of the section being read',
    read: 'getSection',
    cause: async (host) => {
      const collaborator = host.asCollaborator(COLLABORATOR);
      const held = await collaborator.acquireLock({
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      });
      await collaborator.submit({
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: { ...held.document, label: 'Renamed by Grace' },
        revision: held.revision,
      });
    },
    event: `revision:${INFORMATION}`,
    cached: (cache) => labelOf(cache, INFORMATION),
    newer: 'Renamed by Grace',
  },
  {
    name: 'the deletion of the section being read',
    read: 'getSection',
    cause: deleteInformation,
    event: `revision:${INFORMATION}`,
    cached: (cache) => labelOf(cache, INFORMATION),
    newer: undefined,
  },
  {
    name: 'a lock taken on the section being read',
    read: 'getSection',
    cause: async (host) => {
      await host.asCollaborator(COLLABORATOR).acquireLock({
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
    read: 'getSection',
    cause: async (host) => {
      const events = await host
        .asCollaborator(COLLABORATOR)
        .watchProtocol({ protocolId: host.protocolId });
      await events.next();
    },
    event: 'presence:',
    cached: presentNames,
    newer: ['Ada', 'Grace'],
  },
  {
    name: 'a section created while the list is being read',
    read: 'listSections',
    cause: async (host) => {
      await host.client.create({
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
    read: 'listSections',
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
});

/** The observers mounted, the read held open, and the cache to read after. */
async function mount(race: Race) {
  const host = fixtureHost();
  const gate = gatedRead(host.client, race.read);
  const channel = handledEvents(gate.client);
  let cache: Cache | undefined;
  render(
    <ProtocolBuilder client={channel.client} protocolId={host.protocolId}>
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

/**
 * The host's client with one procedure's answers held at a gate the test
 * opens: the host has formed the answer and the client does not have it yet.
 */
function gatedRead(client: ProtocolBuilderClient, procedure: Read) {
  const gates: (() => void)[] = [];
  const call = client[procedure] as (
    input: unknown,
    options: unknown,
  ) => Promise<unknown>;
  const gated = async (input: unknown, options: unknown) => {
    const answer = await call(input, options);
    await new Promise<void>((open) => gates.push(open));
    return answer;
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === procedure ? gated : Reflect.get(target, property),
  });
  return {
    client: wrapped,
    waiting: () => gates.length,
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

/**
 * The host's client, recording each event the channel has finished with.
 *
 * An event is recorded when the channel asks for the next one, which it does
 * only after its handler has run — so a test that waits for the record can
 * read the cache knowing what the channel did with that event is in it.
 */
function handledEvents(client: ProtocolBuilderClient) {
  const handled: string[] = [];
  const watchProtocol: ProtocolBuilderClient['watchProtocol'] = async (
    input,
    options,
  ) => {
    const events = await client.watchProtocol(input, options);
    let pending: ProtocolEvent | undefined;
    return new AsyncIteratorClass<ProtocolEvent, void, void>(
      async () => {
        if (pending !== undefined) handled.push(keyOf(pending));
        pending = undefined;
        const next = await events.next();
        if (next.done === true) return { done: true, value: undefined };
        pending = next.value;
        return { done: false, value: next.value };
      },
      async () => {
        await events.return?.(undefined);
      },
    );
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'watchProtocol'
        ? watchProtocol
        : Reflect.get(target, property),
  });
  return { client: wrapped, handled: () => handled };
}

function keyOf(event: ProtocolEvent): string {
  return `${event.type}:${event.type === 'presence' ? '' : event.sectionId}`;
}
