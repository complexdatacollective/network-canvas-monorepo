import type { Variable } from "@codaco/protocol-validation";
import { values } from "lodash";
import { useCallback, useMemo } from "react";
import { Field, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import { Text } from "~/components/Form/Fields";
import Select from "~/components/Form/Fields/Select";
import ValidatedField from "~/components/Form/ValidatedField";
import InlineEditScreen from "~/components/InlineEditScreen";
import Options from "~/components/Options";
import { isOrdinalOrCategoricalType, VARIABLE_OPTIONS } from "~/config/variables";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { createVariableAsync } from "~/ducks/modules/protocol/codebook";
import { getVariablesForSubject } from "~/selectors/codebook";
import { getFieldId } from "~/utils/issues";
import safeName from "~/utils/safeName";
import { validations } from "~/utils/validations";

export const form = "create-new-variable";

const isRequired = validations.required();
const isAllowedVariableName = validations.allowedVariableName();

export type Entity = "node" | "edge" | "ego";

type NewVariableWindowProps = {
	show?: boolean;
	entity: Entity;
	type: string;
	allowVariableTypes?: string[] | null;
	onComplete: (variable: string) => void;
	onCancel: () => void;
	initialValues?: Record<string, unknown> | null;
};

export default function NewVariableWindow({
	show = false,
	entity,
	type,
	allowVariableTypes = null,
	onComplete,
	onCancel,
	initialValues = null,
}: NewVariableWindowProps) {
	const dispatch = useAppDispatch();

	const variableType = useAppSelector((state) => formValueSelector(form)(state, "type") as string | undefined);

	const existingVariables = useAppSelector((state) => getVariablesForSubject(state, { entity, type }));

	const existingVariableNames = useMemo(
		() => values(existingVariables).map(({ name }: Variable) => name),
		[existingVariables],
	);

	const validateName = useCallback(
		(value: string) => validations.uniqueByList(existingVariableNames)(value),
		[existingVariableNames],
	);

	const filteredVariableOptions = useMemo(
		() =>
			allowVariableTypes
				? VARIABLE_OPTIONS.filter(({ value: optionVariableType }) => allowVariableTypes.includes(optionVariableType))
				: VARIABLE_OPTIONS,
		[allowVariableTypes],
	);

	const handleCreateNewVariable = useCallback(
		async (configuration: Record<string, unknown>) => {
			const result = await dispatch(
				createVariableAsync({
					entity,
					type,
					configuration: configuration as Partial<Variable>,
				}),
			).unwrap();
			onComplete(result.variable);
		},
		[dispatch, entity, type, onComplete],
	);

	return (
		<InlineEditScreen
			show={show}
			form={form}
			onSubmit={(values: unknown) => handleCreateNewVariable(values as Record<string, unknown>)}
			onCancel={onCancel}
			initialValues={initialValues ?? undefined}
			title="Create New Variable"
		>
			<Section
				title="Variable Name"
				summary={
					<p>
						Enter a name for this variable. The variable name is how you will reference the variable elsewhere,
						including in exported data.
					</p>
				}
			>
				<div id={getFieldId("name")} />
				<Field
					name="name"
					component={Text}
					placeholder="e.g. Nickname"
					validate={[isRequired, validateName, isAllowedVariableName]}
					normalize={safeName}
				/>
			</Section>
			<Section title="Variable Type" summary={<p>Choose a variable type</p>}>
				<div id={getFieldId("type")} />
				<ValidatedField
					name="type"
					component={Select}
					validation={{ required: true }}
					componentProps={{
						placeholder: "Select variable type",
						options: filteredVariableOptions,
						isDisabled: !!initialValues?.type,
					}}
				/>
			</Section>
			{isOrdinalOrCategoricalType(variableType) && (
				<Section title="Options" summary={<p>Create some options for this input control</p>}>
					<div id={getFieldId("options")} />
					<Options name="options" label="Options" />
				</Section>
			)}
		</InlineEditScreen>
	);
}
