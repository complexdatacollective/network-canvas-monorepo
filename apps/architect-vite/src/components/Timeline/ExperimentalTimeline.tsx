import { get } from "es-toolkit/compat";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHierarchicalLayout } from "~/hooks/useHierarchicalLayout";
import timelineImages from "~/images/timeline";
import type { Line, BranchNode as TBranchNode, StageNode as TStageNode } from "~/utils/lineValidation";
import { ZoomPanViewport } from "./ZoomPanViewport";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

function StageNode({
	id,
	node,
}: {
	id: string;
	node: TStageNode;
}) {
	return (
		<div className="flex flex-col items-center">
			<img
				data-node-marker={id}
				className="w-40 rounded shadow justify-self-end select-none pointer-events-none group-hover:scale-105 transition-transform duration-300 ease-in-out"
				src={getTimelineImage(node.name)}
				alt={`${node.name} interface`}
			/>
			<h4>{node.name}</h4>
		</div>
	);
}

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
const completeLine: Line = {
	szjys8qdqeb: {
		kind: "stage",
		name: "FinishStage",
	},
	"7p3mtjtj70h": {
		kind: "stage",
		name: "NameGenerator",
		root: true,
		next: "tycywpm8j69",
	},
	"8n22003vs4": {
		kind: "stage",
		name: "Narrative",
		next: "szjys8qdqeb",
	},
	y2aspdvg6rb: {
		kind: "stage",
		name: "OrdinalBin",
		next: "ctxv2x7kx4j",
	},
	ctxv2x7kx4j: {
		kind: "stage",
		name: "CategoricalBin",
		next: "szjys8qdqeb",
	},
	"8wykg1ioli": {
		kind: "stage",
		name: "DyadCensus",
		next: "szjys8qdqeb",
	},
	s3ikdgffkv: {
		kind: "stage",
		name: "FamilyTreeCensus",
		next: "szjys8qdqeb",
	},
	xwjhgypx50k: {
		kind: "stage",
		name: "Geospatial",
		next: "jq1y33luhgh",
	},
	jq1y33luhgh: {
		kind: "stage",
		name: "Narrative",
		next: "0xvg9qs2394b",
	},
	"0xvg9qs2394b": {
		kind: "stage",
		name: "NameGeneratorRoster",
		next: "szjys8qdqeb",
	},
	tycywpm8j69: {
		kind: "branch",
		name: "Path Split",
		next: ["8n22003vs4", "y2aspdvg6rb", "8wykg1ioli", "s3ikdgffkv", "xwjhgypx50k"],
	},
};

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

// Hook to get element positions using data-node-marker for line drawing
function useLinePositions(
	connections: Array<{ from: string; to: string }>,
	layoutPositions: Map<string, { x: number; y: number; width: number; height: number }> | undefined,
) {
	const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
	const containerRef = useRef<HTMLDivElement>(null);

	const updatePositions = useCallback(() => {
		if (!containerRef.current || !layoutPositions) return;

		const newPositions: Record<string, { x: number; y: number }> = {};
		const containerRect = containerRef.current.getBoundingClientRect();

		// Get all unique node IDs from connections
		const nodeIds = new Set<string>();
		for (const connection of connections) {
			nodeIds.add(connection.from);
			nodeIds.add(connection.to);
		}

		// Find each element and get its center position
		for (const nodeId of nodeIds) {
			const element = containerRef.current.querySelector(`[data-node-marker="${nodeId}"]`) as HTMLElement;
			if (element) {
				const rect = element.getBoundingClientRect();
				newPositions[nodeId] = {
					x: rect.left + rect.width / 2 - containerRect.left,
					y: rect.top + rect.height / 2 - containerRect.top,
				};
			}
		}

		setPositions(newPositions);
	}, [connections, layoutPositions]);

	useEffect(() => {
		// Delay position calculation to ensure DOM is ready
		const timer = setTimeout(updatePositions, 100);
		return () => clearTimeout(timer);
	}, [updatePositions]);

	useEffect(() => {
		// Update positions on window resize
		window.addEventListener("resize", updatePositions);
		return () => window.removeEventListener("resize", updatePositions);
	}, [updatePositions]);

	return { positions, containerRef };
}

const ExperimentalTimeline: React.FC = () => {
	const line = completeLine;
	const { layout, zoom, pan, handleZoom, handlePan, resetView } = useHierarchicalLayout(line);
	const connections = getConnections(line);
	const { positions: linePositions, containerRef } = useLinePositions(connections, layout?.positions);

	if (!layout) {
		return <div>No timeline data available</div>;
	}

	return (
		<div className="w-full h-full overflow-hidden">
			{/* Control buttons */}
			<div className="absolute bottom-24 right-4 z-20 flex gap-2">
				<button
					type="button"
					onClick={resetView}
					className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
				>
					Reset View
				</button>
				<div className="px-3 py-1 bg-white border border-gray-300 rounded text-sm">{Math.round(zoom * 100)}%</div>
			</div>

			<ZoomPanViewport zoom={zoom} pan={pan} onZoom={handleZoom} onPan={handlePan} className="w-full h-full">
				<div
					ref={containerRef}
					className="relative"
					style={{
						width: layout.bounds.width + 200, // Add padding
						height: layout.bounds.height + 200, // Add padding
						transform: `translate(100px, 100px)`, // Center with padding
					}}
				>
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
								{isStage ? <StageNode node={node} id={nodeId} /> : <BranchNode node={node} id={nodeId} />}
							</button>
						);
					})}

					{/* SVG overlay for connecting lines */}
					<svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ overflow: "visible" }}>
						<title>Timeline Connectors</title>
						{connections.map(({ from, to }) => {
							const fromPos = linePositions[from];
							const toPos = linePositions[to];

							if (!fromPos || !toPos) return null;

							return (
								<line
									key={`${from}-${to}`}
									x1={fromPos.x}
									y1={fromPos.y}
									x2={toPos.x}
									y2={toPos.y}
									stroke="#3b82f6"
									strokeWidth="2"
									strokeLinecap="round"
									className="drop-shadow-sm"
								/>
							);
						})}
					</svg>
				</div>
			</ZoomPanViewport>
		</div>
	);
};

export default ExperimentalTimeline;
