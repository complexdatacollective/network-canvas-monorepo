import { describe, expect, it } from 'vitest';

import {
  commandsForDetachedRow,
  commandsForOperation,
  resolveInsertIndex,
  resolveMove,
  resolveRowIndex,
} from '../arrayFieldCommands.ts';

type Row = { id?: string; text?: string };

const byId = (row: Row) => row.id;

const A = { id: 'a', text: 'Alpha' };
const B = { id: 'b', text: 'Bravo' };
const C = { id: 'c', text: 'Charlie' };
const REMOTE = { id: 'x', text: 'Remote' };

/**
 * Every function here takes the list the DOCUMENT holds and the rows the
 * EDITOR drew, and the two diverge in ordinary use: a list holding an entry
 * that is not a row at all draws none of it, `ArrayField` renders each
 * mutation out of its own state before the document has taken it, and a drag
 * measures its two ends against whatever the list held at each. `REMOTE` below
 * is a row the document holds and the editor never drew.
 */

describe('resolveRowIndex', () => {
  it('follows a row by its own id after the list has moved beneath it', () => {
    // The editor drew [A, B, C] and is acting on B at index 1. The document
    // holds a row in front of them, so B is at index 2 there.
    expect(resolveRowIndex([REMOTE, A, B, C], [A, B, C], 1, byId)).toBe(2);
  });

  it('refuses when the row it names has left the list', () => {
    // Replaying index 1 here would hit C — a different prompt entirely.
    expect(resolveRowIndex([A, C], [A, B, C], 1, byId)).toBeUndefined();
  });

  it('prefers position over content for rows with no id', () => {
    // Two blank option rows are indistinguishable by content. Position is the
    // only thing that tells them apart, and it is trustworthy while the two
    // lists are still the same list.
    const blanks = [{}, {}];
    expect(resolveRowIndex(blanks, blanks, 1)).toBe(1);
  });

  it('falls back to content for rows with no id once the list has moved', () => {
    const rendered = [{ text: 'first' }, { text: 'second' }];
    const current = [{ text: 'remote' }, ...rendered];
    expect(resolveRowIndex(current, rendered, 1)).toBe(2);
  });

  it('refuses rather than guess between two identical id-less rows', () => {
    const rendered = [{ text: 'same' }, { text: 'same' }];
    const current = [{ text: 'remote' }, ...rendered];
    expect(resolveRowIndex(current, rendered, 0)).toBeUndefined();
  });

  it('finds a row nothing but its id could still name', () => {
    // B was retitled while this editor was still showing "Bravo", and the
    // document holds a row in front of them. Position is untrustworthy because
    // the lists have diverged, and the content the editor drew no longer
    // exists anywhere in the list — the id is the only thing left that names
    // B.
    const current = [REMOTE, A, { id: 'b', text: 'Bravo, revised' }];
    expect(resolveRowIndex(current, [A, B], 1, byId)).toBe(2);
  });
});

describe('resolveInsertIndex', () => {
  it('keeps an append an append when the list has grown elsewhere', () => {
    expect(resolveInsertIndex([REMOTE, A, B], [A, B], 2, byId)).toBe(3);
  });

  it('keeps an insert before a known row before that row', () => {
    expect(resolveInsertIndex([REMOTE, A, B], [A, B], 1, byId)).toBe(2);
  });
});

describe('resolveMove', () => {
  it('replays a move unchanged while the list has not moved', () => {
    expect(resolveMove([A, B, C], [A, B, C], 2, 0, byId)).toEqual({
      from: 2,
      to: 0,
    });
  });

  it('anchors the destination on the row the moved one will follow', () => {
    // Rendered [A, B, C]; C is dragged to the top. The document holds a row in
    // front of them, so "the top of the rows I can see" is index 1, not 0.
    expect(resolveMove([REMOTE, A, B, C], [A, B, C], 2, 0, byId)).toEqual({
      from: 3,
      to: 1,
    });
  });

  it('anchors a move to the bottom on the row the moved one will follow', () => {
    // Rendered [A, B, C]; A is dragged to the bottom, and the document holds a
    // row in front of them. Nothing follows A there, so the row it will
    // FOLLOW — C — is the only anchor left, and the destination is the place
    // after it.
    expect(resolveMove([REMOTE, A, B, C], [A, B, C], 0, 2, byId)).toEqual({
      from: 1,
      to: 3,
    });
  });

  it('anchors on the nearest surviving row when the one it would follow has gone', () => {
    // Rendered [A, B, C]; A is dragged to the bottom, and C has been deleted
    // since. The row A was to follow is gone, and the row it was also moving
    // past still says where it belongs: after B.
    expect(resolveMove([A, B], [A, B, C], 0, 2, byId)).toEqual({
      from: 0,
      to: 1,
    });
  });

  it('anchors on the nearest surviving row it precedes when the rows above have gone', () => {
    // Rendered [A, B, C]; C is dragged to the top, and A has been deleted
    // since. Nothing the researcher could see survives above C's destination,
    // so the row it will PRECEDE is the anchor, and C stays in front of B.
    expect(resolveMove([B, C], [A, B, C], 2, 0, byId)).toEqual({
      from: 1,
      to: 0,
    });
  });

  it('refuses a move whose row has gone', () => {
    expect(resolveMove([A, C], [A, B, C], 1, 0, byId)).toBeUndefined();
  });

  it('refuses a move no row the editor could see still anchors', () => {
    // Rendered [A, B, C]; A is dragged to the bottom. Both rows it was to move
    // past have gone, and the row standing in their place is one the
    // researcher never saw — nothing they did says where A belongs beside it.
    expect(resolveMove([REMOTE, A], [A, B, C], 0, 2, byId)).toBeUndefined();
  });
});

describe('commandsForOperation', () => {
  /**
   * A drag whose two ends were measured against two different lists.
   *
   * `ArrayField` takes a pointer drag's `from` when the pointer goes DOWN and
   * its `to` when it comes up, and re-syncs its rows from the value in
   * between — so a list that gains a row mid-drag leaves `from` numbering a
   * list that no longer exists. Reading it as a position in the list as it
   * stands now picks up whichever row has since taken that place.
   */
  it('moves the row the drag picked up, not the one now at its old index', () => {
    // The researcher took hold of A at the top of [A, B, C] and dropped it
    // below B. A row appeared at the front while the pointer was down, so the
    // drop was measured against [X, A, B, C] — where A is index 2.
    expect(
      commandsForOperation(
        'prompts',
        [REMOTE, A, B, C],
        [REMOTE, A, B, C],
        { type: 'move', from: 0, to: 2, item: A },
        byId,
      ),
    ).toEqual([{ op: 'moveItem', key: 'prompts', from: 1, to: 2 }]);
  });

  it('moves one of two rows nothing but position tells apart', () => {
    // An options list may legitimately hold two blank rows. Neither carries an
    // id and their content is identical, so the row a drag picked up cannot be
    // named — but the list has not moved, so `from` still names it, and moving
    // either of two identical rows produces the same array anyway.
    const blank = {};
    expect(
      commandsForOperation('options', [blank, blank, A], [blank, blank, A], {
        type: 'move',
        from: 0,
        to: 2,
        item: blank,
      }),
    ).toEqual([{ op: 'moveItem', key: 'options', from: 0, to: 2 }]);
  });

  it('issues nothing when the row a drag picked up has since gone', () => {
    expect(
      commandsForOperation(
        'prompts',
        [REMOTE, B, C],
        [REMOTE, B, C],
        { type: 'move', from: 0, to: 2, item: A },
        byId,
      ),
    ).toEqual([]);
  });

  it('removes the row the editor named, not the index it drew it at', () => {
    expect(
      commandsForOperation(
        'prompts',
        [REMOTE, A, B],
        [A, B],
        { type: 'remove', index: 0 },
        byId,
      ),
    ).toEqual([{ op: 'removeItem', key: 'prompts', index: 1 }]);
  });

  it('issues nothing when the row to remove has already gone', () => {
    expect(
      commandsForOperation(
        'prompts',
        [A],
        [A, B],
        { type: 'remove', index: 1 },
        byId,
      ),
    ).toEqual([]);
  });

  it('rebuilds a replacement from the list the document holds now', () => {
    const edited = { id: 'b', text: 'Bravo edited' };
    expect(
      commandsForOperation(
        'prompts',
        [REMOTE, A, B],
        [A, B],
        { type: 'replace', index: 1, item: edited },
        byId,
      ),
    ).toEqual([{ op: 'set', key: 'prompts', value: [REMOTE, A, edited] }]);
  });

  it('inserts at the end of the list the document holds now', () => {
    const added = { id: 'n', text: 'New' };
    expect(
      commandsForOperation(
        'prompts',
        [REMOTE, A, B],
        [A, B],
        { type: 'insert', index: 2, item: added },
        byId,
      ),
    ).toEqual([{ op: 'insertItem', key: 'prompts', index: 3, item: added }]);
  });

  it('draws no rows out of a value that is not a list at all', () => {
    const added = { id: 'n', text: 'New' };
    // What a list field is handed when an import, a migration or a legacy
    // protocol left something else at its key. The editor drew an empty list
    // for it, so the operation numbers rows in a list with none in it — and
    // reading `.every` off the value itself would take the editor down out of
    // an ordinary Add click.
    expect(
      commandsForOperation(
        'prompts',
        [],
        'legacy',
        { type: 'insert', index: 0, item: added },
        byId,
      ),
    ).toEqual([{ op: 'insertItem', key: 'prompts', index: 0, item: added }]);
  });

  it('refuses a row named against a value that is not a list at all', () => {
    // No row was drawn, so there is no row the operation can name — and
    // replaying its index onto the document would remove whatever now sits
    // there.
    expect(
      commandsForOperation(
        'prompts',
        [A, B],
        { text: 'not a list' },
        { type: 'remove', index: 0 },
        byId,
      ),
    ).toEqual([]);
  });
});

/**
 * The row-level twin of "rebuilt from what the document holds now". Rebuilding
 * the ARRAY keeps a row the editor never drew; dropping the edited row in whole
 * still discards a change that reached another property of that row.
 */
describe('a row that moved while its edit was being composed', () => {
  // The editor drew this prompt and changed its text. A property the editor
  // never rendered moved on the same row meanwhile — another control on the
  // page owning it, or a repair the list made on its way to the write.
  const drawn = { id: 'b', text: 'Bravo', note: 'as drawn' };
  const moved = { id: 'b', text: 'Bravo', note: 'moved since' };
  const edited = { id: 'b', text: 'Bravo edited', note: 'as drawn' };

  it('keeps that change when a replace commits', () => {
    expect(
      commandsForOperation(
        'prompts',
        [A, moved],
        [A, drawn],
        { type: 'replace', index: 1, item: edited },
        byId,
      ),
    ).toEqual([
      {
        op: 'set',
        key: 'prompts',
        value: [A, { id: 'b', text: 'Bravo edited', note: 'moved since' }],
      },
    ]);
  });

  it('keeps that change when a save that outlived its editor commits', () => {
    expect(
      commandsForDetachedRow(
        'prompts',
        [A, moved],
        edited,
        'b',
        false,
        byId,
        drawn,
      ),
    ).toEqual([
      {
        op: 'set',
        key: 'prompts',
        value: [A, { id: 'b', text: 'Bravo edited', note: 'moved since' }],
      },
    ]);
  });

  it('keeps a change to a SIBLING LEAF of the key the edit changed', () => {
    // A stage document holds a capability as one object, and two controls can
    // be inside the same one: this edit set `edges.create` while
    // `edges.display` moved elsewhere on the page. Compared key by key, `edges` differs — so the
    // whole object the dialog opened with would be written back, taking
    // `display` with it and discarding a change the editor never rendered.
    const drawnEdges = {
      id: 'b',
      text: 'Bravo',
      edges: { create: 'knows', display: 'as drawn' },
    };
    const movedEdges = {
      id: 'b',
      text: 'Bravo',
      edges: { create: 'knows', display: 'moved since' },
    };
    const editedEdges = {
      id: 'b',
      text: 'Bravo',
      edges: { create: 'friends', display: 'as drawn' },
    };

    expect(
      commandsForOperation(
        'prompts',
        [A, movedEdges],
        [A, drawnEdges],
        { type: 'replace', index: 1, item: editedEdges },
        byId,
      ),
    ).toEqual([
      {
        op: 'set',
        key: 'prompts',
        value: [
          A,
          {
            id: 'b',
            text: 'Bravo',
            edges: { create: 'friends', display: 'moved since' },
          },
        ],
      },
    ]);
  });

  it('treats a list inside the row as one leaf', () => {
    // Rows of a nested list have no identity here, so merging two versions of
    // it index by index would combine rows that are not the same row. The edit
    // changed it, so the edit's list is the one that is written.
    const drawnRules = { id: 'b', rules: [{ property: 'name' }] };
    const movedRules = { id: 'b', rules: [{ property: 'age' }] };
    const editedRules = {
      id: 'b',
      rules: [{ property: 'name' }, { property: 'label' }],
    };

    expect(
      commandsForOperation(
        'prompts',
        [A, movedRules],
        [A, drawnRules],
        { type: 'replace', index: 1, item: editedRules },
        byId,
      ),
    ).toEqual([{ op: 'set', key: 'prompts', value: [A, editedRules] }]);
  });

  it('still removes a property the edit itself cleared', () => {
    // Surviving the row's other movement must not mean ignoring the edit: a
    // key the researcher emptied is emptied, even though the row moved
    // beneath them.
    expect(
      commandsForOperation(
        'prompts',
        [A, moved],
        [A, drawn],
        { type: 'replace', index: 1, item: { id: 'b', text: 'Bravo' } },
        byId,
      ),
    ).toEqual([
      { op: 'set', key: 'prompts', value: [A, { id: 'b', text: 'Bravo' }] },
    ]);
  });
});

describe('commandsForDetachedRow', () => {
  it('commits an edit onto the row it was made on', () => {
    const edited = { id: 'b', text: 'Bravo edited' };
    expect(
      commandsForDetachedRow(
        'prompts',
        [REMOTE, A, B],
        edited,
        'b',
        false,
        byId,
      ),
    ).toEqual([{ op: 'set', key: 'prompts', value: [REMOTE, A, edited] }]);
  });

  it('appends a row that was still being added', () => {
    const added = { id: 'n', text: 'New' };
    expect(
      commandsForDetachedRow('prompts', [A], added, 'n', true, byId),
    ).toEqual([{ op: 'insertItem', key: 'prompts', index: 1, item: added }]);
  });

  it('commits nothing to a row that was deleted while the save was running', () => {
    expect(
      commandsForDetachedRow(
        'prompts',
        [A],
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
        byId,
      ),
    ).toEqual([]);
  });
});
