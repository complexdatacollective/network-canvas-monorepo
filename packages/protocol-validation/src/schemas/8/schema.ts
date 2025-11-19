import { z } from "zod";
import {
	entityExists,
	filterRuleAttributeExists,
	filterRuleEntityExists,
	findDuplicateId,
	getVariablesForSubject,
	variableExists,
} from "~/utils/validation-helpers";

// Re-export all the split schemas
export * from "./assets";
export * from "./codebook";
export * from "./common";
export * from "./filters";
export * from "./stages";
export * from "./variables";

// Import what we need for the ProtocolSchema
import { getAssetId } from "~/utils/mock-seeds";
import { assetSchema } from "./assets";
import { CodebookSchema, type EdgeDefinition, type NodeDefinition } from "./codebook";
import { ExperimentsSchema, type StageSubject } from "./common";
import { stageSchema } from "./stages";

const ProtocolSchema = z
	.strictObject({
		description: z.string().optional(),
		experiments: ExperimentsSchema.optional(),
		lastModified: z
			.string()
			.datetime()
			.optional()
			.generateMock(() => new Date().toISOString()),
		schemaVersion: z.literal(8),
		codebook: CodebookSchema,
		assetManifest: z.record(z.string(), assetSchema).optional(),
		stages: z.array(stageSchema).superRefine((stages, ctx) => {
			// Check for duplicate stage IDs
			const duplicateStageId = findDuplicateId(stages);
			if (duplicateStageId) {
				ctx.addIssue({
					code: "custom" as const,
					message: `Stages contain duplicate ID "${duplicateStageId}"`,
					path: [],
				});
			}
		}),
	})
	.superRefine((protocol, ctx) => {
		// 1. Sstage validation
		protocol.stages.forEach((stage, stageIndex) => {
			// 3a. Check stage subject exists in codebook
			if ("subject" in stage && stage.subject) {
				if (!entityExists(protocol.codebook, stage.subject)) {
					ctx.addIssue({
						code: "custom" as const,
						message: "Stage subject is not defined in the codebook",
						path: ["stages", stageIndex, "subject"],
					});
				}
			}

			// 2. Form field validation - check variables exist in appropriate codebook entity
			if ("form" in stage && stage.form?.fields) {
				stage.form.fields.forEach((field, fieldIndex) => {
					let subject: StageSubject | undefined;
					if (stage.type === "EgoForm") {
						subject = { entity: "ego" as const };
					} else if ("subject" in stage && stage.subject) {
						subject = stage.subject as { entity: "node" | "edge"; type: string };
					}

					if (subject && !variableExists(protocol.codebook, subject, field.variable)) {
						ctx.addIssue({
							code: "custom" as const,
							message: "Form field variable not found in codebook.",
							path: ["stages", stageIndex, "form", "fields", fieldIndex, "variable"],
						});
					}
				});
			}

			// 3c. Comprehensive prompt validation (duplicate ID validation moved to individual stage schemas)
			if ("prompts" in stage && stage.prompts) {
				stage.prompts.forEach((prompt, promptIndex) => {
					// 3d.i. Variable references in prompts (for bin stages)
					if ("variable" in prompt && prompt.variable && "subject" in stage && stage.subject) {
						if (!variableExists(protocol.codebook, stage.subject, prompt.variable)) {
							const subject = stage.subject;
							ctx.addIssue({
								code: "custom" as const,
								message: `"${prompt.variable}" not defined in codebook[${subject.entity}][${subject.type}].variables`,
								path: ["stages", stageIndex, "prompts", promptIndex, "variable"],
							});
						}
					}

					// 3d.ii. otherVariable validation (for categorical bin)
					if ("otherVariable" in prompt && prompt.otherVariable && "subject" in stage && stage.subject) {
						if (!variableExists(protocol.codebook, stage.subject, prompt.otherVariable)) {
							const subject = stage.subject;
							ctx.addIssue({
								code: "custom" as const,
								message: `"${prompt.otherVariable}" not defined in codebook[${subject.entity}][${subject.type}].variables`,
								path: ["stages", stageIndex, "prompts", promptIndex, "otherVariable"],
							});
						}
					}

					// 3d.iii. createEdge references validation
					if ("createEdge" in prompt && prompt.createEdge) {
						if (!(protocol.codebook.edge && Object.keys(protocol.codebook.edge).includes(prompt.createEdge))) {
							ctx.addIssue({
								code: "custom" as const,
								message: `"${prompt.createEdge}" definition for createEdge not found in codebook["edge"]`,
								path: ["stages", stageIndex, "prompts", promptIndex, "createEdge"],
							});
						}
					}

					// 3d.iv. edgeVariable validation for TieStrengthCensus
					if ("edgeVariable" in prompt && prompt.edgeVariable && "createEdge" in prompt && prompt.createEdge) {
						const edgeSubject = { entity: "edge" as const, type: prompt.createEdge };
						if (!variableExists(protocol.codebook, edgeSubject, prompt.edgeVariable)) {
							ctx.addIssue({
								code: "custom" as const,
								message: `"${prompt.edgeVariable}" not defined in codebook[edge][${prompt.createEdge}].variables`,
								path: ["stages", stageIndex, "prompts", promptIndex, "edgeVariable"],
							});
						} else {
							// Check that it's an ordinal variable
							const variables = getVariablesForSubject(protocol.codebook, edgeSubject);
							const variable = variables[prompt.edgeVariable];
							if (variable && variable.type !== "ordinal") {
								ctx.addIssue({
									code: "custom" as const,
									message: `"${prompt.edgeVariable}" is not of type 'ordinal'.`,
									path: ["stages", stageIndex, "prompts", promptIndex, "edgeVariable"],
								});
							}
						}
					}

					// 3d.v. layoutVariable validation (string only)
					if (
						"layout" in prompt &&
						prompt.layout &&
						"layoutVariable" in prompt.layout &&
						prompt.layout.layoutVariable
					) {
						const layoutVariable = prompt.layout.layoutVariable;
						if (typeof layoutVariable === "string" && "subject" in stage && stage.subject) {
							if (!variableExists(protocol.codebook, stage.subject, layoutVariable)) {
								const subject = stage.subject;
								ctx.addIssue({
									code: "custom" as const,
									message: `Layout variable "${layoutVariable}" not defined in codebook[${subject.entity}][${subject.type}].variables.`,
									path: ["stages", stageIndex, "prompts", promptIndex, "layout", "layoutVariable"],
								});
							}
						}
					}

					// 3d.vi. additionalAttributes validation
					if ("additionalAttributes" in prompt && prompt.additionalAttributes && "subject" in stage && stage.subject) {
						const missingVariables: string[] = [];
						for (const attr of prompt.additionalAttributes) {
							if (!variableExists(protocol.codebook, stage.subject, attr.variable)) {
								missingVariables.push(attr.variable);
							}
						}
						if (missingVariables.length > 0) {
							ctx.addIssue({
								code: "custom" as const,
								message: `One or more sortable properties not defined in codebook: ${missingVariables.join(", ")}`,
								path: ["stages", stageIndex, "prompts", promptIndex, "additionalAttributes"],
							});
						}
					}

					// edges.restrict.origin validation removed - feature was abandoned
				});
			}

			// Note: Panels duplicate ID validation moved to individual stage schemas

			// Note: Items duplicate ID validation moved to individual stage schemas

			// 3g. Filter rules validation (comprehensive)
			if ("filter" in stage && stage.filter?.rules) {
				const duplicateRuleId = findDuplicateId(stage.filter.rules);
				if (duplicateRuleId) {
					ctx.addIssue({
						code: "custom" as const,
						message: `Rules contain duplicate ID "${duplicateRuleId}"`,
						path: ["stages", stageIndex, "filter", "rules"],
					});
				}

				stage.filter.rules.forEach((rule, ruleIndex) => {
					// Check entity exists
					if (!filterRuleEntityExists(rule, protocol.codebook)) {
						ctx.addIssue({
							code: "custom" as const,
							message:
								rule.type === "ego"
									? 'Entity type "Ego" is not defined in codebook'
									: `Rule option type "${rule.options.type}" is not defined in codebook`,
							path: ["stages", stageIndex, "filter", "rules", ruleIndex, "options", "type"],
						});
					}

					// Check attribute exists
					if (rule.options.attribute && !filterRuleAttributeExists(rule, protocol.codebook)) {
						ctx.addIssue({
							code: "custom" as const,
							message: `"${rule.options.attribute}" is not a valid variable ID`,
							path: ["stages", stageIndex, "filter", "rules", ruleIndex, "options", "attribute"],
						});
					}
				});
			}

			// 3h. Check any nested filter rules recursively (for skipLogic, etc.)
			const validateNestedFilters = (obj: unknown, basePath: (string | number)[]) => {
				if (typeof obj === "object" && obj !== null) {
					if ("rules" in obj && Array.isArray(obj.rules)) {
						const rules = obj.rules as unknown[];
						const duplicateNestedRuleId = findDuplicateId(rules as { id: string }[]);
						if (duplicateNestedRuleId) {
							ctx.addIssue({
								code: "custom" as const,
								message: `Rules contain duplicate ID "${duplicateNestedRuleId}"`,
								path: [...basePath, "rules"],
							});
						}
					}
					// Recursively check nested objects
					for (const [key, value] of Object.entries(obj)) {
						validateNestedFilters(value, [...basePath, key]);
					}
				}
			};
			validateNestedFilters(stage, ["stages", stageIndex]);
		});

		// 4. Codebook variable validation
		const validateVariableReferences = (
			variables: Record<string, unknown> | undefined,
			entityPath: string[],
			entityType: "ego" | "node" | "edge",
			entityName?: string,
		) => {
			if (!variables) return;

			for (const [varId, variable] of Object.entries(variables)) {
				if (
					variable &&
					typeof variable === "object" &&
					"validation" in variable &&
					variable.validation &&
					typeof variable.validation === "object"
				) {
					const validation = variable.validation as Record<string, unknown>;

					// Note: Ego-specific validation moved to EgoDefinitionSchema

					// 4b. Cross-reference validations
					const checkCrossRef = (refType: string, refVar: string) => {
						const subject =
							entityType === "ego" ? { entity: "ego" as const } : { entity: entityType, type: entityName || "" };

						if (!variableExists(protocol.codebook, subject, refVar)) {
							ctx.addIssue({
								code: "custom" as const,
								message: `The variable "${refVar}" does not exist in the codebook`,
								path: [...entityPath, varId, "validation", refType],
							});
						}
					};

					if (validation.sameAs && typeof validation.sameAs === "string") {
						checkCrossRef("sameAs", validation.sameAs);
					}
					if (validation.differentFrom && typeof validation.differentFrom === "string") {
						checkCrossRef("differentFrom", validation.differentFrom);
					}
					if (validation.greaterThanVariable && typeof validation.greaterThanVariable === "string") {
						checkCrossRef("greaterThanVariable", validation.greaterThanVariable);
					}
					if (validation.lessThanVariable && typeof validation.lessThanVariable === "string") {
						checkCrossRef("lessThanVariable", validation.lessThanVariable);
					}
				}
			}
		};

		// 5. Apply variable validation to all codebook entities

		// 5a. Validate ego variables
		if (protocol.codebook.ego?.variables) {
			validateVariableReferences(protocol.codebook.ego.variables, ["codebook", "ego", "variables"], "ego");
		}

		// 5b. Validate node variables
		if (protocol.codebook.node) {
			for (const [nodeType, nodeDef] of Object.entries(protocol.codebook.node) as [string, NodeDefinition][]) {
				validateVariableReferences(nodeDef.variables, ["codebook", "node", nodeType, "variables"], "node", nodeType);
			}
		}

		// 5c. Validate edge variables
		if (protocol.codebook.edge) {
			for (const [edgeType, edgeDef] of Object.entries(protocol.codebook.edge) as [string, EdgeDefinition][]) {
				validateVariableReferences(edgeDef.variables, ["codebook", "edge", edgeType, "variables"], "edge", edgeType);
			}
		}
	})
	.generateMock(() => {
		const codebook = CodebookSchema.generateMock();
		const stages = Array.from({ length: 5 }, () => stageSchema.generateMock());

		return {
			description: "Generated Mock Protocol for Testing",
			schemaVersion: 8 as const,
			lastModified: new Date().toISOString(),
			experiments: {
				encryptedVariables: false,
			},
			codebook,
			assetManifest: {
				[getAssetId(0)]: assetSchema.generateMock(),
				[getAssetId(1)]: assetSchema.generateMock(),
			},
			stages,
		};
	});

export type ProtocolSchemaV8 = z.infer<typeof ProtocolSchema>;

export default ProtocolSchema;
