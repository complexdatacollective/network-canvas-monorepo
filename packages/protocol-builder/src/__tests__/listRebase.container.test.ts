/**
 * A nested list command whose CONTAINER the arrival has dropped.
 *
 * Not a contrived shape. `PageContentSection`'s `introScreen` variant binds its
 * list at `introScreen.items` and gives the capability switch the container
 * `introScreen`, so "one researcher adds a block while another switches the
 * introduction screen off" is exactly this — and the same arrival reaches every
 * other section that owns a list inside a capability.
 *
 * The rebase has to read the missing container the way the apply engine reads
 * it, as an empty list. Reading it as "not a list, do not rebase" let the
 * command through un-rebased, and `applyCommands` then refused its index with
 * an `ApplyError` that escaped `acknowledge` — which the Studio client turns
 * into lost edit access.
 */
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  commandsFromDraftChange,
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../session.ts';

const revision = (sequence: bigint) => ({
  sequence,
  hash: `revision-${String(sequence)}`,
});

const block = (id: string) => ({ id, type: 'text', content: `Block ${id}` });

const stageWith = (introScreen: SectionDoc | undefined): SectionDoc =>
  introScreen === undefined
    ? { label: 'Pedigree' }
    : { label: 'Pedigree', introScreen };

function openSession(introScreen: SectionDoc | undefined) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('FamilyPedigree', () => 'stage-1'),
    fields: stageWith(introScreen),
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
}

const itemsOf = (session: ProtocolBuilderSessionStore): unknown => {
  const { introScreen } = session.getSnapshot().editedSection.fields;
  return typeof introScreen === 'object' && introScreen !== null
    ? Reflect.get(introScreen, 'items')
    : undefined;
};

describe('a nested list command whose container the arrival has dropped', () => {
  it('does not take the session down when a row was inserted', () => {
    const session = openSession({ items: [block('one')] });

    // The researcher adds a second block: the bound list's own structural
    // command, at the nested path the section binds.
    session.dispatch([
      {
        op: 'insertItem',
        key: ['introScreen', 'items'],
        index: 1,
        item: block('two'),
      },
    ]);

    // A collaborator switches the introduction screen off, which is an `unset`
    // of the whole container.
    expect(() => {
      session.acknowledge({
        fields: stageWith(undefined),
        throughBatchId: 0,
        manifestRevision: revision(2n),
      });
    }).not.toThrow();

    // The insert lands at the only place left for it: the researcher's own
    // block survives the container going away, which is what an insert into
    // nothing means.
    expect(itemsOf(session)).toEqual([block('two')]);
  });

  it('does not take the session down when a row was removed', () => {
    const session = openSession({ items: [block('one'), block('two')] });
    session.dispatch([
      { op: 'removeItem', key: ['introScreen', 'items'], index: 1 },
    ]);
    expect(() => {
      session.acknowledge({
        fields: stageWith(undefined),
        throughBatchId: 0,
        manifestRevision: revision(2n),
      });
    }).not.toThrow();

    // The row the removal named is not there to remove, so the command is
    // refused rather than landed on whatever else is: the container stays gone.
    expect(
      session.getSnapshot().editedSection.fields.introScreen,
    ).toBeUndefined();
  });

  it('does not take the session down when a row was moved', () => {
    const session = openSession({ items: [block('one'), block('two')] });
    session.dispatch([
      { op: 'moveItem', key: ['introScreen', 'items'], from: 1, to: 0 },
    ]);
    expect(() => {
      session.acknowledge({
        fields: stageWith(undefined),
        throughBatchId: 0,
        manifestRevision: revision(2n),
      });
    }).not.toThrow();

    expect(
      session.getSnapshot().editedSection.fields.introScreen,
    ).toBeUndefined();
  });

  /**
   * The control that pins the mechanism on the intermediate segment: an insert
   * at index 0 was always fine, because the index the un-rebased command
   * carried happened to be in range for the empty list the apply engine read.
   */
  it('goes through when the insert is at index 0', () => {
    const session = openSession({ items: [] });
    session.dispatch([
      {
        op: 'insertItem',
        key: ['introScreen', 'items'],
        index: 0,
        item: block('two'),
      },
    ]);
    expect(() => {
      session.acknowledge({
        fields: stageWith(undefined),
        throughBatchId: 0,
        manifestRevision: revision(2n),
      });
    }).not.toThrow();
  });
});

/**
 * The same arrival under a whole-list `set`.
 *
 * A list editor that rewrites a row commits the whole list, so this is the
 * shape the container question takes for every edit the command vocabulary
 * cannot say structurally — and a `set` writes the containers on its way down,
 * which the row commands do not. The merge answers with the rows that survive
 * it, and what the command does with that answer decides whether a container
 * the collaborator switched off comes back.
 */
describe('a whole-list set whose container the arrival has dropped', () => {
  it('is dropped when the merge leaves nothing of the researcher’s', () => {
    const session = openSession({ items: [block('one')] });

    // The researcher rewrites the only block. No single row operation says
    // that, so the diff is the whole-list `set` this merge exists for.
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith({ items: [{ ...block('one'), content: 'Rewritten' }] }),
      ),
    );

    // A collaborator switches the introduction screen off, taking the row the
    // rewrite was about with it.
    session.acknowledge({
      fields: stageWith(undefined),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    // Nothing of the researcher's is left to write, so there is nothing to
    // write it into: a `set []` here would put the switched-off screen back as
    // an empty one.
    expect(
      session.getSnapshot().editedSection.fields.introScreen,
    ).toBeUndefined();
  });

  /**
   * The sibling case, and the rule it leaves standing: a row the researcher
   * ADDED is one the arrival never saw, so switching the screen off says
   * nothing about it and it is written back — container and all, exactly as
   * the `insertItem` above is.
   */
  it('puts back a row the arrival never saw, container and all', () => {
    const session = openSession({ items: [block('one')] });

    // One submit that rewrites the existing block and adds another: again no
    // single row operation, so again a whole-list `set`.
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith({
          items: [{ ...block('one'), content: 'Rewritten' }, block('two')],
        }),
      ),
    );

    session.acknowledge({
      fields: stageWith(undefined),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(itemsOf(session)).toEqual([block('two')]);
  });
});

/**
 * The same container, CREATED on both sides at once.
 *
 * Switching a capability on is a container the draft did not have before, and
 * two researchers can switch the same one on within a round trip of each
 * other — each configuring the part of it they came for.
 */
describe('a container this draft and the arrival both created', () => {
  it('keeps the leaf the arrival wrote beside the one the draft did', () => {
    const session = openSession(undefined);

    // The researcher switches the introduction screen on and writes a block
    // into it, which is one draft change: the container and its list at once.
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith({ items: [block('one')] }),
      ),
    );

    // A collaborator switched the same screen on and gave it a title.
    session.acknowledge({
      fields: stageWith({ title: 'Welcome' }),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(session.getSnapshot().editedSection.fields.introScreen).toEqual({
      title: 'Welcome',
      items: [block('one')],
    });
  });

  /**
   * The other direction, which is the rule this leaves standing: a container
   * the researcher REMOVED goes whole, taking whatever the arrival wrote
   * inside it. Switching a capability off is a decision about the capability,
   * not about the fields that happened to be configured under it when it was
   * switched off — and leaving the container behind because somebody else had
   * just written a leaf into it would say the switch never happened.
   */
  it('removes a container the draft dropped, and the leaf the arrival wrote in it', () => {
    const session = openSession({ items: [block('one')] });
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith(undefined),
      ),
    );

    session.acknowledge({
      fields: stageWith({ items: [block('one')], title: 'Welcome' }),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(
      session.getSnapshot().editedSection.fields.introScreen,
    ).toBeUndefined();
  });
});

/**
 * The control on the other side: the same arrival on a TOP-LEVEL list was
 * always rebased correctly, because the missing key was the LAST segment and
 * the "absent reads as empty" branch was reachable there.
 */
describe('the same arrival on a top-level list', () => {
  const topLevel = (items: unknown[] | undefined): SectionDoc =>
    items === undefined ? { label: 'Info' } : { label: 'Info', items };

  it('is rebased rather than replayed', () => {
    const session = new ProtocolBuilderSessionStore({
      identity: createStageIdentity('Information', () => 'stage-1'),
      fields: topLevel([block('one'), block('two')]),
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
    session.dispatch([{ op: 'removeItem', key: 'items', index: 1 }]);
    expect(() => {
      session.acknowledge({
        fields: topLevel(undefined),
        throughBatchId: 0,
        manifestRevision: revision(2n),
      });
    }).not.toThrow();
  });
});
