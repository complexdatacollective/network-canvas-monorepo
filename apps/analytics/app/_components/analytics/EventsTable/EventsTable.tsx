// EventsTable.tsx
import React from "react";
import { DataTable } from "~/components/DataTable/data-table";
import getEvents from "~/db/getEvents";
import { columns } from "./Columns";
import ExportButton from "../../../../components/ExportButton";

export default async function EventsTable() {
  const events = await getEvents();

  return (
    <>
      <ExportButton data={events} filename="events.tsx" />
      <DataTable columns={columns} data={events} pagination={true} />
    </>
  );
}
