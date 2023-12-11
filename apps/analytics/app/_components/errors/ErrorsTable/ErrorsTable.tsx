import { DataTable } from "~/components/DataTable/data-table";
import getErrors from "~/db/getErrors";
import { columns } from "./Columns";
import ExportButton from "~/components/ExportButton";

export default async function ErrorsTable() {
  const errors = await getErrors();

  return (
    <>
      <ExportButton data={errors} filename="errors.csv" />
      <DataTable columns={columns} data={errors} pagination={true} />
    </>
  );
}
