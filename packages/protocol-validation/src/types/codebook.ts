import type { Color } from "./colors";
import type { Protocol } from "./protocol";
import type { VariableDefinition } from "./variables";

export enum EntityTypes {
	edge = "edge",
	node = "node",
	ego = "ego",
}

export type EntityTypeDefinition = {
	name?: string;
	color?: Color;
	iconVariant?: string;
	variables?: Record<string, VariableDefinition>;
};

export type NodeTypeDefinition = EntityTypeDefinition & {
	name: string;
	color: Color;
	iconVariant?: string;
};

export type EdgeTypeDefinition = EntityTypeDefinition & {
	name: string;
	color: Color;
};

export type EgoTypeDefinition = EntityTypeDefinition;

export type Codebook = Protocol["codebook"];
