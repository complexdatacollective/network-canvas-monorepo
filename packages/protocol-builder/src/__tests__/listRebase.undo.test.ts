/**
 * What an undo means once an arrival has moved the ground under the history.
 *
 * An undo entry is a whole draft, and `undo` diffs the draft on screen against
 * it — so an entry made before a collaborator's row arrived describes a
 * document without that row, and undoing to it deletes the row along with the
 * researcher's own edit. `rebasePending` answers that with `steps`, "the draft
 * before each rebased batch, in order: a rebase's undo entries", and the
 * compound-edit apply fences the history and pushes them. `acknowledge` has to
 * do the same — but only when the arrival actually carries something this
 * session did not put there, because a host that applies `onCommands` live
 * acknowledges every batch as it commits.
 */
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../session.ts';

const revision = (sequence: bigint) => ({
  sequence,
  hash: `revision-${String(sequence)}`,
});

const stageWith = (prompts: readonly SectionDoc[]): SectionDoc => ({
  label: 'Name generator',
  prompts: [...prompts],
});

const ASKED = { id: 'a', text: 'Who do you know?' };
const ADDED = { id: 'b', text: 'Anyone else?' };
const ARRIVED = { id: 'z', text: 'Who lives with you?' };

const openSession = () =>
  new ProtocolBuilderSessionStore({
    identity: createStageIdentity('NameGenerator', () => 'stage-1'),
    fields: stageWith([ASKED]),
    protocolSections: {},
    manifestRevision: revision(1n),
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'p',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
    onCommands: vi.fn(),
  });

const addPrompt = (session: ProtocolBuilderSessionStore) => {
  session.dispatch([
    { op: 'insertItem', key: 'prompts', index: 1, item: ADDED },
  ]);
};

describe('undo after a collaborator’s arrival', () => {
  it('does not delete the row the collaborator added', () => {
    const session = openSession();
    addPrompt(session);

    // A collaborator adds a prompt above the researcher's. Nothing of this
    // session's is acknowledged: the batch is still pending, and is rebased.
    session.acknowledge({
      fields: stageWith([ARRIVED, ASKED]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      ARRIVED,
      ASKED,
      ADDED,
    ]);

    // The history was cut at the arrival and rebuilt from it, which the
    // snapshot says so the editor can tell the researcher.
    expect(session.getSnapshot().history).toMatchObject({
      canUndo: true,
      canRedo: false,
      generation: 1,
      fencedAtRevision: revision(2n),
    });

    // The researcher undoes their own prompt. Only their own prompt goes.
    session.undo();

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      ARRIVED,
      ASKED,
    ]);
  });

  /**
   * The control, and the reason the fence is conditional. A host that applies
   * `onCommands` live acknowledges every batch the moment it commits, so the
   * base moves constantly with nothing but this session's own work in it —
   * fencing on that would leave the researcher unable to undo anything they
   * had saved, which is most of what there is to undo.
   */
  it('keeps the history when the arrival is only this session’s own batch', () => {
    const session = openSession();
    addPrompt(session);

    session.acknowledge({
      fields: stageWith([ASKED, ADDED]),
      throughBatchId: 1,
      manifestRevision: revision(2n),
    });

    expect(session.getSnapshot().pendingCommands).toHaveLength(0);
    expect(session.getSnapshot().history).toMatchObject({
      canUndo: true,
      generation: 0,
    });
    expect(session.getSnapshot().history.fencedAtRevision).toBeUndefined();

    session.undo();

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([ASKED]);
  });
});
