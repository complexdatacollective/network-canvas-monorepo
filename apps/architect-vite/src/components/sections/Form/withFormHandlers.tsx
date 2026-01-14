import { connect } from "react-redux";

type Entity = "node" | "edge" | "ego";

import { compose, withHandlers } from "recompose";
import type { FormAction } from "redux-form";
import { change, SubmissionError } from "redux-form";
import { getTypeForComponent } from "~/config/variables";
import { createVariableAsync, updateVariableAsync } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/modules/root";
import { makeGetVariable } from "../../../selectors/codebook";
import { getCodebookProperties } from "./helpers";

type FormHandlerProps = {
	updateVariable: typeof updateVariableAsync;
	createVariable: typeof createVariableAsync;
	type: string;
	entity: string;
	changeForm: (form: string, field: string, value: unknown) => FormAction;
	form: string;
	getVariable: (uuid: string) => ReturnType<ReturnType<typeof makeGetVariable>>;
	/** Optional mapping of variable names to semantic keys. When a variable is created with a name in this map, the semantic key will be used instead of a UUID. */
	semanticKeyMap?: Record<string, string>;
};

const formHandlers = withHandlers({
	handleChangeFields: (props: FormHandlerProps) => async (values: Record<string, unknown>) => {
		const { variable, component, _createNewVariable, ...rest } = values as {
			variable?: string;
			component?: string;
			_createNewVariable?: string;
			[key: string]: unknown;
		};

		const variableType = getTypeForComponent(component);
		// prune properties that are not part of the codebook:
		const codebookProperties = getCodebookProperties(rest);
		const configuration = {
			type: variableType,
			component,
			...codebookProperties,
		};

		// Register a change in the stage editor
		// `form` here refers to the `section/` parent form, not the fields form
		props.changeForm(props.form, "_modified", Date.now());
		if (!_createNewVariable) {
			const current = props.getVariable(variable ?? "");
			if (!current) {
				throw new SubmissionError({
					_error: "Variable not found",
				});
			}

			const currentVar = current as { component?: string; type?: string; name?: string };
			const baseProps = {
				component: currentVar.component,
				type: currentVar.type,
				name: currentVar.name,
			};

			// Merge is set to false below so that properties that were removed, such
			// as 'options: []' and 'parameters: {}' get deleted.
			await props.updateVariable({
				entity: props.entity as Entity,
				type: props.type,
				variable: variable ?? "",
				configuration: { ...baseProps, ...configuration } as Record<string, unknown>,
				merge: false,
			});

			return {
				variable,
				...rest,
			};
		}

		try {
			// Check if this variable name has a semantic key mapping
			const semanticKey = props.semanticKeyMap?.[_createNewVariable];

			const result = await props.createVariable({
				entity: props.entity as Entity,
				type: props.type,
				configuration: {
					...configuration,
					name: _createNewVariable,
				} as Record<string, unknown>,
				semanticKey,
			});
			const payload = result as unknown as { payload: { variable: string } };
			return {
				variable: payload.payload.variable,
				...rest,
			};
		} catch (e) {
			throw new SubmissionError({ variable: String(e) });
		}
	},
});

const mapDispatchToProps = {
	changeForm: change as (form: string, field: string, value: unknown) => FormAction,
	updateVariable: updateVariableAsync,
	createVariable: createVariableAsync,
};

const mapStateToProps = (state: RootState) => ({
	getVariable: (uuid: string) => makeGetVariable(uuid)(state),
});

const formState = connect(mapStateToProps, mapDispatchToProps);

export default compose(formState, formHandlers);
