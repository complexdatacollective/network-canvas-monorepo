import * as Fields from "@codaco/ui/lib/components/Fields";
import PropTypes from "prop-types";
import { Component } from "react";
import { Field } from "redux-form";
import { Section } from "~/src/components/EditorLayout";
import Select from "~/src/components/Form/Fields/Select";
import ValidatedField from "~/src/components/Form/ValidatedField";
import InlineEditScreen from "~/src/components/InlineEditScreen";
import Options from "~/src/components/Options";
import { isOrdinalOrCategoricalType, VARIABLE_OPTIONS } from "~/src/config/variables";
import { getFieldId } from "~/src/utils/issues";
import safeName from "~/src/utils/safeName";
import { allowedVariableName, required, uniqueByList } from "~/src/utils/validations";
import withNewVariableHandler, { form } from "./withNewVariableHandler";

const isRequired = required();

const isAllowedVariableName = allowedVariableName();

class NewVariableWindow extends Component {
	validateName = (value) => {
		const { existingVariableNames } = this.props;
		return uniqueByList(existingVariableNames)(value);
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
				onSubmit={handleCreateNewVariable}
				onCancel={onCancel}
				initialValues={initialValues}
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
						component={Fields.Text}
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
						placeholder="Select variable type"
						options={this.filteredVariableOptions()}
						isDisabled={!!initialValues.type}
						validation={{ required: true }}
					/>
				</Section>
				{isOrdinalOrCategoricalType(variableType) && (
					<Section title="Options" summary={<p>Create some options for this input control</p>}>
						<div id={getFieldId("options")} />
						<Options name="options" label="Options" form={form} />
					</Section>
				)}
			</InlineEditScreen>
		);
	}
}

NewVariableWindow.propTypes = {
	show: PropTypes.bool,
	variableType: PropTypes.string,
	// eslint-disable-next-line react/forbid-prop-types
	allowVariableTypes: PropTypes.array,
	// eslint-disable-next-line
	onComplete: PropTypes.func.isRequired, // This prop is required by withNewVariableHandler
	handleCreateNewVariable: PropTypes.func.isRequired,
	onCancel: PropTypes.func.isRequired,
	// eslint-disable-next-line react/forbid-prop-types
	initialValues: PropTypes.object,
	// eslint-disable-next-line react/forbid-prop-types
	existingVariableNames: PropTypes.array.isRequired,
};

NewVariableWindow.defaultProps = {
	show: false,
	variableType: null,
	allowVariableTypes: null,
	initialValues: null,
};

export { NewVariableWindow };

export default withNewVariableHandler(NewVariableWindow);
