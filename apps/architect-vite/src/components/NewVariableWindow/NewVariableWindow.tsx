import { Component } from "react";
import { Field } from "redux-form";
import { Section } from "~/components/EditorLayout";
import { Text } from "~/components/Form/Fields";
import Select from "~/components/Form/Fields/Select";
import ValidatedField from "~/components/Form/ValidatedField";
import InlineEditScreen from "~/components/InlineEditScreen";
import Options from "~/components/Options";
import { isOrdinalOrCategoricalType, VARIABLE_OPTIONS } from "~/config/variables";
import { getFieldId } from "~/utils/issues";
import safeName from "~/utils/safeName";
import { validations } from "~/utils/validations";
import withNewVariableHandler, { form } from "./withNewVariableHandler";

const isRequired = validations.required();

const isAllowedVariableName = validations.allowedVariableName();

type NewVariableWindowProps = {
	show?: boolean;
	variableType?: string | null;
	allowVariableTypes?: string[] | null;
	onComplete: () => void;
	handleCreateNewVariable: (values: Record<string, unknown>) => void;
	onCancel: () => void;
	initialValues?: Record<string, unknown> | null;
	existingVariableNames: string[];
};

type State = Record<string, never>;

class NewVariableWindow extends Component<NewVariableWindowProps, State> {
	static defaultProps: Partial<NewVariableWindowProps> = {
		show: false,
		variableType: null,
		allowVariableTypes: null,
		initialValues: null,
	};

	validateName = (value: string) => {
		const { existingVariableNames } = this.props;
		return validations.uniqueByList(existingVariableNames)(value);
	};

	filteredVariableOptions() {
		const { allowVariableTypes } = this.props;

		return allowVariableTypes
			? VARIABLE_OPTIONS.filter(({ value: optionVariableType }) => allowVariableTypes.includes(optionVariableType))
			: VARIABLE_OPTIONS;
	}

	render() {
		const { show, variableType, handleCreateNewVariable, onCancel, initialValues } = this.props;

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
						validate={[isRequired, this.validateName, isAllowedVariableName]}
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
							options: this.filteredVariableOptions(),
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
}

export default withNewVariableHandler(NewVariableWindow) as unknown as React.ComponentType<{
	show?: boolean;
	variableType?: string | null;
	allowVariableTypes?: string[] | null;
	onComplete: () => void;
	onCancel: () => void;
	initialValues?: Record<string, unknown> | null;
}>;
