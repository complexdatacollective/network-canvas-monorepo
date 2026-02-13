import type { VariableOptions } from "@codaco/protocol-validation";
import { get } from "es-toolkit/compat";
import { connect, useSelector } from "react-redux";
import { compose } from "recompose";
import { change, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
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
];

type FamilyTreeVariablesProps = StageEditorSectionProps & {
	type?: string;
	entity?: string;
	disabled?: boolean;
	changeForm: typeof change;
};

type VariableRowProps = {
	name: string;
	label: string;
	description: string;
	entity: Entity;
	entityType: string | undefined;
	options: { value: string; label: string; type?: string }[];
	onCreateOption: (name: string) => void;
};

const VariableRow = ({ name, label, description, entity, entityType, options, onCreateOption }: VariableRowProps) => (
	<div className="flex items-start gap-4">
		<div className="flex flex-col gap-1 pt-2 shrink-0 w-72">
			<span className="font-semibold">
				{label}
				<span className="text-error ms-0.5">*</span>
			</span>
			<span className="text-sm text-foreground/60 leading-snug">{description}</span>
		</div>
		<div className="relative flex-1">
			<IssueAnchor fieldName={name} description={`${label} Variable`} />
			<ValidatedField
				name={name}
				component={VariablePicker}
				validation={{ required: true }}
				componentProps={{
					entity,
					type: entityType,
					label: "Select variable",
					options,
					onCreateOption,
				}}
			/>
		</div>
	</div>
);

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
				<div className="flex flex-col gap-6">
					{/* Ego Variables */}
					<div className="flex flex-col gap-3">
						<h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Ego</h4>
						<div className="flex flex-col gap-4">
							<VariableRow
								name="egoSexVariable"
								label="Ego Biological Sex"
								description="Stores the participant's biological sex. Used to determine visual representation in the family tree."
								entity="ego"
								entityType=""
								options={egoSexCompatibleVariables}
								onCreateOption={handleNewEgoSexVariable}
							/>
						</div>
					</div>

					{/* Alter Variables */}
					<div className="flex flex-col gap-3">
						<h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Alter</h4>
						<div className="flex flex-col gap-4">
							<VariableRow
								name="nodeSexVariable"
								label="Alter Biological Sex"
								description="Stores each alter's biological sex. Used to determine visual representation in the family tree."
								entity="node"
								entityType={type}
								options={nodeSexCompatibleVariables}
								onCreateOption={handleNewNodeSexVariable}
							/>
							<VariableRow
								name="relationshipToEgoVariable"
								label="Relationship to Participant"
								description="Stores each person's relationship to the participant (e.g., mother, uncle, daughter). Automatically calculated by the family tree interface."
								entity="node"
								entityType={type}
								options={textNodeVariables}
								onCreateOption={handleNewRelationshipToEgoVariable}
							/>
							<VariableRow
								name="nodeIsEgoVariable"
								label="Ego Identifier"
								description="A boolean variable to identify which node represents the participant (ego) in the family tree. This variable can be used in future stage filtering to remove the ego from node attribute collection."
								entity="node"
								entityType={type}
								options={booleanNodeVariables}
								onCreateOption={handleNewNodeIsEgoVariable}
							/>
						</div>
					</div>

					{/* Edge Variables */}
					<div className="flex flex-col gap-3">
						<h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Edge</h4>
						<div className="flex flex-col gap-4">
							<VariableRow
								name="relationshipTypeVariable"
								label="Relationship Type"
								description="Stores the type of relationship between family members (parent or partner)."
								entity="edge"
								entityType={edgeType}
								options={relationshipTypeCompatibleVariables}
								onCreateOption={handleNewRelationshipTypeVariable}
							/>
						</div>
					</div>
				</div>
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
