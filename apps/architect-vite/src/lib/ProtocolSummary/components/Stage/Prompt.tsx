import { get, isNull } from "lodash";
import type { ReactNode } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import EntityBadge from "../EntityBadge";
import { renderValue } from "../helpers";
import MiniTable from "../MiniTable";
import Variable from "../Variable";

const directionLabel = (direction: string) => (direction === "desc" ? "descending" : "ascending");

type SortOrderProps = {
	rules: Array<{
		property: string;
		direction: string;
	}>;
};

const SortOrder = ({ rules }: SortOrderProps) => {
	if (!rules) return null;

	const result = rules.map(({ property, direction }) => (
		<li key={property}>
			{property === "*" ? "*" : <Variable id={property} />} <small>({directionLabel(direction)})</small>
		</li>
	));
	return <ol className="protocol-summary-stage__prompts-sort">{result}</ol>;
};

const attributes: Array<[string, string, (val: unknown) => ReactNode]> = [
	["layout.layoutVariable", "Layout variable", (id: unknown) => <Variable id={String(id)} />],
	["variable", "Variable", (id: unknown) => <Variable id={String(id)} />],
	["edges.create", "Creates edge", (type: unknown) => <EntityBadge entity="edge" type={String(type)} tiny link />],
	["createEdge", "Creates edge", (type: unknown) => <EntityBadge entity="edge" type={String(type)} tiny link />],
	["edgeVariable", "Edge Strength Variable", (id: unknown) => <Variable id={String(id)} />],
	["highlight.allowHighlighting", "Allow highlighting", (allow: unknown) => renderValue(allow)],
	["highlight.variable", "Highlight variable", (id: unknown) => <Variable id={String(id)} />],
	["negativeLabel", "Negative Option Label", (text: unknown) => String(text)],
	["sortOrder", "Sort by property", (rules: unknown) => <SortOrder rules={rules as SortOrderProps["rules"]} />],
	["binSortOrder", "Bin sort order", (rules: unknown) => <SortOrder rules={rules as SortOrderProps["rules"]} />],
	["bucketSortOrder", "Bucket sort order", (rules: unknown) => <SortOrder rules={rules as SortOrderProps["rules"]} />],
	["otherVariable", "Other variable", (id: unknown) => <Variable id={String(id)} />],
	["otherVariablePrompt", "Other variable prompt", (text: unknown) => String(text)],
	["otherOptionLabel", "Other option label", (text: unknown) => String(text)],
];
const reduceAttribute =
	(prompt: Record<string, unknown>) =>
	(acc: ReactNode[][], [path, label, renderer]: [string, string, (val: unknown) => ReactNode]) => {
		const value = get(prompt, path, null);
		if (isNull(value)) {
			return acc;
		}
		return [...acc, [label, renderer(value)]];
	};

type PromptProps = {
	text: string;
	additionalAttributes?: Array<{
		variable: string;
		value: unknown;
	}>;
	edges?: {
		create?: string;
	} | null;
	variable?: string | null;
	layout?: {
		layoutVariable?: string;
	} | null;
	createEdge?: string | null;
	edgeVariable?: string | null;
	[key: string]: unknown;
};

const Prompt = ({ text, additionalAttributes = [], ...prompt }: PromptProps) => {
	const attributeRows = attributes.reduce(reduceAttribute(prompt), [] as ReactNode[][]);

	const additionalAttributeRows: ReactNode[][] = additionalAttributes.map(({ variable: variableId, value }) => [
		<Variable key={variableId} id={variableId} />,
		renderValue(value),
	]);

	return (
		<div className="protocol-summary-stage__prompts-item">
			<Markdown value={text} />
			{attributeRows.length > 0 && <MiniTable rotated rows={attributeRows} />}
			{additionalAttributes.length > 0 && <MiniTable rows={[["Variable", "Value"], ...additionalAttributeRows]} />}
		</div>
	);
};

export default Prompt;
