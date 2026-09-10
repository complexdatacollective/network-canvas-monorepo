import { AsyncIteratorClass } from '@orpc/client';
import { useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Component, StrictMode, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';
import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { useProtocolBuilderContext } from '../context.ts';
import { useEntityTypes, useSection, useSectionMutation } from '../hooks.ts';

/** The edit these calls are made from: one editor, open throughout. */
const EDIT = 'edit-1';

/** A fresh idempotency key: every write below is its own intent. */
let writes = 0;
const nextRequestId = (): string => `write-${++writes}`;

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
      requestId: nextRequestId(),
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
      requestId: nextRequestId(),
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
      requestId: nextRequestId(),
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
      requestId: nextRequestId(),
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
      requestId: nextRequestId(),
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

  it('gives back a lock granted for a section the editor has left', async () => {
    const host = newHost();
    // Held BEFORE the host sees it, so the release the cleanup sends for the
    // section this editor left arrives while nobody holds that lock and the
    // grant lands after it.
    const gated = withheldAcquire(silentChannel(host.client), INFORMATION);

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
    // The host has granted the lock for the section this editor left, and the
    // release its cleanup sent went out before that. Nothing else will ever
    // hand this one back: the section would stay read-only to every
    // collaborator with nobody editing it.
    await waitFor(() => {
      expect(gated.granted()).toEqual(['held']);
    });
    await waitFor(() => {
      expect(host.store.holderOf(INFORMATION)).toBeUndefined();
    });
    expect(host.store.holderOf(EGO_FORM)?.displayName).toBe('Ada');
  });

  it('says a section is unavailable when its acquire is refused', async () => {
    const host = newHost();
    const missing = sectionId({ kind: 'stage', stageId: 'never-existed' });

    render(
      <ProtocolBuilder
        client={silentChannel(host.client)}
        protocolId={host.protocolId}
      >
        <Lock id={missing} />
      </ProtocolBuilder>,
    );

    // A section deleted while this editor was opening it, or a transport that
    // dropped: nothing retries, so an editor left acquiring is one the
    // researcher can neither use nor close.
    await waitFor(() => {
      expect(screen.getByLabelText('lock').textContent).toBe('unavailable');
    });
  });

  it('does not open a cached section for editing before the acquire answers', async () => {
    const host = newHost();
    await host.asCollaborator(COLLABORATOR).acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const gated = gatedAcquire(silentChannel(host.client), INFORMATION);
    const counts: Counts = { information: 0, egoForm: 0 };

    render(
      <ProtocolBuilder client={gated.client} protocolId={host.protocolId}>
        <Label
          name="information"
          id={INFORMATION}
          counts={counts}
          field="information"
        />
        <Lock id={INFORMATION} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
      expect(screen.getByLabelText('information').textContent).not.toBe(
        'loading',
      );
    });

    // The document is read and the acquire is still in flight. Offering it as
    // this editor's is offering a draft the host is about to refuse.
    expect(screen.getByLabelText('lock').textContent).toBe('acquiring');

    gated.release();
    await waitFor(() => {
      expect(screen.getByLabelText('lock').textContent).toBe('Grace');
    });
  });

  it('hands the editor what its submit promoted', async () => {
    const host = newHost();
    const staged = await host.client.resources.stage({
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Portrait',
        source: 'portrait.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');

    render(
      <ProtocolBuilder
        client={silentChannel(host.client)}
        protocolId={host.protocolId}
      >
        <PromotingEditor
          id={INFORMATION}
          resourceId={staged.data.descriptor.id}
        />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    // The host answers a promoting submit with what it committed — metadata
    // staging never had — and this hook is what a component has instead of the
    // client, so an editor that cannot see it cannot settle the staged rows it
    // was holding.
    await waitFor(() => {
      expect(screen.getByLabelText('promoted').textContent).toBe(
        'Portrait: committed',
      );
    });
  });

  it('repeats a save whose answer was lost under the id that save used', async () => {
    const host = newHost();
    const staged = await host.client.resources.stage({
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Portrait',
        source: 'portrait.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const lost = lostAnswers(silentChannel(host.client));

    render(
      <ProtocolBuilder client={lost.client} protocolId={host.protocolId}>
        <PromotingEditor
          id={INFORMATION}
          resourceId={staged.data.descriptor.id}
        />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByLabelText('promoted').textContent).toBe('lost');
    });

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    // The host made the first write and the answer never arrived. A second id
    // would be a second operation, and the promotion behind it names a file
    // that write already committed: the researcher's save would fail for good,
    // with the picture they imported gone from the editor.
    await waitFor(() => {
      expect(screen.getByLabelText('promoted').textContent).toBe(
        'Portrait: committed',
      );
    });
    expect(lost.requestIds()).toHaveLength(2);
    expect(new Set(lost.requestIds()).size).toBe(1);
  });

  it('does not put back a section deleted while its acquire was in flight', async () => {
    const host = newHost();
    const gated = gatedAcquire(host.client, INFORMATION);
    const cache = cacheProbe();

    const view = render(
      <ProtocolBuilder client={gated.client} protocolId={host.protocolId}>
        <cache.Probe />
        <Lock id={INFORMATION} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
      expect(cache.section(INFORMATION)).toBeDefined();
    });

    view.rerender(
      <ProtocolBuilder client={gated.client} protocolId={host.protocolId}>
        <cache.Probe />
        <Lock id={EGO_FORM} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('lock').textContent).toBe('yours');
      expect(host.store.holderOf(INFORMATION)).toBeUndefined();
    });

    await host.asCollaborator(COLLABORATOR).delete({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await waitFor(() => {
      expect(cache.section(INFORMATION)).toBeUndefined();
    });

    gated.release();
    // The grant this editor no longer wants is handed back by the same handler
    // that would write the cache, so the second release is that handler having
    // run.
    await waitFor(() => {
      expect(gated.releases(INFORMATION)).toBe(2);
    });
    // Nothing in this cache refetches and the removal took the newer state
    // with it, so a deleted section written back here is one the editors would
    // go on offering for as long as the protocol is open.
    expect(cache.section(INFORMATION)).toBeUndefined();
  });

  it('does not report a fault in its own acquire handler as a host that did not answer', async () => {
    const host = newHost();

    render(
      <Boundary>
        <ProtocolBuilder
          client={faultyAcquire(silentChannel(host.client), INFORMATION)}
          protocolId={host.protocolId}
        >
          <Lock id={INFORMATION} />
        </ProtocolBuilder>
      </Boundary>,
    );

    // Reported as `unavailable`, a bug in this hook reads to the researcher
    // exactly like a section the host cannot reach — and to everyone else like
    // nothing at all.
    await waitFor(() => {
      expect(screen.getByLabelText('caught').textContent).toBe(
        'bug reading the acquired document',
      );
    });
    expect(screen.queryByLabelText('lock')).toBeNull();
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

/** An editor whose save promotes a resource it staged during the edit. */
function PromotingEditor({
  id,
  resourceId,
}: Readonly<{ id: ProtocolSectionId; resourceId: string }>) {
  const { document, submit } = useSectionMutation(id);
  const [promoted, setPromoted] = useState('none');
  return (
    <>
      <output aria-label="promoted">{promoted}</output>
      <button
        type="button"
        disabled={document === undefined}
        onClick={() => {
          if (document === undefined) return;
          void submit(document, {
            editId: EDIT,
            resourceIds: [resourceId],
          }).then(
            (result) => {
              if (result.status !== 'written') {
                setPromoted(result.status);
                return;
              }
              setPromoted(
                (result.promoted ?? [])
                  .map((resource) => `${resource.name}: ${resource.status}`)
                  .join(', '),
              );
            },
            // A save the host never answered, which is what an editor has to
            // report rather than leave the researcher's click looking ignored.
            () => {
              setPromoted('lost');
            },
          );
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
  const released: string[] = [];
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
  const releaseLock: ProtocolBuilderClient['releaseLock'] = (
    input,
    options,
  ) => {
    released.push(input.sectionId);
    return client.releaseLock(input, options);
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'acquireLock'
        ? acquireLock
        : property === 'releaseLock'
          ? releaseLock
          : Reflect.get(target, property),
  });
  return {
    client: wrapped,
    waiting: () => gates.length,
    releases: (id: ProtocolSectionId) =>
      released.filter((section) => section === id).length,
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

/**
 * The host's client with one section's `acquireLock` answered by a result
 * whose document cannot be read: a bug in what the hook does with an answer,
 * rather than anything the host said about it.
 */
function faultyAcquire(
  client: ProtocolBuilderClient,
  faulty: ProtocolSectionId,
): ProtocolBuilderClient {
  const acquireLock: ProtocolBuilderClient['acquireLock'] = async (
    input,
    options,
  ) => {
    const answer = await client.acquireLock(input, options);
    if (input.sectionId !== faulty) return answer;
    return {
      lock: 'held',
      revision: answer.revision,
      get document(): SectionDoc {
        throw new Error('bug reading the acquired document');
      },
    };
  };
  return new Proxy(client, {
    get: (target, property) =>
      property === 'acquireLock' ? acquireLock : Reflect.get(target, property),
  });
}

/**
 * The host's client with the first `submit` answered by a dropped connection.
 *
 * The host makes the write and the caller is told only that the call failed,
 * which is all a client has when a socket closes between a request and its
 * answer: an oRPC link rejects the calls that were in flight and reconnects
 * only the ones that follow, so nothing resends this one.
 */
function lostAnswers(client: ProtocolBuilderClient) {
  const requestIds: string[] = [];
  let lost = false;
  const submit: ProtocolBuilderClient['submit'] = async (input, options) => {
    requestIds.push(input.requestId);
    const answer = await client.submit(input, options);
    if (lost) return answer;
    lost = true;
    throw new Error('WebSocket closed (code 1006)');
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'submit' ? submit : Reflect.get(target, property),
  });
  return { client: wrapped, requestIds: () => requestIds };
}

/** The section cache as the hooks leave it, which no rendered output shows. */
function cacheProbe() {
  let read: ((id: ProtocolSectionId) => unknown) | undefined;
  function Probe() {
    const { protocolId, utils } = useProtocolBuilderContext();
    const queryClient = useQueryClient();
    read = (id) =>
      queryClient.getQueryData(
        utils.getSection.queryKey({ input: { protocolId, sectionId: id } }),
      );
    return null;
  }
  return {
    Probe,
    section: (id: ProtocolSectionId): unknown => {
      if (read === undefined) throw new Error('the cache probe never rendered');
      return read(id);
    },
  };
}

/** What a hook's own fault reaches, when it is not swallowed on the way. */
class Boundary extends Component<
  Readonly<{ children: ReactNode }>,
  Readonly<{ message: string }>
> {
  override state: Readonly<{ message: string }> = { message: 'none' };

  static getDerivedStateFromError(error: unknown): Readonly<{
    message: string;
  }> {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    return this.state.message === 'none' ? (
      this.props.children
    ) : (
      <output aria-label="caught">{this.state.message}</output>
    );
  }
}

/**
 * The host's client with one section's `acquireLock` held at a gate the test
 * opens BEFORE the request reaches the host, so an acquire can be granted
 * after the editor that asked for it has already given the lock back.
 */
function withheldAcquire(
  client: ProtocolBuilderClient,
  held: ProtocolSectionId,
) {
  const gates: (() => void)[] = [];
  const granted: string[] = [];
  const acquireLock: ProtocolBuilderClient['acquireLock'] = async (
    input,
    options,
  ) => {
    if (input.sectionId !== held) return client.acquireLock(input, options);
    await new Promise<void>((open) => gates.push(open));
    const answer = await client.acquireLock(input, options);
    granted.push(answer.lock);
    return answer;
  };
  const wrapped = new Proxy(client, {
    get: (target, property) =>
      property === 'acquireLock' ? acquireLock : Reflect.get(target, property),
  });
  return {
    client: wrapped,
    waiting: () => gates.length,
    granted: () => granted,
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
  const { access, holder } = useSectionMutation(id);
  return (
    <output aria-label="lock">
      {access === 'editing'
        ? 'yours'
        : access === 'pending'
          ? 'acquiring'
          : access === 'unavailable'
            ? 'unavailable'
            : (holder?.displayName ?? 'someone')}
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
