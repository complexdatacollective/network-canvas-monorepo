import { find, get, has } from "es-toolkit/compat";
import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import {
	formattedInputOptions,
	getComponentsForType,
	getTypeForComponent,
	INPUT_OPTIONS,
	VARIABLE_TYPES_WITH_COMPONENTS,
} from "~/config/variables";
import { actionCreators as codebookActions } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubjectSelector, getVariablesForSubjectSelector } from "~/selectors/codebook";

type UseFieldHandlerProps = {
	form: string;
	entity: string;
	type: string;
};

export const useFieldHandlers = ({ form, entity, type }: UseFieldHandlerProps) => {
	const dispatch = useDispatch();
	const changeField = useCallback(
		(field: string, value: any) => dispatch(change(form, field, value)),
		[dispatch, form],
	);
	const deleteVariable = useCallback(
		(variable: string) => dispatch(codebookActions.deleteVariable(entity, type, variable)),
		[dispatch, entity, type],
	);

	// Create separate selectors for each field to avoid creating new objects
	const makeFormFieldSelector = useCallback(
		(field: string) => {
			return (state: RootState) => formValueSelector(form)(state, field);
		},
		[form],
	);

	// Use separate selectors for each field
	const variable = useSelector(makeFormFieldSelector("variable"));
	const component = useSelector(makeFormFieldSelector("component"));
	const createNewVariable = useSelector(makeFormFieldSelector("_createNewVariable"));

	const isNewVariable = !!createNewVariable;

	// Create subject object once to ensure stable reference
	const subject = useMemo(() => ({ entity, type }), [entity, type]) as {
		entity: "node" | "edge" | "ego";
		type?: string;
	};

	// Use the properly memoized selectors
	const existingVariables = useSelector((state: RootState) => getVariablesForSubjectSelector(state, subject));

	const baseVariableOptions = useSelector((state: RootState) =>
		getVariableOptionsForSubjectSelector(state, subject, {}),
	);

	// Memoize the filtered and concatenated variable options
	const variableOptions = useMemo(() => {
		const filtered = baseVariableOptions
			// If not a variable with corresponding component, we can't use it here.
			.filter(({ type: variableType }: any) => VARIABLE_TYPES_WITH_COMPONENTS.includes(variableType));

		// with New variable
		return isNewVariable ? filtered.concat([{ label: createNewVariable, value: createNewVariable }]) : filtered;
	}, [baseVariableOptions, isNewVariable, createNewVariable]);

	// 1. If type defined use that (existing variable)
	// 2. Otherwise derive it from component (new variable)
	const variableType = get(existingVariables, [variable, "type"], getTypeForComponent(component));

	// 1. If type defined, show components that match (existing variable)
	// 2. Otherwise list all INPUT_OPTIONS (new variable)
	const componentOptions = variableType && !isNewVariable ? getComponentsForType(variableType) : formattedInputOptions;

	const metaForType = find(INPUT_OPTIONS, { value: component });

	const handleChangeComponent = useCallback(
		(_e: any, value: string) => {
			const typeForComponent = getTypeForComponent(value);

			// If we have changed type, also reset validation since options may not be
			// applicable.
			if (variableType !== typeForComponent) {
				changeField("validation", null);
				changeField("options", null);
				// Special case for boolean, where BooleanChoice has options but Toggle doesn't
			} else if (variableType === "boolean") {
				changeField("options", null);
			}

			// Always reset parameters since they depend on the component
			changeField("parameters", null);
		},
		[changeField, variableType],
	);

	const handleChangeVariable = useCallback(
		(_: any, value: any) => {
			// Either load settings from codebook, or reset
			const options = get(existingVariables, [value, "options"], null);
			const parameters = get(existingVariables, [value, "parameters"], null);
			const validation = get(existingVariables, [value, "validation"], null);
			const component = get(existingVariables, [value, "component"], null);

			// If value was set to something from codebook, reset this flag
			if (has(existingVariables, value)) {
				changeField("_createNewVariable", null);
			}
			changeField("component", component);
			changeField("options", options);
			changeField("parameters", parameters);
			changeField("validation", validation);
		},
		[changeField, existingVariables],
	);

	const handleDeleteVariable = useCallback(
		(variable: string) => {
			deleteVariable(variable);
		},
		[deleteVariable],
	);

	const handleNewVariable = useCallback(
		(value: any) => {
			changeField("_createNewVariable", value);
			changeField("variable", value);
			return value;
		},
		[changeField],
	);

	return {
		variable,
		variableType,
		variableOptions,
		componentOptions,
		component,
		metaForType,
		existingVariables,
		isNewVariable,
		handleNewVariable,
		handleChangeComponent,
		handleChangeVariable,
		handleDeleteVariable,
	};
};
