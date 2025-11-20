import dotenv from "dotenv";

dotenv.config();

import { faker } from "@faker-js/faker";
import { db, type EventInsertType } from "~/db/db";
import { eventsTable } from "~/db/schema";
import { eventTypes } from "~/lib/analytics-types";

const installationIds: string[] = [];
for (let i = 0; i < 20; i++) {
	installationIds.push(faker.string.uuid());
}

async function seedEvents() {
	try {
		const eventPromises = [];

		for (let i = 0; i < 100; i++) {
			const type = faker.helpers.arrayElement([...eventTypes, "Error"]);
			const installationId = faker.helpers.arrayElement(installationIds);
			const timestamp = faker.date.recent();
			const metadata = {
				details: faker.lorem.sentence(),
				path: faker.lorem.sentence(),
			};
			const countryISOCode = faker.location.countryCode();
			const message = faker.lorem.sentence();
			const name = faker.lorem.sentence();
			const stack = faker.lorem.sentence();
			const cause = faker.lorem.sentence();

			const noneErrorEvent: EventInsertType = {
				type,
				installationId,
				timestamp,
				metadata,
				countryISOCode,
			};

			const errorEvent: EventInsertType = {
				type,
				installationId,
				timestamp,
				metadata,
				countryISOCode,
				message,
				name,
				stack,
				cause,
			};

			eventPromises.push(
				db
					.insert(eventsTable)
					.values(type === "Error" ? errorEvent : noneErrorEvent)
					.returning(),
			);
		}

		await Promise.all(eventPromises);
	} catch (_error) {}

	process.exit();
}

await seedEvents();
