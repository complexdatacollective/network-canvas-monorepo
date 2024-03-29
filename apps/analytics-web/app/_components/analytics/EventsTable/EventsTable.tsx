'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEvents, type Event } from '~/app/_actions/actions';
import { DataTable } from '~/components/DataTable/data-table';
import ExportButton from '~/components/ExportButton';
import { getColumns } from './Columns';

export type EventType = {
  text: string;
  isSelected: boolean;
};

export default function EventsTable() {
  const [events, setEvents] = useState<Event[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);

  const fetchEvents = useCallback(async () => {
    const data = await getEvents();
    setEvents(data);
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const eventTypesMap = new Map<string, EventType>();
    events.forEach((event) =>
      eventTypesMap.set(event.type, { text: event.type, isSelected: true }),
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
    <>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <h2>Events</h2>
          {!events.length && <p>Loading...</p>}
        </div>
        {!!events.length && (
          <ExportButton data={events} filename="events.csv" />
        )}
      </div>

      <div className="mt-2 rounded-md bg-card">
        {!!events.length && (
          <DataTable
            columns={getColumns(eventTypes, setEventTypes)}
            data={filteredEvents}
            pagination={true}
          />
        )}
      </div>
    </>
  );
}
