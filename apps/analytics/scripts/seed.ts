import dotenv from "dotenv";
dotenv.config();

import { db } from "~/lib/db";
import { events } from "~/lib/schema";
import { faker } from "@faker-js/faker";
import { sql } from "@vercel/postgres";

type Event = typeof events.$inferInsert;

let installationIds: string[] = [];
for (let i = 0; i < 20; i++) {
  installationIds.push(faker.string.uuid());
}

const eventTypes = [
  "AppSetup",
  "ProtocolInstalled",
  "InterviewStarted",
  "InterviewCompleted",
  "InterviewCompleted",
  "DataExported",
  "Error",
];

async function seedEvents() {
  console.info("Starting to seed events");

  try {
    for (let i = 0; i < 100; i++) {
      const type = faker.helpers.arrayElement(eventTypes);
      const installationId = faker.helpers.arrayElement(installationIds);
      const timestamp = faker.date.recent().toDateString();
      const metadata = {
        details: faker.lorem.sentence(),
        path: faker.lorem.sentence(),
      };
      const isocode = faker.location.countryCode();
      const message = faker.lorem.sentence();
      const name = faker.lorem.sentence();
      const stack = faker.lorem.sentence();

      const event: Event = {
        type,
        metadata,
        timestamp,
        installationId,
        isocode,
        message,
        name,
        stack,
      };

      await db.insert(events).values(event).returning();
    }
  } catch (error) {
    console.error("Error seeding events", error);
  }

  process.exit();
}

async function checkTables() {
  const result = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema='public' 
    AND table_type='BASE TABLE';
  `;

  console.log(result.rows);
}

(async () => {
  await seedEvents();
})();
