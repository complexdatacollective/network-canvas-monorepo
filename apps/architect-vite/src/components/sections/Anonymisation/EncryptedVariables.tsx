import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Section } from "~/components/EditorLayout";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import * as Fields from "~/components/Form/Fields";
import { getNodeTypes } from "~/selectors/codebook";

import { omit } from "es-toolkit/compat";
import { actionCreators as codebookActions } from "../../../ducks/modules/protocol/codebook";
import DetachedField from "../../DetachedField";
import Tip from "../../Tip";

const EncryptedVariables = () => {
	const dispatch = useDispatch();
	const openDialog = useCallback((dialog) => dispatch(dialogActions.openDialog(dialog)), [dispatch]);
	const nodeTypes = useSelector((state) => getNodeTypes(state));

	const handleEncryptionToggle = (variableId, encrypted, variable) => {
		const properties = encrypted ? { ...variable, encrypted: true } : omit(variable, "encrypted");

		dispatch(codebookActions.updateVariableByUUID(variableId, properties, false));
	};
	const handleToggleChange = useCallback(
		async (hasEncryptedVariable, nodeType, newState) => {
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
					if (variable.encrypted) {
						handleEncryptionToggle(variableId, false, variable);
					}
				});
				return true;
			}

			return false;
		},
		[openDialog],
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
				const hasEncryptedVariable = Object.values(nodeType.variables || {}).some((variable) => variable.encrypted);

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
							.filter(([, variable]) => variable.encrypted)
							.map(([variableId]) => variableId),
					[variables],
				);

				return (
					<Section
						toggleable
						title={nodeType.name}
						key={nodeTypeId}
						startExpanded={hasEncryptedVariable}
						// eslint-disable-next-line max-len
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
								component={Fields.CheckboxGroup}
								options={variableOptions}
								value={encryptedVariableIds}
								onChange={(selectedValues) => {
									Object.entries(variables).forEach(([variableId, variable]) => {
										const shouldEncrypt = selectedValues.includes(variableId);
										if (variable.encrypted !== shouldEncrypt) {
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
