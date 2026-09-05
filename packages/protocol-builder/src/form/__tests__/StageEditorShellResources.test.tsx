import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../controller.ts';
import {
  ResourceGatewayProvider,
  useResourceGateway,
} from '../../resources/context.tsx';
import type { ProtocolBuilderResourceGateway } from '../../resources/gateway.ts';
import { InMemoryResourceGateway } from '../../resources/InMemoryResourceGateway.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import StageEditorShell from '../StageEditorShell.tsx';

const initialFields: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [],
};

function createSession(gateway?: ProtocolBuilderResourceGateway) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: initialFields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    ...(gateway === undefined ? {} : { resourceGateway: gateway }),
    buildCandidate: ({ stageDocument }) => ({
      name: 'Stage editor resources test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

function Editor({
  session,
  children,
}: Readonly<{
  session: ProtocolBuilderSessionStore;
  children: ReactNode;
}>) {
  const controller = useStageEditorController(session, 'stage-form');
  return (
    <DialogProvider>
      <StageEditorShell controller={controller}>
        <BuilderSection title="Page content">{children}</BuilderSection>
      </StageEditorShell>
    </DialogProvider>
  );
}

describe('StageEditorShell resource gateway', () => {
  it('hands editors the session gateway, so staging is the session that is edited', async () => {
    const host = new InMemoryResourceGateway();
    const session = createSession(host);
    let seen: ProtocolBuilderResourceGateway | undefined;
    function Picker() {
      seen = useResourceGateway();
      return <p>Resource picker</p>;
    }

    render(
      <Editor session={session}>
        <Picker />
      </Editor>,
    );

    expect(screen.getByText('Resource picker')).toBeInTheDocument();
    // The session's own gateway, not the host's: what an editor stages is
    // staging the session knows about, and can promote or discard.
    expect(seen).toBe(session.getResourceGateway());
    expect(seen).not.toBe(host);

    await act(async () => {
      await seen?.stageUpload({
        requestId: 'picked',
        kind: 'image',
        name: 'Picked backdrop',
        source: 'picked.png',
        contentType: 'image/png',
        bytes: Uint8Array.from([1, 2, 3]),
      });
    });

    expect(session.getSnapshot().stagedResources).toMatchObject([
      { name: 'Picked backdrop', status: 'staged' },
    ]);
  });

  it('provides no gateway when the host opened the session without one', () => {
    const session = createSession();
    function Picker() {
      useResourceGateway();
      return <p>Resource picker</p>;
    }
    // React reports the throw from the failed render as well.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        render(
          <Editor session={session}>
            <Picker />
          </Editor>,
        ),
      ).toThrow(/useResourceGateway must be used inside/);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('refuses an outer gateway when the host opened this session without one', () => {
    const outer = new InMemoryResourceGateway();
    const session = createSession();
    function Picker() {
      useResourceGateway();
      return <p>Resource picker</p>;
    }
    // React reports the throw from the failed render as well.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      // A shell nested under another editor's provider: staging here would be
      // staging in a session that neither tracks nor cleans it up.
      expect(() =>
        render(
          <ResourceGatewayProvider gateway={outer}>
            <Editor session={session}>
              <Picker />
            </Editor>
          </ResourceGatewayProvider>,
        ),
      ).toThrow(/useResourceGateway must be used inside/);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('renders a stage editor that uses no resources at all', () => {
    render(
      <Editor session={createSession()}>
        <p>Plain content</p>
      </Editor>,
    );

    expect(screen.getByText('Plain content')).toBeInTheDocument();
  });
});
