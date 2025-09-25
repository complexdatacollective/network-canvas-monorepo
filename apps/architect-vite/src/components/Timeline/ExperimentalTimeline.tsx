import { get } from "es-toolkit/compat";
import type React from "react";
import { useHierarchicalLayout } from "~/hooks/useHierarchicalLayout";
import timelineImages from "~/images/timeline";
import { Button } from "~/lib/legacy-ui/components";
import { createSampleLine, type Line, type BranchNode as TBranchNode } from "~/utils/lineValidation";
import { ZoomPanViewport } from "./ZoomPanViewport";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

function BranchNode({
	id,
	node,
}: {
	id: string;
	node: TBranchNode;
}) {
	return (
		<div className="flex flex-col items-center">
			{/* /* Render a diamond shape for branch nodes */}
			<div
				className="w-10 h-10 bg-timeline text-timeline-foreground rounded-full flex items-center justify-center"
				data-node-marker={id}
			/>
			<h4>{node.name}</h4>
		</div>
	);
}

// Example line segments that can be composed - now using the utility function
// const completeLine: Line = {
// 	szjys8qdqeb: {
// 		kind: "stage",
// 		name: "FinishStage",
// 	},
// 	"7p3mtjtj70h": {
// 		kind: "stage",
// 		name: "NameGenerator",
// 		root: true,
// 		next: "tycywpm8j69",
// 	},
// 	"8n22003vs4": {
// 		kind: "stage",
// 		name: "Narrative",
// 		next: "szjys8qdqeb",
// 	},
// 	y2aspdvg6rb: {
// 		kind: "stage",
// 		name: "OrdinalBin",
// 		next: "ctxv2x7kx4j",
// 	},
// 	ctxv2x7kx4j: {
// 		kind: "stage",
// 		name: "CategoricalBin",
// 		next: "szjys8qdqeb",
// 	},
// 	"8wykg1ioli": {
// 		kind: "stage",
// 		name: "DyadCensus",
// 		next: "szjys8qdqeb",
// 	},
// 	s3ikdgffkv: {
// 		kind: "stage",
// 		name: "FamilyTreeCensus",
// 		next: "szjys8qdqeb",
// 	},
// 	xwjhgypx50k: {
// 		kind: "stage",
// 		name: "Geospatial",
// 		next: "jq1y33luhgh",
// 	},
// 	jq1y33luhgh: {
// 		kind: "stage",
// 		name: "Narrative",
// 		next: "0xvg9qs2394b",
// 	},
// 	"0xvg9qs2394b": {
// 		kind: "stage",
// 		name: "NameGeneratorRoster",
// 		next: "szjys8qdqeb",
// 	},
// 	tycywpm8j69: {
// 		kind: "branch",
// 		name: "Path Split",
// 		next: ["8n22003vs4", "y2aspdvg6rb", "8wykg1ioli", "s3ikdgffkv", "xwjhgypx50k"],
// 	},
// };

const completeLine = createSampleLine();

console.log("Complete Line:", completeLine);

// Helper function to get all connections from the line data
function getConnections(line: Line): Array<{ from: string; to: string }> {
	const connections: Array<{ from: string; to: string }> = [];

	for (const [nodeId, node] of Object.entries(line)) {
		if ("next" in node && node.next) {
			if (node.kind === "stage" && node.next) {
				connections.push({ from: nodeId, to: node.next });
			} else if (node.kind === "branch" && node.next) {
				for (const nextId of node.next) {
					connections.push({ from: nodeId, to: nextId });
				}
			}
		}
	}

	return connections;
}

const ExperimentalTimeline: React.FC = () => {
	const line = completeLine;
	const { layout, zoom, pan, handleZoom, handlePan, resetView, config } = useHierarchicalLayout(line);
	const connections = getConnections(line);

	if (!layout) {
		return <div>No timeline data available</div>;
	}

	const { nodeWidth, nodeHeight } = config;

	return (
		<>
			{/* Control buttons */}
			<div className="absolute bottom-24 right-4 z-20 flex gap-2">
				<Button onClick={resetView}>Reset View</Button>
				<div className="px-3 py-1 bg-white border border-gray-300 rounded text-sm">{Math.round(zoom * 100)}%</div>
			</div>
			<div className="w-full h-full overflow-hidden">
				<ZoomPanViewport
					zoom={zoom}
					pan={pan}
					onZoom={handleZoom}
					onPan={handlePan}
					className="w-full h-full"
					zoomConfig={config.zoomSensitivity}
				>
					<div
						className="relative"
						style={{
							width: layout.bounds.width + 200, // Add padding
							height: layout.bounds.height + 200, // Add padding
							transform: "translate(100px, 100px)", // Center with padding
						}}
					>
						{/* SVG overlay for connecting lines */}
						<svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ overflow: "visible" }}>
							<title>Timeline Connectors</title>
							{connections.map(({ from, to }) => {
								const fromNode = line[from];
								const fromPos = layout.positions.get(from);
								const toPos = layout.positions.get(to);

								if (!fromPos || !toPos || !fromNode) return null;

								let pathData: string;

								if (fromNode.kind === "branch") {
									const fromSideX = fromPos.x + fromPos.width;
									const fromSideY = fromPos.y + fromPos.height / 2;
									const toTopX = toPos.x + toPos.width / 2;
									const toTopY = toPos.y;
									pathData = `M ${fromSideX} ${fromSideY} H ${toTopX} V ${toTopY}`;
								} else {
									const fromBottomX = fromPos.x + fromPos.width / 2;
									const fromBottomY = fromPos.y + fromPos.height;
									const toSideY = toPos.y + toPos.height / 2;
									const toSideX = toPos.x;
									pathData = `M ${fromBottomX} ${fromBottomY} V ${toSideY} H ${toSideX}`;
								}

								return (
									<path
										key={`${from}-${to}`}
										d={pathData}
										strokeLinecap="round"
										strokeLinejoin="round"
										className="stroke-timeline stroke-2 fill-none"
									/>
								);
							})}
						</svg>
						{/* Render nodes using absolute positioning */}
						{Array.from(layout.positions.entries()).map(([nodeId, position]) => {
							const node = line[nodeId];
							if (!node) return null;

							const isStage = node.kind === "stage";

							return (
								<button
									type="button"
									key={nodeId}
									data-node-id={nodeId}
									className="absolute flex items-center justify-center hover:scale-105 transition-transform duration-200"
									style={{
										left: position.x,
										top: position.y,
										width: position.width,
										height: position.height,
									}}
								>
									{isStage ? (
										<div
											className="flex flex-col items-center bg-white shadow-md rounded p-2 group"
											style={{ width: `${nodeWidth}px`, height: `${nodeHeight}px` }}
										>
											<img
												data-node-marker={nodeId}
												className="w-full aspect-[4/3] rounded shadow justify-self-end select-none pointer-events-none"
												src={getTimelineImage(node.name)}
												alt={`${node.name} interface`}
											/>
											<h4>{node.name}</h4>
										</div>
									) : (
										<BranchNode node={node} id={nodeId} />
									)}
								</button>
							);
						})}
					</div>
				</ZoomPanViewport>
			</div>
		</>
	);
};

export default ExperimentalTimeline;
