import dotenv from "dotenv";
dotenv.config();

import { db } from "~/lib/db";
import { events } from "~/lib/schema";

async function getEvent() {
  const result = await db.select().from(events);

  console.log("Events: ", result);
}

getEvent();
