import type { ProtocolMigration } from "src/migration";

// Remove `options` from Toggle boolean variables
const removeToggleOptions = (variables?: Record<string, unknown>) => {
	if (!variables) return;
	for (const variable of Object.values(variables)) {
		if (typeof variable === "object" && variable !== null) {
			const typedVariable = variable as Record<string, unknown>;
			if (typedVariable.type === "boolean" && typedVariable.component === "Toggle") {
				// Remove invalid 'options' property
				// biome-ignore lint/performance/noDelete: acceptable in this instance
				delete typedVariable.options;
			}
		}
	}
};

const migrationV7toV8: ProtocolMigration<7, 8> = {
	from: 7,
	to: 8,
	notes: `
- New interface: "geospatial interface". Allows the participant to select a location on a map based on a geojson shapefile.
- New experimental interface: "anonymisation interface". Allows the participant to encrypt sensitive/identifiable information, so that it cannot be read by the researcher. Not enabled by default. Contact the team for details.
- New interface: "one-to-many dyad-census". Allows the participant to link multiple alters at a time.
- Add new validation options for form fields: \`greaterThanVariable\` and \`lessThanVariable\`.
- Add new comparator options for skip logic and filter: \`contains\` and \`does not contain\`.
- Amplify comparator options \`includes\` and \`excludes\` for ordinal and categorical variables to allow multiple selections.
- Removed 'displayVariable' property, if set. This property was not used, and has been marked as deprecated for a long time.
- Removed 'options' property for boolean Toggle variables. This property was not used.
`,
	migrate: (doc) => {
		const codebook = doc.codebook;

		// Iterate node and edge types in codebook, and remove 'displayVariable' property
		for (const type of ["node", "edge"] as const) {
			const entityRecord = codebook[type];
			if (entityRecord) {
				for (const entityDefinition of Object.values(entityRecord as Record<string, unknown>)) {
					if (typeof entityDefinition === "object" && entityDefinition !== null) {
						const typedEntity = entityDefinition as Record<string, unknown>;
						// Remove deprecated displayVariable property
						// biome-ignore lint/performance/noDelete: necessary for migration
						delete typedEntity.displayVariable;
						// Remove options from Toggle boolean variables
						removeToggleOptions(typedEntity.variables as Record<string, unknown> | undefined);
					}
				}
			}
		}

		// Handle ego variables
		if (codebook.ego && typeof codebook.ego === "object" && codebook.ego !== null) {
			const egoRecord = codebook.ego as Record<string, unknown>;
			if ("variables" in egoRecord && typeof egoRecord.variables === "object" && egoRecord.variables !== null) {
				removeToggleOptions(egoRecord.variables as Record<string, unknown>);
			}
		}

		return {
			...doc,
			codebook,
			schemaVersion: 8 as const,
			experiments: undefined,
		} as ReturnType<ProtocolMigration<7, 8>["migrate"]>;
	},
};

export default migrationV7toV8;
