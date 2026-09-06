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
