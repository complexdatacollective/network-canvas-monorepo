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
 * A list whose value arrives one render after it mounts, as every host form
 * here does. `deliver` is the moment the record lands.
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
 * The enter animation as Motion has written it onto the row, read
 * synchronously and outside `waitFor`: `skipAnimations` finishes an animation
 * on the next frame rather than not starting it, so this is the only window in
 * which the two behaviours differ.
 */
function enterStyleOf(label: string): { opacity: string; transform: string } {
  const row = screen.getByText(label).closest('li');
  if (!row) throw new Error(`no row rendered for ${label}`);
  return { opacity: row.style.opacity, transform: row.style.transform };
}

/**
 * The two states a row can be mounted in, as Motion leaves them in the inline
 * style. Compared whole and by value: a row caught part-way in, at
 * `opacity: 0.2`, animates in just the same as one at 0.
 */
const AT_REST = { opacity: '1', transform: 'none' };
const ENTERING = { opacity: '0', transform: 'scale(0.6)' };

describe('rows that are simply there when the list opens', () => {
  it('does not animate in rows delivered a render after mount', () => {
    render(<Host />);

    act(() => {
      deliver(ROWS);
    });

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

    expect(enterStyleOf('New')).toEqual(ENTERING);
  });

  it('still animates in the first row added to a list that really is empty', () => {
    render(<Host />);

    // No value ever arrives: this list is empty rather than still waiting.
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    expect(enterStyleOf('New')).toEqual(ENTERING);
  });
});
