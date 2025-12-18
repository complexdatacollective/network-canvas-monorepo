import type { ProtocolDocument, ProtocolMigration } from "~/migration";
import { traverseAndTransform } from "~/utils/traverse-and-transform";

const migrationV7toV8: ProtocolMigration<7, 8, { name: string }> = {
	from: 7,
	to: 8,
	dependencies: ["name"],
	notes: `
- New interface: "geospatial interface". Allows the participant to select a location on a map based on a geojson shapefile.
- New experimental interface: "anonymisation interface". Allows the participant to encrypt sensitive/identifiable information, so that it cannot be read by the researcher. Not enabled by default. Contact the team for details.
- New interface: "one-to-many dyad-census". Allows the participant to link multiple alters at a time.
- Add new validation options for form fields: \`greaterThanVariable\` and \`lessThanVariable\`.
- Add new comparator options for skip logic and filter: \`contains\` and \`does not contain\`.
- Amplify comparator options \`includes\` and \`excludes\` for ordinal and categorical variables to allow multiple selections.
- Removed 'displayVariable' property, if set. This property was not used, and has been marked as deprecated for a long time.
- Removed 'options' property for boolean Toggle variables. This property was not used.
- Changed FilterRule type to use the same entity names as elsewhere
- Added 'name' property to protocol (required dependency for migration)
`,
	migrate: (doc, deps) => {
		const transformed = traverseAndTransform(doc as Record<string, unknown>, [
			{
				// Remove deprecated 'displayVariable' property from node and edge entity definitions
				paths: ["codebook.node.*", "codebook.edge.*"],
				fn: <V>(entityDefinition: V) => {
					if (typeof entityDefinition === "object" && entityDefinition !== null) {
						const typedEntity = entityDefinition as Record<string, unknown>;
						delete typedEntity.displayVariable;
					}
					return entityDefinition;
				},
			},
			{
				// Remove 'options' property from Toggle boolean variables
				paths: ["codebook.node.*.variables", "codebook.edge.*.variables", "codebook.ego.variables"],
				fn: <V>(variables: V) => {
					if (!variables || typeof variables !== "object") return variables;

					for (const variable of Object.values(variables as Record<string, unknown>)) {
						if (typeof variable === "object" && variable !== null) {
							const typedVariable = variable as Record<string, unknown>;
							if (typedVariable.type === "boolean" && typedVariable.component === "Toggle") {
								delete typedVariable.options;
							}
						}
					}
					return variables;
				},
			},
			{
				// Change filter.type value from "alter" to "node" to match entity naming elsewhere
				paths: [
					"stages[].panels[].filter.rules[].type",
					"stages[].skipLogic.filter.rules[].type",
					"stages[].filter.rules[].type",
				],
				fn: <V>(filterType: V) => {
					if (filterType === "alter") return "node" as V;
					return filterType;
				},
			},
			{
				// Update schema version and add experiments field
				paths: [""],
				fn: <V>(protocol: V) =>
					({
						...(protocol as Record<string, unknown>),
						schemaVersion: 8 as const,
						experiments: {},
					}) as V,
			},
		]);

		// Set name from required dependency
		const result = transformed as Record<string, unknown>;
		result.name = deps.name;

		return result as ProtocolDocument<8>;
	},
};

export default migrationV7toV8;
