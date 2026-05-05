import type { ItemProps } from "@codaco/fresco-ui/collection/types";
import type { DragMetadata, DropCallback } from "@codaco/fresco-ui/dnd/types";
import type { Panel as PanelType } from "@codaco/protocol-validation";
import { entityPrimaryKeyProperty, type NcNode } from "@codaco/shared-consts";
import { useCallback, useEffect, useMemo } from "react";
import NodeList from "../../../components/NodeList";
import Panel from "../../../components/Panel";
import useExternalData from "../../../hooks/useExternalData";
import { useStageSelector } from "../../../hooks/useStageSelector";
import { getPanelNodes } from "../../../selectors/name-generator";
import { getStageSubject } from "../../../selectors/session";
import ExternalNodeItem from "./ExternalNodeItem";

type NodePanelProps = {
	panelConfig: PanelType;
	disableDragging: boolean;
	accepts: string[];
	panelNumber: number;
	minimize: boolean;
	onDrop: DropCallback;
	onUpdate: (nodeCount: number, nodeIndex: Set<string>) => void;
	id: string;
	animationKey?: string | number;
};

function NodePanel(props: NodePanelProps) {
	const { panelNumber, id, onUpdate, panelConfig, onDrop, minimize, accepts, animationKey } = props;

	const stageSubject = useStageSelector(getStageSubject);

	const { externalData } = useExternalData(panelConfig.dataSource, stageSubject);

	const nodes = useStageSelector(getPanelNodes(panelConfig, externalData));

	// Because the index is used to determine whether node originated in this list
	// we need to supply an index for the unfiltered list for externalData.
	const fullNodeIndex = useMemo(() => {
		const allNodes = panelConfig.dataSource === "existing" ? nodes : (externalData ?? []);

		return new Set(allNodes.map((node) => node[entityPrimaryKeyProperty]));
	}, [externalData, nodes, panelConfig.dataSource]);

	useEffect(() => {
		onUpdate(nodes.length, fullNodeIndex);
	}, [nodes.length, onUpdate, fullNodeIndex]);

	const acceptsFilter = useCallback(
		(metadata: DragMetadata | undefined) => {
			if (!metadata) return false;

			const node = metadata as NcNode & { itemType?: string };

			// Only accept nodes from the main panel
			if (node.itemType !== "EXISTING_NODE") return false;

			if (panelConfig.dataSource === "existing") {
				// Existing network panels accept nodes that were on multiple prompts
				// (i.e. they existed before this prompt and were shown in this panel)
				return (node.promptIDs?.length ?? 0) > 1;
			}

			// External data panels only accept nodes that originated from this
			// specific data source (their ID exists in the full node index) AND
			// were added on the current prompt only (promptIDs.length === 1).
			// Nodes with multiple promptIDs came via the existing network panel.
			return (node.promptIDs?.length ?? 0) === 1 && fullNodeIndex.has(node[entityPrimaryKeyProperty]);
		},
		[panelConfig.dataSource, fullNodeIndex],
	);

	const isExternalData = panelConfig.dataSource !== "existing";

	const renderItem = useCallback(
		(node: NcNode, itemProps: ItemProps) => <ExternalNodeItem node={node} itemProps={itemProps} size="sm" />,
		[],
	);

	return (
		<Panel title={panelConfig.title} panelNumber={panelNumber} minimize={minimize} testId="node-panel">
			<NodeList
				items={nodes}
				id={id}
				itemType="NEW_NODE"
				onDrop={onDrop}
				accepts={accepts}
				acceptsFilter={acceptsFilter}
				nodeSize="sm"
				animationKey={animationKey}
				announcedName={panelConfig.title}
				renderItem={isExternalData ? renderItem : undefined}
			/>
		</Panel>
	);
}

export default NodePanel;
