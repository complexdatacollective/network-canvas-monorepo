import type { UnknownAction } from "@reduxjs/toolkit";
import { omit } from "es-toolkit/compat";
import type { Dispatch } from "react";
import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Section } from "~/components/EditorLayout";
import { CheckboxGroup } from "~/components/Form/Fields";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";
import { getNodeTypes } from "~/selectors/codebook";
import { updateVariableByUUID } from "../../../ducks/modules/protocol/codebook";
import DetachedField from "../../DetachedField";
import Tip from "../../Tip";

type Variable = {
	name: string;
	encrypted?: boolean;
	[key: string]: unknown;
};

type NodeType = {
	name: string;
	variables?: Record<string, Variable>;
	[key: string]: unknown;
};

const EncryptedVariables = (_props: StageEditorSectionProps) => {
	const dispatch = useDispatch<Dispatch<UnknownAction>>();
	const openDialog = useCallback(
		(dialog: Parameters<typeof dialogActions.openDialog>[0]) => dispatch(dialogActions.openDialog(dialog)),
		[dispatch],
	);
	const nodeTypes = useSelector((state: RootState) => getNodeTypes(state) as Record<string, NodeType>);

	const handleEncryptionToggle = useCallback(
		(variableId: string, encrypted: boolean, variable: Variable) => {
			const properties = encrypted ? { ...variable, encrypted: true } : omit(variable, "encrypted");

			dispatch(updateVariableByUUID(variableId, properties, false));
		},
		[dispatch],
	);

	const handleToggleChange = useCallback(
		async (hasEncryptedVariable: boolean, nodeType: NodeType, newState: boolean) => {
			if (!hasEncryptedVariable || newState === true) {
				return true;
			}

			const confirm = await openDialog({
				type: "Warning",
				title: "This will clear selected variables",
				message: `This will deselect all encrypted variables for the ${nodeType.name} node type. Do you want to continue?`,
				confirmLabel: "Clear encrypted variables",
			});

			if (confirm) {
				Object.entries(nodeType.variables || {}).forEach(([variableId, variable]) => {
					if (variable?.encrypted) {
						handleEncryptionToggle(variableId, false, variable);
					}
				});
				return true;
			}

			return false;
		},
		[openDialog, handleEncryptionToggle],
	);
	return (
		<Section
			title="Encrypted Variables"
			summary={
				<>
					<p>
						You may encrypt one or more variables. Select the variables for each node type that should be encrypted.
					</p>
					<Tip>
						<p>Values for encrypted variables are not stored in the database.</p>
					</Tip>
				</>
			}
		>
			{Object.entries(nodeTypes).map(([nodeTypeId, nodeType]) => {
				const hasEncryptedVariable = Object.values(nodeType.variables || {}).some((variable) => variable?.encrypted);

				// Memoize these calculations to avoid recreating arrays on every render
				const variables = nodeType.variables || {};
				const variableOptions = useMemo(
					() =>
						Object.entries(variables).map(([variableId, variable]) => ({
							value: variableId,
							label: variable.name,
						})),
					[variables],
				);

				const encryptedVariableIds = useMemo(
					() =>
						Object.entries(variables)
							.filter(([, variable]) => variable?.encrypted)
							.map(([variableId]) => variableId),
					[variables],
				);

				return (
					<Section
						toggleable
						title={nodeType.name}
						key={nodeTypeId}
						startExpanded={hasEncryptedVariable}
						layout="vertical"
						handleToggleChange={(newState) => handleToggleChange(hasEncryptedVariable, nodeType, newState)}
						summary={<p>Which variables should be encrypted?</p>}
					>
						<div
							style={{
								maxHeight: "300px",
								overflowY: "auto",
							}}
						>
							<DetachedField
								component={CheckboxGroup}
								options={variableOptions}
								value={encryptedVariableIds}
								onChange={(selectedValues: string[]) => {
									Object.entries(variables).forEach(([variableId, variable]) => {
										const shouldEncrypt = selectedValues.includes(variableId);
										if (variable?.encrypted !== shouldEncrypt) {
											handleEncryptionToggle(variableId, shouldEncrypt, variable);
										}
									});
								}}
							/>
						</div>
					</Section>
				);
			})}
		</Section>
	);
};

export default EncryptedVariables;
