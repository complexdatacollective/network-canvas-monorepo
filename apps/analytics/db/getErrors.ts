import { db } from "./db";

export default async function getErrors() {
  try {
    const errorEvents = await db.query.eventsTable.findMany({
      where: (events, { eq }) => eq(events.type, "Error"),
      orderBy: (events, { desc }) => [desc(events.timestamp)],
    });

    return errorEvents;
  } catch (error) {
    console.error("Error getting events", error);
    return [];
  }
}

type ErrorEvents = Awaited<ReturnType<typeof getErrors>>;
export type ErrorEvent = ErrorEvents[0];
