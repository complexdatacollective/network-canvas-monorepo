import { createMigration, type ProtocolDocument } from "~/migration";

const migrationV6toV7 = createMigration({
	from: 6,
	to: 7,
	dependencies: {},
	notes: `- Add the ability to specify minimum and maximum numbers of named alters on name generator stages.
- Add additional skip logic options for handling ordinal and categorical variables.`,
	migrate: (doc) =>
		({
			...doc,
			schemaVersion: 7 as const,
		}) as ProtocolDocument<7>,
});

export default migrationV6toV7;
