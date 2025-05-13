/**
 * Migration from v7 to v8
 */

const migration = (protocol) => {
	// Iterate node and edge types in codebook, and remove 'displayVariable' property
	for (const type of ["node", "edge"]) {
		if (protocol.codebook[type]) {
			for (const entityDefinition of Object.values(protocol.codebook[type])) {
				// biome-ignore lint/performance/noDelete: performance hit acceptable, as this is a one-time operation
				delete entityDefinition.displayVariable;
			}
		}
	}
	// Remove options from Toggle variables
	for (const type of ["ego", "node", "edge"]) {
		const variables = protocol.codebook[type]?.variables;
		if (!variables) continue;

		for (const [, variable] of Object.entries(variables)) {
			if (variable.type === "boolean" && variable.component === "Toggle") {
				// biome-ignore lint/performance/noDelete: performance hit acceptable, as this is a one-time operation
				delete variable.options;
			}
		}
	}
	return protocol;
};

// Markdown format
const notes = `
- New interface: "geospatial interface". Allows the participant to select a location on a map based on a geojson shapefile.
- New interface: "anonymisation interface". Allows the participant to encrypt sensitive/identifiable information, so that it cannot be read by the researcher.
- New interface: "one-to-many dyad-census". Allows the participant to link multiple alters at a time.
- Add new validation options for form fields: \`greaterThanVariable\` and \`lessThanVariable\`.
- Add new comparator options for skip logic and filter: \`contains\` and \`does not contain\`.
- Amplify comparator options \`includes\` and \`excludes\` for ordinal and categorical variables to allow multiple selections.
- Removed 'displayVariable' property, if set. This property was not used, and has been marked as deprecated for a long time.
`;

const v8 = {
	version: 8,
	notes,
	migration,
};

export default v8;
