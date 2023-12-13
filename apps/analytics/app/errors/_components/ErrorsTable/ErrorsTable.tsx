import { DataTable } from "~/components/DataTable/data-table";
import getErrors from "~/db/getErrors";
import { columns } from "./Columns";
import ExportButton from "~/components/ExportButton";

export default async function ErrorsTable() {
  const errors = await getErrors();

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="font-semibold text-white pb-4">Latest Errors</h2>
        <ExportButton data={errors} filename="errors.csv" />
      </div>

      <div className="mt-4">
        <DataTable columns={columns} data={errors} pagination={true} />
      </div>
    </div>
  );
}
