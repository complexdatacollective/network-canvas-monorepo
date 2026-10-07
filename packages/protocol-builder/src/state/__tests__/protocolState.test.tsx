import { useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect, Schema, Stream } from 'effect';
import { Component, StrictMode, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ProtocolEventSchema } from '@codaco/protocol-builder-core/contract/schemas';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import {
  createInMemoryHost,
  type HandlerOverrides,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import {
  useProtocolBuilderContext,
  type ProtocolBuilderAdapter,
} from '../context.ts';
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

const isEnglishLabel = Schema.is(Schema.Struct({ 'en-US': Schema.String }));

function englishLabel(document: SectionDoc): string {
  const { label } = document;
  return isEnglishLabel(label) ? label['en-US'] : 'unlabelled';
}

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
  const label = useSection(id, (section) => englishLabel(section.document));
  counts[field] += 1;
  return <output aria-label={name}>{label ?? 'loading'}</output>;
}

async function renderObservers(
  adapter: ProtocolBuilderAdapter,
  protocolId: string,
) {
  const counts: Counts = { information: 0, egoForm: 0 };
  render(
    <ProtocolBuilder adapter={adapter} protocolId={protocolId}>
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
    const counts = await renderObservers(host.adapter, host.protocolId);
    const settled = { ...counts };

    const collaborator = host.asCollaborator(COLLABORATOR);
    const held = await collaborator.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await collaborator.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: { ...held.document, label: { 'en-US': 'Renamed by Grace' } },
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
    const watched = recordingWatch(host);
    const counts = await renderObservers(watched.adapter, host.protocolId);
    expect(counts.information).toBeGreaterThan(0);

    const collaborator = host.asCollaborator(COLLABORATOR);
    const held = await collaborator.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await waitFor(() => {
      expect(watched.since()).toHaveLength(1);
    });

    // The stream is cut before the write, so the revision reaches no open
    // watcher: resuming from the last cursor is the only way it can arrive.
    host.store.disconnectWatchers();
    await collaborator.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: {
        ...held.document,
        label: { 'en-US': 'Written while disconnected' },
      },
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
    const delayed = delayedSectionReads(host);
    const counts: Counts = { information: 0, egoForm: 0 };
    render(
      <ProtocolBuilder adapter={delayed.adapter} protocolId={host.protocolId}>
        <Label
          name="information"
          id={INFORMATION}
          counts={counts}
          field="information"
        />
        <Label name="ego form" id={EGO_FORM} counts={counts} field="egoForm" />
      </ProtocolBuilder>,
    );
    // The two observed sections, and the settings `ProtocolBuilder` reads for
    // the protocol's languages.
    await waitFor(() => {
      expect(delayed.waiting()).toBe(3);
    });

    const collaborator = host.asCollaborator(COLLABORATOR);
    const held = await collaborator.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await collaborator.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: { ...held.document, label: { 'en-US': 'Renamed by Grace' } },
      revision: held.revision,
    });
    await waitFor(() => {
      expect(screen.getByLabelText('information').textContent).toBe(
        'Renamed by Grace',
      );
    });

    delayed.release();

    // The reads were released together, so the ego form's document arriving
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
    const adapter = silentChannel(host);
    const counts: Counts = { information: 0, egoForm: 0 };
    const view = render(
      <ProtocolBuilder adapter={adapter} protocolId={host.protocolId}>
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
    const held = await collaborator.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await collaborator.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: { ...held.document, label: { 'en-US': 'Renamed by Grace' } },
      revision: held.revision,
    });
    await collaborator.rpcCall('ReleaseLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    view.rerender(
      <ProtocolBuilder adapter={adapter} protocolId={host.protocolId}>
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
          adapter={silentChannel(host)}
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
    const gated = gatedSectionList(host);
    const watched = watchedEvents(gated.adapter);
    render(
      <ProtocolBuilder adapter={watched.adapter} protocolId={host.protocolId}>
        <NodeTypes />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
    });

    // Created after the host answered the list and before that answer
    // arrived: the channel carries the new section while the list that does
    // not have it is still on its way, and nothing refetches the list.
    await host.adapter.rpcCall('Create', {
      protocolId: host.protocolId,
      requestId: nextRequestId(),
      kind: 'codebookNode',
      document: {
        name: 'Place',
        label: { 'en-US': 'Place' },
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
    await host.asCollaborator(COLLABORATOR).rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const gated = gatedAcquire(host, INFORMATION);

    const view = render(
      <ProtocolBuilder adapter={gated.adapter} protocolId={host.protocolId}>
        <Lock id={INFORMATION} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
    });

    view.rerender(
      <ProtocolBuilder adapter={gated.adapter} protocolId={host.protocolId}>
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
    const gated = withheldAcquire(host, INFORMATION, SILENT);

    const view = render(
      <ProtocolBuilder adapter={gated.adapter} protocolId={host.protocolId}>
        <Lock id={INFORMATION} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
    });

    view.rerender(
      <ProtocolBuilder adapter={gated.adapter} protocolId={host.protocolId}>
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
        adapter={silentChannel(host)}
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
    await host.asCollaborator(COLLABORATOR).rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const gated = gatedAcquire(host, INFORMATION, SILENT);
    const counts: Counts = { information: 0, egoForm: 0 };

    render(
      <ProtocolBuilder adapter={gated.adapter} protocolId={host.protocolId}>
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
    const staged = await host.adapter.rpcCall('ResourcesStage', {
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Portrait',
        source: 'portrait.png',
        contentType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');

    render(
      <ProtocolBuilder
        adapter={silentChannel(host)}
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
    const staged = await host.adapter.rpcCall('ResourcesStage', {
      protocolId: host.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Portrait',
        source: 'portrait.png',
        contentType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const lost = lostAnswers(host, SILENT);

    render(
      <ProtocolBuilder adapter={lost.adapter} protocolId={host.protocolId}>
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
    const gated = gatedAcquire(host, INFORMATION);
    const cache = cacheProbe();

    const view = render(
      <ProtocolBuilder adapter={gated.adapter} protocolId={host.protocolId}>
        <cache.Probe />
        <Lock id={INFORMATION} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(gated.waiting()).toBe(1);
      expect(cache.section(INFORMATION)).toBeDefined();
    });

    view.rerender(
      <ProtocolBuilder adapter={gated.adapter} protocolId={host.protocolId}>
        <cache.Probe />
        <Lock id={EGO_FORM} />
      </ProtocolBuilder>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('lock').textContent).toBe('yours');
      expect(host.store.holderOf(INFORMATION)).toBeUndefined();
    });

    await host.asCollaborator(COLLABORATOR).rpcCall('Delete', {
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
          adapter={faultyAcquire(host, INFORMATION, SILENT)}
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
    await host.asCollaborator(COLLABORATOR).rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });

    render(
      <ProtocolBuilder
        adapter={silentChannel(host)}
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
        {document === undefined ? 'loading' : englishLabel(document)}
      </output>
      <output aria-label="saved">{saved}</output>
      <button
        type="button"
        disabled={document === undefined}
        onClick={() => {
          if (document === undefined) return;
          void submit({ ...document, label: { 'en-US': 'Saved' } }).then(
            (result) => {
              setSaved(result.status);
            },
          );
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

const SILENT: HandlerOverrides = { WatchProtocol: () => Stream.never };

function gatedAcquire(
  host: InMemoryHost,
  held: ProtocolSectionId,
  base: HandlerOverrides = {},
) {
  const gates: (() => void)[] = [];
  const released: string[] = [];
  const adapter = host.adapterWith({
    ...base,
    AcquireLock: (input) =>
      Effect.flatMap(host.handle.AcquireLock(input), (answer) =>
        input.sectionId === held
          ? Effect.as(
              Effect.promise(
                () => new Promise<void>((open) => gates.push(open)),
              ),
              answer,
            )
          : Effect.succeed(answer),
      ),
    ReleaseLock: (input) => {
      released.push(input.sectionId);
      return host.handle.ReleaseLock(input);
    },
  });
  return {
    adapter,
    waiting: () => gates.length,
    releases: (id: ProtocolSectionId) =>
      released.filter((section) => section === id).length,
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

function faultyAcquire(
  host: InMemoryHost,
  faulty: ProtocolSectionId,
  base: HandlerOverrides = {},
): ProtocolBuilderAdapter {
  return host.adapterWith({
    ...base,
    AcquireLock: (input) =>
      Effect.map(host.handle.AcquireLock(input), (answer) =>
        input.sectionId !== faulty
          ? answer
          : {
              lock: 'held' as const,
              revision: answer.revision,
              get document(): SectionDoc {
                throw new Error('bug reading the acquired document');
              },
            },
      ),
  });
}

/**
 * The host makes the write and the caller is told only that the call failed,
 * which is all a client has when a socket closes between a request and its
 * answer: the socket protocol fails the calls that were in flight and
 * reconnects only for the ones that follow, so nothing resends this one.
 */
function lostAnswers(host: InMemoryHost, base: HandlerOverrides = {}) {
  const requestIds: string[] = [];
  let lost = false;
  const adapter = host.adapterWith({
    ...base,
    Submit: (input) => {
      requestIds.push(input.requestId);
      return Effect.flatMap(host.handle.Submit(input), (answer) => {
        if (lost) return Effect.succeed(answer);
        lost = true;
        return Effect.die(new Error('WebSocket closed (code 1006)'));
      });
    },
  });
  return { adapter, requestIds: () => requestIds };
}

/** The section cache as the hooks leave it, which no rendered output shows. */
function cacheProbe() {
  let read: ((id: ProtocolSectionId) => unknown) | undefined;
  function Probe() {
    const { protocolId, adapter } = useProtocolBuilderContext();
    const queryClient = useQueryClient();
    read = (id) =>
      queryClient.getQueryData(
        adapter.rpcKey('GetSection', { protocolId, sectionId: id }),
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

function withheldAcquire(
  host: InMemoryHost,
  held: ProtocolSectionId,
  base: HandlerOverrides = {},
) {
  const gates: (() => void)[] = [];
  const granted: string[] = [];
  const adapter = host.adapterWith({
    ...base,
    AcquireLock: (input) =>
      input.sectionId !== held
        ? host.handle.AcquireLock(input)
        : Effect.flatMap(
            Effect.promise(() => new Promise<void>((open) => gates.push(open))),
            () =>
              Effect.tap(host.handle.AcquireLock(input), (answer) =>
                Effect.sync(() => granted.push(answer.lock)),
              ),
          ),
  });
  return {
    adapter,
    waiting: () => gates.length,
    granted: () => granted,
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

function gatedSectionList(host: InMemoryHost) {
  const gates: (() => void)[] = [];
  const adapter = host.adapterWith({
    ListSections: (input) =>
      Effect.flatMap(host.handle.ListSections(input), (answer) =>
        Effect.as(
          Effect.promise(() => new Promise<void>((open) => gates.push(open))),
          answer,
        ),
      ),
  });
  return {
    adapter,
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

function delayedSectionReads(host: InMemoryHost) {
  const gates: (() => void)[] = [];
  const adapter = host.adapterWith({
    GetSection: (input) =>
      Effect.flatMap(host.handle.GetSection(input), (answer) =>
        Effect.as(
          Effect.promise(() => new Promise<void>((open) => gates.push(open))),
          answer,
        ),
      ),
  });
  return {
    adapter,
    waiting: () => gates.length,
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

const isProtocolEvent = Schema.is(ProtocolEventSchema);

function watchedEvents(adapter: ProtocolBuilderAdapter) {
  const applied: string[] = [];
  return {
    adapter: {
      ...adapter,
      rpcStream: (tag, payload, onChunk, signal) =>
        adapter.rpcStream(
          tag,
          payload,
          (chunk) => {
            onChunk(chunk);
            if (isProtocolEvent(chunk) && chunk.type === 'revision') {
              applied.push(chunk.sectionId);
            }
          },
          signal,
        ),
    } satisfies ProtocolBuilderAdapter,
    applied: () => applied,
  };
}

/**
 * A host that answers procedures but publishes nothing — Architect's
 * in-process host, whose locks are always granted, has no lock events to
 * send.
 */
function silentChannel(host: InMemoryHost): ProtocolBuilderAdapter {
  return host.adapterWith(SILENT);
}

function recordingWatch(host: InMemoryHost) {
  const since: (string | undefined)[] = [];
  const adapter = host.adapterWith({
    WatchProtocol: (input) => {
      since.push(input.since);
      return host.handle.WatchProtocol(input);
    },
  });
  return { adapter, since: () => since };
}
