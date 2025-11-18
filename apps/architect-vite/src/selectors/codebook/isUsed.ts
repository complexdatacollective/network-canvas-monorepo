import type { EdgeDefinition, EgoDefinition, NodeDefinition, Validation } from "@codaco/protocol-validation";
import { createSelector } from "@reduxjs/toolkit";
import { cloneDeep, get, omit } from "lodash";
import { getFormNames, getFormValues } from "redux-form";
import { formName as EditableListFormName } from "~/components/EditableList";
import { formName as StageEditorFormName } from "~/components/StageEditor/configuration";
import type { RootState } from "~/ducks/store";
import { getCodebook, getProtocol } from "../protocol";
import { getIdsFromCodebook } from "./helpers";

// Types
export interface GetIsUsedOptions {
	formNames?: string[];
	excludePaths?: string[];
}

interface IsUsedMap {
	[variableId: string]: boolean;
}

interface VariableOption {
	label: string;
	value: string;
	type?: string;
	color?: string;
	isUsed?: boolean;
}

// Helper selectors
const getFormsSelector = (formNames: string[]) =>
	createSelector([(state: RootState) => state], (state) => {
		const forms: Record<string, any> = {};
		formNames.forEach((formName) => {
			forms[formName] = getFormValues(formName)(state);
		});
		return forms;
	});

const getAllFormsSelector = createSelector([(state: RootState) => state], (state) => {
	const allFormNames = getFormNames(state);
	// Ensure allFormNames is an array
	const formNamesArray = Array.isArray(allFormNames) ? allFormNames : [];
	const forms: Record<string, any> = {};
	formNamesArray.forEach((formName) => {
		forms[formName] = getFormValues(formName)(state);
	});
	return forms;
});

// Extract variable validations from codebook
const getVariableValidationsSelector = createSelector([getCodebook], (codebook): Validation[] => {
	if (!codebook) return [];

	const validations: Validation[] = [];

	const getEntityVariableValidations = (
		entityDefinition: NodeDefinition | EdgeDefinition | EgoDefinition | undefined,
	): Validation[] => {
		if (!entityDefinition?.variables) {
			return [];
		}

		return Object.values(entityDefinition.variables).reduce<Validation[]>((memo, variable) => {
			if ("validation" in variable && variable.validation) {
				memo.push(variable.validation);
			}
			return memo;
		}, []);
	};

	// Process ego
	if (codebook.ego) {
		validations.push(...getEntityVariableValidations(codebook.ego));
	}

	// Process nodes
	if (codebook.node) {
		for (const entityDefinition of Object.values(codebook.node)) {
			validations.push(...getEntityVariableValidations(entityDefinition));
		}
	}

	// Process edges
	if (codebook.edge) {
		for (const entityDefinition of Object.values(codebook.edge)) {
			validations.push(...getEntityVariableValidations(entityDefinition));
		}
	}

	return validations;
});

/**
 * Gets a key value object describing which variables are in use (including in redux forms).
 *
 * Naive implementation: just checks if the variable id is in the flattened
 * protocol, or any redux forms.
 *
 * JRM BUGFIX: This previously did not check for `sameAs` or `differentFrom`
 * variable references that are contained within codebook variable definitions.
 * This caused a bug where these variables were able to be removed, creating
 * references to variables that no longer existed.
 *
 * @param options - options object
 * @param options.formNames - names of forms to check for variable usage
 * @param options.excludePaths - paths to exclude from the check (e.g. 'stages')
 * @returns selector function that returns a key value object describing which variables are in use
 */
export const makeGetIsUsed = (options: GetIsUsedOptions = {}) => {
	const { formNames = [StageEditorFormName, EditableListFormName], excludePaths = [] } = options;

	// Create the forms selector based on whether we have specific form names or not
	const formsSelector = formNames.length > 0 ? getFormsSelector(formNames) : getAllFormsSelector;

	return createSelector(
		[getProtocol, formsSelector, getVariableValidationsSelector],
		(protocol, forms, validations): IsUsedMap => {
			if (!protocol || !protocol.codebook) {
				return {};
			}

			const variableIds = getIdsFromCodebook(protocol.codebook);
			const searchLocations = {
				stages: protocol.stages,
				forms,
				validations,
			};

			const data = excludePaths.length > 0 ? omit(cloneDeep(searchLocations), excludePaths) : searchLocations;
			const flattenedData = JSON.stringify(data);

			const isUsed = variableIds.reduce<IsUsedMap>(
				(memo, variableId) => ({
					...memo,
					[variableId]: flattenedData.includes(`"${variableId}"`),
				}),
				{},
			);

			return isUsed;
		},
	);
};

// Default instance of getIsUsed
export const getIsUsed = makeGetIsUsed();

/**
 * Factory function that creates a selector to add isUsed property to variable options
 * @param isUsedOptions - options to pass to getIsUsed
 * @returns memoized selector that adds isUsed property to options
 */
export const makeOptionsWithIsUsedSelector = (isUsedOptions: GetIsUsedOptions = {}) => {
	const isUsedSelector = makeGetIsUsed(isUsedOptions);

	return createSelector(
		[isUsedSelector, (_state: RootState, options: VariableOption[]) => options],
		(isUsed, options): VariableOption[] => {
			return options.map(({ value, ...rest }) => ({
				...rest,
				value,
				isUsed: get(isUsed, value, false),
			}));
		},
	);
};
