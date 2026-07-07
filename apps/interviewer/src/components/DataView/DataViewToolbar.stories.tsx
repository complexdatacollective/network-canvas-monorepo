import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';

import type { StoredSessionLite } from '~/lib/db/types';

import { DataViewToolbar } from './DataViewToolbar';
import type { SessionStatusCounts } from './useSessionQuery';

// DataViewToolbar only ever reads/writes column filter state via
// `table.getColumn(id)`/`table.getState().columnFilters` — it never renders
// table rows or headers (DataTable does that). So a real TanStack table with
// bare id-only column defs for the six filterable columns is enough to drive
// it; no need for the full useDataViewColumns/useSessionQuery machinery.
const columns: ColumnDef<StoredSessionLite>[] = [
  { id: 'caseId', accessorKey: 'caseId' },
  { id: 'protocolName', accessorKey: 'protocolName' },
  { id: 'startedAt', accessorKey: 'startedAt' },
  { id: 'updatedAt', accessorKey: 'lastUpdatedAt' },
  { id: 'progress', accessorKey: 'progressPercent' },
  { id: 'exportedAt', accessorKey: 'exportedAt' },
];

const statusCounts: SessionStatusCounts = {
  all: 12,
  inProgress: 5,
  complete: 7,
};

const protocolOptions = [
  { value: 'Family Mapping', label: 'Family Mapping' },
  { value: 'Community Ties', label: 'Community Ties' },
];

type StoryArgs = { selectedCount: number };

function ToolbarHarness({ selectedCount }: StoryArgs) {
  const [globalFilter, setGlobalFilter] = useState('');
  const table = useReactTable({
    data: [],
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DataViewToolbar
      table={table}
      globalFilter={globalFilter}
      onGlobalFilterChange={setGlobalFilter}
      statusCounts={statusCounts}
      protocolOptions={protocolOptions}
      selectedCount={selectedCount}
      exporting={false}
      deleting={false}
      pendingShare={false}
      onExport={() => {
        // No-op in the story: no export pipeline to run.
      }}
      onDelete={() => {
        // No-op in the story: no rows to delete.
      }}
      onShareReady={() => {
        // No-op in the story: no pending export to hand off.
      }}
    />
  );
}

const meta: Meta<StoryArgs> = {
  title: 'Components/DataView/DataViewToolbar',
  parameters: { layout: 'padded' },
  args: { selectedCount: 0 },
  argTypes: {
    selectedCount: { control: { type: 'number', min: 0, max: 12 } },
  },
  render: (args) => <ToolbarHarness {...args} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Selecting rows reveals the bulk delete/export actions.
export const ActiveSelection: Story = {
  args: { selectedCount: 4 },
};
