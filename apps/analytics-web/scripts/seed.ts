import dotenv from "dotenv";
dotenv.config();

import { eventTypes } from "@codaco/analytics";
import { faker } from "@faker-js/faker";
import { type EventInsertType, db } from "~/db/db";
import { eventsTable } from "~/db/schema";

const installationIds: string[] = [];
for (let i = 0; i < 20; i++) {
	installationIds.push(faker.string.uuid());
}

async function seedEvents() {
	try {
		for (let i = 0; i < 100; i++) {
			const type = faker.helpers.arrayElement([...eventTypes, "Error"]);
			const installationId = faker.helpers.arrayElement(installationIds);
			const timestamp = faker.date.recent();
			const metadata = {
				details: faker.lorem.sentence(),
				path: faker.lorem.sentence(),
			};
			const countryIsoCode = faker.location.countryCode();
			const message = faker.lorem.sentence();
			const name = faker.lorem.sentence();
			const stack = faker.lorem.sentence();
			const cause = faker.lorem.sentence();

			const noneErrorEvent: EventInsertType = {
				type,
				installationId,
				timestamp,
				metadata,
				countryISOCode: countryIsoCode,
			};

			const errorEvent: EventInsertType = {
				type,
				installationId,
				timestamp,
				metadata,
				countryISOCode: countryIsoCode,
				message,
				name,
				stack,
				cause,
			};

			await db
				.insert(eventsTable)
				.values(type === "Error" ? errorEvent : noneErrorEvent)
				.returning();
		}
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: <explanation>
		console.error(error);
		process.exit(1);
	}

	process.exit();
}

await seedEvents();
