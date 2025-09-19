import { useCallback, useMemo, useState } from "react";
import type { Line, Node } from "~/utils/lineValidation";

// Layout configuration constants
const LAYOUT_CONFIG = {
	nodeWidth: 260,
	nodeHeight: 220,
	horizontalSpacing: 60,
	verticalSpacing: 80,
	minZoom: 0.5,
	maxZoom: 2,
	zoomStep: 0.1,
	// Centralized zoom sensitivity configuration
	zoomSensitivity: {
		// Base scale factor that affects all zoom methods equally
		baseScaleFactor: 0.02,
		// Multipliers for different input methods (relative to baseScaleFactor)
		mouseWheel: 0.5, // Reduced mouse wheel sensitivity
		trackpadPinch: 2.0, // Further reduced trackpad sensitivity for macOS pinch
		pointerPinch: 0.5, // Pointer pinch uses distance ratios, so smaller multiplier
		keyboard: 2.5, // Slightly increased keyboard steps for better control
	},
} as const;

// Position type for layout
export type LayoutPosition = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type GraphNode = {
	id: string;
	node: Node;
	children: GraphNode[];
	parents: GraphNode[];
	level: number;
	column: number;
	width: number;
};

function buildGraph(line: Line): {
	nodes: Map<string, GraphNode>;
	rootId: string | null;
	finishId: string | null;
	levels: Map<number, string[]>;
} {
	const nodes = new Map<string, GraphNode>();
	let rootId: string | null = null;
	let finishId: string | null = null;

	// First pass: create all nodes
	for (const [id, nodeData] of Object.entries(line)) {
		nodes.set(id, {
			id,
			node: nodeData,
			children: [],
			parents: [],
			level: -1,
			column: -1,
			width: 1,
		});
		if (nodeData.root) {
			rootId = id;
		}
		if (!("next" in nodeData) || !nodeData.next || (Array.isArray(nodeData.next) && nodeData.next.length === 0)) {
			finishId = id;
		}
	}

	// Second pass: build connections
	for (const [id, nodeData] of Object.entries(line)) {
		const graphNode = nodes.get(id);
		if (graphNode && "next" in nodeData && nodeData.next) {
			const nextIds = Array.isArray(nodeData.next) ? nodeData.next : [nodeData.next];
			for (const nextId of nextIds) {
				const childNode = nodes.get(nextId);
				if (childNode) {
					graphNode.children.push(childNode);
					childNode.parents.push(graphNode);
				}
			}
		}
	}

	// Third pass: calculate levels (topological sort)
	const levels = new Map<number, string[]>();
	if (rootId) {
		const rootNode = nodes.get(rootId);
		if (rootNode) {
			rootNode.level = 0;
			const queue: string[] = [rootId];
			const visited = new Set<string>();

			while (queue.length > 0) {
				const nodeId = queue.shift();
				if (!nodeId || visited.has(nodeId)) continue;
				visited.add(nodeId);

				const node = nodes.get(nodeId);
				if (node) {
					if (!levels.has(node.level)) {
						levels.set(node.level, []);
					}
					const level = levels.get(node.level);
					if (level) {
						level.push(nodeId);
					}

					for (const child of node.children) {
						child.level = Math.max(child.level, node.level + 1);
						queue.push(child.id);
					}
				}
			}
		}
	}

	return { nodes, rootId, finishId, levels };
}

function calculateLayout(graph: {
	nodes: Map<string, GraphNode>;
	rootId: string | null;
	finishId: string | null;
	levels: Map<number, string[]>;
}): Map<string, LayoutPosition> {
	const { nodes, rootId, finishId, levels } = graph;
	const positions = new Map<string, LayoutPosition>();
	if (!rootId) return positions;

	// 1. Find all paths from root to leaf nodes. These paths represent the initial columns.
	const paths: string[][] = [];
	function findPaths(nodeId: string, currentPath: string[]) {
		const newPath = [...currentPath, nodeId];
		const node = nodes.get(nodeId);
		if (!node) return;

		if (node.children.length === 0) {
			paths.push(newPath);
			return;
		}

		for (const child of node.children) {
			findPaths(child.id, newPath);
		}
	}
	findPaths(rootId, []);

	// 2. Ensure there is an odd number of columns for centering.
	let numColumns = paths.length;
	let middleColumnOffset = 0;
	if (numColumns % 2 === 0) {
		numColumns += 1;
		middleColumnOffset = 0.5; // Shift paths to center them in an odd-column grid
	}

	// 3. Assign each node to its columns.
	const nodeToColumns = new Map<string, number[]>();
	for (let i = 0; i < paths.length; i++) {
		const path = paths[i];
		if (!path) continue;
		for (const nodeId of path) {
			if (!nodeToColumns.has(nodeId)) {
				nodeToColumns.set(nodeId, []);
			}
			nodeToColumns.get(nodeId)?.push(i);
		}
	}

	const columnWidth = LAYOUT_CONFIG.nodeWidth + LAYOUT_CONFIG.horizontalSpacing;
	const rowHeight = LAYOUT_CONFIG.nodeHeight + LAYOUT_CONFIG.verticalSpacing;
	const layoutCenterX = ((numColumns - 1) / 2) * columnWidth;

	// 4. Calculate the final position for each node.
	for (const [nodeId, columnIndexes] of nodeToColumns.entries()) {
		const node = nodes.get(nodeId);
		if (!node) continue;

		// The node's column is the average of the columns it appears in.
		const avgColumn = columnIndexes.reduce((a, b) => a + b, 0) / columnIndexes.length;
		const finalColumn = Math.round(avgColumn + middleColumnOffset);

		const x = finalColumn * columnWidth;
		const y = node.level * rowHeight;

		positions.set(nodeId, {
			x,
			y,
			width: LAYOUT_CONFIG.nodeWidth,
			height: LAYOUT_CONFIG.nodeHeight,
		});
	}

	// 5. Center the root and finish nodes explicitly in the middle column.
	const middleColumnIndex = Math.floor(numColumns / 2);
	if (rootId) {
		const rootPos = positions.get(rootId);
		if (rootPos) {
			rootPos.x = middleColumnIndex * columnWidth;
		}
	}
	if (finishId) {
		const finishPos = positions.get(finishId);
		const finishNode = nodes.get(finishId);
		if (finishPos && finishNode) {
			finishPos.x = middleColumnIndex * columnWidth;
			// Ensure finish node is on its own row at the bottom
			let maxLevel = 0;
			for (const level of levels.keys()) {
				maxLevel = Math.max(maxLevel, level);
			}
			if (finishNode.level <= maxLevel) {
				finishPos.y = (maxLevel + 1) * rowHeight;
			}
		}
	}

	// 6. Center the entire layout horizontally.
	const allX = Array.from(positions.values()).map((p) => p.x);
	const minX = Math.min(...allX);
	const maxX = Math.max(...allX) + LAYOUT_CONFIG.nodeWidth;
	const currentWidth = maxX - minX;
	const shiftX = layoutCenterX - currentWidth / 2;

	for (const pos of positions.values()) {
		pos.x += shiftX;
	}

	return positions;
}

function getLayoutBounds(positions: Map<string, LayoutPosition>): {
	width: number;
	height: number;
	minX: number;
	minY: number;
} {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const pos of positions.values()) {
		minX = Math.min(minX, pos.x);
		minY = Math.min(minY, pos.y);
		maxX = Math.max(maxX, pos.x + pos.width);
		maxY = Math.max(maxY, pos.y + pos.height);
	}

	return {
		width: maxX - minX,
		height: maxY - minY,
		minX,
		minY,
	};
}

export function useHierarchicalLayout(line: Line) {
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });

	// Calculate layout
	const layout = useMemo(() => {
		const graph = buildGraph(line);
		if (!graph.rootId) return null;

		const positions = calculateLayout(graph);
		const bounds = getLayoutBounds(positions);

		return {
			positions,
			bounds,
			config: LAYOUT_CONFIG,
		};
	}, [line]);

	// Zoom handlers
	const handleZoom = useCallback((delta: number, centerX: number, centerY: number) => {
		setZoom((prevZoom) => {
			const newZoom = Math.max(LAYOUT_CONFIG.minZoom, Math.min(LAYOUT_CONFIG.maxZoom, prevZoom + delta));

			// Adjust pan to zoom towards the pointer position
			if (newZoom !== prevZoom) {
				const zoomRatio = newZoom / prevZoom;
				setPan((prevPan) => ({
					x: centerX + (prevPan.x - centerX) * zoomRatio,
					y: centerY + (prevPan.y - centerY) * zoomRatio,
				}));
			}

			return newZoom;
		});
	}, []);

	// Pan handlers
	const handlePan = useCallback((deltaX: number, deltaY: number) => {
		setPan((prevPan) => ({
			x: prevPan.x + deltaX,
			y: prevPan.y + deltaY,
		}));
	}, []);

	// Reset view
	const resetView = useCallback(() => {
		setZoom(1);
		setPan({ x: 0, y: 0 });
	}, []);

	return {
		layout,
		zoom,
		pan,
		handleZoom,
		handlePan,
		resetView,
		config: LAYOUT_CONFIG,
	};
}
