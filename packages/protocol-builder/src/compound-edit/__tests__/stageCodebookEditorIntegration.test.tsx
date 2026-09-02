import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import CodebookEntityEditor from '../../codebook/components/CodebookEntityEditor.tsx';
import { withStageSectionEdit } from '../../codebook/editing.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
  type ProtocolBuilderPresence,
} from '../../session.ts';
import { InMemoryCompoundHost } from '../InMemoryCompoundHost.ts';

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const placeSection = sectionId({ kind: 'codebookNode', typeId: 'place' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });
const initialStage = {
  id: 'stage-1',
  type: 'Information',
  label: 'Welcome',
  title: 'Welcome',
  items: [],
} satisfies SectionDoc;
const initialSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Stage codebook integration', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: initialStage,
  [assetsSection]: {},
};
const holder: ProtocolBuilderPresence = {
  sessionId: 'stage-tab',
  userId: 'researcher',
  displayName: 'Researcher',
  sectionId: stageSection,
  mode: 'editing',
};

describe('stage-owned codebook editor flow', () => {
  it('creates an entity and updates the edited stage through one atomic request', async () => {
    const host = new InMemoryCompoundHost({
      protocolSections: initialSections,
      manifestRevision: { sequence: 1n, hash: 'revision-1' },
      leases: [
        {
          sectionId: stageSection,
          leaseOwner: 'stage-owner',
          leaseEpoch: 1n,
          holder,
        },
      ],
    });
    const onCommands = vi.fn();
    const session = new ProtocolBuilderSessionStore({
      identity: createStageIdentity('Information', () => 'stage-1'),
      fields: { label: 'Welcome', title: 'Welcome', items: [] },
      protocolSections: host.getSnapshot().protocolSections,
      manifestRevision: host.getSnapshot().manifestRevision,
      access: {
        mode: 'editable',
        leaseOwner: 'stage-owner',
        leaseEpoch: 1n,
      },
      buildCandidate: ({ stageDocument }) => ({
        name: 'Stage codebook integration',
        schemaVersion: 8,
        codebook: {},
        stages: [stageDocument],
      }),
      onCommands,
      onCompoundEdit: (submission) => host.submit(submission),
    });
    const onApplied = vi.fn();

    render(
      <CodebookEntityEditor
        mode="create"
        sessionKey="create-place-from-stage"
        createRequestId={() => 'create-place-from-stage'}
        description="Create and select a place type"
        subject={{ entity: 'node', type: 'place' }}
        initialDraft={{
          name: 'Place',
          color: 'node-color-seq-2',
          shape: { default: 'square' },
          icon: 'MapPin',
        }}
        existingEntityNames={[]}
        onSubmit={(codebookRequest) =>
          session.requestCompoundEdit(
            withStageSectionEdit(codebookRequest, stageSection, initialStage, [
              { op: 'set', key: 'label', value: 'Places' },
            ]),
          )
        }
        onApplied={onApplied}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
    expect(onCommands).not.toHaveBeenCalled();
    expect(host.getSnapshot().protocolSections).toMatchObject({
      [stageSection]: { label: 'Places' },
      [placeSection]: { name: 'Place', variables: {} },
    });
    expect(session.getSnapshot()).toMatchObject({
      editedSection: { fields: { label: 'Places' } },
      protocolContext: {
        codebook: { node: { place: { name: 'Place' } } },
      },
    });
  });
});
