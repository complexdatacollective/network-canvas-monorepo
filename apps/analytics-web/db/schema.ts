import {
  json,
  pgTable,
  serial,
  text,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";

export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // Todo: make this use pgEnum with the eventTypes array.
    installationId: text("installationId").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    countryISOCode: text("countryISOCode").notNull(),
    message: text("message"),
    name: text("name"),
    stack: text("stack"),
    cause: text("cause"),
    metadata: json("metadata"),
  },
  (events) => {
    return {
      uniqueIdx: uniqueIndex("unique_idx").on(events.id),
    };
  }
);
