import { type EventInsertType, db } from "./db";
import { eventsTable } from "~/db/schema";

export default async function insertEvent(event: EventInsertType) {
  try {
    const insertedEvent = await db
      .insert(eventsTable)
      .values(event)
      .returning();

    return { data: insertedEvent, error: null };
  } catch (error) {
    console.error("Error inserting events", error);
    return { data: null, error: "Error inserting events" };
  }
}
