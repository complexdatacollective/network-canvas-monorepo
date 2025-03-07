import { get, isObject } from "es-toolkit/compat";
import type {
	AdditionalAttributes,
	Codebook,
	EntityDefinition,
	FilterRule,
	FormField,
	Item,
	Panel,
	Prompt,
	Protocol,
	Stage,
	StageSubject,
	Validation,
	Variable,
} from "../schemas/8.zod";
import Validator from "./Validator";
import {
	checkDuplicateNestedId,
	duplicateInArray,
	getEntityNames,
	getRuleEntityCodebookDefinition,
	getVariableNameFromID,
	getVariableNames,
	getVariablesForSubject,
} from "./helpers";

/**
 * Define and run all dynamic validations (which aren't covered by the JSON Schema).
 *
 * @return {string[]} an array of failure messages from the validator
 */
export const validateLogic = (protocol: Protocol) => {
	const v = new Validator(protocol);
	const codebook = protocol.codebook;

	v.addValidation<Codebook>(
		"codebook",
		(codebook) => !duplicateInArray(getEntityNames(codebook)),
		(codebook) => `Duplicate entity name "${duplicateInArray(getEntityNames(codebook))}"`,
	);

	v.addValidation<StageSubject>(
		"stages[].subject",
		(subject) => {
			const entity = subject.entity;

			if (entity === "ego") {
				return codebook.ego !== undefined;
			}

			const type = subject.type as keyof Codebook[typeof entity];
			return codebook?.[entity]?.[type] !== undefined;
		},
		() => "Stage subject is not defined in the codebook",
	);

	// Tries to validate inline forms.
	// If the stage type is egoform, lookup variables in codebook[ego]
	// Otherwise, use stage.subject to get codebook reference
	v.addValidationSequence<FormField>("stages[].form.fields[]", [
		(field, _subject, keypath) => {
			// We know that keypath will be in key order, with dedicated keys for array index.
			// Therefore: keypath[1] = 'stages', keypath[2] = [index]
			const stage = get(protocol, `${keypath[1]}${keypath[2]}`);
			let codebookEntity: Protocol["codebook"]["ego"] | Protocol["codebook"]["node"];

			if (stage.type === "EgoForm") {
				codebookEntity = codebook.ego;
			} else {
				const stageSubject = stage.subject;
				const path = `codebook.${stageSubject.entity}.${stageSubject.type}`;

				codebookEntity = get(protocol, path);
			}

			const variable = field.variable;

			return codebookEntity?.variables?.[variable as keyof typeof codebookEntity.variables] !== undefined;
		},
		() => "Form field variable not found in codebook.",
	]);

	// Variable validation...validation (:/)
	// Needs to:
	//   1. Check that any variables referenced by a validation exist in the codebook
	//   2. Check that validation is not applied on a variable that is on an inappropriate
	//      entity type.
	v.addValidation<Validation>(
		"codebook.ego.variables.*.validation",
		// First, check that unique is not applied on any ego variables
		(validation) => !Object.keys(validation).includes("unique"),
		(_, __, keypath) =>
			`The 'unique' variable validation cannot be used on ego variables. Was used on ego variable "${getVariableNameFromID(
				codebook,
				{
					entity: "ego",
				},
				// biome-ignore lint/style/noNonNullAssertion: We know this keypath will exist due to the validation pattern.
				keypath[4]!,
			)}".`,
	);

	v.addValidation<string>(
		/codebook\..*\.variables\..*\.validation\.(sameAs|differentFrom|greaterThanVariable|lessThanVariable)/,
		(variable, _, keypath) => {
			let variablesForType: Record<string, Variable>;

			if (keypath[2] === "ego") {
				// Get variable registryfor the current variable's entity type
				variablesForType = get(protocol, ["codebook", "ego", "variables"], {});
			} else {
				const path = `codebook.${keypath[2]}.${keypath[3]}.variables`;
				variablesForType = get(protocol, path, {});
			}

			// Check that the variable referenced by the validation exists in the codebook
			return !!variablesForType[variable];
		},
		(variable, _, keypath) => {
			if (keypath[2] === "ego") {
				return `Validation configuration for the variable "${getVariableNameFromID(
					codebook,
					{
						entity: "ego",
					},
					// biome-ignore lint/style/noNonNullAssertion: We know this keypath will exist due to the validation pattern.
					keypath[4]!,
				)}" is invalid! The variable "${variable}" does not exist in the codebook for this type.`;
			}

			return `Validation configuration for the variable "${getVariableNameFromID(
				codebook,
				{ entity: keypath[2] as "node" | "edge", type: keypath[3] as string },
				// biome-ignore lint/style/noNonNullAssertion: We know this keypath will exist due to the validation pattern.
				keypath[5]!,
			)}" is invalid! The variable "${variable}" does not exist in the codebook for this type.`;
		},
	);

	v.addValidationSequence<FilterRule>(
		"filter.rules[]",
		[
			(rule) => !!getRuleEntityCodebookDefinition(rule, codebook),
			(rule) => {
				if (rule.type === "ego") {
					return `Entity type "Ego" is not defined in codebook`;
				}

				return `Rule option type "${rule.options.type}" is not defined in codebook`;
			},
		],
		[
			(rule) => {
				if (!rule.options.attribute) {
					return true;
				} // Entity type rules do not have an attribute
				const codebookEntityDefinition = getRuleEntityCodebookDefinition(rule, codebook);
				return !!codebookEntityDefinition?.variables?.[rule.options.attribute];
			},
			(rule) => `"${rule.options.attribute}" is not a valid variable ID`,
		],
	);

	v.addValidation(
		"protocol.stages",
		(stages: Stage[]) => !checkDuplicateNestedId(stages),
		(stages) => `Stages contain duplicate ID "${checkDuplicateNestedId(stages)}"`,
	);

	v.addValidation<Panel[]>(
		"stages[].panels",
		(panels) => !checkDuplicateNestedId(panels),
		(panels) => `Panels contain duplicate ID "${checkDuplicateNestedId(panels)}"`,
	);

	v.addValidation<FilterRule[]>(
		".rules",
		(rules) => !checkDuplicateNestedId(rules),
		(rules) => `Rules contain duplicate ID "${checkDuplicateNestedId(rules)}"`,
	);

	v.addValidation<Prompt[]>(
		"stages[].prompts",
		(prompts) => !checkDuplicateNestedId(prompts),
		(prompts) => `Prompts contain duplicate ID "${checkDuplicateNestedId(prompts)}"`,
	);

	v.addValidation<Item[]>(
		"stages[].items",
		(items) => !checkDuplicateNestedId(items),
		(items) => `Items contain duplicate ID "${checkDuplicateNestedId(items)}"`,
	);

	v.addValidation<EntityDefinition["variables"]>(
		/codebook\..*\.variables/,
		(variableMap) => !duplicateInArray(getVariableNames(variableMap)),
		(variableMap) => `Duplicate variable name "${duplicateInArray(getVariableNames(variableMap))}"`,
	);

	// Ordinal and categorical bin interfaces have a variable property on the prompt.
	// Check this variable exists in the stage subject codebook
	v.addValidation<string>(
		"prompts[].variable",
		// biome-ignore lint/style/noNonNullAssertion: This stage type will always have a stage subject
		(variable, subject) => getVariablesForSubject(codebook, subject!)[variable],
		(variable, subject) => {
			if (!subject) {
				return `Subject not defined for stage. Variable: "${variable}"`;
			}

			if (subject.entity === "ego") {
				return `"Ego" not defined in codebook, but referenced by variable "${variable}".`;
			}

			return `"${variable}" not defined in codebook[${subject.entity}][${subject.type}].variables`;
		},
	);

	// 'otherVariable' is used by categorical bin for 'other' responses. Check this variable
	// exists in the stage subject codebook
	v.addValidation<string>(
		"prompts[].otherVariable",
		// biome-ignore lint/style/noNonNullAssertion: This stage type will always have a stage subject
		(otherVariable, subject) => getVariablesForSubject(codebook, subject!)[otherVariable],
		(otherVariable, subject) => {
			if (!subject) {
				return `Subject not defined for stage. Variable: "${otherVariable}"`;
			}

			if (subject.entity === "ego") {
				return `"Ego" not defined in codebook, but referenced by otherVariable "${otherVariable}".`;
			}

			return `"${otherVariable}" not defined in codebook[${subject.entity}][${subject.type}].variables`;
		},
	);

	// Sociogram and TieStrengthCensus use createEdge to know which edge type to create.
	// Check this edge type exists in the edge codebook
	v.addValidation<string>(
		"prompts[].createEdge",
		(createEdge) => {
			if (!codebook.edge) {
				return false;
			}

			const edgeTypes = Object.keys(codebook.edge);
			return edgeTypes.includes(createEdge);
		},
		(createEdge) => `"${createEdge}" definition for createEdge not found in codebook["edge"]`,
	);

	// TieStrengthCensus uses edgeVariable to indicate which ordinal variable should be used to
	// provide the strength options.
	// Check that it exists on the edge type specified by createEdge, and that its type is ordinal.
	v.addValidationSequence<string>(
		"prompts[].edgeVariable",
		[
			(edgeVariable, _, keypath) => {
				// Keypath = [ 'protocol', 'stages', '[{stageIndex}]', 'prompts', '[{promptIndex}]', 'edgeVariable' ]
				const path = `stages.${keypath[2]}.prompts${keypath[4]}.createEdge`;
				const createEdgeForPrompt = get(protocol, path);
				return getVariablesForSubject(codebook, {
					entity: "edge",
					type: createEdgeForPrompt,
				})[edgeVariable];
			},
			(edgeVariable, _, keypath) => {
				const path = `stages.${keypath[2]}.prompts${keypath[4]}.createEdge`;
				const createEdgeForPrompt = get(protocol, path);
				return `"${edgeVariable}" not defined in codebook[edge][${createEdgeForPrompt}].variables`;
			},
		],
		[
			(edgeVariable, _, keypath) => {
				// Keypath = [ 'protocol', 'stages', '[{stageIndex}]', 'prompts', '[{promptIndex}]', 'edgeVariable' ]
				const path = `stages.${keypath[2]}.prompts${keypath[4]}.createEdge`;
				const createEdgeForPrompt = get(protocol, path);
				const codebookEdgeVariable = getVariablesForSubject(codebook, {
					entity: "edge",
					type: createEdgeForPrompt,
				})[edgeVariable];

				return codebookEdgeVariable.type === "ordinal";
			},
			(edgeVariable) => `"${edgeVariable}" is not of type 'ordinal'.`,
		],
	);

	// layoutVariable can either be a string, or an object where the key is a node type and the value
	// is a variable ID.
	v.addValidation<string>(
		"prompts[].layout.layoutVariable",
		(variable, subject) => {
			if (isObject(variable)) {
				return Object.keys(variable).every(
					(nodeType) =>
						getVariablesForSubject(codebook, {
							entity: "node",
							type: nodeType,
						})[variable[nodeType]],
				);
			}

			// biome-ignore lint/style/noNonNullAssertion: This stage type will always have a stage subject
			return getVariablesForSubject(codebook, subject!)[variable];
		},
		(variable, subject) => {
			if (isObject(variable)) {
				const missing = Object.keys(variable).filter(
					(nodeType) =>
						!getVariablesForSubject(codebook, {
							entity: "node",
							type: nodeType,
						})[variable[nodeType]],
				);
				return missing
					.map(
						(nodeType) =>
							`Layout variable "${variable[nodeType]}" not defined in codebook[node][${nodeType}].variables.`,
					)
					.join(" ");
			}

			if (!subject) {
				return `Subject not defined for stage. Variable: "${variable}"`;
			}

			if (subject.entity === "ego") {
				return `"Ego" not defined in codebook, but referenced by layoutVariable "${variable}".`;
			}

			return `Layout variable "${variable}" not defined in codebook[${subject.entity}][${subject.type}].variables.`;
		},
	);

	v.addValidation<AdditionalAttributes>(
		"prompts[].additionalAttributes",
		(additionalAttributes, subject) =>
			// biome-ignore lint/style/noNonNullAssertion: This stage type will always have a stage subject
			additionalAttributes.every(({ variable }) => getVariablesForSubject(codebook, subject!)[variable]),
		(additionalAttributes) =>
			`One or more sortable properties not defined in codebook: ${additionalAttributes.map(
				({ variable }) => variable,
			)}`,
	);

	// Sociogram prompt edges key can contain a restrict object.

	// If restrict.origin is present, its value must be a valid node type.
	v.addValidation<string>(
		"prompts[].edges.restrict.origin",
		(origin) => {
			if (!codebook.node) return false;
			return Object.keys(codebook.node).includes(origin);
		},
		(origin) => `"${origin}" is not a valid node type.`,
	);

	v.runValidations();

	for (const warning of v.warnings) {
		console.error(warning); // eslint-disable-line no-console
	}

	if (v.errors.length > 0) {
		return {
			hasErrors: true,
			errors: v.errors,
		};
	}

	return {
		hasErrors: false,
		errors: [],
	};
};
