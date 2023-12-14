// EventsTable.tsx
import React from "react";
import { DataTable } from "~/components/DataTable/data-table";
import getEvents from "~/db/getEvents";
import { columns } from "./Columns";
import ExportButton from "../../../../components/ExportButton";
import { Card, CardHeader, CardContent } from "~/components/ui/card";

export default async function EventsTable() {
  const events = await getEvents();

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          Events
          <ExportButton data={events} filename="events.csv" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mt-4">
          <DataTable columns={columns} data={events} pagination={true} />
        </div>
      </CardContent>
    </Card>
  );
}
