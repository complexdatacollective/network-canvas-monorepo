import { isArray, isNil } from "es-toolkit/compat";
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
	type: "",
	attribute: "",
	operator: "",
	value: "",
};

type OptionItem = {
	value: string | number;
	label: string;
};

type EditEgoRuleProps = {
	rule: {
		options?: Record<string, unknown>;
	};
	variableType?: string;
	variablesAsOptions: OptionItem[];
	variableOptions?: OptionItem[];
	operatorOptions: OptionItem[];
	handleRuleChange: (event: unknown, value: unknown, oldValue: unknown, name: string | null) => void;
	codebook?: Record<string, unknown>;
	onChange?: (value: Record<string, unknown>) => void;
};

const EditEgoRule = ({
	rule,
	variableType,
	variablesAsOptions,
	variableOptions = [],
	operatorOptions,
	handleRuleChange,
}: EditEgoRuleProps) => {
	const options = rule?.options;
	const optionsWithDefaults = { ...defaultOptions, ...options };
	const operatorNeedsValue =
		typeof optionsWithDefaults.operator === "string" ? operatorsWithValue.has(optionsWithDefaults.operator) : false;
	// const operatorNeedsRegExp = operatorsWithRegExp.has(optionsWithDefaults.operator);
	const operatorNeedsOptionCount =
		typeof optionsWithDefaults.operator === "string"
			? operatorsWithOptionCount.has(optionsWithDefaults.operator)
			: false;
	const countFriendlyValue = !isNil(optionsWithDefaults.value) ? optionsWithDefaults.value : "";
	const optionsWithCounts = {
		...optionsWithDefaults,
		value: isArray(optionsWithDefaults.value) ? "" : countFriendlyValue,
	};
	return (
		<>
			<Section title="Ego Variable" layout="vertical">
				<DetachedField
					component={NativeSelect as React.ComponentType<Record<string, unknown>>}
					name="attribute"
					options={variablesAsOptions}
					onChange={handleRuleChange}
					value={optionsWithDefaults.attribute}
					validation={{ required: true }}
				/>
			</Section>
			{optionsWithDefaults.attribute && (
				<Section title="Operator" layout="vertical">
					<DetachedField
						component={NativeSelect as React.ComponentType<Record<string, unknown>>}
						name="operator"
						options={operatorOptions}
						onChange={handleRuleChange}
						value={optionsWithDefaults.operator}
						validation={{ required: true }}
					/>
				</Section>
			)}
			{operatorNeedsValue && (
				<Section title="Attribute Value" layout="vertical">
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
				<Section title="Selected Option Count" layout="vertical">
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

export default compose<
	EditEgoRuleProps,
	{
		rule?: { options?: Record<string, unknown> };
		codebook?: Record<string, unknown>;
		onChange?: (value: Record<string, unknown>) => void;
	}
>(
	withOptions,
	withRuleChangeHandler,
)(EditEgoRule);
