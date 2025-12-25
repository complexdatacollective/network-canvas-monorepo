/**
 * Creates a base valid protocol for testing variations
 */
export const createBaseProtocol = () => ({
	name: "Test Protocol",
	schemaVersion: 8 as const,
	codebook: {
		ego: {
			variables: {
				egoName: {
					name: "EgoName",
					type: "text",
				},
				egoAge: {
					name: "EgoAge",
					type: "number",
				},
			},
		},
		node: {
			person: {
				name: "Person",
				color: "node-color-seq-1",
				variables: {
					name: {
						name: "Name",
						type: "text",
					},
					age: {
						name: "Age",
						type: "number",
					},
					category: {
						name: "Category",
						type: "categorical",
						options: [
							{ label: "Friend", value: "friend" },
							{ label: "Family", value: "family" },
						],
					},
					strength: {
						name: "Relationship_Strength",
						type: "ordinal",
						options: [
							{ label: "Weak", value: 1 },
							{ label: "Medium", value: 2 },
							{ label: "Strong", value: 3 },
						],
					},
				},
			},
			colleague: {
				name: "Colleague",
				color: "node-color-seq-2",
				variables: {
					name: {
						name: "Name",
						type: "text",
					},
					department: {
						name: "Department",
						type: "text",
					},
				},
			},
		},
		edge: {
			knows: {
				name: "Knows",
				color: "edge-color-seq-1",
				variables: {
					closeness: {
						name: "Closeness",
						type: "ordinal",
						options: [
							{ label: "Not Close", value: 1 },
							{ label: "Somewhat Close", value: 2 },
							{ label: "Very Close", value: 3 },
						],
					},
					duration: {
						name: "Duration",
						type: "number",
					},
				},
			},
			collaborates: {
				name: "Collaborates",
				color: "edge-color-seq-2",
				variables: {
					frequency: {
						name: "Frequency",
						type: "ordinal",
						options: [
							{ label: "Rarely", value: 1 },
							{ label: "Sometimes", value: 2 },
							{ label: "Often", value: 3 },
						],
					},
				},
			},
		},
	},
	stages: [
		{
			id: "nameGenerator1",
			type: "NameGenerator",
			label: "Generate Names",
			subject: {
				entity: "node",
				type: "person",
			},
			form: {
				fields: [
					{
						variable: "name",
						prompt: "Enter name",
					},
				],
			},
			prompts: [
				{
					id: "prompt1",
					text: "Who do you know?",
				},
			],
		},
		{
			id: "sociogram1",
			type: "Sociogram",
			label: "Sociogram",
			subject: {
				entity: "node",
				type: "person",
			},
			prompts: [
				{
					id: "socPrompt1",
					text: "Position nodes",
					layout: {
						layoutVariable: "category",
					},
				},
			],
		},
	],
});
