import { isArray, isNil } from "es-toolkit/compat";
import { compose } from "recompose";
import DetachedField from "~/components/DetachedField";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import RadioGroup from "~/components/Form/Fields/RadioGroup";
import Section from "../../EditorLayout/Section";
import IssueAnchor from "../../IssueAnchor";
import EntitySelectField from "../../sections/fields/EntitySelectField/EntitySelectField";
import { makeGetOptionsWithDefaults } from "./defaultRule";
import EditValue from "./EditValue";
import {
	// operatorsWithRegExp,
	operatorsWithOptionCount,
	operatorsWithValue,
} from "./options";
import { entityRuleTypeOptions, entityRuleTypes, withEntityRuleType } from "./withEntityRuleType";
import withOptions from "./withOptions";
import withRuleChangeHandler from "./withRuleChangeHandler";

export type OptionItem = {
	value: string | number;
	label: string;
};

type EditEntityRuleProps = {
	entityRuleType?: string;
	handleChangeEntityRuleType: (value: string) => void;
	rule: {
		options?: Record<string, unknown>;
		type: string;
	};
	typeOptions: OptionItem[];
	variableType?: string;
	variablesAsOptions: OptionItem[];
	variableOptions?: OptionItem[];
	operatorOptions: OptionItem[];
	handleRuleChange: (value: Record<string, unknown>) => void;
};

const EditEntityRule = ({
	entityRuleType,
	handleChangeEntityRuleType,
	rule,
	typeOptions,
	variableType,
	variablesAsOptions,
	variableOptions = [],
	operatorOptions,
	handleRuleChange,
}: EditEntityRuleProps) => {
	const { type: entityType } = rule;
	const options = rule?.options;
	const getOptionsWithDefaults = makeGetOptionsWithDefaults(variableType, ["type", "operator", "attributes", "value"]);
	const optionsWithDefaults = getOptionsWithDefaults(options);
	const operatorNeedsValue = operatorsWithValue.has(optionsWithDefaults.operator);
	// const operatorNeedsRegExp = operatorsWithRegExp.has(optionsWithDefaults.operator);
	const isVariableRule = entityRuleType === entityRuleTypes.VARIABLE_RULE;
	const isTypeRule = entityRuleType === entityRuleTypes.TYPE_RULE;
	const operatorNeedsOptionCount = operatorsWithOptionCount.has(optionsWithDefaults.operator);
	const countFriendlyValue = !isNil(optionsWithDefaults.value) ? optionsWithDefaults.value : "";
	const optionsWithCounts = {
		...optionsWithDefaults,
		value: isArray(optionsWithDefaults.value) ? "" : countFriendlyValue,
	};

	return (
		<>
			<Section
				title={`${entityType} Type`}
				summary={
					<p>
						Choose an {entityType} type to base your rule on. Remember you can add multiple rules if you need to cover
						different types.
					</p>
				}
				layout="vertical"
			>
				<IssueAnchor fieldName="type" description={`${entityType} Type`} />
				<DetachedField
					component={EntitySelectField}
					entityType={entityType === "alter" ? "node" : "edge"}
					name="type"
					options={typeOptions}
					onChange={handleRuleChange}
					value={optionsWithDefaults.type}
					validation={{ required: true }}
				/>
			</Section>
			<Section title="Rule Type" disabled={!optionsWithDefaults.type} layout="vertical">
				<DetachedField
					component={RadioGroup}
					options={entityRuleTypeOptions(entityType)}
					value={entityRuleType}
					onChange={handleChangeEntityRuleType}
				/>
			</Section>
			{isTypeRule && optionsWithDefaults.type && (
				<Section title="Operator" layout="vertical">
					<DetachedField
						component={RadioGroup}
						name="operator"
						options={operatorOptions}
						onChange={handleRuleChange}
						value={optionsWithDefaults.operator}
						validation={{ required: true }}
					/>
				</Section>
			)}
			{isVariableRule && optionsWithDefaults.type && (
				<Section title="Variable" summary={<p>Select a variable to query.</p>} layout="vertical">
					<DetachedField
						component={NativeSelect}
						name="attribute"
						options={variablesAsOptions}
						onChange={handleRuleChange}
						value={optionsWithDefaults.attribute}
						validation={{ required: true }}
					/>
				</Section>
			)}
			{isVariableRule && optionsWithDefaults.attribute && (
				<Section title="Operator" layout="vertical">
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
			{isVariableRule && operatorNeedsValue && (
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
			{/* { isVariableRule && operatorNeedsRegExp
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
			{isVariableRule && operatorNeedsOptionCount && (
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

export default compose<EditEntityRuleProps, Partial<EditEntityRuleProps>>(
	withEntityRuleType,
	withRuleChangeHandler,
	withOptions,
)(EditEntityRule as React.ComponentType<unknown>);
