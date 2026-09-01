import { describe, expect, it, vi } from 'vitest';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
  type ProtocolBuilderPresence,
} from '../../session.ts';
import {
  InMemoryCompoundHost,
  type InMemoryCompoundHostLease,
} from '../InMemoryCompoundHost.ts';

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
  [settingsSection]: { name: 'Compound integration', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: initialStage,
  [assetsSection]: {},
};
const primaryPresence: ProtocolBuilderPresence = {
  sessionId: 'tab-primary',
  userId: 'user-primary',
  displayName: 'Primary editor',
  sectionId: stageSection,
  mode: 'editing',
};
const primaryLease: InMemoryCompoundHostLease = {
  sectionId: stageSection,
  leaseOwner: 'owner-primary',
  leaseEpoch: 4n,
  holder: primaryPresence,
};

function createSession(
  additionalLeases: readonly InMemoryCompoundHostLease[] = [],
) {
  const host = new InMemoryCompoundHost({
    protocolSections: initialSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [primaryLease, ...additionalLeases],
  });
  const onCommands = vi.fn();
  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: { label: 'Welcome', title: 'Welcome', items: [] },
    protocolSections: host.getSnapshot().protocolSections,
    manifestRevision: host.getSnapshot().manifestRevision,
    access: {
      mode: 'editable',
      leaseOwner: 'owner-primary',
      leaseEpoch: 4n,
    },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Compound integration',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
    onCommands,
    onCompoundEdit: (submission) => host.submit(submission),
  });
  return { host, onCommands, session };
}

const request = {
  id: 'create-place-and-rename-stage',
  description: 'Create a place and rename the stage',
  edits: [
    {
      kind: 'update' as const,
      sectionId: stageSection,
      expectedContentHash: contentHash(initialStage),
      commands: [{ op: 'set' as const, key: 'label', value: 'Places' }],
    },
    {
      kind: 'create' as const,
      sectionId: placeSection,
      document: {
        name: 'Place',
        color: 'node-color-seq-2',
        shape: { default: 'square' },
        variables: {},
      },
    },
  ],
};

describe('compound host and protocol-builder session integration', () => {
  it('publishes one authoritative stage-and-codebook revision without echo', async () => {
    const { host, onCommands, session } = createSession();

    await expect(session.requestCompoundEdit(request)).resolves.toMatchObject({
      status: 'applied',
      update: { manifestRevision: { sequence: 8n } },
    });

    expect(onCommands).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      editedSection: { fields: { label: 'Places' } },
      manifestRevision: { sequence: 8n },
    });
    expect(
      session.getSnapshot().protocolContext.codebook.node?.place,
    ).toMatchObject({ name: 'Place' });
    expect(session.getSnapshot().protocolSections).toEqual(
      host.getSnapshot().protocolSections,
    );
  });

  it('leaves both host and session unchanged when an auxiliary section is held', async () => {
    const holder: ProtocolBuilderPresence = {
      sessionId: 'tab-place',
      userId: 'user-place',
      displayName: 'Place editor',
      sectionId: placeSection,
      mode: 'editing',
    };
    const { host, session } = createSession([
      {
        sectionId: placeSection,
        leaseOwner: 'owner-place',
        leaseEpoch: 2n,
        holder,
      },
    ]);
    await session.validate();
    const hostBefore = host.getSnapshot();
    const sessionBefore = session.getSnapshot();

    await expect(session.requestCompoundEdit(request)).resolves.toEqual({
      status: 'blocked',
      blockedSections: [{ sectionId: placeSection, holder }],
    });

    expect(host.getSnapshot()).toEqual(hostBefore);
    expect(session.getSnapshot()).toBe(sessionBefore);
  });
});
