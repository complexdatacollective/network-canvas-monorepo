import type { Color } from "./colors.js";

export enum StageTypes {
	NameGenerator = "NameGenerator",
	NameGeneratorQuickAdd = "NameGeneratorQuickAdd",
	NameGeneratorRoster = "NameGeneratorRoster",
	NameGeneratorList = "NameGeneratorList",
	NameGeneratorAutoComplete = "NameGeneratorAutoComplete",
	Sociogram = "Sociogram",
	Information = "Information",
	OrdinalBin = "OrdinalBin",
	CategoricalBin = "CategoricalBin",
	Narrative = "Narrative",
	AlterForm = "AlterForm",
	EgoForm = "EgoForm",
	AlterEdgeForm = "AlterEdgeForm",
	DyadCensus = "DyadCensus",
	TieStrengthCensus = "TieStrengthCensus",
}

export type SortOption = {
	property: string;
	direction: "asc" | "desc";
};

export type PromptEdges = {
	display?: string[];
	create?: string;
};

export type AdditionalAttribute = {
	variable: string;
	value: boolean;
};

export type AdditionalAttributes = AdditionalAttribute[];

export type Prompt = {
	id: string;
	text: string;
	additionalAttributes?: AdditionalAttributes;
	createEdge?: string;
	edgeVariable?: string;
	negativeLabel?: string;
	variable?: string;
	bucketSortOrder?: SortOption[];
	binSortOrder?: SortOption[];
	color?: Color;
	sortOrder?: SortOption[];
	layout?: {
		layoutVariable?: string;
	};
	edges?: PromptEdges;
	highlight?: {
		allowHighlighting?: boolean;
		variable?: string;
	};
	otherVariable?: string;
	otherVariablePrompt?: string;
	otherOptionLabel?: string;
};

type Operator =
	| "EXISTS"
	| "NOT_EXISTS"
	| "EXACTLY"
	| "NOT"
	| "GREATER_THAN"
	| "GREATER_THAN_OR_EQUAL"
	| "LESS_THAN"
	| "LESS_THAN_OR_EQUAL"
	| "INCLUDES"
	| "EXCLUDES"
	| "OPTIONS_GREATER_THAN"
	| "OPTIONS_LESS_THAN"
	| "OPTIONS_EQUALS"
	| "OPTIONS_NOT_EQUALS";

type BaseFilterRule = {
	id: string;
};

type EgoFilterRule = BaseFilterRule & {
	type: "ego";
	options: {
		attribute?: string;
		operator: Operator;
		value: boolean | number | string;
	};
};

type NodeOrAlterFilterRule = BaseFilterRule & {
	type: "edge" | "alter";
	options: {
		type: string;
		attribute?: string;
		operator: Operator;
		value: boolean | number | string;
	};
};

export type FilterRule = EgoFilterRule | NodeOrAlterFilterRule;

export type FilterDefinition = {
	join: "AND" | "OR";
	rules: FilterRule[];
};

export type SkipDefinition = {
	action: "SKIP" | "SHOW";
	filter: FilterDefinition;
};

export type PresetDefinition = {
	id: string;
	label: string;
	layoutVariable: string;
	groupVariable?: string;
	edges?: {
		display?: string[];
	};
	highlight?: string[];
};

export type ItemDefinition = {
	id: string;
	type: "asset" | "text";
	content: string;
	size: "SMALL" | "MEDIUM" | "LARGE";
};

type EgoStageSubject = {
	entity: "ego";
};

type NodeStageSubject = {
	entity: "node";
	type: string;
};

type EdgeStageSubject = {
	entity: "edge";
	type: string;
};

export type StageSubject = EgoStageSubject | NodeStageSubject | EdgeStageSubject;

export type FormField = {
	variable: string;
	prompt: string;
};

export type Form = {
	title: string;
	fields: FormField[];
};

export type Panel = {
	id: string;
	title: string;
	filter?: FilterDefinition;
	dataSource?: string;
};

export type Stage = {
	id: string;
	type: string;
	label: string;
	title?: string; // Todo: remove this
	interviewScript?: string;
	form?: Form;
	introductionPanel?: object; // Todo: create a Panel type
	subject?: StageSubject | StageSubject[];
	panels?: Panel[];
	prompts?: Prompt[];
	quickAdd?: string;
	behaviours?: object;
	filter?: FilterDefinition;
	skipLogic?: SkipDefinition;
	dataSource?: string;
	cardOptions?: object; // Todo: create a CardOptions type
	sortOptions?: {
		sortOrder: SortOption[];
		sortableProperties: object[]; // Todo: create a SortableProperty type
	};
	background?: {
		image?: string;
		concentricCircles?: number;
		skewedTowardCenter?: boolean;
	};
	searchOptions?: {
		fuzziness?: number;
		matchProperties?: string[];
	};
	presets?: PresetDefinition[];
	items?: ItemDefinition[];
};
