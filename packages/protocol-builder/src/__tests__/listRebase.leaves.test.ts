/**
 * Two researchers inside the same ROW of the same list.
 *
 * A list editor that rewrites one row commits a whole-list `set` — the command
 * vocabulary cannot reach inside a row — and the merge that replays such a
 * `set` onto an arrival gave the whole row to whichever side had touched it.
 * That is the right answer for the list (a row the researcher rewrote is
 * theirs) and too coarse for the row itself: the values the `set` carries are
 * the ones the form was rendered from, so a collaborator's edit to a DIFFERENT
 * property of that same row was written back out of existence.
 *
 * It is the same question `reseatEditedRow` already answers for a row a list
 * editor commits directly, asked of a row a rebase is putting back, and it is
 * answered by the same code.
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

const arrives = (
  session: ProtocolBuilderSessionStore,
  fields: readonly SectionDoc[],
) => {
  session.acknowledge({
    fields: stageWith(fields),
    throughBatchId: 0,
    manifestRevision: revision(2n),
  });
};

describe('a row both sides edited', () => {
  const age: SectionDoc = {
    id: 'f-age',
    variable: 'age',
    prompt: 'Their age?',
    component: 'Text',
  };
  const job: SectionDoc = {
    id: 'f-job',
    variable: 'job',
    prompt: 'Their job?',
    component: 'Text',
  };

  it('keeps a collaborator’s edit to a property the submit left alone', () => {
    const session = openSession([age, job]);
    // Rewriting one row of a list is a whole-list `set`: the vocabulary cannot
    // address a row's own properties.
    edit(session, [{ ...age, prompt: 'How old are they?' }, job]);
    expect(session.getSnapshot().pendingCommands[0]?.commands[0]?.op).toBe(
      'set',
    );

    // A collaborator changes that row's input control, not its question.
    arrives(session, [{ ...age, component: 'Number' }, job]);

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      {
        id: 'f-age',
        variable: 'age',
        prompt: 'How old are they?',
        component: 'Number',
      },
      job,
    ]);
  });

  it('gives the researcher the property both of them changed', () => {
    const session = openSession([age, job]);
    edit(session, [{ ...age, prompt: 'How old are they?' }, job]);

    arrives(session, [{ ...age, prompt: 'What age are they?' }, job]);

    // The whole-list rule, said at a leaf: where both sides decided the same
    // thing, the researcher at the keyboard wins.
    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      { ...age, prompt: 'How old are they?' },
      job,
    ]);
  });

  /**
   * The same question one level down, which is where it arrives from: a row
   * holds its validation as an object, and two researchers can be inside it.
   */
  it('keeps a collaborator’s edit to a sibling of the leaf the submit changed', () => {
    const validated = {
      ...age,
      validation: { required: true, minValue: 18 },
    };
    const session = openSession([validated, job]);
    edit(session, [
      { ...validated, validation: { required: false, minValue: 18 } },
      job,
    ]);

    arrives(session, [
      { ...validated, validation: { required: true, minValue: 21 } },
      job,
    ]);

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      { ...age, validation: { required: false, minValue: 21 } },
      job,
    ]);
  });

  /**
   * A row with no id of its own is not merged at all, and there is nothing to
   * merge: its identity IS its content, so a submit that rewrote it reads as
   * removing one row and adding another — from here those are the same edit,
   * and nothing in either document tells them apart. Both rows stand, which is
   * what the whole-list merge says about a row each side added.
   */
  it('leaves an id-less row each side rewrote as two rows', () => {
    const anonymous = { variable: 'age', prompt: 'Their age?' };
    const other = { variable: 'job', prompt: 'Their job?' };
    const session = openSession([anonymous, other]);
    edit(session, [{ ...anonymous, prompt: 'How old are they?' }, other]);

    arrives(session, [{ ...anonymous, component: 'Number' }, other]);

    expect(readFields(session.getSnapshot().editedSection.fields)).toEqual([
      { ...anonymous, component: 'Number' },
      { ...anonymous, prompt: 'How old are they?' },
      other,
    ]);
  });
});
