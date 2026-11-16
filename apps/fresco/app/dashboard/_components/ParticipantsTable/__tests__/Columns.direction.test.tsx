// A participant's identifier and label are written by the researcher, in any
// script, whatever language the dashboard is shown in. Each takes its reading
// direction from its own content: otherwise "team-b!" in an Arabic dashboard
// is drawn as "!team-b", and an Arabic label in an English dashboard has its
// punctuation on the wrong side.
import { flexRender } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { getParticipantColumns } from '~/app/dashboard/_components/ParticipantsTable/Columns';
import type { ParticipantRow } from '~/app/dashboard/_components/ParticipantsTable/ParticipantsTableClient';
import { useClientDataTable } from '~/hooks/useClientDataTable';

const participant: ParticipantRow = {
  id: 'participant-1',
  identifier: 'team-b!',
  label: 'Group (B).',
  interviews: [],
  _count: { interviews: 0 },
};

const columns = getParticipantColumns(
  createAppIntl({ locale: 'en' }),
  [],
).filter(
  (column) =>
    'accessorKey' in column &&
    (column.accessorKey === 'identifier' || column.accessorKey === 'label'),
);

function Cells() {
  const { table } = useClientDataTable({ data: [participant], columns });
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe('the participants table’s researcher-written text', () => {
  it.each([participant.identifier, participant.label ?? ''])(
    'lets “%s” take its direction from its own content, on the interface’s side',
    (text) => {
      render(
        <NuqsTestingAdapter>
          <Cells />
        </NuqsTestingAdapter>,
      );

      const element = screen.getByText(text);
      expect(element).toHaveAttribute('dir', 'auto');
      expect(element).toHaveClass('text-match-parent');
    },
  );
});
