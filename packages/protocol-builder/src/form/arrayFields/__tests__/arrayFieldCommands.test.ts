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

describe('resolveRowIndex', () => {
  it('follows a row by its own id after the list has moved beneath it', () => {
    // The editor drew [A, B, C] and is acting on B at index 1. A row arrived
    // from elsewhere since, so B is at index 2 now.
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
    // B was retitled elsewhere while this editor was still showing "Bravo",
    // and a row arrived at the front. Position is untrustworthy because the
    // lists have diverged, and the content the editor drew no longer exists
    // anywhere in the list — the id is the only thing left that names B.
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
    // Rendered [A, B, C]; C is dragged to the top. A row arrived at the front
    // since, so "the top of the rows I can see" is index 1, not 0.
    expect(resolveMove([REMOTE, A, B, C], [A, B, C], 2, 0, byId)).toEqual({
      from: 3,
      to: 1,
    });
  });

  it('anchors a move to the bottom on the row the moved one will follow', () => {
    // Rendered [A, B, C]; A is dragged to the bottom, and a row arrived at the
    // front since. Nothing follows A there, so the row it will FOLLOW — C — is
    // the only anchor left, and the destination is the place after it.
    expect(resolveMove([REMOTE, A, B, C], [A, B, C], 0, 2, byId)).toEqual({
      from: 1,
      to: 3,
    });
  });

  it('refuses a move whose row has gone', () => {
    expect(resolveMove([A, C], [A, B, C], 1, 0, byId)).toBeUndefined();
  });
});

describe('commandsForOperation', () => {
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

  it('rebuilds a replacement from the list the session holds now', () => {
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

  it('inserts at the end of the list the session holds now', () => {
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
});

/**
 * The row-level twin of "rebuilt from what the session holds now". Rebuilding
 * the ARRAY keeps a row that arrived from elsewhere; dropping the edited row in
 * whole still discards an arrival that reached another property of that row.
 */
describe('a row that moved while its edit was being composed', () => {
  // The editor drew this prompt and changed its text. Something else changed a
  // property the editor never rendered on the same row meanwhile — a
  // collaborator's edit, an undo, an acknowledgement.
  const drawn = { id: 'b', text: 'Bravo', note: 'as drawn' };
  const arrived = { id: 'b', text: 'Bravo', note: 'from elsewhere' };
  const edited = { id: 'b', text: 'Bravo edited', note: 'as drawn' };

  it('keeps the arrival when a replace commits', () => {
    expect(
      commandsForOperation(
        'prompts',
        [A, arrived],
        [A, drawn],
        { type: 'replace', index: 1, item: edited },
        byId,
      ),
    ).toEqual([
      {
        op: 'set',
        key: 'prompts',
        value: [A, { id: 'b', text: 'Bravo edited', note: 'from elsewhere' }],
      },
    ]);
  });

  it('keeps the arrival when a save that outlived its editor commits', () => {
    expect(
      commandsForDetachedRow(
        'prompts',
        [A, arrived],
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
        value: [A, { id: 'b', text: 'Bravo edited', note: 'from elsewhere' }],
      },
    ]);
  });

  it('keeps an arrival on a SIBLING LEAF of the key the edit changed', () => {
    // A stage document holds a capability as one object, and two people can be
    // inside the same one: this edit set `edges.create` while `edges.display`
    // arrived from elsewhere. Compared key by key, `edges` differs — so the
    // whole object the dialog opened with would be written back, taking
    // `display` with it and undoing a change the editor never rendered.
    const drawnEdges = {
      id: 'b',
      text: 'Bravo',
      edges: { create: 'knows', display: 'as drawn' },
    };
    const arrivedEdges = {
      id: 'b',
      text: 'Bravo',
      edges: { create: 'knows', display: 'from elsewhere' },
    };
    const editedEdges = {
      id: 'b',
      text: 'Bravo',
      edges: { create: 'friends', display: 'as drawn' },
    };

    expect(
      commandsForOperation(
        'prompts',
        [A, arrivedEdges],
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
            edges: { create: 'friends', display: 'from elsewhere' },
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
    const arrivedRules = { id: 'b', rules: [{ property: 'age' }] };
    const editedRules = {
      id: 'b',
      rules: [{ property: 'name' }, { property: 'label' }],
    };

    expect(
      commandsForOperation(
        'prompts',
        [A, arrivedRules],
        [A, drawnRules],
        { type: 'replace', index: 1, item: editedRules },
        byId,
      ),
    ).toEqual([{ op: 'set', key: 'prompts', value: [A, editedRules] }]);
  });

  it('still removes a property the edit itself cleared', () => {
    // Surviving an arrival must not mean ignoring the edit: a key the
    // researcher emptied is emptied, even though the row moved beneath them.
    expect(
      commandsForOperation(
        'prompts',
        [A, arrived],
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
