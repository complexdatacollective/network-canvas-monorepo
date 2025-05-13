/**
 * Migration from v7 to v8
 */

const migration = (protocol) => {
	// Iterate node and edge types in codebook, and remove 'displayVariable' property
	for (const type of ["nodes", "edges"]) {
		if (protocol.codebook[type]) {
			for (const node of protocol.codebook[type]) {
				if (node.displayVariable) {
					// biome-ignore lint/performance/noDelete: performance hit acceptable, as this is a one-time operation
					delete node.displayVariable;
				}
			}
		}
	}

	return protocol;
};

// Markdown format
const notes = `
- New interface: "geospatial interface". Allows the participant to select a location on a map based on a geojson shapefile.
- New experimental interface: "anonymisation interface". Allows the participant to encrypt sensitive/identifiable information, so that it cannot be read by the researcher. Not enabled by default.
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
