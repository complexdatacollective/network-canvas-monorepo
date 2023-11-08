import { DataTable } from "@/components/DataTable/data-table";
import getEvents from "@/db/getEvents";
import { columns } from "./Columns";

export default async function ErrorsTable() {
  const events = await getEvents();
  return <DataTable columns={columns} data={events} pagination={true} />;
}
