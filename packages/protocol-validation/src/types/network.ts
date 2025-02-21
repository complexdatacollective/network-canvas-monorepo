import { entityAttributesProperty, entityPrimaryKeyProperty } from "@codaco/shared-consts";

export type NcEntity = {
	readonly [entityPrimaryKeyProperty]: string;
	type?: string;
	[entityAttributesProperty]: Record<string, unknown>;
};

export type NcNode = NcEntity & {
	type: string;
	stageId?: string;
	promptIDs?: string[];
	displayVariable?: string; // @deprecated
	iconVariant?: string;
	color?: string;
	variables?: Record<string, unknown>;
};

export type NcEdge = NcEntity & {
	type: string;
	from: string;
	to: string;
	color?: string;
	variables?: Record<string, unknown>;
};

export type NcEgo = NcEntity & {
	variables?: Record<string, unknown>;
};

export type NcNetwork = {
	nodes: NcNode[];
	edges: NcEdge[];
	ego?: NcEgo;
};
