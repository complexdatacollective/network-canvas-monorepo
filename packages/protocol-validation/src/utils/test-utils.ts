/**
 * Test utilities for Protocol Schema V8 validation tests
 */

import type { z } from "zod";

/**
 * Creates a base valid protocol for testing variations
 */
export const createBaseProtocol = () => ({
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

/**
 * Creates a minimal valid protocol
 */
export const createMinimalProtocol = () => ({
	schemaVersion: 8 as const,
	codebook: {},
	stages: [],
});

/**
 * Creates a protocol with complex stage configurations for testing
 */
export const createComplexProtocol = () => ({
	...createBaseProtocol(),
	stages: [
		{
			id: "nameGen1",
			type: "NameGenerator",
			label: "Name Generator",
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
					additionalAttributes: [
						{ variable: "age", value: true },
						{ variable: "category", value: false },
					],
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
		{
			id: "ordinalBin1",
			type: "OrdinalBin",
			label: "Ordinal Bin",
			subject: {
				entity: "node",
				type: "person",
			},
			prompts: [
				{
					id: "binPrompt1",
					text: "Sort by strength",
					variable: "strength",
				},
			],
		},
		{
			id: "dyadCensus1",
			type: "DyadCensus",
			label: "Dyad Census",
			subject: {
				entity: "node",
				type: "person",
			},
			prompts: [
				{
					id: "censusPrompt1",
					text: "Do these people know each other?",
					createEdge: "knows",
				},
			],
		},
	],
});

/**
 * Creates a stage with filter rules for testing
 */
export const createStageWithFilters = () => ({
	id: "stageWithFilters",
	type: "NameGenerator",
	label: "Stage with Filters",
	subject: {
		entity: "node",
		type: "person",
	},
	prompts: [
		{
			id: "prompt1",
			text: "Filtered prompt",
		},
	],
	filter: {
		rules: [
			{
				id: "rule1",
				type: "node",
				options: {
					type: "person",
					attribute: "age",
					operator: "GREATER_THAN",
					value: 18,
				},
			},
			{
				id: "rule2",
				type: "ego",
				options: {
					attribute: "egoAge",
					operator: "LESS_THAN",
					value: 65,
				},
			},
		],
	},
});

/**
 * Creates a protocol with variable cross-references for testing
 */
export const createProtocolWithCrossReferences = () => {
	const base = createBaseProtocol();
	return {
		...base,
		codebook: {
			...base.codebook,
			node: {
				person: {
					...base.codebook.node.person,
					variables: {
						...base.codebook.node.person.variables,
						confirmAge: {
							name: "ConfirmAge",
							type: "number",
							validation: {
								sameAs: "age",
							},
						},
						uniqueId: {
							name: "UniqueID",
							type: "text",
							validation: {
								differentFrom: "name",
							},
						},
						maxAge: {
							name: "MaximumAge",
							type: "number",
							validation: {
								greaterThanVariable: "age",
							},
						},
						minAge: {
							name: "MinimumAge",
							type: "number",
							validation: {
								lessThanVariable: "age",
							},
						},
					},
				},
			},
			ego: {
				variables: {
					...base.codebook.ego.variables,
					confirmName: {
						name: "ConfirmName",
						type: "text",
						validation: {
							sameAs: "egoName",
						},
					},
				},
			},
		},
	};
};

/**
 * Helper to find specific error in Zod validation issues
 */
export const findErrorByMessage = (issues: z.ZodIssue[], messageSubstring: string) => {
	return issues.find((issue) => issue.message.includes(messageSubstring));
};

/**
 * Helper to find error by path
 */
export const findErrorByPath = (issues: z.ZodIssue[], path: (string | number)[]) => {
	return issues.find((issue) => JSON.stringify(issue.path) === JSON.stringify(path));
};

/**
 * Helper to extract all error messages from validation result
 */
export const extractErrorMessages = (issues: z.ZodIssue[]) => {
	return issues.map((issue) => issue.message);
};

/**
 * Helper to create a protocol with invalid references for testing error cases
 */
export const createInvalidReferenceProtocol = () => {
	const base = createBaseProtocol();
	return {
		...base,
		stages: [
			{
				id: "invalidStage",
				type: "NameGenerator",
				label: "Invalid Stage",
				subject: {
					entity: "node",
					type: "nonexistentNodeType", // Invalid subject
				},
				form: {
					fields: [
						{
							variable: "nonexistentVariable", // Invalid form field variable
							prompt: "Enter something",
						},
					],
				},
				prompts: [
					{
						id: "prompt1",
						text: "Main prompt",
						additionalAttributes: [
							{ variable: "anotherNonexistent", value: true }, // Invalid additional attribute
						],
					},
				],
				filter: {
					rules: [
						{
							id: "rule1",
							type: "node",
							options: {
								type: "anotherNonexistent", // Invalid filter entity type
								attribute: "invalidAttribute", // Invalid filter attribute
								operator: "EXISTS",
							},
						},
					],
				},
			},
		],
	};
};

/**
 * Helper to create protocol with duplicate IDs for testing
 */
export const createProtocolWithDuplicateIds = () => {
	const base = createBaseProtocol();
	return {
		...base,
		stages: [
			base.stages[0],
			{
				...base.stages[0],
				label: "Duplicate Stage", // Different label, same ID
			},
		],
	};
};

/**
 * Helper to create stage with duplicate prompt IDs
 */
export const createStageWithDuplicatePromptIds = () => ({
	id: "stageWithDuplicatePrompts",
	type: "NameGenerator",
	label: "Stage with Duplicate Prompt IDs",
	subject: {
		entity: "node",
		type: "person",
	},
	prompts: [
		{ id: "prompt1", text: "First prompt" },
		{ id: "prompt1", text: "Duplicate ID prompt" },
	],
});

/**
 * Type helper for protocol objects
 */
export type TestProtocol = ReturnType<typeof createBaseProtocol>;
