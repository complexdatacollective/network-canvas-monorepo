import {
	edgeExportIDProperty,
	edgeSourceProperty,
	edgeTargetProperty,
	entityPrimaryKeyProperty,
	ncSourceUUID,
	ncTargetUUID,
	nodeExportIDProperty,
} from "@codaco/shared-consts";
import type {
	EdgeWithResequencedID,
	NodeWithResequencedID,
	SessionWithNetworkEgo,
	SessionWithResequencedIDs,
} from "../input";

export const resequenceSessionIds = (session: SessionWithNetworkEgo): SessionWithResequencedIDs => {
	let resequencedNodeId = 0;
	let resequencedEdgeId = 0;
	const IDLookupMap: Record<string, string> = {};

	return {
		...session,
		nodes: session?.nodes?.map((node) => {
			resequencedNodeId++;
			IDLookupMap[node[entityPrimaryKeyProperty]] = resequencedNodeId.toString();
			const newNode: NodeWithResequencedID = {
				[nodeExportIDProperty]: resequencedNodeId,
				...node,
			};
			return newNode;
		}),
		edges: session?.edges?.map((edge) => {
			resequencedEdgeId++;
			IDLookupMap[edge[entityPrimaryKeyProperty]] = resequencedEdgeId.toString();
			const newEdge: EdgeWithResequencedID = {
				...edge,
				[ncSourceUUID]: edge[edgeSourceProperty],
				[ncTargetUUID]: edge[edgeTargetProperty],
				[edgeExportIDProperty]: resequencedEdgeId,
				from: IDLookupMap[edge[edgeSourceProperty]] ?? edge[edgeSourceProperty],
				to: IDLookupMap[edge[edgeTargetProperty]] ?? edge[edgeTargetProperty],
			};
			return newEdge;
		}),
	};
};
