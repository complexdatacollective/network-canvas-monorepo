import { useMemo } from "react";
import { useSelector } from "react-redux";
import type { Codebook, Asset } from "@codaco/protocol-validation";
import { getEdgeIndex, getNodeIndex } from "~/selectors/indexes";
import { getNetworkAssets } from "~/selectors/protocol";
import { makeGetEntityWithUsage } from "./helpers";

// More specific type for stage/usage metadata
type UsageMeta = {
	label: string;
	id?: string;
};

type EntityWithUsage = {
	readonly entity: "node" | "edge";
	readonly type: string;
	readonly inUse: boolean;
	readonly usage: readonly UsageMeta[];
};

type AssetWithId = Asset & {
	readonly id: string;
};

type CodebookFlags = {
	readonly hasEgoVariables: boolean;
	readonly hasNodes: boolean;
	readonly hasEdges: boolean;
	readonly hasNetworkAssets: boolean;
};

type CodebookData = {
	readonly nodes: readonly EntityWithUsage[];
	readonly edges: readonly EntityWithUsage[];
	readonly processedNetworkAssets: readonly AssetWithId[];
} & CodebookFlags;

// Performance optimization: Create memoized processors for nodes and edges
const useEntityProcessors = () => {
	const nodeIndex = useSelector(getNodeIndex);
	const edgeIndex = useSelector(getEdgeIndex);

	// Memoize selector creation to avoid recreating on every render
	const getNodeWithUsage = useMemo(() => makeGetEntityWithUsage(nodeIndex, { entity: "node" }), [nodeIndex]);

	const getEdgeWithUsage = useMemo(() => makeGetEntityWithUsage(edgeIndex, { entity: "edge" }), [edgeIndex]);

	// Use the selectors
	const nodeProcessor = useSelector(getNodeWithUsage);
	const edgeProcessor = useSelector(getEdgeWithUsage);

	return { nodeProcessor, edgeProcessor };
};

const processEntityEntries = (
	entries: [string, unknown][],
	processor: (value: unknown, id: string) => unknown,
): EntityWithUsage[] => {
	return entries.map(([id, value]) => processor(value, id) as EntityWithUsage);
};

const processNetworkAssets = (networkAssets: Record<string, unknown>): AssetWithId[] => {
	return Object.entries(networkAssets).map(([id, asset]) => ({
		...(asset as Asset),
		id,
	}));
};

const calculateFlags = (
	codebook: Codebook,
	nodes: EntityWithUsage[],
	edges: EntityWithUsage[],
	networkAssets: AssetWithId[],
): CodebookFlags => ({
	hasEgoVariables: Boolean(codebook.ego && Object.keys(codebook.ego).length > 0),
	hasNodes: nodes.length > 0,
	hasEdges: edges.length > 0,
	hasNetworkAssets: networkAssets.length > 0,
});

export const useCodebookData = (codebook: Codebook | null): CodebookData => {
	const networkAssets = useSelector(getNetworkAssets);
	const { nodeProcessor, edgeProcessor } = useEntityProcessors();

	// Memoize node processing
	const nodes = useMemo(() => {
		if (!codebook?.node) return [];
		return processEntityEntries(Object.entries(codebook.node), nodeProcessor);
	}, [codebook?.node, nodeProcessor]);

	// Memoize edge processing
	const edges = useMemo(() => {
		if (!codebook?.edge) return [];
		return processEntityEntries(Object.entries(codebook.edge), edgeProcessor);
	}, [codebook?.edge, edgeProcessor]);

	// Memoize network assets processing
	const processedNetworkAssets = useMemo(() => {
		return processNetworkAssets(networkAssets || {});
	}, [networkAssets]);

	// Memoize flags calculation
	const flags = useMemo(() => {
		if (!codebook) {
			return {
				hasEgoVariables: false,
				hasNodes: false,
				hasEdges: false,
				hasNetworkAssets: false,
			};
		}
		return calculateFlags(codebook, nodes, edges, processedNetworkAssets);
	}, [codebook, nodes, edges, processedNetworkAssets]);

	return useMemo(
		() => ({
			nodes,
			edges,
			processedNetworkAssets,
			...flags,
		}),
		[nodes, edges, processedNetworkAssets, flags],
	);
};
