import { DataTable } from "~/components/DataTable/data-table";
import getRegionsTotals from "~/utils/getRegionsTotals";
import { columns } from "./Columns";

export default async function ErrorsTable() {
  const regionsTotals = await getRegionsTotals();
  return (
    <div className="mt-4">
      <DataTable columns={columns} data={regionsTotals} pagination={true} />
    </div>
  );
}
