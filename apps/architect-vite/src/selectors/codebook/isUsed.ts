import { createSelector } from "@reduxjs/toolkit";
import { get } from "lodash";
import { getFormNames, getFormValues } from "redux-form";
import { formName as EditableListFormName } from "~/components/EditableList";
import { formName as StageEditorFormName } from "~/components/StageEditor/configuration";
import type { RootState } from "~/ducks/store";
import { getVariableIndex } from "../indexes";
import { getProtocol } from "../protocol";
import { getIdsFromCodebook } from "./helpers";

// Types
export type GetIsUsedOptions = {
	formNames?: string[];
	excludePaths?: string[];
};

type IsUsedMap = {
	[variableId: string]: boolean;
};

type VariableOption = {
	label: string;
	value: string;
	type?: string;
	color?: string;
	isUsed?: boolean;
};

// Helper selectors
const getFormsSelector = (formNames: string[]) =>
	createSelector([(state: RootState) => state], (state) => {
		const forms: Record<string, unknown> = {};
		formNames.forEach((formName) => {
			forms[formName] = getFormValues(formName)(state);
		});
		return forms;
	});

const getAllFormsSelector = createSelector([(state: RootState) => state], (state) => {
	const allFormNames = getFormNames(state as unknown as Parameters<typeof getFormNames>[0]);
	// Ensure allFormNames is an array
	const formNamesArray = Array.isArray(allFormNames) ? allFormNames : [];
	const forms: Record<string, unknown> = {};
	formNamesArray.forEach((formName) => {
		forms[formName] = getFormValues(formName)(state);
	});
	return forms;
});

/**
 * Gets a key value object describing which variables are in use (including in redux forms).
 *
 * Uses the same path-based detection as getVariableIndex (defined in indexes.js) to ensure
 * consistency between "is used" checks and "where used" display. Both systems share the
 * same source of truth: paths.variables.
 *
 * For redux forms (unsaved changes), JSON string search is used since form paths are dynamic.
 *
 * @param options - options object
 * @param options.formNames - names of forms to check for variable usage
 * @param options.excludePaths - paths to exclude from the check (e.g. 'stages') - currently unused
 * @returns selector function that returns a key value object describing which variables are in use
 */
export const makeGetIsUsed = (options: GetIsUsedOptions = {}) => {
	const { formNames = [StageEditorFormName, EditableListFormName] } = options;

	// Create the forms selector based on whether we have specific form names or not
	const formsSelector = formNames.length > 0 ? getFormsSelector(formNames) : getAllFormsSelector;

	// Uses getVariableIndex to share the same source of truth as usage display
	return createSelector([getProtocol, formsSelector, getVariableIndex], (protocol, forms, variableIndex): IsUsedMap => {
		if (!protocol || !protocol.codebook) {
			return {};
		}

		const variableIds = getIdsFromCodebook(protocol.codebook);

		// Variables referenced at known paths (same source as usage display)
		const referencedVariables = new Set(Object.values(variableIndex));

		// For forms (unsaved changes), use JSON search since form structure is dynamic
		const formsData = JSON.stringify(forms);

		const isUsed = variableIds.reduce<IsUsedMap>((memo, variableId) => {
			const inProtocol = referencedVariables.has(variableId);
			const inForms = formsData.includes(`"${variableId}"`);

			memo[variableId] = inProtocol || inForms;
			return memo;
		}, {});

		return isUsed;
	});
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
