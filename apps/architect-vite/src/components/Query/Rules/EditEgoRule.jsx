import { isArray, isNil } from "es-toolkit/compat";
import PropTypes from "prop-types";
import { compose } from "recompose";
import DetachedField from "~/components/DetachedField";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import Section from "../../EditorLayout/Section";
import EditValue from "./EditValue";
import {
	// operatorsWithRegExp,
	operatorsWithOptionCount,
	operatorsWithValue,
} from "./options";
import withOptions from "./withOptions";
import withRuleChangeHandler from "./withRuleChangeHandler";

const defaultOptions = {
	type: null,
	attribute: null,
	operator: null,
	value: "",
};

const EditEgoRule = ({
	rule,
	variableType,
	variablesAsOptions,
	variableOptions,
	operatorOptions,
	handleRuleChange,
}) => {
	const options = rule && rule.options;
	const optionsWithDefaults = { ...defaultOptions, ...options };
	const operatorNeedsValue = operatorsWithValue.has(optionsWithDefaults.operator);
	// const operatorNeedsRegExp = operatorsWithRegExp.has(optionsWithDefaults.operator);
	const operatorNeedsOptionCount = operatorsWithOptionCount.has(optionsWithDefaults.operator);
	const countFriendlyValue = !isNil(optionsWithDefaults.value) ? optionsWithDefaults.value : "";
	const optionsWithCounts = {
		...optionsWithDefaults,
		value: isArray(optionsWithDefaults.value) ? "" : countFriendlyValue,
	};
	return (
		<>
			<Section title="Ego Variable">
				<DetachedField
					component={NativeSelect}
					name="attribute"
					options={variablesAsOptions}
					onChange={handleRuleChange}
					value={optionsWithDefaults.attribute}
					validation={{ required: true }}
				/>
			</Section>
			{optionsWithDefaults.attribute && (
				<Section title="Operator">
					<DetachedField
						component={NativeSelect}
						name="operator"
						options={operatorOptions}
						onChange={handleRuleChange}
						value={optionsWithDefaults.operator}
						validation={{ required: true }}
					/>
				</Section>
			)}
			{operatorNeedsValue && (
				<Section title="Attribute Value">
					<EditValue
						variableType={variableType}
						placeholder="Enter a value..."
						onChange={handleRuleChange}
						value={optionsWithDefaults.value}
						options={variableOptions}
						validation={{ required: true }}
					/>
				</Section>
			)}
			{/* { operatorNeedsRegExp
        && (
        <Section
          title="Attribute Value"
        >
          <EditValue
            variableType={variableType}
            placeholder="Enter a regular expression..."
            onChange={handleRuleChange}
            value={optionsWithDefaults.value}
            options={variableOptions}
            validation={{ required: true, validRegExp: true }}
          />
        </Section>
        )} */}
			{operatorNeedsOptionCount && (
				<Section title="Selected Option Count">
					<EditValue
						variableType="number"
						placeholder="Enter a value..."
						onChange={handleRuleChange}
						value={optionsWithCounts.value}
						validation={{ requiredAcceptsZero: true }}
					/>
				</Section>
			)}
		</>
	);
};

EditEgoRule.propTypes = {
	rule: PropTypes.shape({
		// eslint-disable-next-line react/forbid-prop-types
		options: PropTypes.object,
	}).isRequired,
	// eslint-disable-next-line react/forbid-prop-types
	variablesAsOptions: PropTypes.array.isRequired,
	// eslint-disable-next-line react/forbid-prop-types
	variableOptions: PropTypes.array,
	// eslint-disable-next-line react/forbid-prop-types
	operatorOptions: PropTypes.array.isRequired,
	handleRuleChange: PropTypes.func.isRequired,
	variableType: PropTypes.string,
};

EditEgoRule.defaultProps = {
	variableType: null,
	variableOptions: null,
};

export default compose(withOptions, withRuleChangeHandler)(EditEgoRule);
