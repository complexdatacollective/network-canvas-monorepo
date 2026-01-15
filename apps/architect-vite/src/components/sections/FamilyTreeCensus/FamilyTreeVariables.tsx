import type { VariableOptions } from "@codaco/protocol-validation";
import { get } from "es-toolkit/compat";
import { connect, useSelector } from "react-redux";
import { compose } from "recompose";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import NewVariableWindow, { type Entity, useNewVariableWindowState } from "~/components/NewVariableWindow";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { optionsMatch } from "~/utils/variables";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import ValidatedField from "../../Form/ValidatedField";
import IssueAnchor from "../../IssueAnchor";

// Locked options for interface-controlled categorical variables
// If these are changed in Fresco, they must also be updated here to match
const SEX_VARIABLE_OPTIONS: VariableOptions = [
	{ value: "male", label: "Male" },
	{ value: "female", label: "Female" },
];

const RELATIONSHIP_TYPE_OPTIONS: VariableOptions = [
	{ value: "parent", label: "Parent" },
	{ value: "partner", label: "Partner" },
	{ value: "ex-partner", label: "Ex-partner" },
];

type FamilyTreeVariablesProps = StageEditorSectionProps & {
	type?: string;
	entity?: string;
	disabled?: boolean;
	changeForm: typeof change;
};

const mapDispatchToProps = {
	changeForm: change,
};

const FamilyTreeVariables = ({ form, type, disabled, changeForm }: FamilyTreeVariablesProps) => {
	const formSelector = formValueSelector(form);

	// Get edge type from form to filter edge variables
	const edgeType = useSelector((state: RootState) => {
		const edgeTypeValue = formSelector(state, "edgeType");
		return get(edgeTypeValue, "type");
	}) as string | undefined;

	// Require both node type and edge type to be selected before enabling this section
	const isDisabled = disabled || !edgeType;

	// Get variable options for node type (only when type is defined)
	const nodeVariableOptions = useSelector((state: RootState) =>
		type ? getVariableOptionsForSubject(state, { entity: "node", type }) : [],
	);

	// Get variable options for ego
	const egoVariableOptions = useSelector((state: RootState) =>
		getVariableOptionsForSubject(state, { entity: "ego", type: "" }),
	);

	// Get variable options for edge type (only when edgeType is defined)
	const edgeVariableOptions = useSelector((state: RootState) =>
		edgeType ? getVariableOptionsForSubject(state, { entity: "edge", type: edgeType }) : [],
	);

	// Filter for boolean variables (for nodeIsEgoVariable)
	const booleanNodeVariables = nodeVariableOptions.filter((v) => v.type === "boolean");

	// Filter for categorical variables with matching locked options
	// Only show variables whose options exactly match the required locked options
	const egoSexCompatibleVariables = egoVariableOptions.filter(
		(v) => v.type === "categorical" && optionsMatch(v.options, SEX_VARIABLE_OPTIONS),
	);
	const nodeSexCompatibleVariables = nodeVariableOptions.filter(
		(v) => v.type === "categorical" && optionsMatch(v.options, SEX_VARIABLE_OPTIONS),
	);
	const relationshipTypeCompatibleVariables = edgeVariableOptions.filter(
		(v) => v.type === "categorical" && optionsMatch(v.options, RELATIONSHIP_TYPE_OPTIONS),
	);

	// Filter for text variables (for relationshipToEgoVariable)
	const textNodeVariables = nodeVariableOptions.filter((v) => v.type === "text");

	// Set up new variable window for node variables
	const handleCreatedNodeVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		changeForm(form, params.field, id);
	};

	const [nodeVariableWindowProps, openNodeVariableWindow] = useNewVariableWindowState(
		{
			entity: "node" as Entity,
			type: type ?? "",
			initialValues: { name: "", type: "" },
			lockedOptions: null as VariableOptions | null,
		},
		handleCreatedNodeVariable,
	);

	// Set up new variable window for ego variables
	const handleCreatedEgoVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		changeForm(form, params.field, id);
	};

	const [egoVariableWindowProps, openEgoVariableWindow] = useNewVariableWindowState(
		{
			entity: "ego" as Entity,
			type: "",
			initialValues: { name: "", type: "" },
			lockedOptions: null as VariableOptions | null,
		},
		handleCreatedEgoVariable,
	);

	// Set up new variable window for edge variables
	const handleCreatedEdgeVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		changeForm(form, params.field, id);
	};

	const [edgeVariableWindowProps, openEdgeVariableWindow] = useNewVariableWindowState(
		{
			entity: "edge" as Entity,
			type: edgeType ?? "",
			initialValues: { name: "", type: "" },
			lockedOptions: null as VariableOptions | null,
		},
		handleCreatedEdgeVariable,
	);

	// Early return if no node type or edge type is selected
	if (isDisabled) {
		return (
			<Section
				title="Family Tree Variables"
				summary={<p>Configure which variables will be used to store family tree data.</p>}
			>
				<p>Please select both a node type and an edge type above before configuring variables.</p>
			</Section>
		);
	}

	// Handlers for creating new variables
	const handleNewRelationshipTypeVariable = (name: string) =>
		openEdgeVariableWindow(
			{ initialValues: { name, type: "categorical" }, lockedOptions: RELATIONSHIP_TYPE_OPTIONS },
			{ field: "relationshipTypeVariable" },
		);

	const handleNewRelationshipToEgoVariable = (name: string) =>
		openNodeVariableWindow(
			{ initialValues: { name, type: "text" }, lockedOptions: null },
			{ field: "relationshipToEgoVariable" },
		);

	const handleNewEgoSexVariable = (name: string) =>
		openEgoVariableWindow(
			{ initialValues: { name, type: "categorical" }, lockedOptions: SEX_VARIABLE_OPTIONS },
			{ field: "egoSexVariable" },
		);

	const handleNewNodeSexVariable = (name: string) =>
		openNodeVariableWindow(
			{ initialValues: { name, type: "categorical" }, lockedOptions: SEX_VARIABLE_OPTIONS },
			{ field: "nodeSexVariable" },
		);

	const handleNewNodeIsEgoVariable = (name: string) =>
		openNodeVariableWindow(
			{ initialValues: { name, type: "boolean" }, lockedOptions: null },
			{ field: "nodeIsEgoVariable" },
		);

	return (
		<>
			<Section
				title="Family Tree Variables"
				summary={<p>Configure which variables will be used to store family tree data.</p>}
			>
				<Section
					title="Relationship Type"
					summary={
						<p>
							Select a variable to store the type of relationship between family members (parent, partner, or
							ex-partner). This variable is stored on the edge connecting two people.
						</p>
					}
					layout="vertical"
				>
					<Row>
						<IssueAnchor fieldName="relationshipTypeVariable" description="Relationship Type Variable" />
						<ValidatedField
							name="relationshipTypeVariable"
							component={VariablePicker}
							validation={{ required: true }}
							componentProps={{
								entity: "edge",
								type: edgeType,
								label: "Select or create a variable",
								options: relationshipTypeCompatibleVariables,
								onCreateOption: handleNewRelationshipTypeVariable,
							}}
						/>
					</Row>
				</Section>

				<Section
					title="Participant Biological Sex"
					summary={
						<p>
							Select an ego variable to store the participant&apos;s biological sex. This is used to correctly position
							the participant in the family tree visualization.
						</p>
					}
					layout="vertical"
				>
					<Row>
						<IssueAnchor fieldName="egoSexVariable" description="Ego Sex Variable" />
						<ValidatedField
							name="egoSexVariable"
							component={VariablePicker}
							validation={{ required: true }}
							componentProps={{
								entity: "ego",
								type: "",
								label: "Select or create a variable",
								options: egoSexCompatibleVariables,
								onCreateOption: handleNewEgoSexVariable,
							}}
						/>
					</Row>
				</Section>

				<Section
					title="Alter Biological Sex"
					summary={
						<p>
							Select a node variable to store each alter&apos;s biological sex. This is used to correctly position
							people in the family tree visualization.
						</p>
					}
					layout="vertical"
				>
					<Row>
						<IssueAnchor fieldName="nodeSexVariable" description="Node Sex Variable" />
						<ValidatedField
							name="nodeSexVariable"
							component={VariablePicker}
							validation={{ required: true }}
							componentProps={{
								entity: "node",
								type,
								label: "Select or create a variable",
								options: nodeSexCompatibleVariables,
								onCreateOption: handleNewNodeSexVariable,
							}}
						/>
					</Row>
				</Section>

				<Section
					title="Relationship to Participant"
					summary={
						<p>
							Select a variable to store each person&apos;s relationship to the participant (e.g., mother, uncle,
							daughter). This value is automatically calculated by the interface.
						</p>
					}
					layout="vertical"
				>
					<Row>
						<IssueAnchor fieldName="relationshipToEgoVariable" description="Relationship to Ego Variable" />
						<ValidatedField
							name="relationshipToEgoVariable"
							component={VariablePicker}
							validation={{ required: true }}
							componentProps={{
								entity: "node",
								type,
								label: "Select or create a variable",
								options: textNodeVariables,
								onCreateOption: handleNewRelationshipToEgoVariable,
							}}
						/>
					</Row>
				</Section>

				<Section
					title="Ego Identifier"
					summary={
						<p>Select a boolean variable to identify which node represents the participant (ego) in the family tree.</p>
					}
					layout="vertical"
				>
					<Row>
						<IssueAnchor fieldName="nodeIsEgoVariable" description="Node Is Ego Variable" />
						<ValidatedField
							name="nodeIsEgoVariable"
							component={VariablePicker}
							validation={{ required: true }}
							componentProps={{
								entity: "node",
								type,
								label: "Select or create a variable",
								options: booleanNodeVariables,
								onCreateOption: handleNewNodeIsEgoVariable,
							}}
						/>
					</Row>
				</Section>
			</Section>
			<NewVariableWindow {...nodeVariableWindowProps} />
			<NewVariableWindow {...egoVariableWindowProps} />
			<NewVariableWindow {...edgeVariableWindowProps} />
		</>
	);
};

export default compose<FamilyTreeVariablesProps, StageEditorSectionProps>(
	connect(null, mapDispatchToProps),
	withSubject,
	withDisabledSubjectRequired,
)(FamilyTreeVariables);
