import { get } from "es-toolkit/compat";
import type React from "react";
import timelineImages from "~/images/timeline";
import type { Line, Node, BranchNode as TBranchNode, StageNode as TStageNode } from "~/utils/lineValidation";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

function StageNode({
	node,
}: {
	node: TStageNode;
}) {
	return (
		<div className="flex flex-col items-center">
			<img
				className="w-40 rounded shadow justify-self-end select-none pointer-events-none group-hover:scale-105 transition-transform duration-300 ease-in-out"
				src={getTimelineImage(node.name)}
				alt={`${node.name} interface`}
			/>
			<h4>{node.name}</h4>
		</div>
	);
}

function BranchNode({
	node,
}: {
	node: TBranchNode;
}) {
	return (
		<div className="flex flex-col items-center">
			<img
				className="w-40 rounded shadow justify-self-end select-none pointer-events-none group-hover:scale-105 transition-transform duration-300 ease-in-out"
				src={getTimelineImage(node.name)}
				alt={`${node.name} interface`}
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

// Grid position type for CSS Grid layout
type GridPosition = {
	row: number;
	column: number;
	// Store pixel positions for SVG connectors
	pixelX: number;
	pixelY: number;
};

// Layout algorithm for CSS Grid
function calculateGridLayout(line: Line): { positions: Record<string, GridPosition>; totalColumns: number } {
	const positions: Record<string, GridPosition> = {};
	const nodeDepths: Record<string, number> = {};
	const nodeColumns: Record<string, number> = {};

	// Find root nodes (start points)
	const rootNodeIds = Object.entries(line)
		.filter(([_, node]) => node.root)
		.map(([id]) => id);

	// Calculate depth (row in grid)
	function calculateDepth(nodeId: string, depth: number, visited: Set<string> = new Set()): void {
		if (visited.has(nodeId)) return;
		visited.add(nodeId);

		nodeDepths[nodeId] = Math.max(nodeDepths[nodeId] || 0, depth);

		const node = line[nodeId];
		if (node && "next" in node && node.next) {
			if (node.kind === "stage" && node.next) {
				calculateDepth(node.next, depth + 1, visited);
			} else if (node.kind === "branch" && node.next) {
				for (const nextId of node.next) {
					calculateDepth(nextId, depth + 1, visited);
				}
			}
		}
	}

	for (const nodeId of rootNodeIds) {
		calculateDepth(nodeId, 0);
	}

	// Ensure FinishStage is on its own row at the bottom
	const finishStageId = Object.entries(line).find(([_, node]) => node.name === "FinishStage")?.[0];
	if (finishStageId) {
		// Find all non-FinishStage nodes and get their max depth
		const otherNodeDepths = Object.entries(nodeDepths)
			.filter(([id]) => id !== finishStageId)
			.map(([_, depth]) => depth);
		const maxOtherDepth = otherNodeDepths.length > 0 ? Math.max(...otherNodeDepths) : 0;
		nodeDepths[finishStageId] = maxOtherDepth + 1;
	}

	// Find convergence nodes (like FinishStage)
	const incomingConnections: Record<string, string[]> = {};
	for (const [nodeId, node] of Object.entries(line)) {
		if ("next" in node && node.next) {
			if (node.kind === "stage" && node.next) {
				const connections = incomingConnections[node.next] || [];
				connections.push(nodeId);
				incomingConnections[node.next] = connections;
			} else if (node.kind === "branch" && node.next) {
				for (const nextId of node.next) {
					const connections = incomingConnections[nextId] || [];
					connections.push(nodeId);
					incomingConnections[nextId] = connections;
				}
			}
		}
	}

	const convergenceNodes = new Set(
		Object.entries(incomingConnections)
			.filter(([_, incoming]) => incoming.length > 1)
			.map(([nodeId]) => nodeId),
	);

	// Find the maximum branch width needed
	let maxBranchWidth = 1;
	for (const [nodeId, node] of Object.entries(line)) {
		if (node.kind === "branch" && node.next) {
			maxBranchWidth = Math.max(maxBranchWidth, node.next.length);
		}
	}

	// Ensure we have an odd number of total columns for proper centering
	const totalColumns = maxBranchWidth % 2 === 0 ? maxBranchWidth + 1 : maxBranchWidth;
	const centerColumn = Math.ceil(totalColumns / 2);

	// Assign columns with proper centering
	const assignColumns = (nodeId: string, preferredColumn: number, visited: Set<string> = new Set()): void => {
		if (visited.has(nodeId)) return;
		visited.add(nodeId);

		const node = line[nodeId];
		if (!node) return;

		// Convergence nodes (like FinishStage) go in center column
		if (convergenceNodes.has(nodeId)) {
			nodeColumns[nodeId] = centerColumn;
		} else if (nodeColumns[nodeId] === undefined) {
			nodeColumns[nodeId] = preferredColumn;
		}

		if ("next" in node && node.next) {
			if (node.kind === "stage" && node.next) {
				// Linear progression stays in the same column
				assignColumns(node.next, nodeColumns[nodeId], visited);
			} else if (node.kind === "branch" && node.next) {
				// Branch nodes spread their children symmetrically around center
				const branchWidth = node.next.length;
				const startOffset = -(branchWidth - 1) / 2;

				for (const [index, nextId] of node.next.entries()) {
					const offset = startOffset + index;
					assignColumns(nextId, centerColumn + offset, visited);
				}
			}
		}
	};

	// Start from center column for root nodes
	for (const nodeId of rootNodeIds) {
		assignColumns(nodeId, centerColumn);
	}

	// Convert to grid positions with pixel positions for connectors
	const cellWidth = 180; // minmax(180px, auto) from grid template
	const cellHeight = 80; // minmax(80px, auto) from grid template
	const gap = 16; // gap-4 = 1rem = 16px
	const offsetX = cellWidth / 2; // Center of cell
	const offsetY = cellHeight / 2; // Center of cell

	for (const [nodeId, depth] of Object.entries(nodeDepths)) {
		const column = nodeColumns[nodeId] || centerColumn;
		const row = depth + 1; // CSS Grid is 1-indexed

		positions[nodeId] = {
			row,
			column,
			// Account for grid gap and center position within cell
			pixelX: (column - 1) * (cellWidth + gap) + offsetX,
			pixelY: (row - 1) * (cellHeight + gap) + offsetY,
		};
	}

	return { positions, totalColumns };
}

// Helper to check if node is terminal
function isTerminal(node: Node): "start" | "end" | null {
	if (node.root) return "start";
	if (!node.next || (node.kind === "branch" && node.next.length === 0)) return "end";
	return null;
}

const ExperimentalTimeline: React.FC = () => {
	const line = completeLine;
	const { positions, totalColumns } = calculateGridLayout(line);

	// Calculate grid dimensions
	const allPositions = Object.values(positions);
	if (allPositions.length === 0) {
		return <div>No timeline data available</div>;
	}

	const maxRow = Math.max(...allPositions.map((p) => p.row));

	return (
		<div className="relative">
			{/* CSS Grid for nodes */}
			<div
				className="grid gap-30 relative z-10"
				style={{
					gridTemplateRows: `repeat(${maxRow}, minmax(80px, auto))`,
					gridTemplateColumns: `repeat(${totalColumns}, minmax(180px, auto))`,
				}}
			>
				{Object.entries(line).map(([nodeId, node]) => {
					const pos = positions[nodeId];
					if (!pos) return null;
					const isStage = node.kind === "stage";

					return (
						<button
							type="button"
							data-node-id={nodeId}
							key={nodeId}
							className="flex items-center justify-center relative"
							style={{
								gridRow: pos.row,
								gridColumn: pos.column,
							}}
						>
							{isStage ? <StageNode node={node} /> : <BranchNode node={node} />}
						</button>
					);
				})}
			</div>
		</div>
	);
};

export default ExperimentalTimeline;
