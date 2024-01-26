// EventsTable.tsx
import { DataTable } from "~/components/DataTable/data-table";
import ExportButton from "~/components/ExportButton";
import getEvents from "~/db/getEvents";
import { columns } from "./Columns";

export default async function EventsTable() {
  const events = await getEvents();

  return (
    <div>
      <div className="flex justify-between">
        <h2>Events</h2>
        <ExportButton data={events} filename="events.csv" />
      </div>

      <div className="mt-4">
        <DataTable columns={columns} data={events} pagination={true} />
      </div>
    </div>
  );
}
