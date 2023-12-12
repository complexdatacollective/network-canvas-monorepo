import { DataTable } from "~/components/DataTable/data-table";
import getErrors from "~/db/getErrors";
import { columns } from "./Columns";

export default async function ErrorsTable() {
  const errors = await getErrors();
  return <DataTable columns={columns} data={errors} pagination={true} />;
}
