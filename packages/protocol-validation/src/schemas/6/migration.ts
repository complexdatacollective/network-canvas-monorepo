import { createMigration, type ProtocolDocument } from "~/migration";

const migrationV5toV6 = createMigration({
	from: 5,
	to: 6,
	dependencies: {},
	notes: `
- Replace roster-based name generators (small and large) with a single new interface that combines the functionality of both. This will change the interview experience, and may impact your data collection!
- Enable support for using the automatic node positioning feature on the Sociogram interface.
`,
	migrate: (doc) => {
		const protocol = doc as Record<string, unknown>;
		const stages = (protocol.stages as Array<Record<string, unknown>>) ?? [];

		const migratedStages = stages.map((stage) => {
			if (stage.type !== "NameGeneratorAutoComplete" && stage.type !== "NameGeneratorList") {
				return stage;
			}
			const { panels: _panels, ...rest } = stage;
			return { ...rest, type: "NameGeneratorRoster" };
		});

		return {
			...protocol,
			schemaVersion: 6 as const,
			stages: migratedStages,
		} as ProtocolDocument<6>;
	},
});

export default migrationV5toV6;
