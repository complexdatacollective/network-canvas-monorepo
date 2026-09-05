import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import StageEditorShell from '../../StageEditorShell.tsx';
import {
  ArrayFieldBindingContext,
  useArrayFieldCommands,
  type ArrayFieldCommands,
  type ArrayWriteOutcome,
} from '../useArrayFieldCommands.ts';

type Row = { id?: string; text?: string };

const byId = (row: Row) => row.id;

const A: Row = { id: 'a', text: 'Alpha' };
const B: Row = { id: 'b', text: 'Bravo' };

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Array commands test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

/**
 * The hook as a list editor holds it, inside a real stage form.
 *
 * A row operation is what reaches it in the product, but the branches below
 * belong to the hook: whether a list is bound to a document key at all, and
 * what a save that outlived its editing session may commit. Driving them
 * through a particular list would make each of them a fact about that list.
 */
function renderCommands(
  session: ProtocolBuilderSessionStore,
  rendered: readonly Row[],
  documentKey: string | undefined,
  onChange: (next: Row[]) => void,
) {
  const held: { commands?: ArrayFieldCommands<Row> } = {};

  function Probe() {
    held.commands = useArrayFieldCommands<Row>(rendered, onChange, byId);
    return null;
  }

  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        {documentKey === undefined ? (
          <Probe />
        ) : (
          <ArrayFieldBindingContext value={{ documentKey }}>
            <Probe />
          </ArrayFieldBindingContext>
        )}
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );

  return held.commands!;
}

describe('a list bound to a document key', () => {
  it('takes the list operations, so each row edit commits as what it was', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    // Handed to `ArrayField`, which then reports the operation rather than
    // just the new array. An unbound list has no key to address and answers
    // `undefined`, so this is the whole difference between the two.
    expect(commands.onOperation).toBeTypeOf('function');
  });

  it('commits a save that outlived its editor onto the row it was made on', () => {
    const session = createSession({ prompts: [A, B] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A, B], 'prompts', onChange);

    let committed: ArrayWriteOutcome | undefined;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    expect(committed).toEqual({ kind: 'written' });
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      A,
      { id: 'b', text: 'Bravo edited' },
    ]);
  });

  it('answers no when the row it was asked to commit to has gone', () => {
    const session = createSession({ prompts: [A] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A, B], 'prompts', onChange);

    let committed: ArrayWriteOutcome | undefined;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    // There is nothing left to commit the edit to, and appending it would add
    // back a row the researcher deleted. Answering yes — or answering no
    // without saying why — is what closes the dialog over an edit that reached
    // nothing.
    expect(committed).toEqual({ kind: 'refused', reason: 'row-removed' });
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([A]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * The value a bound list is pointed at is whatever the stage document holds at
 * that key, and an import, a migration or a legacy protocol can leave it as
 * something that is not a list at all. Every reader in the editor shows that
 * as an empty list with a working Add button, so the write behind that button
 * has to make the document hold the list it has been showing.
 */
describe('a list bound to a key the document does not hold as a list', () => {
  const legacyShape = () => ({ prompts: { text: 'a legacy object' } });

  it('replaces the foreign value in the same batch, so the added row lands in a list', () => {
    const session = createSession(legacyShape());
    const onChange = vi.fn();
    // What every reader renders for a value that is not a list of rows, and
    // therefore what the operation's index was resolved against.
    const commands = renderCommands(session, [], 'prompts', onChange);

    act(() => {
      commands.onOperation?.({ type: 'insert', index: 0, item: { id: 'n' } });
    });

    // Applying the insert alone throws `ApplyError("Field prompts is not a
    // list")` out of the click handler, which nothing above catches.
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      { id: 'n' },
    ]);
    expect(onChange).toHaveBeenCalledWith([{ id: 'n' }]);
    // ONE batch, so it is one entry in the history: undoing the add the
    // researcher made puts back what it replaced rather than half of it.
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.commands),
    ).toEqual([
      [
        { op: 'set', key: 'prompts', value: [] },
        { op: 'insertItem', key: 'prompts', index: 0, item: { id: 'n' } },
      ],
    ]);
  });

  it('replaces it for a save that outlived its editor too', () => {
    const session = createSession(legacyShape());
    const onChange = vi.fn();
    const commands = renderCommands(session, [], 'prompts', onChange);

    let committed: ArrayWriteOutcome | undefined;
    act(() => {
      committed = commands.commitDetachedRow({ id: 'n' }, 'n', true);
    });

    // The other write that can reach a foreign value: a row still being added
    // when its dialog outlived the list it was opened from.
    expect(committed).toEqual({ kind: 'written' });
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      { id: 'n' },
    ]);
  });

  it('writes nothing at all for an operation naming a row the value has not got', () => {
    const session = createSession(legacyShape());
    const onChange = vi.fn();
    // `ArrayField`'s own optimistic copy still showing a row the document
    // never took: the only way a remove, move or edit can be issued here.
    const commands = renderCommands(session, [A], 'prompts', onChange);

    act(() => {
      commands.onOperation?.({ type: 'remove', index: 0 });
    });
    act(() => {
      commands.onOperation?.({ type: 'move', from: 0, to: 1 });
    });
    act(() => {
      commands.onOperation?.({
        type: 'replace',
        index: 0,
        item: { id: 'a', text: 'Alpha edited' },
      });
    });

    // None of the three has a row to address, and a repair issued on its own
    // would throw the value away for an edit that never happened.
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual({
      text: 'a legacy object',
    });
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('treats an absent list as the empty list it already is, repairing nothing', () => {
    const session = createSession({});
    const commands = renderCommands(session, [], 'prompts', vi.fn());

    act(() => {
      commands.onOperation?.({ type: 'insert', index: 0, item: { id: 'n' } });
    });

    // A key the document does not hold is an empty list to the apply engine
    // as much as to every reader here, so there is nothing foreign to replace
    // and no `set` belongs in front of the insert.
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.commands),
    ).toEqual([
      [{ op: 'insertItem', key: 'prompts', index: 0, item: { id: 'n' } }],
    ]);
  });
});

/**
 * A hole is an entry the document holds that is not a row at all — `null`,
 * `undefined`, a string an import or a migration left behind. It is a document
 * row the editor does not render, and `ArrayField` refuses a value holding one
 * outright: the WHOLE list draws as empty, so its Add reports index 0 however
 * many rows the document has.
 *
 * Every command carries a position in the DOCUMENT, so what these pin is that
 * a position is never replayed as a document index.
 */
describe('a list the document holds with a hole in it', () => {
  // The only operation an editor that drew no rows can report.
  const addFirstRow = { type: 'insert', index: 0, item: { id: 'n' } } as const;

  it('appends past a leading hole rather than landing in front of it', () => {
    const session = createSession({ prompts: [null, A] });
    // What the field was handed, and therefore what `ArrayField` refused to
    // draw. Read as the rows on screen, index 0 is "before Alpha".
    const commands = renderCommands(
      session,
      [null as unknown as Row, A],
      'prompts',
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.(addFirstRow);
    });

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      null,
      A,
      { id: 'n' },
    ]);
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.commands),
    ).toEqual([
      [{ op: 'insertItem', key: 'prompts', index: 2, item: { id: 'n' } }],
    ]);
  });

  it('appends past a trailing hole', () => {
    const session = createSession({ prompts: [A, null] });
    const commands = renderCommands(
      session,
      [A, null as unknown as Row],
      'prompts',
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.(addFirstRow);
    });

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      A,
      null,
      { id: 'n' },
    ]);
  });

  it('appends past a hole between two rows', () => {
    const session = createSession({ prompts: [A, null, B] });
    const commands = renderCommands(
      session,
      [A, null as unknown as Row, B],
      'prompts',
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.(addFirstRow);
    });

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      A,
      null,
      B,
      { id: 'n' },
    ]);
  });

  it('issues nothing for an operation naming a row the editor never drew', () => {
    const session = createSession({ prompts: [null, A] });
    const onChange = vi.fn();
    const commands = renderCommands(
      session,
      [null as unknown as Row, A],
      'prompts',
      onChange,
    );

    act(() => {
      commands.onOperation?.({ type: 'remove', index: 1 });
    });
    act(() => {
      commands.onOperation?.({ type: 'move', from: 1, to: 0 });
    });

    // The list drew no rows, so nothing on screen could have been dragged or
    // deleted. Reading index 1 as Alpha's row would be a write the researcher
    // never made — and asking a row's id of a hole throws out of the click
    // handler on the way there.
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      null,
      A,
    ]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * The list came back on screen — the hook writes the rows the researcher can
 * see back to the form (`readRows`, which drops the hole), while the document
 * keeps it. From here the control and the document are numbered differently,
 * which is the ordinary state of this editor after any write over a holed
 * list.
 */
describe('a list drawn without the hole its document still holds', () => {
  it('inserts before the row on screen, at its document index', () => {
    const session = createSession({ prompts: [null, A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    act(() => {
      commands.onOperation?.({ type: 'insert', index: 1, item: { id: 'n' } });
    });

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      null,
      A,
      { id: 'n' },
      B,
    ]);
  });

  it('appends to the end of the document, not the end of the rows drawn', () => {
    const session = createSession({ prompts: [null, A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    act(() => {
      commands.onOperation?.({ type: 'insert', index: 2, item: { id: 'n' } });
    });

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      null,
      A,
      B,
      { id: 'n' },
    ]);
  });

  it('removes the row it names at its document index', () => {
    const session = createSession({ prompts: [null, A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    act(() => {
      commands.onOperation?.({ type: 'remove', index: 0 });
    });

    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      null,
      B,
    ]);
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.commands),
    ).toEqual([[{ op: 'removeItem', key: 'prompts', index: 1 }]]);
  });

  it('moves a row between document indices, leaving the hole where it is', () => {
    const session = createSession({ prompts: [null, A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    act(() => {
      commands.onOperation?.({ type: 'move', from: 1, to: 0 });
    });

    // Bravo above Alpha, and the hole still the document's first entry — a
    // move the researcher made among the rows on screen cannot reach past
    // them.
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      null,
      B,
      A,
    ]);
  });
});

describe('a list with no document key of its own', () => {
  it('withholds the list operations, so it commits as an ordinary value', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], undefined, vi.fn());

    // A list nested inside a row dialog is committed as part of the row around
    // it. Writing its rows into the document as they change would commit half
    // of an edit the researcher can still cancel.
    expect(commands.onOperation).toBeUndefined();
  });

  it('answers no when the row it was asked to commit to has gone', () => {
    const session = createSession({ prompts: [A, B] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A], undefined, onChange);

    let committed: ArrayWriteOutcome | undefined;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    expect(committed).toEqual({ kind: 'refused', reason: 'row-removed' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('appends a row that was still being added when its editor went', () => {
    const session = createSession({ prompts: [A, B] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A], undefined, onChange);

    let committed: ArrayWriteOutcome | undefined;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'n', text: 'New' },
        'n',
        true,
      );
    });

    // The one exception to the rule above: a row being added was never in the
    // list to begin with, so there is no wrong row for it to land on.
    expect(committed).toEqual({ kind: 'written' });
    expect(onChange).toHaveBeenCalledWith([A, { id: 'n', text: 'New' }]);
  });
});

/**
 * Every route out of this hook that does not write, and the reason it gives.
 *
 * The defect this enumerates is one this file's own seam kept producing: a
 * write path that could answer "no" without saying why, next to a caller — a
 * row dialog — that reads silence as a save and closes itself over the
 * researcher's draft. Each round of review found one more branch that had not
 * been wired into the refusal signal, so the branches are listed here rather
 * than being discovered one at a time.
 *
 * `written` is asserted alongside them deliberately: a test that only pins the
 * refusals passes just as well against a write path that refuses everything.
 */
describe('what a list write answers', () => {
  it('is written when the commands reach the document', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => {
        commands.onOperation?.({ type: 'remove', index: 1 });
      });
    });

    expect(outcome).toEqual({ kind: 'written' });
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([A]);
  });

  it('names the row it could not resolve when an operation reaches no row', () => {
    // The document has moved on, and the row the operation names carries no id
    // to be found by — so it is matched by content, and two rows the
    // researcher cannot tell apart match it equally. Resolving to either would
    // be a guess; resolving to neither must not read as a save.
    const twin = { text: 'Same' };
    const session = createSession({ prompts: [null, twin, twin] });
    const commands = renderCommands(session, [twin, twin], 'prompts', vi.fn());

    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => {
        commands.onOperation?.({
          type: 'replace',
          index: 0,
          item: { text: 'Edited' },
        });
      });
    });

    expect(outcome).toEqual({ kind: 'refused', reason: 'row-unresolved' });
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      null,
      twin,
      twin,
    ]);
  });

  it('names the session when the stage will not take the write', () => {
    const session = createSession({ prompts: [A, B] });
    act(() => {
      session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    let operated: ArrayWriteOutcome | undefined;
    let detached: ArrayWriteOutcome | undefined;
    act(() => {
      operated = commands.writeThrough(() => {
        commands.onOperation?.({ type: 'remove', index: 1 });
      });
      detached = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    // Both routes to the document, so neither can be the one that forgets.
    expect(operated).toEqual({ kind: 'refused', reason: 'session-refused' });
    expect(detached).toEqual({ kind: 'refused', reason: 'session-refused' });
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([A, B]);
  });

  it('refuses a dispatch through a bound list that wrote nothing at all', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    // What `ArrayField`'s own save handler does when it is no longer editing
    // the row: it returns, silently, having issued no operation. A bound list
    // reaches the document by no other route, so silence here is a write that
    // did not happen.
    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => undefined);
    });

    expect(outcome).toEqual({ kind: 'refused', reason: 'row-removed' });
  });

  it('accepts a dispatch through an unbound list that wrote nothing at all', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], undefined, vi.fn());

    // An unbound list has no document key to address: its rows commit through
    // the form value the handler was handed, so the dispatch itself IS the
    // write and there is nothing here to have gone missing.
    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => undefined);
    });

    expect(outcome).toEqual({ kind: 'written' });
  });

  it('does not spend one write’s answer on the next', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    act(() => {
      commands.onOperation?.({ type: 'remove', index: 1 });
    });

    // A write made outside any dispatch this reads. Left standing, it would be
    // read as the verdict on a save that issued nothing — which is the whole
    // shape of the defect this seam replaced.
    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => undefined);
    });

    expect(outcome).toEqual({ kind: 'refused', reason: 'row-removed' });
  });
});
