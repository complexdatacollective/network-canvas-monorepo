import { db } from "./db";

export default async function getEvents() {
  try {
    const events = await db.query.eventsTable.findMany({
      where: (events, { ne }) => ne(events.type, "Error"),
      orderBy: (events, { desc }) => [desc(events.timestamp)],
      columns: {
        name: false,
        message: false,
        stack: false,
      },
    });

    return events;
  } catch (error) {
    console.error("Error getting events", error);
    return [];
  }
}

type Events = Awaited<ReturnType<typeof getEvents>>;
export type Event = Events[0];
