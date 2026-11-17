import { useTable } from '@tanstack/react-table';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DataTableFacetedFilter } from '../DataTableFacetedFilter';
import { dataTableFeatures } from '../features';
import { type DataTableColumnDef } from '../types';

type Row = { protocol: string };

const columns: DataTableColumnDef<Row>[] = [
  { id: 'protocol', accessorKey: 'protocol' },
];

function Filter({ labelledBy }: { labelledBy?: string }) {
  const table = useTable({ features: dataTableFeatures, data: [], columns });
  return (
    <>
      <div id="protocol-heading">Study</div>
      <DataTableFacetedFilter
        column={table.getColumn('protocol')}
        title="Protocol"
        options={[{ value: 'family', label: 'Family' }]}
        aria-labelledby={labelledBy}
      />
    </>
  );
}

afterEach(cleanup);

describe('DataTableFacetedFilter', () => {
  it('is named by its title', () => {
    render(<Filter />);
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Protocol');
  });

  it('is named by the label it is pointed at', () => {
    render(<Filter labelledBy="protocol-heading" />);
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Study');
  });
});
