import { useTable } from '@tanstack/react-table';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { dataTableFeatures } from '@codaco/fresco-ui/DataTable/features';
import { type DataTableColumnDef } from '@codaco/fresco-ui/DataTable/types';
import type { StoredSessionLite } from '~/lib/db/types';

import { DataViewToolbar } from '../DataViewToolbar';

const columns: DataTableColumnDef<StoredSessionLite>[] = [
  { id: 'caseId', accessorKey: 'caseId' },
  { id: 'protocolName', accessorKey: 'protocolName' },
  { id: 'startedAt', accessorKey: 'startedAt' },
  { id: 'updatedAt', accessorKey: 'lastUpdatedAt' },
  { id: 'progress', accessorKey: 'progressPercent' },
  { id: 'exportedAt', accessorKey: 'exportedAt' },
];

function Toolbar() {
  const [globalFilter, setGlobalFilter] = useState('');
  const table = useTable({
    features: dataTableFeatures,
    data: [],
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });
  return (
    <DataViewToolbar
      table={table}
      globalFilter={globalFilter}
      onGlobalFilterChange={setGlobalFilter}
      statusCounts={{ all: 0, inProgress: 0, complete: 0 }}
      protocolOptions={[{ value: 'Family', label: 'Family' }]}
      selectedCount={0}
      exporting={false}
      deleting={false}
      onExport={() => undefined}
      onDelete={() => undefined}
    />
  );
}

afterEach(cleanup);

// A screen reader user moves through the filter panel field by field, so
// each control is named by the heading a sighted user reads above it.
describe('the data view filter panel', () => {
  it('names the panel and every control in it by its heading', async () => {
    render(<Toolbar />);
    await userEvent.click(screen.getByTestId('data-filter-trigger'));
    const panel = await screen.findByRole('dialog', { name: 'Filters' });
    const inPanel = within(panel);

    expect(inPanel.getByRole('textbox')).toHaveAccessibleName('Case ID');
    expect(inPanel.getByRole('combobox')).toHaveAccessibleName('Protocol');

    for (const heading of ['Started', 'Updated']) {
      const dates = inPanel
        .getByRole('group', { name: heading })
        .querySelectorAll('input[type="date"]');
      expect(dates).toHaveLength(2);
      expect(dates[0]).toHaveAccessibleName(heading);
      expect(dates[1]).toHaveAccessibleName('to');
    }

    const exportStatus = inPanel.getByRole('group', { name: 'Export status' });
    expect(within(exportStatus).getAllByRole('checkbox')).toHaveLength(2);

    // Nothing else in the panel is left without a name.
    for (const role of ['textbox', 'combobox', 'button', 'checkbox', 'group']) {
      expect(inPanel.queryAllByRole(role, { name: /^$/ })).toEqual([]);
    }
    // Base UI's form inputs are hidden from screen readers.
    for (const input of panel.querySelectorAll(
      'input:not([aria-hidden="true"])',
    )) {
      expect(input).not.toHaveAccessibleName('');
    }
  });
});
