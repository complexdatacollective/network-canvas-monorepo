/**
 * A whole-list `set` merged onto a collaborator's arrival, over rows that carry
 * no `id` of their own.
 *
 * `FormFieldSchema.id` is optional by design — Architect started assigning one
 * and the schema "must tolerate" a protocol that predates that — so a form
 * opened from an older protocol holds rows whose only identity is their
 * content. `mergeListArrival` used to map such a row by POSITION whenever the
 * local edit had kept the list's length, on the reading that such an edit
 * rewrote one row in place. A submit that reorders two rows and rewrites one of
 * them keeps the length too, and there the mapping was wrong for every row at
 * once.
 *
 * Stated against the real session, so the route a researcher takes is visible:
 * one submit is one diff, and a diff no single row operation explains is the
 * whole-list `set` this merge exists for.
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

/** A form field WITHOUT an `id`. */
const field = (variable: string, prompt: string): SectionDoc => ({
  variable,
  prompt,
});

const stageWith = (fields: readonly SectionDoc[]): SectionDoc => ({
  label: 'About them',
  form: { title: 'About them', fields: [...fields] },
});

const readFields = (doc: SectionDoc): unknown => {
  const form = doc.form;
  return typeof form === 'object' && form !== null
    ? Reflect.get(form, 'fields')
    : undefined;
};

function openSession(fields: readonly SectionDoc[]) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('AlterForm', () => 'stage-1'),
    fields: stageWith(fields),
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

/** One form submit: the diff between the draft and what the researcher left. */
function edit(
  session: ProtocolBuilderSessionStore,
  next: readonly SectionDoc[],
) {
  session.dispatch(
    commandsFromDraftChange(
      session.getSnapshot().editedSection.fields,
      stageWith(next),
    ),
  );
}

const variableNames = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map((row) =>
        typeof row === 'object' && row !== null
          ? Reflect.get(row, 'variable')
          : row,
      )
    : value;

describe('an id-less list rebased onto a collaborator’s arrival', () => {
  const a = field('a', 'Their age?');
  const b = field('b', 'Their job?');

  it('keeps a row the researcher added', () => {
    const session = openSession([a, b]);
    // One submit that deletes field `a` and adds field `c`. No single row
    // operation says that, so the diff is a whole-list `set` — the merge case.
    const c = field('c', 'Their city?');
    edit(session, [c, b]);

    // A collaborator deletes field `a`, which the researcher had also deleted.
    session.acknowledge({
      fields: stageWith([b]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    // `c` is a row the researcher created and nobody else said anything about.
    expect(
      variableNames(readFields(session.getSnapshot().editedSection.fields)),
    ).toEqual(['c', 'b']);
  });

  it('keeps the collaborator’s deletion, and the researcher’s rewrite', () => {
    const session = openSession([a, b]);
    // One submit that reorders the two rows and rewrites the other one's
    // question: again no single row operation, so a whole-list `set`.
    edit(session, [{ ...b, prompt: 'What do they do?' }, a]);

    // A collaborator deletes field `a`.
    session.acknowledge({
      fields: stageWith([b]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    const fields = readFields(session.getSnapshot().editedSection.fields);
    // `a` is deleted, and the researcher's rewritten question for `b` stands.
    expect(fields).toEqual([{ variable: 'b', prompt: 'What do they do?' }]);
  });

  /**
   * The control. The same two edits on rows that DO carry an id have always
   * merged correctly, which is what pinned the mechanism on the positional
   * fallback rather than on the merge as a whole.
   */
  it('does the same when the rows carry ids', () => {
    const withId = (id: string, variable: string, prompt: string) => ({
      id,
      variable,
      prompt,
    });
    const idA = withId('f-a', 'a', 'Their age?');
    const idB = withId('f-b', 'b', 'Their job?');

    const added = openSession([idA, idB]);
    edit(added, [withId('f-c', 'c', 'Their city?'), idB]);
    added.acknowledge({
      fields: stageWith([idB]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });
    expect(
      variableNames(readFields(added.getSnapshot().editedSection.fields)),
    ).toEqual(['c', 'b']);

    const reordered = openSession([idA, idB]);
    edit(reordered, [{ ...idB, prompt: 'What do they do?' }, idA]);
    reordered.acknowledge({
      fields: stageWith([idB]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });
    expect(readFields(reordered.getSnapshot().editedSection.fields)).toEqual([
      { id: 'f-b', variable: 'b', prompt: 'What do they do?' },
    ]);
  });
});
