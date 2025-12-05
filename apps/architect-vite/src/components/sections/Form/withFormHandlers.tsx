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

const formHandlers = withHandlers({
	handleChangeFields:
		({ updateVariable, createVariable, type, entity, changeForm, form, getVariable }) =>
		async (values: Record<string, unknown>) => {
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
			changeForm(form, "_modified", Date.now());
			if (!_createNewVariable) {
				const current = getVariable(variable ?? "");
				if (!current) {
					throw new SubmissionError({
						_error: "Variable not found",
					});
				}

				const baseProps = {
					component: current.component,
					type: current.type,
					name: current.name,
				};

				// Merge is set to false below so that properties that were removed, such
				// as 'options: []' and 'parameters: {}' get deleted.
				await updateVariable({
					entity: entity as Entity,
					type,
					variable: variable ?? "",
					configuration: { ...baseProps, ...configuration },
					merge: false,
				});

				return {
					variable,
					...rest,
				};
			}

			return createVariable({
				entity: entity as Entity,
				type,
				configuration: {
					...configuration,
					name: _createNewVariable,
				},
			})
				.then(({ variable: newVariable }: { variable: string }) => ({
					variable: newVariable,
					...rest,
				}))
				.catch((e: Error) => {
					throw new SubmissionError({ variable: e.toString() });
				});
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
