import type { FilterRule, VariableType } from "@codaco/protocol-validation";
import type { UnknownAction } from "@reduxjs/toolkit";
import React from "react";
import { useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import BooleanField from "~/components/Form/Fields/BooleanField";
import ValidatedField from "~/components/Form/ValidatedField";
import Tip from "~/components/Tip";
import { useAppDispatch } from "~/ducks/hooks";
import type { AppDispatch, RootState } from "~/ducks/store";
import { createVariableAsync } from "../../../ducks/modules/protocol/codebook";
import DetachedField from "../../DetachedField";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import EntitySelectField from "../fields/EntitySelectField/EntitySelectField";
import { getEdgeFilters, getHighlightVariablesForSubject } from "./selectors";
import getEdgeFilteringWarning from "./utils";

// TODO: Move this somewhere else!
// This was created as part of removing the HOC pattern used throughout the app.
// It replaces withCreateVariableHandler. Other uses of this handler could be
// updated to use this function.
// Internal helper - not exported
const createVariableHandler =
	(dispatch: AppDispatch, entity: string, type: VariableType, form: string) =>
	async (variableName: string, variableType: VariableType, field: string) => {
		const withType = variableType ? { type: variableType } : {};

		const configuration = {
			name: variableName,
			...withType,
		};

		const result = await dispatch(
			createVariableAsync({
				entity: entity as "node" | "edge" | "ego",
				type,
				configuration,
			}),
		).unwrap();

		const { variable } = result;

		// If we supplied a field, update it with the result of the variable creation
		if (field) {
			dispatch(change(form, field, variable) as UnknownAction);
		}

		return variable;
	};

const TAP_BEHAVIOURS = {
	CREATE_EDGES: "create edges",
	HIGHLIGHT_ATTRIBUTES: "highlight attributes",
};

type TapBehaviourProps = {
	form: string;
	entity: string;
	type: string;
};

const TapBehaviour = ({ form, type, entity }: TapBehaviourProps) => {
	const dispatch = useAppDispatch();
	const getFormValue = formValueSelector(form);
	const hasCreateEdgeBehaviour = useSelector((state: RootState) => !!getFormValue(state, "edges.create"));
	const hasToggleAttributeBehaviour = useSelector(
		(state: RootState) => !!getFormValue(state, "highlight.allowHighlighting"),
	);
	const highlightVariable = useSelector((state: RootState) => getFormValue(state, "highlight.variable"));

	const highlightVariablesForSubject = useSelector((state: RootState) =>
		getHighlightVariablesForSubject(state, { type, entity }),
	);

	const handleCreateVariable = createVariableHandler(dispatch, entity, type, form);

	const initialState = () => {
		if (hasCreateEdgeBehaviour) {
			return TAP_BEHAVIOURS.CREATE_EDGES;
		}

		if (hasToggleAttributeBehaviour) {
			return TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES;
		}

		return null;
	};

	const [tapBehaviour, setTapBehaviour] = React.useState(initialState());

	const handleChangeTapBehaviour = (
		eventOrValue: unknown,
		nextValue: unknown,
		_currentValue: unknown,
		_name: string | null,
	) => {
		const behaviour = (typeof eventOrValue === "string" ? eventOrValue : nextValue) as string | null;
		setTapBehaviour(behaviour);
		if (behaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES) {
			// Reset edge creation
			dispatch(change(form, "edges.create", null) as UnknownAction);
			dispatch(change(form, "highlight.allowHighlighting", true) as UnknownAction);
		}

		if (behaviour === TAP_BEHAVIOURS.CREATE_EDGES) {
			// Reset attribute highlighting
			dispatch(change(form, "highlight.allowHighlighting", false) as UnknownAction);
			dispatch(change(form, "highlight.variable", null) as UnknownAction);
		}
	};

	const handleToggleChange = (value: boolean) => {
		if (value) {
			return true;
		}

		// Reset edge creation
		dispatch(change(form, "edges.create", null) as UnknownAction);
		dispatch(change(form, "highlight.allowHighlighting", false) as UnknownAction);
		dispatch(change(form, "highlight.variable", null) as UnknownAction);

		return true;
	};

	const selectedValue = useSelector((state: RootState) => getFormValue(state, "edges.create")) as string;

	const edgeFilters = useSelector(getEdgeFilters) as FilterRule[];
	const showNetworkFilterWarning = getEdgeFilteringWarning(edgeFilters, [selectedValue]);

	return (
		<Section
			group
			title="Interaction Behavior"
			summary={
				<p>
					Tapping a node on the sociogram can trigger one of two behaviors: assigning an attribute to the node, or
					creating an edge between two nodes.
				</p>
			}
			toggleable
			startExpanded={
				tapBehaviour === TAP_BEHAVIOURS.CREATE_EDGES || !!hasCreateEdgeBehaviour || !!hasToggleAttributeBehaviour
			}
			handleToggleChange={handleToggleChange}
			layout="vertical"
		>
			<Row>
				<DetachedField
					component={BooleanField as React.ComponentType<Record<string, unknown>>}
					onChange={handleChangeTapBehaviour}
					value={tapBehaviour}
					validation={{ required: true }}
					options={[
						{
							value: TAP_BEHAVIOURS.CREATE_EDGES,
							label: () => (
								<div>
									<h4>Edge Creation</h4>
									<p>Clicking or tapping a node will allow the participant to create an edge.</p>
								</div>
							),
						},
						{
							value: TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES,
							label: () => (
								<div>
									<h4>Attribute Toggling</h4>
									<p>Clicking or tapping a node will toggle a boolean variable to true or false.</p>
								</div>
							),
						},
					]}
					noReset
				/>
			</Row>
			<Row>
				{tapBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES && (
					<ValidatedField
						name="highlight.variable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity,
							type,
							label: "Boolean Attribute to Toggle",
							placeholder: "Select or create a boolean variable",
							onCreateOption: (value: string) => handleCreateVariable(value, "boolean", "highlight.variable"),
							options: highlightVariablesForSubject,
							variable: highlightVariable,
						}}
					/>
				)}
				{tapBehaviour === TAP_BEHAVIOURS.CREATE_EDGES && (
					<>
						{showNetworkFilterWarning && (
							<Tip type="warning">
								<p>
									Stage level network filtering is enabled, but the edge type you want to create on this prompt is not
									currently included in the filter. This means that these edges may not be displayed. Either remove the
									stage-level network filtering, or add these edge types to the filter to resolve this issue.
								</p>
							</Tip>
						)}

						<ValidatedField
							name="edges.create"
							component={EntitySelectField as React.ComponentType<Record<string, unknown>>}
							validation={{ required: true }}
							componentProps={{
								entityType: "edge",
								label: "Create edges of the following type",
							}}
						/>
					</>
				)}
			</Row>
		</Section>
	);
};

export default TapBehaviour;
