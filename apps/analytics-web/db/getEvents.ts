import { db } from "./db";

export default async function getEvents() {
  try {
    const events = await db.query.eventsTable.findMany({
      orderBy: (events, { desc }) => [desc(events.timestamp)],
    });

    return events;
  } catch (error) {
    console.error("Error getting events", error);
    return [];
  }
}

type Events = Awaited<ReturnType<typeof getEvents>>;
export type Event = Events[0];
