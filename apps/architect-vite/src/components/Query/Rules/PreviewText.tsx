import Node from "@codaco/fresco-ui/Node";
import { get, isArray, isNil, join } from "es-toolkit/compat";
import type { CSSProperties } from "react";
import { SimpleVariablePill } from "../../Form/Fields/VariablePicker/VariablePill";
import PreviewEdge from "../../sections/fields/EntitySelectField/PreviewEdge";
import PreviewNode from "../../sections/fields/EntitySelectField/PreviewNode";

// Ego is rendered as a one-off platinum node — not a real codebook color
const EGO_NODE_STYLE: CSSProperties = {
	["--base" as string]: "var(--color-platinum)",
};

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
	<fieldset className="h-0 w-full border-t-4 border-platinum px-(--space-xl) py-(--space-md) text-center">
		<legend className="px-(--space-md) italic uppercase text-platinum-dark">{value.toLowerCase()}</legend>
	</fieldset>
);

type VariableProps = {
	children?: React.ReactNode;
};

const Variable = ({ children = "" }: VariableProps) => <div>{children}</div>;

type OperatorProps = {
	value?: string;
	isEgo?: boolean;
};

const Operator = ({ value = "", isEgo = false }: OperatorProps) => (
	<div>{get(operatorsAsText(isEgo), value, value.toLowerCase())}</div>
);

type TypeOperatorProps = {
	value?: string;
};

const TypeOperator = ({ value = "" }: TypeOperatorProps) => (
	<div>{get(typeOperatorsAsText, value, value.toLowerCase())}</div>
);

type ValueProps = {
	value?: string | number | boolean | Array<string | number>;
};

const Value = ({ value = "" }: ValueProps) => {
	const formattedValue = formatValue(value);
	return (
		<div className="-mb-[3px] mx-(--space-xs) border-b-[3px] border-dotted border-rules-assert font-semibold">
			{formattedValue}
		</div>
	);
};

type CopyProps = {
	children?: string;
};

const Copy = ({ children = "" }: CopyProps) => <div>{children}</div>;

type RuleEntityProps = {
	type: string;
	color: string;
	label: string;
};

const RuleEntity = ({ type, color, label }: RuleEntityProps) =>
	type === "edge" ? (
		<PreviewEdge color={color} label={label} surface={2} />
	) : (
		<PreviewNode color={color} label={label} size="xs" />
	);

const PreviewText = ({ type, options }: PreviewTextProps) => {
	if (type === "ego") {
		return (
			<>
				<Node label="Ego" color="custom" size="xs" className="text-surface-2-foreground" style={EGO_NODE_STYLE} />
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

	if (isNil(options.attribute)) {
		return (
			<>
				<RuleEntity type={type} color={options.typeColor ?? ""} label={options.typeLabel ?? ""} />
				<TypeOperator value={options.operator} />
			</>
		);
	}
	if (isNil(options.value)) {
		return (
			<>
				<RuleEntity type={type} color={options.typeColor ?? ""} label={options.typeLabel ?? ""} />
				<Operator value={options.operator} />
				<Variable>{options.attribute}</Variable>
			</>
		);
	}
	return (
		<>
			<RuleEntity type={type} color={options.typeColor ?? ""} label={options.typeLabel ?? ""} />
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
