import type { Protocol } from "./protocol";

export type Codebook = Protocol["codebook"];

export type EntityTypeDefinition = Codebook["ego"];

export type NodeTypeDefinition = Codebook["node"];

export type EdgeTypeDefinition = Codebook["edge"];
