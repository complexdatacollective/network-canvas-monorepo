import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { createStageDraftProbe } from '../../__tests__/stageDraftProbe.tsx';
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

/**
 * The hook as a list editor holds it, inside a real stage form.
 *
 * A row operation is what reaches it in the product, but the branches below
 * belong to the hook: whether a list is bound to a place in the document at
 * all, and what a save that outlived its own row editor may commit. Driving
 * them through a particular list would make each of them a fact about that
 * list.
 *
 * `prompts` is not a key an Information page's schema declares, so the stage
 * is never saved here: what the write reached is read out of the document the
 * editor is holding, which is the very value a save would assemble.
 */
function renderCommands(
  fields: SectionDoc,
  rendered: readonly Row[],
  documentPath: readonly string[] | undefined,
  onChange: (next: Row[]) => void,
  { readOnly = false }: Readonly<{ readOnly?: boolean }> = {},
) {
  const held: { commands?: ArrayFieldCommands<Row> } = {};
  const { probe, draft } = createStageDraftProbe();

  function Probe() {
    held.commands = useArrayFieldCommands<Row>(rendered, onChange, byId);
    return null;
  }

  renderStageEditor({
    stage: { type: 'Information', fields },
    ...(readOnly ? { readOnly: true } : {}),
    sections: (
      <>
        {probe}
        {documentPath === undefined ? (
          <Probe />
        ) : (
          <ArrayFieldBindingContext value={{ documentPath }}>
            <Probe />
          </ArrayFieldBindingContext>
        )}
      </>
    ),
  });

  const { commands } = held;
  if (commands === undefined) {
    throw new Error(
      'nothing mounted the list, so there are no commands to drive',
    );
  }
  return { commands, prompts: () => draft().prompts };
}

describe('a list bound to a document path', () => {
  it('takes the list operations, so each row edit commits as what it was', () => {
    const { commands } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

    // Handed to `ArrayField`, which then reports the operation rather than
    // just the new array. An unbound list has no key to address and answers
    // `undefined`, so this is the whole difference between the two.
    expect(commands.onOperation).toBeTypeOf('function');
  });

  it('commits a save that outlived its editor onto the row it was made on', () => {
    const onChange = vi.fn();
    const { commands, prompts } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      ['prompts'],
      onChange,
    );

    let committed: ArrayWriteOutcome | undefined;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    expect(committed).toEqual({ kind: 'written' });
    expect(prompts()).toEqual([A, { id: 'b', text: 'Bravo edited' }]);
  });

  it('answers no when the row it was asked to commit to has gone', () => {
    const onChange = vi.fn();
    const { commands, prompts } = renderCommands(
      { prompts: [A] },
      [A, B],
      ['prompts'],
      onChange,
    );

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
    expect(prompts()).toEqual([A]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * The value a bound list is pointed at is whatever the stage document holds at
 * that path, and an import, a migration or a legacy protocol can leave it as
 * something that is not a list at all. Every reader in the editor shows that
 * as an empty list with a working Add button, so the write behind that button
 * has to make the document hold the list it has been showing.
 */
describe('a list bound to a path the document does not hold as a list', () => {
  const legacyShape = () => ({ prompts: { text: 'a legacy object' } });

  it('replaces the foreign value, so the added row lands in a list', () => {
    const onChange = vi.fn();
    // What every reader renders for a value that is not a list of rows, and
    // therefore what the operation's index was resolved against.
    const { commands, prompts } = renderCommands(
      legacyShape(),
      [],
      ['prompts'],
      onChange,
    );

    let answered: boolean | undefined;
    act(() => {
      answered = commands.onOperation?.({
        type: 'insert',
        index: 0,
        item: { id: 'n' },
      });
    });

    // The answer `ArrayField` keeps its own rows by. Pinned beside the
    // refusals below, because a list that answered "no" to everything would
    // satisfy them on its own.
    expect(answered).toBe(true);
    // Applying the insert alone throws `ApplyError("Field prompts is not a
    // list")` out of the click handler, which nothing above catches.
    expect(prompts()).toEqual([{ id: 'n' }]);
    expect(onChange).toHaveBeenCalledWith([{ id: 'n' }]);
  });

  it('replaces it for a save that outlived its editor too', () => {
    const onChange = vi.fn();
    const { commands, prompts } = renderCommands(
      legacyShape(),
      [],
      ['prompts'],
      onChange,
    );

    let committed: ArrayWriteOutcome | undefined;
    act(() => {
      committed = commands.commitDetachedRow({ id: 'n' }, 'n', true);
    });

    // The other write that can reach a foreign value: a row still being added
    // when its dialog outlived the list it was opened from.
    expect(committed).toEqual({ kind: 'written' });
    expect(prompts()).toEqual([{ id: 'n' }]);
  });

  it('writes nothing at all for an operation naming a row the value has not got', () => {
    const onChange = vi.fn();
    // `ArrayField`'s own optimistic copy still showing a row the document
    // never took: the only way a remove, move or edit can be issued here.
    const { commands, prompts } = renderCommands(
      legacyShape(),
      [A],
      ['prompts'],
      onChange,
    );

    const answers: (boolean | undefined)[] = [];
    act(() => {
      answers.push(commands.onOperation?.({ type: 'remove', index: 0 }));
    });
    act(() => {
      answers.push(
        commands.onOperation?.({ type: 'move', from: 0, to: 1, item: A }),
      );
    });
    act(() => {
      answers.push(
        commands.onOperation?.({
          type: 'replace',
          index: 0,
          item: { id: 'a', text: 'Alpha edited' },
        }),
      );
    });

    // None of the three has a row to address, and a repair issued on its own
    // would throw the value away for an edit that never happened.
    expect(prompts()).toEqual({ text: 'a legacy object' });
    // A refused operation puts the control back to the rows the document holds
    // — but only when the document holds rows. Writing the empty list into the
    // form value here would replace the legacy object at the next submit, which
    // is the same discard by a slower route.
    expect(onChange).not.toHaveBeenCalled();
    // Which leaves nothing for the value to say, so the answer has to say it:
    // `ArrayField` drew each of these out of its own state before reporting it
    // and re-reads the value only when the value CHANGES. Unanswered, the row
    // an Add put on screen would stay there for good — in a list the document
    // has not got, where every later edit of it is refused too.
    expect(answers).toEqual([false, false, false]);
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
    // What the field was handed, and therefore what `ArrayField` refused to
    // draw. Read as the rows on screen, index 0 is "before Alpha".
    const { commands, prompts } = renderCommands(
      { prompts: [null, A] },
      [null as unknown as Row, A],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.(addFirstRow);
    });

    expect(prompts()).toEqual([null, A, { id: 'n' }]);
  });

  it('appends past a trailing hole', () => {
    const { commands, prompts } = renderCommands(
      { prompts: [A, null] },
      [A, null as unknown as Row],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.(addFirstRow);
    });

    expect(prompts()).toEqual([A, null, { id: 'n' }]);
  });

  it('appends past a hole between two rows', () => {
    const { commands, prompts } = renderCommands(
      { prompts: [A, null, B] },
      [A, null as unknown as Row, B],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.(addFirstRow);
    });

    expect(prompts()).toEqual([A, null, B, { id: 'n' }]);
  });

  it('issues nothing for an operation naming a row the editor never drew', () => {
    const onChange = vi.fn();
    const { commands, prompts } = renderCommands(
      { prompts: [null, A] },
      [null as unknown as Row, A],
      ['prompts'],
      onChange,
    );

    act(() => {
      commands.onOperation?.({ type: 'remove', index: 1 });
    });
    act(() => {
      commands.onOperation?.({ type: 'move', from: 1, to: 0, item: A });
    });

    // The list drew no rows, so nothing on screen could have been dragged or
    // deleted. Reading index 1 as Alpha's row would be a write the researcher
    // never made — and asking a row's id of a hole throws out of the click
    // handler on the way there.
    expect(prompts()).toEqual([null, A]);
    // Nothing was written, so the control is handed the rows the document
    // still holds — the hole dropped, exactly as a written operation drops it.
    // `ArrayField` renders each mutation out of its own state before this runs
    // and re-reads the value only when the value changes, so this is the whole
    // of what puts a refused edit back off the screen.
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith([A]);
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
    const { commands, prompts } = renderCommands(
      { prompts: [null, A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.({ type: 'insert', index: 1, item: { id: 'n' } });
    });

    expect(prompts()).toEqual([null, A, { id: 'n' }, B]);
  });

  it('appends to the end of the document, not the end of the rows drawn', () => {
    const { commands, prompts } = renderCommands(
      { prompts: [null, A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.({ type: 'insert', index: 2, item: { id: 'n' } });
    });

    expect(prompts()).toEqual([null, A, B, { id: 'n' }]);
  });

  it('removes the row it names at its document index', () => {
    const { commands, prompts } = renderCommands(
      { prompts: [null, A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.({ type: 'remove', index: 0 });
    });

    expect(prompts()).toEqual([null, B]);
  });

  /**
   * A drag whose two ends were measured against two different lists.
   *
   * `ArrayField` takes a pointer drag's `from` when the pointer goes DOWN and
   * its `to` when it comes up, and re-syncs its rows from the value in
   * between — a real window of seconds, not a race. A row arriving from
   * elsewhere during it leaves `from` numbering a list that no longer exists,
   * and reading it as a position in the list as it stands now moves whichever
   * row has since taken that place.
   */
  it('moves the row a drag picked up, not the one now at its old index', () => {
    const C: Row = { id: 'c', text: 'Charlie' };
    const X: Row = { id: 'x', text: 'Remote' };
    // The researcher took hold of Alpha at the top of [A, B, C]. X arrived at
    // the front while the pointer was down, so the drop was measured against
    // [X, A, B, C] and asked for the place below Bravo.
    const { commands, prompts } = renderCommands(
      { prompts: [X, A, B, C] },
      [X, A, B, C],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.({ type: 'move', from: 0, to: 2, item: A });
    });

    expect(prompts()).toEqual([X, B, A, C]);
  });

  it('moves a row between document indices, leaving the hole where it is', () => {
    const { commands, prompts } = renderCommands(
      { prompts: [null, A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

    act(() => {
      commands.onOperation?.({ type: 'move', from: 1, to: 0, item: B });
    });

    // Bravo above Alpha, and the hole still the document's first entry — a
    // move the researcher made among the rows on screen cannot reach past
    // them.
    expect(prompts()).toEqual([null, B, A]);
  });
});

describe('a list with no document path of its own', () => {
  it('withholds the list operations, so it commits as an ordinary value', () => {
    const { commands } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      undefined,
      vi.fn(),
    );

    // A list nested inside a row dialog is committed as part of the row around
    // it. Writing its rows into the document as they change would commit half
    // of an edit the researcher can still cancel.
    expect(commands.onOperation).toBeUndefined();
  });

  it('answers no when the row it was asked to commit to has gone', () => {
    const onChange = vi.fn();
    const { commands } = renderCommands(
      { prompts: [A, B] },
      [A],
      undefined,
      onChange,
    );

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
    const onChange = vi.fn();
    const { commands } = renderCommands(
      { prompts: [A, B] },
      [A],
      undefined,
      onChange,
    );

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
    const { commands, prompts } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => {
        commands.onOperation?.({ type: 'remove', index: 1 });
      });
    });

    expect(outcome).toEqual({ kind: 'written' });
    expect(prompts()).toEqual([A]);
  });

  it('names the row it could not resolve when an operation reaches no row', () => {
    // The document has moved on, and the row the operation names carries no id
    // to be found by — so it is matched by content, and two rows the
    // researcher cannot tell apart match it equally. Resolving to either would
    // be a guess; resolving to neither must not read as a save.
    const twin = { text: 'Same' };
    const { commands, prompts } = renderCommands(
      { prompts: [null, twin, twin] },
      [twin, twin],
      ['prompts'],
      vi.fn(),
    );

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
    expect(prompts()).toEqual([null, twin, twin]);
  });

  it('names the row when a drag’s own row left the list while it was held', () => {
    // A drag lasts as long as the pointer is down, which is long enough for
    // the row being dragged to be deleted from elsewhere. Nothing is left to
    // move, and no amount of looking at the list again will bring it back —
    // which is what tells this apart from a row that could not be matched.
    const { commands, prompts } = renderCommands(
      { prompts: [B] },
      [B],
      ['prompts'],
      vi.fn(),
    );

    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => {
        commands.onOperation?.({ type: 'move', from: 0, to: 1, item: A });
      });
    });

    expect(outcome).toEqual({ kind: 'refused', reason: 'row-removed' });
    expect(prompts()).toEqual([B]);
  });

  it('names the stage when it will not take the write', () => {
    const { commands, prompts } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
      { readOnly: true },
    );

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
    expect(operated).toEqual({ kind: 'refused', reason: 'read-only' });
    expect(detached).toEqual({ kind: 'refused', reason: 'read-only' });
    expect(prompts()).toEqual([A, B]);
  });

  it('refuses a dispatch through a bound list that wrote nothing at all', () => {
    const { commands } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

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
    const { commands } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      undefined,
      vi.fn(),
    );

    // An unbound list has no document path to address: its rows commit through
    // the form value the handler was handed, so the dispatch itself IS the
    // write and there is nothing here to have gone missing.
    let outcome: ArrayWriteOutcome | undefined;
    act(() => {
      outcome = commands.writeThrough(() => undefined);
    });

    expect(outcome).toEqual({ kind: 'written' });
  });

  it('does not spend one write’s answer on the next', () => {
    const { commands } = renderCommands(
      { prompts: [A, B] },
      [A, B],
      ['prompts'],
      vi.fn(),
    );

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
