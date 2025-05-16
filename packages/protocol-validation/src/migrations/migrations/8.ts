/**
 * Migration from v7 to v8
 */

import type { Protocol, Variables } from "src/schemas/8.zod";
import type { MigrationFunction } from "../migrateProtocol";

// Remove `options` from Toggle boolean variables
const removeToggleOptions = (variables?: Variables) => {
	if (!variables) return;
	for (const variable of Object.values(variables)) {
		if (variable.type === "boolean" && variable.component === "Toggle") {
			// @ts-expect-error deleting invalid property
			// biome-ignore lint/performance/noDelete: performance hit acceptable, as this is a one-time operation
			delete variable.options;
		}
	}
};

const migration: MigrationFunction<Protocol, Protocol> = (protocol) => {
	const codebook = protocol.codebook;

	// Iterate node and edge types in codebook, and remove 'displayVariable' property
	for (const type of ["node", "edge"] as const) {
		const entityRecord = codebook[type];
		if (entityRecord) {
			for (const entityDefinition of Object.values(entityRecord)) {
				// @ts-expect-error deleting invalid property
				// biome-ignore lint/performance/noDelete: performance hit acceptable, as this is a one-time operation
				delete entityDefinition.displayVariable;
				removeToggleOptions(entityDefinition.variables);
			}
		}
	}

	if (codebook.ego) {
		removeToggleOptions(codebook.ego.variables);
	}

	return protocol;
};

// Markdown format
const notes = `
- New interface: "geospatial interface". Allows the participant to select a location on a map based on a geojson shapefile.
- New experimental interface: "anonymisation interface". Allows the participant to encrypt sensitive/identifiable information, so that it cannot be read by the researcher. Not enabled by default. Contact the team for details.
- New interface: "one-to-many dyad-census". Allows the participant to link multiple alters at a time.
- Add new validation options for form fields: \`greaterThanVariable\` and \`lessThanVariable\`.
- Add new comparator options for skip logic and filter: \`contains\` and \`does not contain\`.
- Amplify comparator options \`includes\` and \`excludes\` for ordinal and categorical variables to allow multiple selections.
- Removed 'displayVariable' property, if set. This property was not used, and has been marked as deprecated for a long time.
- Removed 'options' property for boolean Toggle variables. This property was not used.
`;

const v8 = {
	version: 8,
	notes,
	migration,
};

export default v8;
