import type { UnknownAction } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import { compose } from "recompose";
import { change, Field, formValueSelector } from "redux-form";
import CheckboxGroup from "~/components/Form/Fields/CheckboxGroup";
import Text from "~/components/Form/Fields/Text";
import ValidatedField from "~/components/Form/ValidatedField";
import { useAppDispatch } from "~/ducks/hooks";
import type { RootState } from "~/ducks/modules/root";
import Row from "../../EditorLayout/Row";
import Section from "../../EditorLayout/Section";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import withPresetProps from "./withPresetProps";

type SelectOption = {
	label: string;
	value: string;
};

type PresetFieldsProps = {
	form: string;
	edgesForSubject?: SelectOption[];
	entity: string;
	groupVariable?: string;
	groupVariablesForSubject?: SelectOption[];
	handleCreateLayoutVariable: () => void;
	highlightVariablesForSubject?: SelectOption[];
	layoutVariable?: string;
	layoutVariablesForSubject?: SelectOption[];
	type: string;
};

const PresetFields = ({
	form,
	edgesForSubject = [],
	entity,
	groupVariable = undefined,
	groupVariablesForSubject = [],
	handleCreateLayoutVariable,
	highlightVariablesForSubject = [],
	layoutVariable = undefined,
	layoutVariablesForSubject = [],
	type,
}: PresetFieldsProps) => {
	const getFormValue = formValueSelector(form);

	const dispatch = useAppDispatch();
	const hasGroupVariable = !!groupVariable;
	const displayEdges = useSelector(
		(state: RootState) => getFormValue(state, "edges.display") as Record<string, unknown>[],
	);
	const hasDisplayEdges = displayEdges && displayEdges.length > 0;
	const highlightVariables = useSelector(
		(state: RootState) => getFormValue(state, "highlight") as Record<string, unknown>[],
	);
	const hasHighlightVariables = highlightVariables && highlightVariables.length > 0;

	const handleToggleHighlightVariables = (open: boolean) => {
		if (open) {
			return true;
		}

		dispatch(change(form, "highlight", null) as UnknownAction);
		return true;
	};

	const handleToggleDisplayEdges = (open: boolean) => {
		if (open) {
			return true;
		}

		dispatch(change(form, "edges", null) as UnknownAction);
		return true;
	};

	const handleToggleGroupVariable = (open: boolean) => {
		if (open) {
			return true;
		}

		dispatch(change(form, "groupVariable", null) as UnknownAction);
		return true;
	};

	return (
		<>
			<Section
				title="Preset Label"
				summary={
					<p>
						The preset label will used to quickly identify the preset from within the narrative interface. It will be
						visible to the participant.
					</p>
				}
				layout="vertical"
			>
				<Row>
					<ValidatedField
						name="label"
						component={Text}
						validation={{ required: true }}
						componentProps={{
							label: "Preset label",
							placeholder: "Enter a label for the preset...",
						}}
					/>
				</Row>
			</Section>
			<Section
				layout="vertical"
				title="Layout Variable"
				summary={<p>Select a variable to use to position the nodes for this preset.</p>}
			>
				<Row>
					<ValidatedField
						name="layoutVariable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity,
							type,
							options: layoutVariablesForSubject,
							onCreateOption: handleCreateLayoutVariable,
							variable: layoutVariable,
						}}
					/>
				</Row>
			</Section>
			<Section
				title="Group Variable"
				summary={<p>Select a categorical variable which will be used to draw convex hulls around nodes.</p>}
				toggleable
				disabled={groupVariablesForSubject.length === 0}
				startExpanded={hasGroupVariable && groupVariablesForSubject.length > 0}
				handleToggleChange={handleToggleGroupVariable}
				layout="vertical"
			>
				<Row>
					<p>
						This feature will draw a semi-transparent convex hull for each categorical value of the variable you select.
						If a node&apos;s attributes include this categorical value, the hull will be expanded to include the node.
						If a node has multiple values for this categorical variable, it will appear in multiple overlapping hulls.
					</p>
					<Field
						name="groupVariable"
						label="Select a categorical variable for grouping"
						component={VariablePicker}
						entity={entity}
						type={type}
						variable={groupVariable}
						options={groupVariablesForSubject}
						disallowCreation
					/>
				</Row>
			</Section>
			<Section
				title="Display Edges"
				toggleable
				startExpanded={hasDisplayEdges && edgesForSubject.length > 0}
				handleToggleChange={handleToggleDisplayEdges}
				disabled={edgesForSubject.length === 0}
				summary={<p>Select one or more edge types to display on this narrative preset.</p>}
				layout="vertical"
			>
				<Row>
					<Field
						name="edges.display"
						component={CheckboxGroup}
						label="Edge types"
						placeholder="&mdash; Toggle an edge to display &mdash;"
						options={edgesForSubject}
					/>
				</Row>
			</Section>
			<Section
				title="Highlight Node Attributes"
				summary={
					<p>
						Select one or more boolean variables below. Nodes whose value is &quot;true&quot; for this variable will be
						highlighted when this preset is active.
					</p>
				}
				toggleable
				startExpanded={hasHighlightVariables && highlightVariablesForSubject.length > 0}
				disabled={highlightVariablesForSubject.length === 0}
				handleToggleChange={handleToggleHighlightVariables}
				layout="vertical"
			>
				<Row>
					<Field
						name="highlight"
						component={CheckboxGroup}
						label="Select one or more boolean variables"
						placeholder="&mdash; Toggle a variable to highlight &mdash;"
						options={highlightVariablesForSubject}
					/>
				</Row>
			</Section>
		</>
	);
};

export default compose<PresetFieldsProps, PresetFieldsProps>(withPresetProps)(
	PresetFields as React.ComponentType<unknown>,
);
