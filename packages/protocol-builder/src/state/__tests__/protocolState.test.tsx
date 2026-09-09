import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderClient } from '../../contract/contract.ts';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { useSection } from '../hooks.ts';

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
});

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
