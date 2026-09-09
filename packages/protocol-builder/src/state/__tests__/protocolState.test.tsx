import { AsyncIteratorClass } from '@orpc/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderClient } from '../../contract/contract.ts';
import type { ProtocolEvent } from '../../contract/schemas.ts';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { useEntityTypes, useSection, useSectionMutation } from '../hooks.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const EGO_FORM = sectionId({ kind: 'stage', stageId: 'ego-form-1' });

const COLLABORATOR = {
  sessionId: 'session-2',
  userId: 'user-2',
  displayName: 'Grace',
};

function newHost() {
  return createInMemoryHost({ sections: sectionsFromProtocol(FIXTURE) });
}

type Counts = { information: number; egoForm: number };

function Label({
  name,
  id,
  counts,
  field,
}: Readonly<{
  name: string;
  id: ProtocolSectionId;
  counts: Counts;
  field: keyof Counts;
}>) {
  const label = useSection(id, (section) => String(section.document.label));
  counts[field] += 1;
  return <output aria-label={name}>{label ?? 'loading'}</output>;
}

async function renderObservers(
  client: ProtocolBuilderClient,
  protocolId: string,
) {
  const counts: Counts = { information: 0, egoForm: 0 };
  render(
    <ProtocolBuilder client={client} protocolId={protocolId}>
      <Label
        name="information"
        id={INFORMATION}
        counts={counts}
        field="information"
      />
      <Label name="ego form" id={EGO_FORM} counts={counts} field="egoForm" />
    </ProtocolBuilder>,
  );
  await waitFor(() => {
    expect(screen.getByLabelText('information').textContent).not.toBe(
      'loading',
    );
    expect(screen.getByLabelText('ego form').textContent).not.toBe('loading');
  });
  return counts;
}

describe('the protocol state layer', () => {
  it('re-renders only the observer of the section that changed', async () => {
    const host = newHost();
    const counts = await renderObservers(host.client, host.protocolId);
    const settled = { ...counts };

    const collaborator = host.asCollaborator(COLLABORATOR);
    const held = await collaborator.acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await collaborator.submit({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Renamed by Grace' },
      revision: held.revision,
    });

    await waitFor(() => {
      expect(screen.getByLabelText('information').textContent).toBe(
        'Renamed by Grace',
      );
    });
    expect(counts.information).toBeGreaterThan(settled.information);
    expect(counts.egoForm).toBe(settled.egoForm);
  });

  it('replays the revisions published while the channel was down', async () => {
    const host = newHost();
    const watched = recordingClient(host.client);
    const counts = await renderObservers(watched.client, host.protocolId);
    expect(counts.information).toBeGreaterThan(0);

    const collaborator = host.asCollaborator(COLLABORATOR);
    const held = await collaborator.acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await waitFor(() => {
      expect(watched.since()).toHaveLength(1);
    });

    // The stream is cut before the write, so the revision reaches no open
    // watcher: resuming from the last cursor is the only way it can arrive.
    host.store.disconnectWatchers();
    await collaborator.submit({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Written while disconnected' },
      revision: held.revision,
    });

    await waitFor(
      () => {
        expect(screen.getByLabelText('information').textContent).toBe(
          'Written while disconnected',
        );
      },
      { timeout: 5_000 },
    );
    const calls = watched.since();
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[1]).toBeDefined();
  });

  it('keeps a revision that landed while the section was being read', async () => {
    const host = newHost();
    const delayed = delayedSectionReads(host.client);
    const counts: Counts = { information: 0, egoForm: 0 };
    render(
      <ProtocolBuilder client={delayed.client} protocolId={host.protocolId}>
        <Label
          name="information"
          id={INFORMATION}
          counts={counts}
          field="information"
        />
        <Label name="ego form" id={EGO_FORM} counts={counts} field="egoForm" />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(delayed.waiting()).toBe(2);
    });

    const collaborator = host.asCollaborator(COLLABORATOR);
    const held = await collaborator.acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await collaborator.submit({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Renamed by Grace' },
      revision: held.revision,
    });
    await waitFor(() => {
      expect(screen.getByLabelText('information').textContent).toBe(
        'Renamed by Grace',
      );
    });

    delayed.release();

    // Both reads were released together, so the ego form's document arriving
    // is the proof that the information section's older answer has been
    // through the cache too.
    await waitFor(() => {
      expect(screen.getByLabelText('ego form').textContent).not.toBe('loading');
    });
    expect(screen.getByLabelText('information').textContent).toBe(
      'Renamed by Grace',
    );
  });

  it('edits from the section the acquire answered with, not a cached one', async () => {
    const host = newHost();
    // Nothing arrives on the channel, so the cache holds what it read and
    // keeps holding it: the state an editor opens in while a reconnect is
    // still catching up.
    const client = silentChannel(host.client);
    const counts: Counts = { information: 0, egoForm: 0 };
    const view = render(
      <ProtocolBuilder client={client} protocolId={host.protocolId}>
        <Label
          name="information"
          id={INFORMATION}
          counts={counts}
          field="information"
        />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('information').textContent).not.toBe(
        'loading',
      );
    });

    const collaborator = host.asCollaborator(COLLABORATOR);
    const held = await collaborator.acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await collaborator.submit({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Renamed by Grace' },
      revision: held.revision,
    });
    await collaborator.releaseLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    view.rerender(
      <ProtocolBuilder client={client} protocolId={host.protocolId}>
        <Label
          name="information"
          id={INFORMATION}
          counts={counts}
          field="information"
        />
        <Editor id={INFORMATION} />
      </ProtocolBuilder>,
    );

    // Editing from the cached document would submit Grace's label away again
    // the moment this editor saves.
    await waitFor(() => {
      expect(screen.getByLabelText('editing').textContent).toBe(
        'Renamed by Grace',
      );
    });
  });

  it('keeps the lock an acquire took while an earlier one was settling', async () => {
    const host = newHost();
    render(
      <StrictMode>
        <ProtocolBuilder
          client={silentChannel(host.client)}
          protocolId={host.protocolId}
        >
          <Editor id={INFORMATION} />
        </ProtocolBuilder>
      </StrictMode>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('editing').textContent).not.toBe('loading');
    });

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    // The first effect's acquire settles after its own cleanup and after the
    // second effect has taken the lock. Locks belong to the session, so a
    // release from that first acquire takes the mounted editor's.
    await waitFor(() => {
      expect(screen.getByLabelText('saved').textContent).toBe('written');
    });
  });

  it('lists a section created while the section list was in flight', async () => {
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(FIXTURE),
      nextId: () => 'place',
    });
    const created = sectionId({ kind: 'codebookNode', typeId: 'place' });
    const gated = gatedSectionList(host.client);
    const watched = watchedEvents(gated.client);
    render(
      <ProtocolBuilder client={watched.client} protocolId={host.protocolId}>
        <NodeTypes />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
    });

    // Created after the host answered the list and before that answer
    // arrived: the channel carries the new section while the list that does
    // not have it is still on its way, and nothing refetches the list.
    await host.client.create({
      protocolId: host.protocolId,
      kind: 'codebookNode',
      document: {
        name: 'Place',
        color: 'node-color-seq-3',
        shape: { default: 'circle' },
        variables: {},
      },
    });
    await waitFor(() => {
      expect(watched.applied()).toContain(created);
    });
    gated.release();

    await waitFor(() => {
      expect(screen.getByLabelText('node types').textContent).toContain(
        'Place',
      );
    });
  });

  it('ignores an acquire that settles after the editor moved to another section', async () => {
    const host = newHost();
    await host.asCollaborator(COLLABORATOR).acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const gated = gatedAcquire(host.client, INFORMATION);

    const view = render(
      <ProtocolBuilder client={gated.client} protocolId={host.protocolId}>
        <Lock id={INFORMATION} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
    });

    view.rerender(
      <ProtocolBuilder client={gated.client} protocolId={host.protocolId}>
        <Lock id={EGO_FORM} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('lock').textContent).toBe('yours');
    });

    gated.release();

    // The refusal that lands is about the section this editor left; applying
    // it would tell the researcher the ego form is somebody else's.
    await waitFor(() => {
      expect(host.store.holderOf(EGO_FORM)?.displayName).toBe('Ada');
    });
    expect(screen.getByLabelText('lock').textContent).toBe('yours');
  });

  it('names the holder from the acquire, without waiting for a lock event', async () => {
    const host = newHost();
    await host.asCollaborator(COLLABORATOR).acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    render(
      <ProtocolBuilder
        client={silentChannel(host.client)}
        protocolId={host.protocolId}
      >
        <Lock id={INFORMATION} />
      </ProtocolBuilder>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('lock').textContent).toBe('Grace');
    });
  });
});

function Editor({ id }: Readonly<{ id: ProtocolSectionId }>) {
  const { document, submit } = useSectionMutation(id);
  const [saved, setSaved] = useState('unsaved');
  return (
    <>
      <output aria-label="editing">
        {document === undefined ? 'loading' : String(document.label)}
      </output>
      <output aria-label="saved">{saved}</output>
      <button
        type="button"
        disabled={document === undefined}
        onClick={() => {
          if (document === undefined) return;
          void submit({ ...document, label: 'Saved' }).then((result) => {
            setSaved(result.status);
          });
        }}
      >
        save
      </button>
    </>
  );
}

function NodeTypes() {
  const types = useEntityTypes('node');
  return (
    <output aria-label="node types">
      {types.map((type) => type.name).join(', ')}
    </output>
  );
}

/**
 * The host's client with its answer for one section's `acquireLock` held at a
 * gate the test opens, so an acquire can settle after the editor that asked
 * for it has moved on.
 */
function gatedAcquire(client: ProtocolBuilderClient, held: ProtocolSectionId) {
  const gates: (() => void)[] = [];
  const acquireLock: ProtocolBuilderClient['acquireLock'] = async (
    input,
    options,
  ) => {
    const answer = await client.acquireLock(input, options);
    if (input.sectionId === held) {
      await new Promise<void>((open) => gates.push(open));
    }
    return answer;
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'acquireLock' ? acquireLock : Reflect.get(target, property),
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
 * The host's client with its `listSections` answer held at a gate the test
 * opens, so a section can be created after the host formed the answer and
 * before the client has it.
 */
function gatedSectionList(client: ProtocolBuilderClient) {
  const gates: (() => void)[] = [];
  const listSections: ProtocolBuilderClient['listSections'] = async (
    input,
    options,
  ) => {
    const answer = await client.listSections(input, options);
    await new Promise<void>((open) => gates.push(open));
    return answer;
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'listSections'
        ? listSections
        : Reflect.get(target, property),
  });
  return {
    client: wrapped,
    waiting: () => gates.length,
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

function Lock({ id }: Readonly<{ id: ProtocolSectionId }>) {
  const { readOnly, holder } = useSectionMutation(id);
  return (
    <output aria-label="lock">
      {readOnly ? (holder?.displayName ?? 'someone') : 'yours'}
    </output>
  );
}

/**
 * The host's client with every `getSection` answer held at a gate the test
 * opens, so a revision can be published while a read is in flight.
 */
function delayedSectionReads(client: ProtocolBuilderClient) {
  const gates: (() => void)[] = [];
  const getSection: ProtocolBuilderClient['getSection'] = async (
    input,
    options,
  ) => {
    const answer = await client.getSection(input, options);
    await new Promise<void>((open) => gates.push(open));
    return answer;
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'getSection' ? getSection : Reflect.get(target, property),
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
 * The host's client, recording each revision the channel has finished
 * applying: the event is recorded after the consumer's loop body has run, so
 * a test can sequence itself against what the cache has already been told.
 */
function watchedEvents(client: ProtocolBuilderClient) {
  const applied: string[] = [];
  const watchProtocol: ProtocolBuilderClient['watchProtocol'] = async (
    input,
    options,
  ) => {
    const events = await client.watchProtocol(input, options);
    let handled: ProtocolEvent | undefined;
    return new AsyncIteratorClass<ProtocolEvent, void, void>(
      async () => {
        // Asking for the next event is the channel saying it has finished
        // with the last one, so what it did with that one is already in the
        // cache — which is the ordering this test needs to sequence against.
        if (handled?.type === 'revision') applied.push(handled.sectionId);
        handled = undefined;
        const next = await events.next();
        if (next.done === true) return { done: true, value: undefined };
        handled = next.value;
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
  return { client: wrapped, applied: () => applied };
}

/**
 * A host that answers procedures but publishes nothing — Architect's
 * in-process router, whose locks are always granted, has no lock events to
 * send.
 */
function silentChannel(client: ProtocolBuilderClient): ProtocolBuilderClient {
  const watchProtocol: ProtocolBuilderClient['watchProtocol'] = () =>
    Promise.resolve(
      new AsyncIteratorClass<ProtocolEvent, void, void>(
        () => new Promise<never>(() => undefined),
        () => Promise.resolve(),
      ),
    );
  return new Proxy(client, {
    get: (target, property) =>
      property === 'watchProtocol'
        ? watchProtocol
        : Reflect.get(target, property),
  });
}

/**
 * The host's client, recording the cursor each `watchProtocol` call resumes
 * from. The stream itself is untouched: the host cuts it.
 */
function recordingClient(client: ProtocolBuilderClient) {
  const since: (string | undefined)[] = [];
  const watchProtocol: ProtocolBuilderClient['watchProtocol'] = (
    input,
    options,
  ) => {
    since.push(input.since);
    return client.watchProtocol(input, options);
  };
  // The router client is a lazy proxy, so it cannot be spread: only its
  // `watchProtocol` is replaced, and everything else resolves as before.
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'watchProtocol'
        ? watchProtocol
        : Reflect.get(target, property),
  });
  return { client: wrapped, since: () => since };
}
