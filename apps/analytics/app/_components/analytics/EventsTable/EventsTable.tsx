"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "~/components/DataTable/data-table";
import ExportButton from "~/components/ExportButton";
import { Event } from "~/db/getEvents";
import { columns } from "./Columns";
import TableFilter from "./TableFilter";

export type EventType = {
  text: string;
  isSelected: boolean;
};

export default function EventsTable({ events }: { events: Event[] }) {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);

  useEffect(() => {
    const eventTypesMap = new Map<string, EventType>();
    events.forEach((event) =>
      eventTypesMap.set(event.type, { text: event.type, isSelected: true })
    );

    setEventTypes([...Array.from(eventTypesMap.values())]);
  }, [events]);

  const filteredEvents = useMemo(() => {
    const filters = eventTypes
      .filter((type) => type.isSelected)
      .map((type) => type.text);

    return events.filter((event) => filters.includes(event.type));
  }, [eventTypes, events]);

  return (
    <div>
      <TableFilter eventTypes={eventTypes} setEventTypes={setEventTypes} />

      <div className="flex justify-between items-center mt-2">
        <h2>Events</h2>
        <ExportButton data={events} filename="events.csv" />
      </div>

      <div className="mt-2">
        <DataTable columns={columns} data={filteredEvents} pagination={true} />
      </div>
    </div>
  );
}
