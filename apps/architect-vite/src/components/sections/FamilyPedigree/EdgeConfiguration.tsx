import type { VariableOptions } from "@codaco/protocol-validation";
import { useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import VariablePicker from "~/components/Form/Fields/VariablePicker/VariablePicker";
import ValidatedField from "~/components/Form/ValidatedField";
import IssueAnchor from "~/components/IssueAnchor";
import type { Entity } from "~/components/NewVariableWindow";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import EntitySelectField from "~/components/sections/fields/EntitySelectField/EntitySelectField";
import { useAppDispatch } from "~/ducks/hooks";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { optionsMatch } from "~/utils/variables";

const RELATIONSHIP_TYPE_OPTIONS: VariableOptions = [
	{ value: "parent", label: "Parent" },
	{ value: "partner", label: "Partner" },
];

const edgeEntity: Entity = "edge";

type VariableWindowInitialProps = {
	entity: Entity;
	type: string;
	initialValues: { name: string; type: string };
	lockedOptions: VariableOptions | null;
};

type VariableRowProps = {
	name: string;
	label: string;
	description: string;
	options: { value: string; label: string; type?: string }[];
	onCreateOption: (name: string) => void;
	edgeType: string;
};

const VariableRow = ({ name, label, description, options, onCreateOption, edgeType }: VariableRowProps) => (
	<div className="flex items-start gap-4">
		<div className="flex flex-col gap-1 pt-2 grow">
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
					entity: "edge",
					type: edgeType,
					label: "Select variable",
					options,
					onCreateOption,
				}}
			/>
		</div>
	</div>
);

const EdgeConfiguration = ({ form }: StageEditorSectionProps) => {
	const dispatch = useAppDispatch();
	const formSelector = formValueSelector(form);

	const edgeType = useSelector((state: RootState) => formSelector(state, "edgeConfig.type") as string | undefined);

	const edgeVariableOptions = useSelector((state: RootState) =>
		edgeType ? getVariableOptionsForSubject(state, { entity: "edge", type: edgeType }) : [],
	);

	const relationshipTypeCompatible = edgeVariableOptions.filter(
		(v) => v.type === "categorical" && optionsMatch(v.options, RELATIONSHIP_TYPE_OPTIONS),
	);
	const booleanEdgeVariables = edgeVariableOptions.filter((v) => v.type === "boolean");

	const handleCreatedVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		dispatch(change(form, params.field, id));
	};

	const initialWindowProps: VariableWindowInitialProps = {
		entity: edgeEntity,
		type: edgeType ?? "",
		initialValues: { name: "", type: "" },
		lockedOptions: null,
	};

	const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
		initialWindowProps,
		handleCreatedVariable,
	);

	const handleNewRelationshipTypeVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "categorical" }, lockedOptions: RELATIONSHIP_TYPE_OPTIONS },
			{ field: "edgeConfig.relationshipTypeVariable" },
		);

	const handleNewIsActiveVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "boolean" }, lockedOptions: null },
			{ field: "edgeConfig.isActiveVariable" },
		);

	const handleNewGestationalCarrierVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "boolean" }, lockedOptions: null },
			{ field: "edgeConfig.isGestationalCarrierVariable" },
		);

	return (
		<>
			<Section
				title="Edge Configuration"
				summary={<p>Select the edge type and configure variables for family relationships.</p>}
			>
				<Row>
					<IssueAnchor fieldName="edgeConfig.type" description="Edge Type" />
					<ValidatedField
						name="edgeConfig.type"
						entityType="edge"
						component={EntitySelectField}
						validation={{ required: true }}
					/>
				</Row>
				{edgeType && (
					<div className="bg-surface-2 text-surface-2-foreground p-4 rounded flex flex-col gap-6 mt-6">
						<VariableRow
							name="edgeConfig.relationshipTypeVariable"
							label="Relationship Type"
							description="Stores the type of relationship between family members (parent or partner)."
							edgeType={edgeType}
							options={relationshipTypeCompatible}
							onCreateOption={handleNewRelationshipTypeVariable}
						/>
						<VariableRow
							name="edgeConfig.isActiveVariable"
							label="Is Active"
							description="Stores whether the relationship is currently active."
							edgeType={edgeType}
							options={booleanEdgeVariables}
							onCreateOption={handleNewIsActiveVariable}
						/>
						<VariableRow
							name="edgeConfig.isGestationalCarrierVariable"
							label="Gestational Carrier"
							description="Stores whether a parent is a gestational carrier (parent edges only)."
							edgeType={edgeType}
							options={booleanEdgeVariables}
							onCreateOption={handleNewGestationalCarrierVariable}
						/>
					</div>
				)}
			</Section>
			<NewVariableWindow {...variableWindowProps} />
		</>
	);
};

export default EdgeConfiguration;
