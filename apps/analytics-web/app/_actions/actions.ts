"use server";

import { db, type EventInsertType } from "~/db/db";
import { eventsTable } from "~/db/schema";

export async function getEvents() {
	try {
		const events = await db.query.eventsTable.findMany({
			orderBy: (events, { desc }) => [desc(events.timestamp)],
		});

		return events;
	} catch (_error) {
		return [];
	}
}

type Events = Awaited<ReturnType<typeof getEvents>>;
export type Event = Events[0];

export async function insertEvent(event: EventInsertType) {
	try {
		const insertedEvent = await db.insert(eventsTable).values(event).returning();

		return { data: insertedEvent, error: null };
	} catch (_error) {
		return { data: null, error: "Error inserting events" };
	}
}
