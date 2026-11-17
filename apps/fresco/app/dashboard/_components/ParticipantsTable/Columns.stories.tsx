import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { flexRender } from '@tanstack/react-table';
import { expect, within } from 'storybook/test';

import { useAppIntl } from '@codaco/app-i18n/react';
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

function ResearcherTextCells() {
  const intl = useAppIntl();
  const columns = getParticipantColumns(intl, []).filter(
    (column) =>
      'accessorKey' in column &&
      (column.accessorKey === 'identifier' || column.accessorKey === 'label'),
  );
  const { table } = useClientDataTable({ data: [participant], columns });
  return (
    <table className="w-96">
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

const meta = {
  title: 'Dashboard/ParticipantsTable/Researcher-written text',
  component: ResearcherTextCells,
  parameters: {
    nextjs: { appDirectory: true },
  },
} satisfies Meta<typeof ResearcherTextCells>;

export default meta;
type Story = StoryObj<typeof meta>;

const alignment = (canvasElement: HTMLElement, text: string) =>
  getComputedStyle(within(canvasElement).getByText(text)).textAlign;

// A participant's identifier and label take their reading direction from
// their own content, but sit on the interface's side of the cell: an
// identifier written left to right lines up on the right in a right-to-left
// dashboard, like the rest of the column.
export const InARightToLeftInterface: Story = {
  globals: { appDirection: 'rtl' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.ownerDocument.documentElement.dir).toBe('rtl');
    for (const text of [participant.identifier, participant.label ?? '']) {
      await expect({ text, align: alignment(canvasElement, text) }).toEqual({
        text,
        align: 'right',
      });
    }
  },
};
