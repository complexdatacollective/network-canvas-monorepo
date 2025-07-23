import type React from "react";

// Updated types as provided
type BaseNode = {
	name: string;
	root?: boolean;
};

// Node types
type StageNode = BaseNode & {
	kind: "stage";
	next?: string;
};

type BranchNode = BaseNode & {
	kind: "branch";
	next?: string[];
};

type Node = StageNode | BranchNode;

type Line = Record<string, Node>;

// Example line segments that can be composed
const completeLine: Line = {
	"7N6BCpQ8G4TuG8LM": {
		kind: "stage",
		name: "Information",
		root: true,
		next: "Dui4Q2aJn97QDxCF",
	},
	Dui4Q2aJn97QDxCF: {
		kind: "stage",
		name: "EgoForm",
		next: "RJNVEi8bPJQKhx3c",
	},
	RJNVEi8bPJQKhx3c: {
		kind: "stage",
		name: "NameGenerator",
		next: "TPFCMShPEGqwqwQX",
	},
	TPFCMShPEGqwqwQX: {
		kind: "stage",
		name: "NameGeneratorQuickAdd",
		next: "qQJ2J8fqGKJmRJhP",
	},
	qQJ2J8fqGKJmRJhP: {
		kind: "branch",
		name: "Branch Point",
		next: ["hqJGqBNRBnaCPpBs", "TzqG5NiNKCGpGMmW"],
	},
	hqJGqBNRBnaCPpBs: {
		kind: "stage",
		name: "Sociogram",
		next: "XDCcKJrQKqrLcKQr",
	},
	XDCcKJrQKqrLcKQr: {
		kind: "stage",
		name: "OrdinalBin",
		next: "zjGiRNJ38aLTNhBP",
	},
	TzqG5NiNKCGpGMmW: {
		kind: "stage",
		name: "CategoricalBin",
		next: "zjGiRNJ38aLTNhBP",
	},
	zjGiRNJ38aLTNhBP: {
		kind: "branch",
		name: "Convergence",
		next: ["aDcKqTqJGJ5hJpNJ"],
	},
	aDcKqTqJGJ5hJpNJ: {
		kind: "stage",
		name: "AlterForm",
		next: "bGjKJhGqKPqJQCqp",
	},
	bGjKJhGqKPqJQCqp: {
		kind: "stage",
		name: "DyadCensus",
		next: "cNJKGqJhJhqJrQqr",
	},
	cNJKGqJhJhqJrQqr: {
		kind: "stage",
		name: "Narrative",
		// No next - this is the end
	},
};

// Position type for layout
type Position = { x: number; y: number };

// Layout algorithm
function calculateLayout(line: Line): Record<string, Position> {
	const positions: Record<string, Position> = {};
	const nodeDepths: Record<string, number> = {};
	const nodeColumns: Record<string, number> = {};

	// Find root nodes (start points)
	const rootNodeIds = Object.entries(line)
		.filter(([_, node]) => node.root)
		.map(([id]) => id);

	// Calculate depth
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

	// Find convergence nodes
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

	// Assign columns
	const assignColumns = (nodeId: string, preferredColumn: number, visited: Set<string> = new Set()): void => {
		if (visited.has(nodeId)) return;
		visited.add(nodeId);

		const node = line[nodeId];
		if (!node) return;

		if (convergenceNodes.has(nodeId)) {
			nodeColumns[nodeId] = 0;
		} else if (nodeColumns[nodeId] === undefined) {
			nodeColumns[nodeId] = preferredColumn;
		}

		if ("next" in node && node.next) {
			if (node.kind === "stage" && node.next) {
				assignColumns(node.next, nodeColumns[nodeId], visited);
			} else if (node.kind === "branch" && node.next) {
				const parentCol = nodeColumns[nodeId];
				for (const [index, nextId] of node.next.entries()) {
					const offset = (index - (node.next.length - 1) / 2) * 2;
					assignColumns(nextId, parentCol + offset, visited);
				}
			}
		}
	};

	for (const [index, nodeId] of rootNodeIds.entries()) {
		assignColumns(nodeId, index * 2);
	}

	// Normalize columns
	const minColumn = Math.min(...Object.values(nodeColumns));
	for (const nodeId of Object.keys(nodeColumns)) {
		const currentColumn = nodeColumns[nodeId];
		if (currentColumn !== undefined) {
			nodeColumns[nodeId] = currentColumn - minColumn;
		}
	}

	// Convert to positions
	const verticalSpacing = 80;
	const horizontalSpacing = 100;
	const baseX = 200;
	const baseY = 50;

	for (const [nodeId, depth] of Object.entries(nodeDepths)) {
		positions[nodeId] = {
			x: baseX + (nodeColumns[nodeId] || 0) * horizontalSpacing,
			y: baseY + depth * verticalSpacing,
		};
	}

	return positions;
}

// Helper to get connections
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

// Helper to check if node is terminal
function isTerminal(node: Node): "start" | "end" | null {
	if (node.root) return "start";
	if (!node.next || (node.kind === "branch" && node.next.length === 0)) return "end";
	return null;
}

const ExperimentalTimeline: React.FC = () => {
	const line = completeLine;
	const positions = calculateLayout(line);
	const connections = getConnections(line);

	// Calculate SVG bounds
	const padding = 50;
	const allPositions = Object.values(positions);
	const minX = Math.min(...allPositions.map((p) => p.x)) - padding;
	const maxX = Math.max(...allPositions.map((p) => p.x)) + padding;
	const minY = Math.min(...allPositions.map((p) => p.y)) - padding;
	const maxY = Math.max(...allPositions.map((p) => p.y)) + padding;

	const width = maxX - minX + 200;
	const height = maxY - minY;

	return (
		<div className="w-full h-screen flex flex-col items-center justify-center">
			<svg
				width={Math.min(width, 800)}
				height={Math.min(height, 600)}
				viewBox={`${minX} ${minY} ${width} ${height}`}
				className="bg-white rounded-lg shadow-lg"
				aria-label="Experimental Timeline Visualization"
			>
				<title>Experimental Timeline Visualization</title>
				{/* Render connections */}
				{connections.map(({ from, to }) => {
					const fromPos = positions[from];
					const toPos = positions[to];

					if (!fromPos || !toPos) return null;

					return (
						<line
							key={`${from}-${to}`}
							x1={fromPos.x}
							y1={fromPos.y}
							x2={toPos.x}
							y2={toPos.y}
							stroke="#0098D8"
							strokeWidth="8"
							strokeLinecap="round"
						/>
					);
				})}

				{/* Render nodes */}
				{Object.entries(line).map(([nodeId, node]) => {
					const pos = positions[nodeId];
					if (!pos) return null;

					const terminalType = isTerminal(node);
					const isStage = node.kind === "stage";

					return (
						<g key={nodeId}>
							{/* Node shape */}
							{isStage ? (
								<>
									<circle
										cx={pos.x}
										cy={pos.y}
										r={terminalType ? 12 : 10}
										fill="white"
										stroke="#0098D8"
										strokeWidth={terminalType ? 4 : 3}
									/>
									{terminalType && <circle cx={pos.x} cy={pos.y} r={6} fill="#0098D8" />}
								</>
							) : (
								<rect
									x={pos.x - 8}
									y={pos.y - 8}
									width={16}
									height={16}
									fill="white"
									stroke="#0098D8"
									strokeWidth="3"
									transform={`rotate(45 ${pos.x} ${pos.y})`}
								/>
							)}

							{/* Labels */}
							<text x={pos.x + 20} y={pos.y + 5} fill="black" fontSize="14" fontFamily="Arial, sans-serif">
								{node.name}
							</text>

							{/* Terminal labels */}
							{terminalType && (
								<text
									x={pos.x + 20}
									y={pos.y - 10}
									fill="#0098D8"
									fontSize="12"
									fontWeight="bold"
									fontFamily="Arial, sans-serif"
								>
									{terminalType.toUpperCase()}
								</text>
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
};

export default ExperimentalTimeline;
