import { describe, expect, it } from "vitest";
import { createBaseProtocol } from "~/utils/test-utils";
import ProtocolSchemaV8 from "../schema";

/**
 * Comprehensive tests for Protocol Schema V8 superrefine validation behavior
 * This test suite focuses on the complex validation logic in the superRefine function
 * that validates cross-references between different parts of the protocol.
 */
describe("Protocol Schema V8 - Superrefine Validation", () => {
	// Base valid protocol for testing variations
	const baseValidProtocol = createBaseProtocol();

	describe("Stage Subject Validation", () => {
		it("validates protocol with valid stage subjects", () => {
			const result = ProtocolSchemaV8.safeParse(baseValidProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects stage with non-existent node type", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						subject: {
							entity: "node",
							type: "nonexistent",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues).toHaveLength(2); // Stage subject not defined and form field variable not found
				expect(result.error.issues[0]?.message).toBe("Stage subject is not defined in the codebook");
				expect(result.error.issues[0]?.path).toEqual(["stages", 0, "subject"]);
			}
		});

		it("rejects stage with non-existent edge type", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "edgeForm1",
						type: "AlterEdgeForm",
						label: "Edge Form",
						subject: {
							entity: "edge",
							type: "nonexistent",
						},
						form: {
							fields: [],
						},
						introductionPanel: {
							title: "Edge Form Intro",
							text: "Introduction text for edge form.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const subjectError = result.error.issues.find((issue) =>
					issue.message.includes("Stage subject is not defined in the codebook"),
				);
				expect(subjectError).toBeDefined();
				expect(subjectError?.path).toEqual(["stages", 0, "subject"]);
			}
		});

		it("validates ego subject for EgoForm stages", () => {
			const egoFormProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "egoForm1",
						type: "EgoForm",
						label: "Ego Form",
						form: {
							fields: [
								{
									variable: "egoName",
									prompt: "Enter your name",
								},
							],
						},
						introductionPanel: {
							title: "Ego Form Intro",
							text: "Introduction text for ego form.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(egoFormProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects ego subject when ego is not defined in codebook", () => {
			const protocolWithoutEgo = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					ego: undefined,
				},
				stages: [
					{
						id: "egoForm1",
						type: "EgoForm",
						label: "Ego Form",
						form: {
							fields: [
								{
									variable: "egoName",
									prompt: "Enter your name",
								},
							],
						},
						introductionPanel: {
							title: "Ego Form Intro",
							text: "Introduction text for ego form.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithoutEgo);
			expect(result.success).toBe(false);
			if (!result.success) {
				// The form field validation should fail because ego variables don't exist
				const formFieldError = result.error.issues.find((issue) =>
					issue.message.includes("Form field variable not found in codebook"),
				);
				expect(formFieldError).toBeDefined();
			}
		});
	});

	describe("Form Field Validation", () => {
		it("validates form fields with correct variable references for node entities", () => {
			const protocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						form: {
							fields: [
								{
									variable: "name",
									prompt: "Enter name",
								},
								{
									variable: "age",
									prompt: "Enter age",
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocol);
			expect(result.success).toBe(true);
		});

		it("rejects form field with non-existent variable for node entity", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						form: {
							fields: [
								{
									variable: "nonexistentVariable",
									prompt: "Enter something",
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues).toHaveLength(1);
				expect(result.error.issues[0]?.message).toBe("Form field variable not found in codebook.");
				expect(result.error.issues[0]?.path).toEqual(["stages", 0, "form", "fields", 0, "variable"]);
			}
		});

		it("validates form fields for EgoForm stages", () => {
			const egoFormProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "egoForm1",
						type: "EgoForm",
						label: "Ego Form",
						form: {
							fields: [
								{
									variable: "egoName",
									prompt: "Enter your name",
								},
								{
									variable: "egoAge",
									prompt: "Enter your age",
								},
							],
						},
						introductionPanel: {
							title: "Ego Form Intro",
							text: "Introduction text for ego form.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(egoFormProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects form field with non-existent ego variable", () => {
			const invalidEgoFormProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "egoForm1",
						type: "EgoForm",
						label: "Ego Form",
						form: {
							fields: [
								{
									variable: "nonexistentEgoVariable",
									prompt: "Enter something",
								},
							],
						},
						introductionPanel: {
							title: "Ego Form Intro",
							text: "Introduction text for ego form.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidEgoFormProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const formFieldError = result.error.issues.find((issue) =>
					issue.message.includes("Form field variable not found in codebook"),
				);
				expect(formFieldError).toBeDefined();
				expect(formFieldError?.path).toEqual(["stages", 0, "form", "fields", 0, "variable"]);
			}
		});

		it("validates form fields for edge entities", () => {
			const edgeFormProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "edgeForm1",
						type: "AlterEdgeForm",
						label: "Edge Form",
						subject: {
							entity: "edge",
							type: "knows",
						},
						form: {
							fields: [
								{
									variable: "closeness",
									prompt: "How close are you?",
								},
								{
									variable: "duration",
									prompt: "How long have you known them?",
								},
							],
						},
						introductionPanel: {
							title: "Edge Form Intro",
							text: "Introduction text for edge form.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(edgeFormProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects form field with variable from wrong entity type", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						subject: {
							entity: "node",
							type: "person",
						},
						form: {
							fields: [
								{
									variable: "department", // This variable exists on 'colleague' not 'person'
									prompt: "Enter department",
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const formFieldError = result.error.issues.find((issue) =>
					issue.message.includes("Form field variable not found in codebook"),
				);
				expect(formFieldError).toBeDefined();
			}
		});
	});

	describe("Duplicate ID Validation", () => {
		it("rejects protocols with duplicate stage IDs", () => {
			const protocolWithDuplicateStageIds = {
				...baseValidProtocol,
				stages: [
					baseValidProtocol.stages[0],
					{
						...baseValidProtocol.stages[0],
						label: "Duplicate Stage", // Different label, same ID
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithDuplicateStageIds);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues).toHaveLength(1);
				expect(result.error.issues[0]?.message).toBe('Stages contain duplicate ID "nameGenerator1"');
				expect(result.error.issues[0]?.path).toEqual(["stages"]);
			}
		});

		it("rejects protocols with duplicate prompt IDs within a stage", () => {
			const protocolWithDuplicatePromptIds = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						prompts: [
							{ id: "prompt1", text: "First prompt" },
							{ id: "prompt1", text: "Duplicate ID prompt" },
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithDuplicatePromptIds);
			expect(result.success).toBe(false);
			if (!result.success) {
				const duplicateError = result.error.issues.find((issue) =>
					issue.message.includes('Prompts contain duplicate ID "prompt1"'),
				);
				expect(duplicateError).toBeDefined();
			}
		});
	});

	describe("Prompt Variable Validation", () => {
		it("validates prompt variable references for ordinal bin stages", () => {
			const ordinalBinProtocol = {
				...baseValidProtocol,
				stages: [
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
								id: "prompt1",
								text: "Sort by strength",
								variable: "strength",
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(ordinalBinProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects prompt with non-existent variable reference", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
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
								id: "prompt1",
								text: "Sort by something",
								variable: "nonexistentVariable",
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const variableError = result.error.issues.find((issue) =>
					issue.message.includes('"nonexistentVariable" not defined in codebook[node][person].variables'),
				);
				expect(variableError).toBeDefined();
				expect(variableError?.path).toEqual(["stages", 0, "prompts", 0, "variable"]);
			}
		});

		it("validates otherVariable for categorical bin stages", () => {
			const categoricalBinProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "categoricalBin1",
						type: "CategoricalBin",
						label: "Categorical Bin",
						subject: {
							entity: "node",
							type: "person",
						},
						prompts: [
							{
								id: "prompt1",
								text: "Sort by category",
								variable: "category",
								otherVariable: "name",
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(categoricalBinProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects prompt with non-existent otherVariable reference", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "categoricalBin1",
						type: "CategoricalBin",
						label: "Categorical Bin",
						subject: {
							entity: "node",
							type: "person",
						},
						prompts: [
							{
								id: "prompt1",
								text: "Sort by category",
								variable: "category",
								otherVariable: "nonexistentVariable",
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const otherVariableError = result.error.issues.find((issue) =>
					issue.message.includes('"nonexistentVariable" not defined in codebook[node][person].variables'),
				);
				expect(otherVariableError).toBeDefined();
				expect(otherVariableError?.path).toEqual(["stages", 0, "prompts", 0, "otherVariable"]);
			}
		});
	});

	describe("CreateEdge Reference Validation", () => {
		it("validates createEdge references in prompts", () => {
			const dyadCensusProtocol = {
				...baseValidProtocol,
				stages: [
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
								id: "prompt1",
								text: "Do these people know each other?",
								createEdge: "knows",
							},
						],
						introductionPanel: {
							title: "Dyad Census",
							text: "In the next screens, you will be shown pairs of alters. By answering 'Yes' to the questions, an edge between both alters will then be created.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(dyadCensusProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects createEdge reference to non-existent edge type", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
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
								id: "prompt1",
								text: "Do these people know each other?",
								createEdge: "nonexistentEdge",
							},
						],
						introductionPanel: {
							title: "Dyad Census",
							text: "In the next screens, you will be shown pairs of alters. By answering 'Yes' to the questions, an edge between both alters will then be created.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const createEdgeError = result.error.issues.find((issue) =>
					issue.message.includes('"nonexistentEdge" definition for createEdge not found in codebook["edge"]'),
				);
				expect(createEdgeError).toBeDefined();
				expect(createEdgeError?.path).toEqual(["stages", 0, "prompts", 0, "createEdge"]);
			}
		});

		it("validates edgeVariable for TieStrengthCensus stages", () => {
			const tieStrengthCensusProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "tieStrength1",
						type: "TieStrengthCensus",
						label: "Tie Strength Census",
						subject: {
							entity: "node",
							type: "person",
						},
						prompts: [
							{
								id: "prompt1",
								text: "How close are these people?",
								createEdge: "knows",
								edgeVariable: "closeness",
								negativeLabel: "Not connected",
							},
						],
						introductionPanel: {
							title: "Tie Strength Census",
							text: "In the next screens, you will be shown pairs of alters. Please rate the strength of their relationship.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(tieStrengthCensusProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects edgeVariable that doesn't exist in the edge type", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "tieStrength1",
						type: "TieStrengthCensus",
						label: "Tie Strength Census",
						subject: {
							entity: "node",
							type: "person",
						},
						prompts: [
							{
								id: "prompt1",
								text: "How close are these people?",
								createEdge: "knows",
								edgeVariable: "nonexistentVariable",
								negativeLabel: "Not connected",
							},
						],
						introductionPanel: {
							title: "Tie Strength Census",
							text: "In the next screens, you will be shown pairs of alters. Please rate the strength of their relationship.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const edgeVariableError = result.error.issues.find((issue) =>
					issue.message.includes('"nonexistentVariable" not defined in codebook[edge][knows].variables'),
				);
				expect(edgeVariableError).toBeDefined();
				expect(edgeVariableError?.path).toEqual(["stages", 0, "prompts", 0, "edgeVariable"]);
			}
		});

		it("rejects edgeVariable that is not of type 'ordinal'", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "tieStrength1",
						type: "TieStrengthCensus",
						label: "Tie Strength Census",
						subject: {
							entity: "node",
							type: "person",
						},
						prompts: [
							{
								id: "prompt1",
								text: "How close are these people?",
								createEdge: "knows",
								edgeVariable: "duration", // This is a number, not ordinal
								negativeLabel: "Not connected",
							},
						],
						introductionPanel: {
							title: "Tie Strength Census",
							text: "In the next screens, you will be shown pairs of alters. Please rate the strength of their relationship.",
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const typeError = result.error.issues.find((issue) =>
					issue.message.includes("\"duration\" is not of type 'ordinal'."),
				);
				expect(typeError).toBeDefined();
				expect(typeError?.path).toEqual(["stages", 0, "prompts", 0, "edgeVariable"]);
			}
		});
	});

	describe("Layout Variable Validation", () => {
		it("validates string layoutVariable reference", () => {
			const sociogramProtocol = {
				...baseValidProtocol,
				stages: [
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
								id: "prompt1",
								text: "Position nodes",
								layout: {
									layoutVariable: "category",
								},
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(sociogramProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects string layoutVariable that doesn't exist", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
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
								id: "prompt1",
								text: "Position nodes",
								layout: {
									layoutVariable: "nonexistentVariable",
								},
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const layoutError = result.error.issues.find((issue) =>
					issue.message.includes('Layout variable "nonexistentVariable" not defined'),
				);
				expect(layoutError).toBeDefined();
				expect(layoutError?.path).toEqual(["stages", 0, "prompts", 0, "layout", "layoutVariable"]);
			}
		});

		// Object layoutVariable support has been removed - only strings are supported
	});

	describe("Additional Attributes Validation", () => {
		it("validates additionalAttributes with correct variable references", () => {
			const nameGeneratorProtocol = {
				...baseValidProtocol,
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
				],
			};

			const result = ProtocolSchemaV8.safeParse(nameGeneratorProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects additionalAttributes with non-existent variables", () => {
			const invalidProtocol = {
				...baseValidProtocol,
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
									{ variable: "nonexistentVariable", value: true },
									{ variable: "anotherNonexistent", value: false },
								],
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const attributeError = result.error.issues.find((issue) =>
					issue.message.includes(
						"One or more sortable properties not defined in codebook: nonexistentVariable, anotherNonexistent",
					),
				);
				expect(attributeError).toBeDefined();
				expect(attributeError?.path).toEqual(["stages", 0, "prompts", 0, "additionalAttributes"]);
			}
		});
	});

	// Edges Restrict Origin Validation removed - feature was abandoned

	describe("Filter Rules Validation", () => {
		it("validates filter rules with correct entity and attribute references", () => {
			const protocolWithFilters = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						filter: {
							join: "AND",
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
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithFilters);
			expect(result.success).toBe(true);
		});

		it("rejects filter rule with non-existent entity type", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "nonexistentEntityType",
										attribute: "name",
										operator: "EXISTS",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const entityError = result.error.issues.find((issue) =>
					issue.message.includes('Rule option type "nonexistentEntityType" is not defined in codebook'),
				);
				expect(entityError).toBeDefined();
				expect(entityError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "type"]);
			}
		});

		it("rejects filter rule with non-existent attribute", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "person",
										attribute: "nonexistentAttribute",
										operator: "EXISTS",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const attributeError = result.error.issues.find((issue) =>
					issue.message.includes('"nonexistentAttribute" is not a valid variable ID'),
				);
				expect(attributeError).toBeDefined();
				expect(attributeError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "attribute"]);
			}
		});

		it("rejects filter rules with duplicate IDs", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "duplicateId",
									type: "node",
									options: {
										type: "person",
										attribute: "age",
										operator: "GREATER_THAN",
										value: 18,
									},
								},
								{
									id: "duplicateId",
									type: "node",
									options: {
										type: "person",
										attribute: "name",
										operator: "EXISTS",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const duplicateError = result.error.issues.find((issue) =>
					issue.message.includes('Rules contain duplicate ID "duplicateId"'),
				);
				expect(duplicateError).toBeDefined();
				expect(duplicateError?.path).toEqual(["stages", 0, "filter", "rules"]);
			}
		});

		it("validates ego filter rules without entity type", () => {
			const protocolWithEgoFilter = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						filter: {
							rules: [
								{
									id: "egoRule",
									type: "ego",
									options: {
										attribute: "egoName",
										operator: "EXISTS",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithEgoFilter);
			expect(result.success).toBe(true);
		});

		it("rejects ego filter rule when ego is not defined in codebook", () => {
			const protocolWithoutEgo = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					ego: undefined,
				},
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "egoRule",
									type: "ego",
									options: {
										attribute: "egoName",
										operator: "EXISTS",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithoutEgo);
			expect(result.success).toBe(false);
			if (!result.success) {
				const egoError = result.error.issues.find((issue) =>
					issue.message.includes('Entity type "Ego" is not defined in codebook'),
				);
				expect(egoError).toBeDefined();
				expect(egoError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "type"]);
			}
		});

		it("validates edge filter rules", () => {
			const protocolWithEdgeFilter = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						filter: {
							rules: [
								{
									id: "edgeRule",
									type: "edge",
									options: {
										type: "knows",
										attribute: "closeness",
										operator: "GREATER_THAN",
										value: 2,
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithEdgeFilter);
			expect(result.success).toBe(true);
		});

		it("validates nested filter rules in skipLogic", () => {
			const protocolWithNestedFilters = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						skipLogic: {
							action: "SKIP",
							filter: {
								rules: [
									{
										id: "skipRule1",
										type: "node",
										options: {
											type: "person",
											attribute: "age",
											operator: "GREATER_THAN",
											value: 25,
										},
									},
								],
							},
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithNestedFilters);
			expect(result.success).toBe(true);
		});

		it("rejects invalid operator for variable type (CONTAINS on number variable)", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "person",
										attribute: "age",
										operator: "CONTAINS",
										value: "25",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const operatorError = result.error.issues.find((issue) =>
					issue.message.includes('Operator "CONTAINS" is not valid for variable type "number"'),
				);
				expect(operatorError).toBeDefined();
				expect(operatorError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "operator"]);
			}
		});

		it("rejects GREATER_THAN on text variable", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "person",
										attribute: "name",
										operator: "GREATER_THAN",
										value: 100,
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const operatorError = result.error.issues.find((issue) =>
					issue.message.includes('Operator "GREATER_THAN" is not valid for variable type "text"'),
				);
				expect(operatorError).toBeDefined();
				expect(operatorError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "operator"]);
			}
		});

		it("accepts valid operator for variable type (GREATER_THAN on number variable)", () => {
			const validProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
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
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(validProtocol);
			expect(result.success).toBe(true);
		});

		it("accepts CONTAINS on text variable", () => {
			const validProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "person",
										attribute: "name",
										operator: "CONTAINS",
										value: "John",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(validProtocol);
			expect(result.success).toBe(true);
		});

		it("rejects GREATER_THAN with string value (requires number)", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "person",
										attribute: "age",
										operator: "GREATER_THAN",
										value: "25",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const valueTypeError = result.error.issues.find((issue) =>
					issue.message.includes('Operator "GREATER_THAN" requires a numeric value, but got string'),
				);
				expect(valueTypeError).toBeDefined();
				expect(valueTypeError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "value"]);
			}
		});

		it("rejects CONTAINS with numeric value (requires string)", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "person",
										attribute: "name",
										operator: "CONTAINS",
										value: 123,
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const valueTypeError = result.error.issues.find((issue) =>
					issue.message.includes('Operator "CONTAINS" requires a string value, but got number'),
				);
				expect(valueTypeError).toBeDefined();
				expect(valueTypeError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "value"]);
			}
		});

		it("rejects OPTIONS_GREATER_THAN with string value (requires number count)", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[1],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "person",
										attribute: "category",
										operator: "OPTIONS_GREATER_THAN",
										value: "2",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const valueTypeError = result.error.issues.find((issue) =>
					issue.message.includes('Operator "OPTIONS_GREATER_THAN" requires a numeric value (count), but got string'),
				);
				expect(valueTypeError).toBeDefined();
				expect(valueTypeError?.path).toEqual(["stages", 0, "filter", "rules", 0, "options", "value"]);
			}
		});

		it("rejects nested filter rules with duplicate IDs", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				stages: [
					{
						...baseValidProtocol.stages[0],
						skipLogic: {
							action: "SKIP",
							filter: {
								join: "AND",
								rules: [
									{
										id: "duplicateNestedId",
										type: "node",
										options: {
											type: "person",
											attribute: "age",
											operator: "GREATER_THAN",
											value: 25,
										},
									},
									{
										id: "duplicateNestedId",
										type: "node",
										options: {
											type: "person",
											attribute: "name",
											operator: "EXISTS",
										},
									},
								],
							},
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const duplicateNestedError = result.error.issues.find((issue) =>
					issue.message.includes('Rules contain duplicate ID "duplicateNestedId"'),
				);
				expect(duplicateNestedError).toBeDefined();
				expect(duplicateNestedError?.path).toEqual(["stages", 0, "skipLogic", "filter", "rules"]);
			}
		});
	});

	describe("Variable Cross-Reference Validation", () => {
		it("validates sameAs cross-reference for node variables", () => {
			const protocolWithCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								confirmAge: {
									name: "ConfirmAge",
									type: "number",
									validation: {
										sameAs: "age",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithCrossRef);
			expect(result.success).toBe(true);
		});

		it("rejects sameAs cross-reference to non-existent variable", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								confirmAge: {
									name: "ConfirmAge",
									type: "number",
									validation: {
										sameAs: "nonexistentVariable",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const crossRefError = result.error.issues.find((issue) =>
					issue.message.includes('The variable "nonexistentVariable" does not exist in the codebook'),
				);
				expect(crossRefError).toBeDefined();
				expect(crossRefError?.path).toEqual([
					"codebook",
					"node",
					"person",
					"variables",
					"confirmAge",
					"validation",
					"sameAs",
				]);
			}
		});

		it("validates differentFrom cross-reference for node variables", () => {
			const protocolWithCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								uniqueId: {
									name: "UniqueID",
									type: "text",
									validation: {
										differentFrom: "name",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithCrossRef);
			expect(result.success).toBe(true);
		});

		it("rejects differentFrom cross-reference to non-existent variable", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								uniqueId: {
									name: "UniqueID",
									type: "text",
									validation: {
										differentFrom: "nonexistentVariable",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const crossRefError = result.error.issues.find((issue) =>
					issue.message.includes('The variable "nonexistentVariable" does not exist in the codebook'),
				);
				expect(crossRefError).toBeDefined();
				expect(crossRefError?.path).toEqual([
					"codebook",
					"node",
					"person",
					"variables",
					"uniqueId",
					"validation",
					"differentFrom",
				]);
			}
		});

		it("validates greaterThanVariable cross-reference for node variables", () => {
			const protocolWithCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								maxAge: {
									name: "MaximumAge",
									type: "number",
									validation: {
										greaterThanVariable: "age",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithCrossRef);
			expect(result.success).toBe(true);
		});

		it("validates lessThanVariable cross-reference for node variables", () => {
			const protocolWithCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
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
				},
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithCrossRef);
			expect(result.success).toBe(true);
		});

		it("validates greaterThanOrEqualToVariable cross-reference for node variables", () => {
			const protocolWithCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								minAge: {
									name: "MinimumAge",
									type: "number",
									validation: {
										greaterThanOrEqualToVariable: "age",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithCrossRef);
			expect(result.success).toBe(true);
		});

		it("rejects greaterThanOrEqualToVariable cross-reference to non-existent variable", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								minAge: {
									name: "MinimumAge",
									type: "number",
									validation: {
										greaterThanOrEqualToVariable: "nonexistentVariable",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const crossRefError = result.error.issues.find((issue) =>
					issue.message.includes('The variable "nonexistentVariable" does not exist in the codebook'),
				);
				expect(crossRefError).toBeDefined();
				expect(crossRefError?.path).toEqual([
					"codebook",
					"node",
					"person",
					"variables",
					"minAge",
					"validation",
					"greaterThanOrEqualToVariable",
				]);
			}
		});

		it("validates lessThanOrEqualToVariable cross-reference for node variables", () => {
			const protocolWithCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								maxAge: {
									name: "MaximumAge",
									type: "number",
									validation: {
										lessThanOrEqualToVariable: "age",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithCrossRef);
			expect(result.success).toBe(true);
		});

		it("rejects lessThanOrEqualToVariable cross-reference to non-existent variable", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					node: {
						person: {
							...baseValidProtocol.codebook.node.person,
							variables: {
								...baseValidProtocol.codebook.node.person.variables,
								maxAge: {
									name: "MaximumAge",
									type: "number",
									validation: {
										lessThanOrEqualToVariable: "nonexistentVariable",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const crossRefError = result.error.issues.find((issue) =>
					issue.message.includes('The variable "nonexistentVariable" does not exist in the codebook'),
				);
				expect(crossRefError).toBeDefined();
				expect(crossRefError?.path).toEqual([
					"codebook",
					"node",
					"person",
					"variables",
					"maxAge",
					"validation",
					"lessThanOrEqualToVariable",
				]);
			}
		});

		it("validates cross-references for ego variables", () => {
			const protocolWithEgoCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					ego: {
						variables: {
							...baseValidProtocol.codebook.ego.variables,
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

			const result = ProtocolSchemaV8.safeParse(protocolWithEgoCrossRef);
			expect(result.success).toBe(true);
		});

		it("validates cross-references for edge variables", () => {
			const protocolWithEdgeCrossRef = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					edge: {
						knows: {
							...baseValidProtocol.codebook.edge.knows,
							variables: {
								...baseValidProtocol.codebook.edge.knows.variables,
								maxDuration: {
									name: "MaximumDuration",
									type: "number",
									validation: {
										greaterThanVariable: "duration",
									},
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithEdgeCrossRef);
			expect(result.success).toBe(true);
		});

		it("rejects cross-reference validation when referenced variable doesn't exist in ego", () => {
			const invalidProtocol = {
				...baseValidProtocol,
				codebook: {
					...baseValidProtocol.codebook,
					ego: {
						variables: {
							...baseValidProtocol.codebook.ego.variables,
							invalidRef: {
								name: "InvalidReference",
								type: "text",
								validation: {
									sameAs: "nonexistentEgoVar",
								},
							},
						},
					},
				},
			};

			const result = ProtocolSchemaV8.safeParse(invalidProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				const crossRefError = result.error.issues.find((issue) =>
					issue.message.includes('The variable "nonexistentEgoVar" does not exist in the codebook'),
				);
				expect(crossRefError).toBeDefined();
				expect(crossRefError?.path).toEqual(["codebook", "ego", "variables", "invalidRef", "validation", "sameAs"]);
			}
		});
	});

	describe("Edge Cases and Boundary Conditions", () => {
		it("handles empty stages array", () => {
			const protocolWithNoStages = {
				...baseValidProtocol,
				stages: [],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithNoStages);
			expect(result.success).toBe(true);
		});

		it("handles protocol with minimal codebook", () => {
			const minimalProtocol = {
				name: "Minimal Protocol",
				schemaVersion: 8,
				codebook: {},
				stages: [],
			};

			const result = ProtocolSchemaV8.safeParse(minimalProtocol);
			expect(result.success).toBe(true);
		});

		it("handles stages without form fields", () => {
			const protocolWithoutForm = {
				...baseValidProtocol,
				stages: [
					{
						id: "informationStage",
						type: "Information",
						label: "Information Stage",
						items: [
							{
								id: "item1",
								type: "text",
								content: "This is information",
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithoutForm);
			expect(result.success).toBe(true);
		});

		it("handles stages without prompts", () => {
			const protocolWithoutPrompts = {
				...baseValidProtocol,
				stages: [
					{
						id: "simpleStage",
						type: "Information",
						label: "Simple Stage",
						items: [
							{
								id: "item1",
								type: "text",
								content: "Just some content",
							},
						],
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(protocolWithoutPrompts);
			expect(result.success).toBe(true);
		});

		it("handles complex nested validation scenarios", () => {
			const complexProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "complex1",
						type: "NameGenerator",
						label: "Complex Stage",
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
								text: "Main prompt",
								additionalAttributes: [
									{ variable: "age", value: true },
									{ variable: "category", value: false },
								],
							},
						],
						filter: {
							rules: [
								{
									id: "filterRule1",
									type: "node",
									options: {
										type: "person",
										attribute: "age",
										operator: "GREATER_THAN",
										value: 18,
									},
								},
							],
						},
						skipLogic: {
							action: "SKIP",
							filter: {
								rules: [
									{
										id: "skipRule1",
										type: "ego",
										options: {
											attribute: "egoAge",
											operator: "LESS_THAN",
											value: 21,
										},
									},
								],
							},
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(complexProtocol);
			expect(result.success).toBe(true);
		});

		it("handles multiple validation errors simultaneously", () => {
			const multiErrorProtocol = {
				...baseValidProtocol,
				stages: [
					{
						id: "errorStage",
						type: "NameGenerator",
						label: "Error Stage",
						subject: {
							entity: "node",
							type: "nonexistentNodeType", // Error 1: Invalid subject
						},
						form: {
							fields: [
								{
									variable: "nonexistentVariable", // Error 2: Invalid form field variable
									prompt: "Enter something",
								},
							],
						},
						prompts: [
							{
								id: "prompt1",
								text: "Main prompt",
								additionalAttributes: [
									{ variable: "anotherNonexistent", value: true }, // Error 3: Invalid additional attribute
								],
							},
						],
						filter: {
							rules: [
								{
									id: "rule1",
									type: "node",
									options: {
										type: "anotherNonexistent", // Error 4: Invalid filter entity type
										attribute: "invalidAttribute", // Error 5: Invalid filter attribute
										operator: "EXISTS",
									},
								},
							],
						},
					},
				],
			};

			const result = ProtocolSchemaV8.safeParse(multiErrorProtocol);
			expect(result.success).toBe(false);
			if (!result.success) {
				// Should have multiple errors
				expect(result.error.issues.length).toBeGreaterThan(1);

				// Check for different types of errors
				const subjectError = result.error.issues.find((issue) =>
					issue.message.includes("Stage subject is not defined in the codebook"),
				);
				const formFieldError = result.error.issues.find((issue) =>
					issue.message.includes("Form field variable not found in codebook"),
				);
				const attributeError = result.error.issues.find((issue) =>
					issue.message.includes("One or more sortable properties not defined in codebook"),
				);

				expect(subjectError).toBeDefined();
				expect(formFieldError).toBeDefined();
				expect(attributeError).toBeDefined();
			}
		});
	});
});
