import type { Variable, VariableOptions } from "@codaco/protocol-validation";
import { values } from "lodash";
import { Lock } from "lucide-react";
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

const form = "create-new-variable";

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
	/** Pre-defined options that cannot be edited. When provided, the options section is read-only. */
	lockedOptions?: VariableOptions | null;
	/** Optional semantic key to use instead of a UUID. Used for special variables like "name", "sex", etc in family tree interface. */
	semanticKey?: string | null;
};

export default function NewVariableWindow({
	show = false,
	entity,
	type,
	allowVariableTypes = null,
	onComplete,
	onCancel,
	initialValues = null,
	lockedOptions = null,
	semanticKey = null,
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

	// Merge locked options into initial values if provided
	const mergedInitialValues = useMemo(() => {
		if (lockedOptions) {
			return {
				...initialValues,
				options: lockedOptions,
			};
		}
		return initialValues;
	}, [initialValues, lockedOptions]);

	const handleCreateNewVariable = useCallback(
		async (configuration: Record<string, unknown>) => {
			const result = await dispatch(
				createVariableAsync({
					entity,
					type,
					configuration: configuration as Partial<Variable>,
					semanticKey: semanticKey ?? undefined,
				}),
			).unwrap();
			onComplete(result.variable);
		},
		[dispatch, entity, type, onComplete, semanticKey],
	);

	return (
		<InlineEditScreen
			show={show}
			form={form}
			onSubmit={(values: unknown) => handleCreateNewVariable(values as Record<string, unknown>)}
			onCancel={onCancel}
			initialValues={mergedInitialValues ?? undefined}
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
				layout="vertical"
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
			<Section title="Variable Type" summary={<p>Choose a variable type</p>} layout="vertical">
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
				<Section
					title="Options"
					summary={
						lockedOptions ? (
							<p>These options are automatically configured by the interface and cannot be modified.</p>
						) : (
							<p>Create some options for this input control</p>
						)
					}
					layout="vertical"
				>
					<div id={getFieldId("options")} />
					{lockedOptions ? (
						<div className="relative bg-platinum opacity-50 rounded p-4">
							<Lock className="absolute top-4 right-4 h-4 w-4 text-charcoal" />
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left">
										<th className="pb-2 font-bold">Label</th>
										<th className="pb-2 font-bold">Value</th>
									</tr>
								</thead>
								<tbody>
									{lockedOptions.map((option) => (
										<tr key={String(option.value)}>
											<td className="py-1">{option.label}</td>
											<td className="py-1 font-mono">{String(option.value)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<Options name="options" label="Options" />
					)}
				</Section>
			)}
		</InlineEditScreen>
	);
}
