import type { VariableOptions } from "@codaco/protocol-validation";
import type { UnknownAction } from "@reduxjs/toolkit";
import { difference, keys } from "lodash";
import { useCallback } from "react";
import { connect, useSelector } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change, type FormAction, formValueSelector, getFormValues, SubmissionError } from "redux-form";
import EditableList from "~/components/EditableList";
import { Row, Section } from "~/components/EditorLayout";
import VariablePicker from "~/components/Form/Fields/VariablePicker/VariablePicker";
import ValidatedField from "~/components/Form/ValidatedField";
import IssueAnchor from "~/components/IssueAnchor";
import type { Entity } from "~/components/NewVariableWindow";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import FieldFields from "~/components/sections/Form/FieldFields";
import { getCodebookProperties, itemSelector, normalizeField } from "~/components/sections/Form/helpers";
import EntitySelectField from "~/components/sections/fields/EntitySelectField/EntitySelectField";
import { getTypeForComponent } from "~/config/variables";
import { useAppDispatch } from "~/ducks/hooks";
import { createVariableAsync, updateVariableAsync } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject, makeGetVariable } from "~/selectors/codebook";
import { optionsMatch } from "~/utils/variables";
import NodeFormFieldPreview from "./NodeFormFieldPreview";

const nodeEntity: Entity = "node";

const BIOLOGICAL_SEX_OPTIONS: VariableOptions = [
	{ value: "male", label: "Male" },
	{ value: "female", label: "Female" },
	{ value: "intersex", label: "Intersex" },
	{ value: "unknown", label: "Unknown" },
];

const PRESERVE_ON_NODE_TYPE_CHANGE = [
	"id",
	"type",
	"label",
	"interviewScript",
	"skipLogic",
	"edgeConfig",
	"censusPrompt",
	"nodeConfig.type",
];

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
	entityType: string;
	options: { value: string; label: string; type?: string }[];
	onCreateOption: (name: string) => void;
};

const VariableRow = ({ name, label, description, entityType, options, onCreateOption }: VariableRowProps) => (
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
					entity: "node",
					type: entityType,
					label: "Select variable",
					options,
					onCreateOption,
				}}
			/>
		</div>
	</div>
);

type NodeConfigurationInnerProps = StageEditorSectionProps & {
	handleChangeFields: (fields: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const NodeConfigurationInner = ({ form, handleChangeFields }: NodeConfigurationInnerProps) => {
	const dispatch = useAppDispatch();
	const formSelector = formValueSelector(form);

	const nodeType = useSelector((state: RootState) => formSelector(state, "nodeConfig.type") as string | undefined);

	const formValues = useSelector((state: RootState) => getFormValues(form)(state));
	const formFields = keys(formValues);

	const handleResetStage = useCallback(() => {
		const fieldsToReset = difference(formFields, PRESERVE_ON_NODE_TYPE_CHANGE);
		for (const field of fieldsToReset) {
			dispatch(change(form, field, null) as UnknownAction);
		}
	}, [dispatch, formFields, form]);

	const nodeVariableOptions = useSelector((state: RootState) =>
		nodeType ? getVariableOptionsForSubject(state, { entity: "node", type: nodeType }) : [],
	);

	const textNodeVariables = nodeVariableOptions.filter((v) => v.type === "text");
	const booleanNodeVariables = nodeVariableOptions.filter((v) => v.type === "boolean");
	const biologicalSexCompatible = nodeVariableOptions.filter(
		(v) => v.type === "categorical" && optionsMatch(v.options, BIOLOGICAL_SEX_OPTIONS),
	);

	const handleCreatedVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		dispatch(change(form, params.field, id));
	};

	const initialWindowProps: VariableWindowInitialProps = {
		entity: nodeEntity,
		type: nodeType ?? "",
		initialValues: { name: "", type: "" },
		lockedOptions: null,
	};

	const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
		initialWindowProps,
		handleCreatedVariable,
	);

	const handleNewNodeLabelVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "text" }, lockedOptions: null },
			{ field: "nodeConfig.nodeLabelVariable" },
		);

	const handleNewEgoVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "boolean" }, lockedOptions: null },
			{ field: "nodeConfig.egoVariable" },
		);

	const handleNewBiologicalSexVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "categorical" }, lockedOptions: BIOLOGICAL_SEX_OPTIONS },
			{ field: "nodeConfig.biologicalSexVariable" },
		);

	const handleNewRelationshipVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "text" }, lockedOptions: null },
			{ field: "nodeConfig.relationshipVariable" },
		);

	return (
		<>
			<Section
				title="Node Configuration"
				summary={<p>Select the node type and configure variables and form fields for family members.</p>}
			>
				<Row>
					<IssueAnchor fieldName="nodeConfig.type" description="Node Type" />
					<ValidatedField
						name="nodeConfig.type"
						entityType="node"
						promptBeforeChange="You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
						component={EntitySelectField}
						onChange={handleResetStage}
						validation={{ required: true }}
					/>
				</Row>

				{nodeType && (
					<>
						<div className="flex flex-col gap-6 mt-6">
							<VariableRow
								name="nodeConfig.nodeLabelVariable"
								label="Node Label"
								description="A text variable used to store the display label for each node in the pedigree."
								entityType={nodeType}
								options={textNodeVariables}
								onCreateOption={handleNewNodeLabelVariable}
							/>
							<VariableRow
								name="nodeConfig.egoVariable"
								label="Ego Identifier"
								description="A boolean variable to identify which node represents the participant (ego) in the family tree."
								entityType={nodeType}
								options={booleanNodeVariables}
								onCreateOption={handleNewEgoVariable}
							/>
							<VariableRow
								name="nodeConfig.biologicalSexVariable"
								label="Biological Sex"
								description="Stores the biological sex of each family member. Used for visual representation in the pedigree diagram."
								entityType={nodeType}
								options={biologicalSexCompatible}
								onCreateOption={handleNewBiologicalSexVariable}
							/>
							<VariableRow
								name="nodeConfig.relationshipVariable"
								label="Relationship to Participant"
								description="Stores each person's relationship to the participant (e.g., mother, uncle, daughter). Automatically calculated by the family tree interface."
								entityType={nodeType}
								options={textNodeVariables}
								onCreateOption={handleNewRelationshipVariable}
							/>
						</div>

						<Section
							title="Form Fields"
							summary={
								<p>
									Add fields to collect information about each family member. These fields will be shown when
									participants add or edit family members.
								</p>
							}
							layout="vertical"
						>
							<EditableList
								label="Form Fields"
								editComponent={FieldFields}
								editProps={{ type: nodeType, entity: "node" }}
								previewComponent={NodeFormFieldPreview}
								fieldName="nodeConfig.form"
								title="Edit Field"
								onChange={(value: unknown) => handleChangeFields(value as Record<string, unknown>)}
								normalize={(value: unknown) => normalizeField(value as Record<string, unknown>)}
								itemSelector={
									itemSelector("node", nodeType) as (
										state: Record<string, unknown>,
										params: { form: string; editField: string },
									) => unknown
								}
								form={form}
							/>
						</Section>
					</>
				)}
			</Section>
			<NewVariableWindow {...variableWindowProps} />
		</>
	);
};

const formHandlers = withHandlers({
	handleChangeFields:
		(props: {
			updateVariable: typeof updateVariableAsync;
			createVariable: typeof createVariableAsync;
			changeForm: (form: string, field: string, value: unknown) => FormAction;
			form: string;
			getVariable: (uuid: string) => ReturnType<ReturnType<typeof makeGetVariable>>;
			getNodeType: () => string | undefined;
		}) =>
		async (values: Record<string, unknown>) => {
			const { variable, component, _createNewVariable, ...rest } = values as {
				variable?: string;
				component?: string;
				_createNewVariable?: string;
				[key: string]: unknown;
			};

			const nodeType = props.getNodeType();
			const variableType = getTypeForComponent(component);
			const codebookProperties = getCodebookProperties(rest);
			const configuration = {
				type: variableType,
				component,
				...codebookProperties,
			};

			props.changeForm(props.form, "_modified", Date.now());

			if (!_createNewVariable) {
				const current = props.getVariable(variable ?? "");
				if (!current) {
					throw new SubmissionError({ _error: "Variable not found" });
				}

				const currentVar = current as { component?: string; type?: string; name?: string };
				const baseProps = {
					component: currentVar.component,
					type: currentVar.type,
					name: currentVar.name,
				};

				await props.updateVariable({
					entity: "node",
					type: nodeType ?? "",
					variable: variable ?? "",
					configuration: { ...baseProps, ...configuration } as Record<string, unknown>,
					merge: false,
				});

				return { variable, ...rest };
			}

			try {
				const result = await props.createVariable({
					entity: "node",
					type: nodeType ?? "",
					configuration: {
						...configuration,
						name: _createNewVariable,
					} as Record<string, unknown>,
				});
				const payload = result as unknown as { payload: { variable: string } };
				return { variable: payload.payload.variable, ...rest };
			} catch (e) {
				throw new SubmissionError({ variable: String(e) });
			}
		},
});

const mapStateToProps = (state: RootState, { form }: { form: string }) => ({
	getVariable: (uuid: string) => makeGetVariable(uuid)(state),
	getNodeType: () => formValueSelector(form)(state, "nodeConfig.type") as string | undefined,
});

const mapDispatchToProps = {
	changeForm: change as (form: string, field: string, value: unknown) => FormAction,
	updateVariable: updateVariableAsync,
	createVariable: createVariableAsync,
};

const NodeConfiguration = compose<NodeConfigurationInnerProps, StageEditorSectionProps>(
	connect(mapStateToProps, mapDispatchToProps),
	formHandlers,
)(NodeConfigurationInner);

export default NodeConfiguration;
