import type { Protocol } from "../protocol-validation/dist";

// biome-ignore lint/correctness/noUnusedVariables: <explanation>
const protocol: Protocol = {
	schemaVersion: 8,
	codebook: {
		node: {
			person: {
				color: "red",
				name: "Person",
				variables: {
					test_layout: {
						name: "Test Layout",
						type: "layout",
					},
				},
			},
		},
	},
	stages: [],
};
