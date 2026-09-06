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

  /**
   * Two rows a document really can hold twice.
   *
   * An id-less row's identity IS its content, so a list holding the same row
   * twice holds two rows nothing tells apart — and each ancestor row used to be
   * resolved on its own, by content and then by its ORIGINAL index. A
   * collaborator inserting a row ahead of them shifts both: the first row's
   * index no longer holds its content, so it read as gone, and the second row
   * claimed the same local candidate the first one had. The arrival's unclaimed
   * copy was then treated as a row nobody had ever seen, and the merge emitted
   * BOTH of them alongside the researcher's rewrite.
   */
  it('matches duplicate rows one-to-one rather than duplicating them', () => {
    // A form asking the same question twice, which an older protocol really
    // holds: neither row carries an id, so neither is distinguishable.
    const session = openSession([a, a]);
    // One submit that rewrites the second copy. Content is identity here, so
    // no single row operation says it: a whole-list `set`, the merge case.
    const rewritten = field('a', 'How old are they?');
    edit(session, [a, rewritten]);

    // A collaborator adds a row ABOVE both copies.
    const n = field('n', 'Their name?');
    session.acknowledge({
      fields: stageWith([n, a, a]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    // Three rows: the collaborator's, the copy the researcher left alone, and
    // the one they rewrote. Not four.
    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      n,
      a,
      rewritten,
    ]);
  });

  /**
   * The same pairing, asked of a removal rather than of a `set`.
   *
   * `resolveRowIndex` refuses a row it cannot tell from another, which is right
   * where the answer decides which row an edit is written INTO. A removal only
   * says a row goes, and removing either of two identical rows leaves the same
   * list — so refusing there dropped the researcher's deletion outright, and
   * the row they deleted came back the moment a collaborator touched anything
   * else in the list.
   */
  /**
   * Which copy was deleted, when the copies are not next to each other.
   *
   * Two identical rows with another row BETWEEN them are still two rows nothing
   * tells apart, but the surviving copy's place is not: deleting the first
   * leaves the survivor after `b`, and deleting the second leaves it before.
   * So a removal has to be rebased onto the copy it named — the k-th copy stays
   * the k-th copy — rather than onto whichever copy the pairing deems dropped.
   */
  it('keeps the deletion on the copy the researcher deleted', () => {
    const session = openSession([a, b, a]);
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([b, a]),
      ),
    );
    expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
      { op: 'removeItem', key: ['form', 'fields'], index: 0 },
    ]);

    const n = field('n', 'Their name?');
    session.acknowledge({
      fields: stageWith([n, a, b, a]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    // The first copy went, so the survivor is still the one after `b`.
    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      n,
      b,
      a,
    ]);
  });

  /**
   * The same occurrence question, asked of the row a NEW one follows.
   *
   * Where a row goes is said by naming the row beside it, and a list holding
   * the same row twice names that row twice. Answering with the first copy put
   * the new row in front of both of them, several places from where the
   * researcher had written it.
   */
  it('puts a new row between two identical rows rather than in front of both', () => {
    const session = openSession([a, a]);
    const c = field('c', 'Their city?');
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([a, c, a]),
      ),
    );
    expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
      { op: 'insertItem', key: ['form', 'fields'], index: 1, item: c },
    ]);

    const n = field('n', 'Their name?');
    session.acknowledge({
      fields: stageWith([n, a, a]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      n,
      a,
      c,
      a,
    ]);
  });

  /** And the same again through a whole-list `set`, which merges row by row. */
  it('keeps a row the researcher added after the second of two copies', () => {
    const session = openSession([a, b, a]);
    // One submit that rewrites `b` and adds a row at the end: two changes, so
    // no single row operation says it.
    const rewritten = field('b', 'What do they do?');
    const c = field('c', 'Their city?');
    edit(session, [a, rewritten, a, c]);

    const n = field('n', 'Their name?');
    session.acknowledge({
      fields: stageWith([n, a, b, a]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      n,
      a,
      rewritten,
      a,
      c,
    ]);
  });

  it('keeps the deletion of one of two identical rows', () => {
    const session = openSession([a, a, b]);
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([a, b]),
      ),
    );
    expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
      { op: 'removeItem', key: ['form', 'fields'], index: 1 },
    ]);

    // A collaborator adds a row above everything, which shifts every index the
    // researcher's removal was measured against.
    const n = field('n', 'Their name?');
    session.acknowledge({
      fields: stageWith([n, a, a, b]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      n,
      a,
      b,
    ]);
  });
});

/**
 * A list holding one id twice — a roster imported a second time, a row
 * copy-pasted — where the two copies carry DIFFERENT content.
 *
 * An id is authoritative about which row is which, so two rows carrying one id
 * are two rows the correspondence has to pair off the way it pairs off two
 * copies of an id-less row: in order, one apiece. Order alone is not enough
 * when the copies differ, though. Both sides deleting a different copy leaves
 * each side holding one row that LOOKS like the ancestor's other one, and
 * pairing purely by occurrence reads the survivor as the copy the researcher
 * kept — so their deletion is refused as already applied, and the row they
 * deleted is the one that stays.
 *
 * Content decides first, then: a copy that neither side touched is paired with
 * itself, and occurrence answers only for the copies left over. That is the
 * rule the id-less rows already follow, said for a row whose id cannot tell it
 * from its twin either.
 */
describe('a list holding one id twice', () => {
  const first = { id: 'dup', variable: 'a', prompt: 'Their age?' };
  const second = { id: 'dup', variable: 'b', prompt: 'Their job?' };

  it('keeps both deletions when the two of them delete a copy each', () => {
    const session = openSession([first, second]);
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([first]),
      ),
    );
    expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
      { op: 'removeItem', key: ['form', 'fields'], index: 1 },
    ]);

    // The collaborator deleted the OTHER copy, so what arrives is one row that
    // looks exactly like the one the researcher deleted.
    session.acknowledge({
      fields: stageWith([second]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    // Each of them deleted one row, and each deletion stands.
    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([]);
  });

  /**
   * The control: the copy the researcher kept is the one the collaborator
   * rewrote, so occurrence and content agree and the deletion lands on the
   * copy it named.
   */
  it('keeps the deletion on the named copy when the other one was rewritten', () => {
    const session = openSession([first, second]);
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([first]),
      ),
    );

    const rewritten = { ...first, prompt: 'How old are they?' };
    session.acknowledge({
      fields: stageWith([rewritten, second]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      rewritten,
    ]);
  });
});

/**
 * The same list, where the two copies carry the SAME content.
 *
 * Content is what tells apart two copies of one id that differ, and there is
 * nothing for it to tell apart here: the copies are one row said twice, so the
 * only fact either document holds about which is which is their occurrence.
 * Pairing on content anyway reads a copy the collaborator rewrote as the copy
 * the researcher deleted — the first copy is no longer itself over there, so
 * the search walks past it to the untouched one, and the copy the researcher
 * kept is paired with the row they had nothing to do with. Their deletion then
 * lands on the collaborator's rewrite and takes it away.
 *
 * So content decides only among copies that DIFFER, and occurrence answers for
 * the ones it cannot tell apart: the k-th copy here is the k-th copy there.
 */
describe('a list holding one id twice, the copies identical', () => {
  const copy = { id: 'dup', variable: 'a', prompt: 'Their age?' };
  const rewritten = { ...copy, prompt: 'How old are they?' };

  it('keeps the collaborator’s rewrite when the researcher deleted a copy', () => {
    const session = openSession([copy, copy]);
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([copy]),
      ),
    );
    expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
      { op: 'removeItem', key: ['form', 'fields'], index: 1 },
    ]);

    // The collaborator rewrote the OTHER copy — the one the researcher kept.
    session.acknowledge({
      fields: stageWith([rewritten, copy]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    // One copy went, and the rewrite is not what went with it.
    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      rewritten,
    ]);
  });

  /**
   * The mirror: the researcher rewrote a copy and the collaborator deleted the
   * other one, so the rewrite is theirs to keep this time.
   */
  it('keeps the researcher’s rewrite when the collaborator deleted a copy', () => {
    const session = openSession([copy, copy]);
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([rewritten, copy]),
      ),
    );

    session.acknowledge({
      fields: stageWith([copy]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      rewritten,
    ]);
  });
});

/**
 * The same list, where the copy the researcher's deletion NAMES is the one the
 * collaborator rewrote.
 *
 * Which of two identical copies the researcher deleted is not a fact — the
 * copies were alike when they deleted one — so the deletion is owed a list one
 * copy shorter and the collaborator is owed their rewrite, and dropping a copy
 * nobody touched pays both. It costs the deleted copy's place among the rows
 * around it, which is the only thing the occurrence was carrying and the
 * cheaper of the two things on offer.
 */
describe('a deletion that lands on a copy the collaborator rewrote', () => {
  const copy = { id: 'dup', variable: 'a', prompt: 'Their age?' };
  const rewritten = { ...copy, prompt: 'How old are they?' };
  const other = { id: 'other', variable: 'b', prompt: 'Their job?' };

  it('drops the copy nobody touched instead', () => {
    const session = openSession([copy, other, copy]);
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([other, copy]),
      ),
    );
    expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
      { op: 'removeItem', key: ['form', 'fields'], index: 0 },
    ]);

    session.acknowledge({
      fields: stageWith([rewritten, other, copy]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    // One copy went, and the rewrite is not what went with it.
    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      rewritten,
      other,
    ]);
  });

  /**
   * The same rule for a submit no single row operation explains, which is
   * merged as a whole list rather than replayed as a deletion.
   */
  it('keeps the rewrite when the submit is a whole list', () => {
    const session = openSession([copy, copy]);
    const added = { id: 'new', variable: 'c', prompt: 'Their city?' };
    session.dispatch(
      commandsFromDraftChange(
        session.getSnapshot().editedSection.fields,
        stageWith([copy, added]),
      ),
    );
    expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
      {
        op: 'set',
        key: ['form', 'fields'],
        value: [copy, added],
      },
    ]);

    // The collaborator rewrote the copy the researcher's list no longer holds.
    session.acknowledge({
      fields: stageWith([copy, rewritten]),
      throughBatchId: 0,
      manifestRevision: revision(2n),
    });

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      rewritten,
      added,
    ]);
  });
});
