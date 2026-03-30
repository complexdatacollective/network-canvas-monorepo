import { z } from "~/utils/zod-mock-extension";

export * from "../8/assets";
export * from "../8/codebook";
export * from "../8/common/experiments";
export * from "../8/common/forms";
export * from "../8/common/introductionPanel";
export * from "../8/common/panels";
export * from "../8/common/prompts";
export * from "../8/common/subjects";
export * from "../8/filters";
export * from "../8/variables";

export * from "./stages";
export * from "./timeline";

import {
	entityExists,
	filterRuleAttributeExists,
	filterRuleEntityExists,
	findDuplicateId,
	getFilterRuleVariableType,
	getVariablesForSubject,
	variableExists,
} from "~/utils/validation-helpers";
import { assetSchema } from "../8/assets";
import { CodebookSchema, type EdgeDefinition, type NodeDefinition } from "../8/codebook";
import type { FormField, StageSubject } from "../8/common";
import { ExperimentsSchema } from "../8/common/experiments";
import type { FilterRule } from "../8/filters";
import { OperatorsByVariableType } from "../8/filters/filter";
import type { Prompt } from "./stages";
import type { BranchSlot } from "./timeline/branch";
import { timelineSchema } from "./timeline/timeline";
import { validateCollectionConstraints } from "./validation/collections";
import { flattenAllEntities, flattenStageEntities } from "./validation/flatten";
import { validateAllPathsTerminate, validateNoCycles, validateNoOrphans } from "./validation/graph";
import { validateIdUniqueness, validateStartReference, validateTargetReferences } from "./validation/references";

function validateFilterRules(
	rules: FilterRule[],
	codebook: z.infer<typeof CodebookSchema>,
	basePath: (string | number)[],
	ctx: z.RefinementCtx,
) {
	const duplicateRuleId = findDuplicateId(rules);
	if (duplicateRuleId) {
		ctx.addIssue({
			code: "custom",
			message: `Rules contain duplicate ID "${duplicateRuleId}"`,
			path: [...basePath, "rules"],
		});
	}

	rules.forEach((rule: FilterRule, ruleIndex: number) => {
		if (!filterRuleEntityExists(rule, codebook)) {
			ctx.addIssue({
				code: "custom",
				message:
					rule.type === "ego"
						? 'Entity type "Ego" is not defined in codebook'
						: `Rule option type "${rule.options.type}" is not defined in codebook`,
				path: [...basePath, "rules", ruleIndex, "options", "type"],
			});
		}

		const hasAttribute = "attribute" in rule.options && rule.options.attribute;

		const attributeExists = !hasAttribute || filterRuleAttributeExists(rule, codebook);
		if (!attributeExists && hasAttribute && "attribute" in rule.options) {
			ctx.addIssue({
				code: "custom",
				message: `"${rule.options.attribute}" is not a valid variable ID`,
				path: [...basePath, "rules", ruleIndex, "options", "attribute"],
			});
		}

		if (hasAttribute && attributeExists) {
			const variableType = getFilterRuleVariableType(rule, codebook);
			if (variableType) {
				const validOperators = OperatorsByVariableType[variableType];
				if (validOperators && !validOperators.includes(rule.options.operator)) {
					ctx.addIssue({
						code: "custom",
						message: `Operator "${rule.options.operator}" is not valid for variable type "${variableType}". Valid operators: ${validOperators.join(", ")}`,
						path: [...basePath, "rules", ruleIndex, "options", "operator"],
					});
				}

				if (rule.options.value !== undefined) {
					const valueType = Array.isArray(rule.options.value) ? "array" : typeof rule.options.value;

					const numericComparisonOperators = [
						"GREATER_THAN",
						"GREATER_THAN_OR_EQUAL",
						"LESS_THAN",
						"LESS_THAN_OR_EQUAL",
					];
					const optionsCountOperators = [
						"OPTIONS_GREATER_THAN",
						"OPTIONS_LESS_THAN",
						"OPTIONS_EQUALS",
						"OPTIONS_NOT_EQUALS",
					];
					const stringValueOperators = ["CONTAINS", "DOES_NOT_CONTAIN"];

					if (numericComparisonOperators.includes(rule.options.operator) && valueType !== "number") {
						ctx.addIssue({
							code: "custom",
							message: `Operator "${rule.options.operator}" requires a numeric value, but got ${valueType}`,
							path: [...basePath, "rules", ruleIndex, "options", "value"],
						});
					}

					if (optionsCountOperators.includes(rule.options.operator) && valueType !== "number") {
						ctx.addIssue({
							code: "custom",
							message: `Operator "${rule.options.operator}" requires a numeric value (count), but got ${valueType}`,
							path: [...basePath, "rules", ruleIndex, "options", "value"],
						});
					}

					if (stringValueOperators.includes(rule.options.operator) && valueType !== "string") {
						ctx.addIssue({
							code: "custom",
							message: `Operator "${rule.options.operator}" requires a string value, but got ${valueType}`,
							path: [...basePath, "rules", ruleIndex, "options", "value"],
						});
					}
				}
			}
		}
	});
}

const ProtocolSchema = z
	.strictObject({
		name: z.string().min(1),
		description: z.string().optional(),
		experiments: ExperimentsSchema.optional(),
		lastModified: z.string().datetime().optional(),
		schemaVersion: z.literal(9),
		codebook: CodebookSchema,
		assetManifest: z.record(z.string(), assetSchema).optional(),
		timeline: timelineSchema,
	})
	.superRefine((protocol, ctx) => {
		// 1. Graph validation
		const graphErrors = [
			...validateIdUniqueness(protocol.timeline.entities),
			...validateTargetReferences(protocol.timeline.entities),
			...validateStartReference(protocol.timeline),
			...validateNoCycles(protocol.timeline),
			...validateAllPathsTerminate(protocol.timeline),
			...validateNoOrphans(protocol.timeline),
			...validateCollectionConstraints(protocol.timeline.entities),
		];

		for (const error of graphErrors) {
			ctx.addIssue({ code: "custom", message: error, path: ["timeline"] });
		}

		// 2. Stage codebook cross-reference validation
		const stages = flattenStageEntities(protocol.timeline.entities);

		for (const stage of stages) {
			const stagePath = ["timeline", stage.id];

			if ("subject" in stage && stage.subject) {
				if (!entityExists(protocol.codebook, stage.subject)) {
					ctx.addIssue({
						code: "custom",
						message: "Stage subject is not defined in the codebook",
						path: [...stagePath, "subject"],
					});
				}
			}

			if ("form" in stage && stage.form?.fields) {
				stage.form.fields.forEach((field: FormField, fieldIndex: number) => {
					let subject: StageSubject | undefined;
					if (stage.stageType === "EgoForm") {
						subject = { entity: "ego" as const };
					} else if ("subject" in stage && stage.subject) {
						subject = stage.subject as { entity: "node" | "edge"; type: string };
					}

					if (subject && !variableExists(protocol.codebook, subject, field.variable)) {
						ctx.addIssue({
							code: "custom",
							message: "Form field variable not found in codebook.",
							path: [...stagePath, "form", "fields", fieldIndex, "variable"],
						});
					}
				});
			}

			if ("prompts" in stage && stage.prompts) {
				stage.prompts.forEach((prompt: Prompt, promptIndex: number) => {
					if ("variable" in prompt && prompt.variable && "subject" in stage && stage.subject) {
						if (!variableExists(protocol.codebook, stage.subject, prompt.variable)) {
							const subject = stage.subject;
							ctx.addIssue({
								code: "custom",
								message: `"${prompt.variable}" not defined in codebook[${subject.entity}][${subject.type}].variables`,
								path: [...stagePath, "prompts", promptIndex, "variable"],
							});
						}
					}

					if ("otherVariable" in prompt && prompt.otherVariable && "subject" in stage && stage.subject) {
						if (!variableExists(protocol.codebook, stage.subject, prompt.otherVariable)) {
							const subject = stage.subject;
							ctx.addIssue({
								code: "custom",
								message: `"${prompt.otherVariable}" not defined in codebook[${subject.entity}][${subject.type}].variables`,
								path: [...stagePath, "prompts", promptIndex, "otherVariable"],
							});
						}
					}

					if ("createEdge" in prompt && prompt.createEdge) {
						if (!(protocol.codebook.edge && Object.keys(protocol.codebook.edge).includes(prompt.createEdge))) {
							ctx.addIssue({
								code: "custom",
								message: `"${prompt.createEdge}" definition for createEdge not found in codebook["edge"]`,
								path: [...stagePath, "prompts", promptIndex, "createEdge"],
							});
						}
					}

					if ("edgeVariable" in prompt && prompt.edgeVariable && "createEdge" in prompt && prompt.createEdge) {
						const edgeSubject = {
							entity: "edge" as const,
							type: prompt.createEdge,
						};
						if (!variableExists(protocol.codebook, edgeSubject, prompt.edgeVariable)) {
							ctx.addIssue({
								code: "custom",
								message: `"${prompt.edgeVariable}" not defined in codebook[edge][${prompt.createEdge}].variables`,
								path: [...stagePath, "prompts", promptIndex, "edgeVariable"],
							});
						} else {
							const variables = getVariablesForSubject(protocol.codebook, edgeSubject);
							const variable = variables[prompt.edgeVariable];
							if (variable && variable.type !== "ordinal") {
								ctx.addIssue({
									code: "custom",
									message: `"${prompt.edgeVariable}" is not of type 'ordinal'.`,
									path: [...stagePath, "prompts", promptIndex, "edgeVariable"],
								});
							}
						}
					}

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
									code: "custom",
									message: `Layout variable "${layoutVariable}" not defined in codebook[${subject.entity}][${subject.type}].variables.`,
									path: [...stagePath, "prompts", promptIndex, "layout", "layoutVariable"],
								});
							}
						}
					}

					if ("additionalAttributes" in prompt && prompt.additionalAttributes && "subject" in stage && stage.subject) {
						const missingVariables: string[] = [];
						for (const attr of prompt.additionalAttributes) {
							if (!variableExists(protocol.codebook, stage.subject, attr.variable)) {
								missingVariables.push(attr.variable);
							}
						}
						if (missingVariables.length > 0) {
							ctx.addIssue({
								code: "custom",
								message: `One or more sortable properties not defined in codebook: ${missingVariables.join(", ")}`,
								path: [...stagePath, "prompts", promptIndex, "additionalAttributes"],
							});
						}
					}
				});
			}

			// Stage-level filter validation
			if ("filter" in stage && stage.filter?.rules) {
				validateFilterRules(stage.filter.rules, protocol.codebook, [...stagePath, "filter"], ctx);
			}
		}

		// 3. Branch slot filter validation
		for (const entity of flattenAllEntities(protocol.timeline.entities)) {
			if (entity.type === "Branch") {
				const branch = entity as { id: string; slots: BranchSlot[] };
				for (const slot of branch.slots) {
					if (slot.filter?.rules) {
						validateFilterRules(
							slot.filter.rules,
							protocol.codebook,
							["timeline", branch.id, "slots", slot.id, "filter"],
							ctx,
						);
					}
				}
			}
		}

		// 4. Codebook variable cross-reference validation
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

					const checkCrossRef = (refType: string, refVar: string) => {
						const subject =
							entityType === "ego" ? { entity: "ego" as const } : { entity: entityType, type: entityName || "" };

						if (!variableExists(protocol.codebook, subject, refVar)) {
							ctx.addIssue({
								code: "custom",
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
					if (validation.greaterThanOrEqualToVariable && typeof validation.greaterThanOrEqualToVariable === "string") {
						checkCrossRef("greaterThanOrEqualToVariable", validation.greaterThanOrEqualToVariable);
					}
					if (validation.lessThanOrEqualToVariable && typeof validation.lessThanOrEqualToVariable === "string") {
						checkCrossRef("lessThanOrEqualToVariable", validation.lessThanOrEqualToVariable);
					}
				}
			}
		};

		// 5. Apply variable validation to all codebook entities

		if (protocol.codebook.ego?.variables) {
			validateVariableReferences(protocol.codebook.ego.variables, ["codebook", "ego", "variables"], "ego");
		}

		if (protocol.codebook.node) {
			const discreteEligibleTypes = new Set(["categorical", "ordinal", "boolean"]);
			const breakpointEligibleTypes = new Set(["number", "scalar"]);

			for (const [nodeType, nodeDef] of Object.entries(protocol.codebook.node) as [string, NodeDefinition][]) {
				validateVariableReferences(nodeDef.variables, ["codebook", "node", nodeType, "variables"], "node", nodeType);

				if (nodeDef.shape?.dynamic) {
					const { dynamic } = nodeDef.shape;
					const basePath = ["codebook", "node", nodeType, "shape", "dynamic"];

					if (!nodeDef.variables || !(dynamic.variable in nodeDef.variables)) {
						ctx.addIssue({
							code: "custom",
							message: `Shape mapping variable "${dynamic.variable}" is not defined in this node type's variables`,
							path: [...basePath, "variable"],
						});
					} else {
						const variable = nodeDef.variables[dynamic.variable];
						if (variable) {
							if (dynamic.type === "discrete" && !discreteEligibleTypes.has(variable.type)) {
								ctx.addIssue({
									code: "custom",
									message: `Discrete shape mapping requires a categorical, ordinal, or boolean variable, but "${dynamic.variable}" is of type "${variable.type}"`,
									path: [...basePath, "type"],
								});
							}
							if (dynamic.type === "breakpoints" && !breakpointEligibleTypes.has(variable.type)) {
								ctx.addIssue({
									code: "custom",
									message: `Breakpoint shape mapping requires a number or scalar variable, but "${dynamic.variable}" is of type "${variable.type}"`,
									path: [...basePath, "type"],
								});
							}
						}
					}
				}
			}
		}

		if (protocol.codebook.edge) {
			for (const [edgeType, edgeDef] of Object.entries(protocol.codebook.edge) as [string, EdgeDefinition][]) {
				validateVariableReferences(edgeDef.variables, ["codebook", "edge", edgeType, "variables"], "edge", edgeType);
			}
		}
	});

export default ProtocolSchema;
