import { DataTable } from "~/components/DataTable/data-table";
import getRegionsTotals from "~/utils/getRegionsTotals";
import { columns } from "./Columns";

export default async function ErrorsTable() {
  const regionsTotals = await getRegionsTotals();
  return (
    <div>
      <div className="flex justify-between">
        <h2 className="font-semibold text-white pb-4">Top Regions</h2>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} data={regionsTotals} pagination={true} />
      </div>
    </div>
  );
}
