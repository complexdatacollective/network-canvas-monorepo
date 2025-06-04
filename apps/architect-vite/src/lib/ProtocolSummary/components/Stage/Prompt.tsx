import Markdown from "@codaco/legacy-ui/components/Fields/Markdown";
import { get, isNull } from "lodash";
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


const attributes = [
	["layout.layoutVariable", "Layout variable", (id) => <Variable id={id} />],
	["variable", "Variable", (id) => <Variable id={id} />],
	["edges.create", "Creates edge", (type) => <EntityBadge entity="edge" type={type} tiny link />],
	["createEdge", "Creates edge", (type) => <EntityBadge entity="edge" type={type} tiny link />],
	["edgeVariable", "Edge Strength Variable", (id) => <Variable id={id} />],
	["highlight.allowHighlighting", "Allow highlighting", (allow) => renderValue(allow)],
	["highlight.variable", "Highlight variable", (id) => <Variable id={id} />],
	["negativeLabel", "Negative Option Label", (text) => text],
	["sortOrder", "Sort by property", (rules) => <SortOrder rules={rules} />],
	["binSortOrder", "Bin sort order", (rules) => <SortOrder rules={rules} />],
	["bucketSortOrder", "Bucket sort order", (rules) => <SortOrder rules={rules} />],
	["otherVariable", "Other variable", (id) => <Variable id={id} />],
	["otherVariablePrompt", "Other variable prompt", (text) => text],
	["otherOptionLabel", "Other option label", (text) => text],
];
const reduceAttribute =
	(prompt: any) =>
	(acc: any[], [path, label, renderer]: [string, string, (val: any) => any]) => {
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
		value: any;
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
	[key: string]: any;
};

const Prompt = ({ text, additionalAttributes = [], ...prompt }: PromptProps) => {
	const attributeRows = attributes.reduce(reduceAttribute(prompt), []);

	const additionalAttributeRows = additionalAttributes.map(({ variable: variableId, value }) => [
		<Variable id={variableId} />,
		renderValue(value),
	]);

	return (
		<div className="protocol-summary-stage__prompts-item">
			<Markdown label={text} />
			{attributeRows.length > 0 && <MiniTable rotated rows={attributeRows} />}
			{additionalAttributes.length > 0 && <MiniTable rows={[["Variable", "Value"], ...additionalAttributeRows]} />}
		</div>
	);
};


export default Prompt;
