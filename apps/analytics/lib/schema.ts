import { json, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

// Create a pgTable that maps to a table in your DB
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    installationId: text("installationId").notNull(),
    timestamp: text("timestamp").notNull(),
    isocode: text("isocode"),
    message: text("message"),
    name: text("name"),
    stack: text("stack"),
    metadata: json("metadata"),
  },
  (events) => {
    return {
      uniqueIdx: uniqueIndex("unique_idx").on(events.id),
    };
  }
);
