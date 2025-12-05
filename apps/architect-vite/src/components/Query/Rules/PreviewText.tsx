import { get, isArray, isNil, join } from "lodash";
import { SimpleVariablePill } from "../../Form/Fields/VariablePicker/VariablePill";
import PreviewEdge from "../../sections/fields/EntitySelectField/PreviewEdge";
import PreviewNode from "../../sections/fields/EntitySelectField/PreviewNode";

const operatorsAsText = (isEgo: boolean) => ({
	EXISTS: "where",
	NOT_EXISTS: "without",
	EXACTLY: isEgo ? "that is exactly equal to" : "is exactly equal to",
	NOT: isEgo ? "that is not" : "is not",
	GREATER_THAN: isEgo ? "that is greater than" : "is greater than",
	GREATER_THAN_OR_EQUAL: isEgo ? "that is greater than or equal to" : "is greater than or equal to",
	LESS_THAN: isEgo ? "that is less than" : "is less than",
	LESS_THAN_OR_EQUAL: isEgo ? "that is less than or equal to" : "is less than or equal to",
	CONTAINS: isEgo ? "that contains" : "contains",
	DOES_NOT_CONTAIN: isEgo ? "that does not contain" : "does not contain",
	INCLUDES: isEgo ? "that includes" : "includes",
	NOT_INCLUDES: isEgo ? "that does not include" : "does not include",
	OPTIONS_GREATER_THAN: isEgo ? "that has selected options greater than" : "has selected options greater than",
	OPTIONS_LESS_THAN: isEgo ? "that has selected options less than" : "has selected options less than",
	OPTIONS_EQUALS: isEgo ? "that has selected options equal to" : "has selected options equal to",
	OPTIONS_NOT_EQUALS: isEgo ? "that has selected options not equal to" : "has selected options not equal to",
});

const typeOperatorsAsText = {
	EXISTS: "exists",
	NOT_EXISTS: "does not exist",
};

const formatValue = (value: string | number | boolean | Array<string | number>): string | number | boolean => {
	switch (typeof value) {
		case "boolean":
			return value ? "true" : "false";
		case "object": {
			if (isArray(value)) {
				return join(value, ", ");
			}
			return value;
		}
		default:
			return value;
	}
};

type JoinProps = {
	value?: string;
};

export const Join = ({ value = "" }: JoinProps) => (
	<fieldset className="rules-preview-text__join">
		<legend>{value.toLowerCase()}</legend>
	</fieldset>
);

type TypeProps = {
	children?: React.ReactNode;
};

const _Type = ({ children = "" }: TypeProps) => <div className="rules-preview-text__type">{children}</div>;

type EntityProps = {
	children?: React.ReactNode;
};

const _Entity = ({ children = "" }: EntityProps) => <div className="rules-preview-text__entity">{children}s</div>;

type VariableProps = {
	children?: React.ReactNode;
};

const Variable = ({ children = "" }: VariableProps) => <div className="rules-preview-text__variable">{children}</div>;

type OperatorProps = {
	value?: string;
	isEgo?: boolean;
};

const Operator = ({ value = "", isEgo = false }: OperatorProps) => (
	<div className="rules-preview-text__operator">{get(operatorsAsText(isEgo), value, value.toLowerCase())}</div>
);

type TypeOperatorProps = {
	value?: string;
};

const TypeOperator = ({ value = "" }: TypeOperatorProps) => (
	<div className="rules-preview-text__operator">{get(typeOperatorsAsText, value, value.toLowerCase())}</div>
);

type ValueProps = {
	value?: string | number | boolean | Array<string | number>;
};

const Value = ({ value = "" }: ValueProps) => {
	const formattedValue = formatValue(value);
	return <div className="rules-preview-text__value">{formattedValue}</div>;
};

type CopyProps = {
	children?: string;
};

const Copy = ({ children = "" }: CopyProps) => <div className="rules-preview-text__copy">{children}</div>;

const PreviewText = ({ type, options }: PreviewTextProps) => {
	if (type === "ego") {
		return (
			<>
				<span style={{ "--node--label": "var(--text-dark)" } as React.CSSProperties}>
					<PreviewNode label="Ego" color="color-platinum" />
				</span>
				<Copy>has</Copy>
				<SimpleVariablePill
					label={options.attribute ?? ""}
					type={
						(options.variableType as
							| "number"
							| "text"
							| "boolean"
							| "ordinal"
							| "categorical"
							| "scalar"
							| "datetime"
							| "layout"
							| "location") ?? "text"
					}
				>
					{options.attribute ?? ""}
				</SimpleVariablePill>
				<Operator value={options.operator} isEgo />
				<Value value={options.value} />
			</>
		);
	}

	const PreviewComponent = type === "edge" ? PreviewEdge : PreviewNode;

	if (isNil(options.attribute)) {
		return (
			<>
				<PreviewComponent color={options.typeColor ?? ""} label={options.typeLabel ?? ""} />
				<TypeOperator value={options.operator} />
			</>
		);
	}
	if (isNil(options.value)) {
		return (
			<>
				<PreviewComponent color={options.typeColor ?? ""} label={options.typeLabel ?? ""} />
				<Operator value={options.operator} />
				<Variable>{options.attribute}</Variable>
			</>
		);
	}
	return (
		<>
			<PreviewComponent color={options.typeColor ?? ""} label={options.typeLabel ?? ""} />
			<Copy>where</Copy>
			<SimpleVariablePill
				label={options.attribute ?? ""}
				type={
					(options.variableType as
						| "number"
						| "text"
						| "boolean"
						| "ordinal"
						| "categorical"
						| "scalar"
						| "datetime"
						| "layout"
						| "location") ?? "text"
				}
			>
				{options.attribute ?? ""}
			</SimpleVariablePill>
			<Operator value={options.operator} />
			<Value value={options.value} />
		</>
	);
};

type PreviewTextOptions = {
	attribute?: string;
	operator?: string;
	type?: string;
	value?: string | number | boolean | Array<string | number>;
	variableType?: string;
	typeColor?: string;
	typeLabel?: string;
};

type PreviewTextProps = {
	type: string;
	options: PreviewTextOptions;
};

export default PreviewText;
