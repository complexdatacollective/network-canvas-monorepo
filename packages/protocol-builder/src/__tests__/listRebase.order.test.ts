/**
 * The ORDER a whole-list `set` carries, merged onto a collaborator's arrival.
 *
 * A submit that makes several structural edits at once — move a row up, then
 * add another — is one diff, and no single row operation says it, so it is
 * committed as a whole-list `set`. The merge that replays such a `set` onto a
 * base that has moved used to take the arrival's order for every surviving row,
 * on the reading that a `set` is about a row's CONTENTS and that a reorder
 * arrives as a `moveItem`. That reading is right for a submit that reordered
 * nothing and wrong for one that did: the researcher's move was dropped on the
 * floor the moment a collaborator inserted a row before the batch was
 * acknowledged, and every row carried an id.
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

const variableNames = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map((row) =>
        typeof row === 'object' && row !== null
          ? Reflect.get(row, 'variable')
          : row,
      )
    : value;

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

describe('a reordering submit rebased onto a collaborator’s arrival', () => {
  const identified = (variable: string): SectionDoc => ({
    id: `f-${variable}`,
    variable,
    prompt: `Their ${variable}?`,
  });
  const anonymous = (variable: string): SectionDoc => ({
    variable,
    prompt: `Their ${variable}?`,
  });

  for (const [rows, row] of [
    ['carrying ids', identified],
    ['carrying none', anonymous],
  ] as const) {
    describe(`rows ${rows}`, () => {
      const a = row('age');
      const b = row('job');
      const c = row('city');
      const x = row('email');
      const z = row('name');

      it('keeps a move the same submit made beside an append', () => {
        const session = openSession([a, b, c]);
        // One submit: `b` moved above `a`, and `x` added at the end. Two
        // structural edits, so no single row operation says it — the
        // whole-list `set` this merge exists for.
        edit(session, [b, a, c, x]);
        expect(session.getSnapshot().pendingCommands[0]?.commands).toEqual([
          {
            op: 'set',
            key: ['form', 'fields'],
            value: [b, a, c, x],
          },
        ]);

        // A collaborator inserts a row between `b` and `c`.
        arrives(session, [a, b, z, c]);

        // The collaborator's row is there, and so is the researcher's move.
        expect(
          variableNames(readFields(session.getSnapshot().editedSection.fields)),
        ).toEqual(['job', 'age', 'name', 'city', 'email']);
      });

      /**
       * The other direction, which the arrival's order is right for. A submit
       * that moved nothing says nothing about where the rows are, so a
       * collaborator's reorder of them stands.
       */
      it('leaves a collaborator’s reorder alone when the submit made none', () => {
        const d = row('phone');
        const session = openSession([a, b, c, d]);
        // Again two structural edits in one submit, so again a whole-list
        // `set` — but this one leaves every surviving row where it found it.
        edit(session, [a, b, c, x]);
        expect(session.getSnapshot().pendingCommands[0]?.commands[0]?.op).toBe(
          'set',
        );

        // A collaborator swaps the first two rows.
        arrives(session, [b, a, c, d]);

        expect(
          variableNames(readFields(session.getSnapshot().editedSection.fields)),
        ).toEqual(['job', 'age', 'city', 'email']);
      });
    });
  }
});
