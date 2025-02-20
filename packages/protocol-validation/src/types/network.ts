import type { Codebook } from "./codebook";

export type NcNode = Codebook["node"];

export type NcEdge = Codebook["edge"];

export type NcEgo = Codebook["ego"];

export type NcEntity = NcNode | NcEdge | NcEgo;

export type NcNetwork = {
	nodes: NcNode[];
	edges: NcEdge[];
	ego?: NcEgo;
};
