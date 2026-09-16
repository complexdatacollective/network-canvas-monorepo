import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';
import ArrayField, { type ArrayFieldItemProps } from './ArrayField';

type Row = { id: string; label: string };

function LabelledRow({ item }: ArrayFieldItemProps<Row>) {
  return <span>{item.label}</span>;
}

const ROWS: Row[] = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'bravo', label: 'Bravo' },
];

/**
 * A list whose value arrives one render after it mounts — what every host form
 * in this repository does, because a form hands its fields their registered
 * default before the record it is editing has been read. `deliver` is the
 * moment the record lands.
 */
let deliver: (rows: Row[]) => void;

function Host({ initialRows = [] as Row[] }: { initialRows?: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  deliver = setRows;

  return (
    <DialogProvider>
      <ArrayField<Row>
        value={rows}
        getId={(item) => item.id}
        onChange={(next) => setRows(next ?? [])}
        itemComponent={LabelledRow}
        itemTemplate={() => ({ id: `row-${Math.random()}`, label: 'New' })}
        immediateAdd
      />
    </DialogProvider>
  );
}

/**
 * The enter animation as Motion has written it onto the row, read from the
 * element's own inline style.
 *
 * Read SYNCHRONOUSLY after the render that mounts the row, and outside
 * `waitFor`: unit tests run with `MotionGlobalConfig.skipAnimations`, which
 * makes an animation finish on the next frame rather than not start at all, so
 * a row that animates in is back at its resting values a frame later. This is
 * the only window in which the two behaviours differ — which is also what
 * makes the assertion able to fail.
 */
function enterStyleOf(label: string): { opacity: string; transform: string } {
  const row = screen.getByText(label).closest('li');
  if (!row) throw new Error(`no row rendered for ${label}`);
  return { opacity: row.style.opacity, transform: row.style.transform };
}

/**
 * The two states a row can be mounted in, exactly as Motion leaves them in the
 * element's inline style.
 *
 * Both are measured rather than reasoned about: Motion writes out whichever
 * variant `initial` resolves to, so a row that is not animating carries an
 * explicit `opacity: 1; transform: none`, not an absent declaration.
 *
 * They are compared whole, and by value. Asserting merely that a row is NOT at
 * `opacity: 0` and NOT at `scale(0.6)` would pass a row mounted part-way into
 * the animation — at `opacity: 0.2`, say, or `scale(0.8)` — which is a row
 * that animates in just the same. Only the resting values themselves rule
 * that out.
 */
const AT_REST = { opacity: '1', transform: 'none' };
const ENTERING = { opacity: '0', transform: 'scale(0.6)' };

describe('rows that are simply there when the list opens', () => {
  it('does not animate in rows delivered a render after mount', () => {
    render(<Host />);

    act(() => {
      deliver(ROWS);
    });

    // Both rows are at rest the instant they are mounted — fully opaque and
    // unscaled. A row that animated in would be at `ENTERING` here, and a row
    // that animated in from anywhere else would be at neither.
    for (const { label } of ROWS) {
      expect(enterStyleOf(label), label).toEqual(AT_REST);
    }
  });

  it('does not animate in rows the list is mounted with', () => {
    render(<Host initialRows={ROWS} />);

    for (const { label } of ROWS) {
      expect(enterStyleOf(label), label).toEqual(AT_REST);
    }
  });

  it('still animates in a row the researcher adds', () => {
    render(<Host />);

    act(() => {
      deliver(ROWS);
    });

    // `fireEvent` rather than `userEvent`: the row's enter state has to be read
    // in the same turn the click renders it, and `userEvent`'s await gives the
    // skipped animation the frame it needs to finish.
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    // The row the researcher asked for is the one thing in this list that
    // SHOULD arrive animating.
    expect(enterStyleOf('New')).toEqual(ENTERING);
  });

  it('still animates in the first row added to a list that really is empty', () => {
    render(<Host />);

    // No value ever arrives: this list is empty because it has nothing in it,
    // not because it is still waiting. Its first row is an add like any other.
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    expect(enterStyleOf('New')).toEqual(ENTERING);
  });
});
