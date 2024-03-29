import { DataTable } from '~/components/DataTable/data-table';
import getRegionsTotals from '~/utils/getRegionsTotals';
import { columns } from './Columns';
import { type Event } from '~/app/_actions/actions';

export default function ErrorsTable({ events }: { events: Event[] }) {
  const regionsTotals = getRegionsTotals(events);
  return <DataTable columns={columns} data={regionsTotals} pagination={true} />;
}
