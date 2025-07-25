import { useCallback, useMemo, useState } from "react";
import type { Timeline, Entity } from "~/schemas/timeline";
import { getConnections } from "~/utils/timelineValidation";

// Layout configuration constants
const LAYOUT_CONFIG = {
	nodeWidth: 200,
	nodeHeight: 140,
	horizontalSpacing: 80,
	verticalSpacing: 100,
	collectionVerticalSpacing: 150, // Extra spacing around collections
	minZoom: 0.5,
	maxZoom: 2,
	zoomStep: 0.1,
	// Collection styling
	collectionPadding: 30,
	collectionBorderRadius: 8,
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

// Tree node structure for layout calculation
type TreeNode = {
	id: string;
	entity: Entity;
	children: TreeNode[];
	parent: TreeNode | null;
	depth: number;
	subtreeWidth: number;
	position: LayoutPosition;
	collectionId?: string; // Track which collection this entity belongs to
};

// Build tree structure from timeline data
function buildTree(timeline: Timeline): TreeNode | null {
	const nodeMap = new Map<string, TreeNode>();
	let rootNode: TreeNode | null = null;

	// Create tree nodes for all entities (including Collections)
	for (const entity of timeline.entities) {
		const treeNode: TreeNode = {
			id: entity.id,
			entity,
			children: [],
			parent: null,
			depth: 0,
			subtreeWidth: LAYOUT_CONFIG.nodeWidth,
			position: { x: 0, y: 0, width: LAYOUT_CONFIG.nodeWidth, height: LAYOUT_CONFIG.nodeHeight },
		};

		nodeMap.set(entity.id, treeNode);

		if (entity.type === "Start") {
			rootNode = treeNode;
		}
	}

	if (!rootNode) return null;

	// Build parent-child relationships based on connections
	// Handle multiple parents by prioritizing the first connection found
	const connections = getConnections(timeline);
	const processedChildren = new Set<string>();

	for (const connection of connections) {
		const parentNode = nodeMap.get(connection.from);
		const childNode = nodeMap.get(connection.to);

		if (parentNode && childNode) {
			// Only set parent-child relationship if the child doesn't already have a parent
			if (!processedChildren.has(childNode.id)) {
				parentNode.children.push(childNode);
				childNode.parent = parentNode;
				processedChildren.add(childNode.id);
			}
			// If child already has a parent, we could store this as a cross-reference
			// but for layout purposes, we'll ignore additional incoming connections
		}
	}

	// Calculate depths
	function calculateDepths(node: TreeNode, depth: number) {
		node.depth = depth;
		for (const child of node.children) {
			calculateDepths(child, depth + 1);
		}
	}
	calculateDepths(rootNode, 0);

	return rootNode;
}

// Calculate subtree widths (bottom-up) - accounts for collection containers
function calculateSubtreeWidths(node: TreeNode, collectionBounds?: Map<string, LayoutPosition>): number {
	if (node.children.length === 0) {
		// Check if this is a collection entity
		if (node.entity.type === "Collection" && collectionBounds?.has(node.id)) {
			const bounds = collectionBounds.get(node.id)!;
			node.subtreeWidth = bounds.width;
		} else {
			node.subtreeWidth = LAYOUT_CONFIG.nodeWidth;
		}
		return node.subtreeWidth;
	}

	let totalChildrenWidth = 0;
	for (let i = 0; i < node.children.length; i++) {
		const childWidth = calculateSubtreeWidths(node.children[i], collectionBounds);
		totalChildrenWidth += childWidth;
		if (i > 0) {
			totalChildrenWidth += LAYOUT_CONFIG.horizontalSpacing;
		}
	}

	// Check if this is a collection entity
	if (node.entity.type === "Collection" && collectionBounds?.has(node.id)) {
		const bounds = collectionBounds.get(node.id)!;
		node.subtreeWidth = Math.max(bounds.width, totalChildrenWidth);
	} else {
		node.subtreeWidth = Math.max(LAYOUT_CONFIG.nodeWidth, totalChildrenWidth);
	}
	return node.subtreeWidth;
}

// Calculate positions for all nodes (top-down) - accounts for collection containers
function calculatePositions(
	node: TreeNode,
	startX: number,
	startY: number,
	collectionBounds?: Map<string, LayoutPosition>,
) {
	// Position this node - use collection bounds if available
	if (node.entity.type === "Collection" && collectionBounds?.has(node.id)) {
		const bounds = collectionBounds.get(node.id)!;
		node.position = {
			x: startX + (node.subtreeWidth - bounds.width) / 2,
			y: startY,
			width: bounds.width,
			height: bounds.height,
		};
	} else {
		node.position = {
			x: startX + (node.subtreeWidth - LAYOUT_CONFIG.nodeWidth) / 2,
			y: startY,
			width: LAYOUT_CONFIG.nodeWidth,
			height: LAYOUT_CONFIG.nodeHeight,
		};
	}

	// Position children
	if (node.children.length > 0) {
		// Use extra spacing for collections
		const spacing =
			node.entity.type === "Collection" || node.children.some((child) => child.entity.type === "Collection")
				? LAYOUT_CONFIG.collectionVerticalSpacing
				: LAYOUT_CONFIG.verticalSpacing;
		const childY = startY + node.position.height + spacing;
		let currentX = startX;

		for (const child of node.children) {
			calculatePositions(child, currentX, childY, collectionBounds);
			currentX += child.subtreeWidth + LAYOUT_CONFIG.horizontalSpacing;
		}
	}
}

// Calculate collection bounds - Collections now render as containers
function calculateCollectionBounds(timeline: Timeline, tree: TreeNode): Map<string, LayoutPosition> {
	const collectionBounds = new Map<string, LayoutPosition>();

	// Find all collection entities and calculate their container bounds
	for (const entity of timeline.entities) {
		if (entity.type === "Collection") {
			// For each collection, we need to calculate layout for its internal timeline
			// and then determine the container bounds
			const internalLayout = buildTreeForTimeline(entity.timeline);
			if (internalLayout) {
				calculateSubtreeWidths(internalLayout);
				calculatePositions(internalLayout, 0, 0);

				const internalBounds = getLayoutBounds(internalLayout);
				const padding = LAYOUT_CONFIG.collectionPadding;

				// Collection bounds include padding and header space
				collectionBounds.set(entity.id, {
					x: 0, // Will be positioned later
					y: 0, // Will be positioned later
					width: internalBounds.width + padding * 2,
					height: internalBounds.height + padding * 2 + 40, // Extra for header
				});
			}
		}
	}

	return collectionBounds;
}

// Helper function to build tree for any timeline
function buildTreeForTimeline(timeline: Timeline): TreeNode | null {
	const nodeMap = new Map<string, TreeNode>();
	let rootNode: TreeNode | null = null;

	// Create tree nodes for all entities
	for (const entity of timeline.entities) {
		const treeNode: TreeNode = {
			id: entity.id,
			entity,
			children: [],
			parent: null,
			depth: 0,
			subtreeWidth: LAYOUT_CONFIG.nodeWidth,
			position: { x: 0, y: 0, width: LAYOUT_CONFIG.nodeWidth, height: LAYOUT_CONFIG.nodeHeight },
		};

		nodeMap.set(entity.id, treeNode);

		if (entity.type === "Start") {
			rootNode = treeNode;
		}
	}

	if (!rootNode) return null;

	// Build parent-child relationships
	const connections = getConnections(timeline);
	const processedChildren = new Set<string>();

	for (const connection of connections) {
		const parentNode = nodeMap.get(connection.from);
		const childNode = nodeMap.get(connection.to);

		if (parentNode && childNode) {
			if (!processedChildren.has(childNode.id)) {
				parentNode.children.push(childNode);
				childNode.parent = parentNode;
				processedChildren.add(childNode.id);
			}
		}
	}

	// Calculate depths
	function calculateDepths(node: TreeNode, depth: number) {
		node.depth = depth;
		for (const child of node.children) {
			calculateDepths(child, depth + 1);
		}
	}
	calculateDepths(rootNode, 0);

	return rootNode;
}

// Center finish nodes horizontally
function centerFinishNodes(root: TreeNode, timeline: Timeline) {
	const bounds = getLayoutBounds(root);
	const layoutCenterX = bounds.minX + bounds.width / 2;

	// Find all finish nodes
	const finishNodes = timeline.entities.filter((entity) => entity.type === "Finish");

	// Center each finish node
	function findAndCenterNode(node: TreeNode) {
		if (finishNodes.some((finish) => finish.id === node.id)) {
			node.position.x = layoutCenterX - LAYOUT_CONFIG.nodeWidth / 2;

			// Position below all other nodes
			let maxY = 0;
			function findMaxY(n: TreeNode) {
				maxY = Math.max(maxY, n.position.y + n.position.height);
				for (const child of n.children) {
					findMaxY(child);
				}
			}
			findMaxY(root);

			if (maxY > node.position.y) {
				node.position.y = maxY + LAYOUT_CONFIG.verticalSpacing;
			}
		}

		for (const child of node.children) {
			findAndCenterNode(child);
		}
	}

	findAndCenterNode(root);
}

// Get layout bounds
function getLayoutBounds(root: TreeNode): { width: number; height: number; minX: number; minY: number } {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	function traverse(node: TreeNode) {
		minX = Math.min(minX, node.position.x);
		minY = Math.min(minY, node.position.y);
		maxX = Math.max(maxX, node.position.x + node.position.width);
		maxY = Math.max(maxY, node.position.y + node.position.height);

		for (const child of node.children) {
			traverse(child);
		}
	}
	traverse(root);

	return {
		width: maxX - minX,
		height: maxY - minY,
		minX,
		minY,
	};
}

export function useTimelineLayout(timeline: Timeline) {
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });

	// Calculate layout
	const layout = useMemo(() => {
		const tree = buildTree(timeline);
		if (!tree) return null;

		// Calculate collection bounds first
		const collectionBounds = calculateCollectionBounds(timeline, tree);

		// Calculate subtree widths with collection bounds
		calculateSubtreeWidths(tree, collectionBounds);

		// Calculate initial positions with collection bounds
		calculatePositions(tree, 0, 0, collectionBounds);

		// Center end stages
		centerFinishNodes(tree, timeline);

		// Get layout bounds
		const bounds = getLayoutBounds(tree);

		// Create position map
		const positions = new Map<string, LayoutPosition>();
		function collectPositions(node: TreeNode) {
			positions.set(node.id, node.position);
			for (const child of node.children) {
				collectPositions(child);
			}
		}
		collectPositions(tree);

		return {
			tree,
			positions,
			bounds,
			collectionBounds,
			config: LAYOUT_CONFIG,
		};
	}, [timeline]);

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
