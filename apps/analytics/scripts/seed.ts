import dotenv from "dotenv";
dotenv.config();

import { faker } from "@faker-js/faker";
import { db } from "~/db/db";
import { eventsTable } from "~/db/schema";
import { type EventInsertType } from "~/db/db";

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
      const timestamp = faker.date.recent();
      const metadata = {
        details: faker.lorem.sentence(),
        path: faker.lorem.sentence(),
      };
      const isocode = faker.location.countryCode();
      const message = faker.lorem.sentence();
      const name = faker.lorem.sentence();
      const stack = faker.lorem.sentence();

      const event: EventInsertType = {
        type,
        metadata,
        timestamp,
        installationId,
        isocode,
        message,
        name,
        stack,
      };

      await db.insert(eventsTable).values(event).returning();
    }
  } catch (error) {
    console.error("Error seeding events", error);
  }

  process.exit();
}

(async () => {
  await seedEvents();
})();
