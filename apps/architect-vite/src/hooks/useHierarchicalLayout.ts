import { useCallback, useMemo, useState } from "react";
import type { Line, Node } from "~/utils/lineValidation";

// Layout configuration constants
const LAYOUT_CONFIG = {
	nodeWidth: 180,
	nodeHeight: 120,
	horizontalSpacing: 60,
	verticalSpacing: 80,
	minZoom: 0.1,
	maxZoom: 3,
	zoomStep: 0.1,
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
	node: Node;
	children: TreeNode[];
	parent: TreeNode | null;
	depth: number;
	subtreeWidth: number;
	position: LayoutPosition;
};

// Build tree structure from line data
function buildTree(line: Line): TreeNode | null {
	const nodeMap = new Map<string, TreeNode>();
	let rootNode: TreeNode | null = null;

	// Create tree nodes
	for (const [nodeId, node] of Object.entries(line)) {
		const treeNode: TreeNode = {
			id: nodeId,
			node,
			children: [],
			parent: null,
			depth: 0,
			subtreeWidth: LAYOUT_CONFIG.nodeWidth,
			position: { x: 0, y: 0, width: LAYOUT_CONFIG.nodeWidth, height: LAYOUT_CONFIG.nodeHeight },
		};
		nodeMap.set(nodeId, treeNode);

		if (node.root) {
			rootNode = treeNode;
		}
	}

	if (!rootNode) return null;

	// Build parent-child relationships
	for (const [nodeId, node] of Object.entries(line)) {
		const treeNode = nodeMap.get(nodeId);
		if (!treeNode) continue;

		if ("next" in node && node.next) {
			if (node.kind === "stage" && node.next) {
				const child = nodeMap.get(node.next);
				if (child) {
					treeNode.children.push(child);
					child.parent = treeNode;
				}
			} else if (node.kind === "branch" && node.next) {
				for (const nextId of node.next) {
					const child = nodeMap.get(nextId);
					if (child) {
						treeNode.children.push(child);
						child.parent = treeNode;
					}
				}
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

// Calculate subtree widths (bottom-up)
function calculateSubtreeWidths(node: TreeNode): number {
	if (node.children.length === 0) {
		node.subtreeWidth = LAYOUT_CONFIG.nodeWidth;
		return node.subtreeWidth;
	}

	let totalChildrenWidth = 0;
	for (let i = 0; i < node.children.length; i++) {
		const childWidth = calculateSubtreeWidths(node.children[i]);
		totalChildrenWidth += childWidth;
		if (i > 0) {
			totalChildrenWidth += LAYOUT_CONFIG.horizontalSpacing;
		}
	}

	node.subtreeWidth = Math.max(LAYOUT_CONFIG.nodeWidth, totalChildrenWidth);
	return node.subtreeWidth;
}

// Calculate positions for all nodes (top-down)
function calculatePositions(node: TreeNode, startX: number, startY: number) {
	// Position this node
	node.position = {
		x: startX + (node.subtreeWidth - LAYOUT_CONFIG.nodeWidth) / 2,
		y: startY,
		width: LAYOUT_CONFIG.nodeWidth,
		height: LAYOUT_CONFIG.nodeHeight,
	};

	// Position children
	if (node.children.length > 0) {
		const childY = startY + LAYOUT_CONFIG.nodeHeight + LAYOUT_CONFIG.verticalSpacing;
		let currentX = startX;

		for (const child of node.children) {
			calculatePositions(child, currentX, childY);
			currentX += child.subtreeWidth + LAYOUT_CONFIG.horizontalSpacing;
		}
	}
}

// Adjust vertical positions based on sibling heights
function adjustVerticalSpacing(root: TreeNode) {
	// Find all branch points (nodes with multiple children)
	const branchPoints: TreeNode[] = [];

	function findBranchPoints(node: TreeNode) {
		if (node.children.length > 1) {
			branchPoints.push(node);
		}
		for (const child of node.children) {
			findBranchPoints(child);
		}
	}
	findBranchPoints(root);

	console.log(
		`Found ${branchPoints.length} branch points:`,
		branchPoints.map((bp) => bp.node.name),
	);

	// Process each branch point
	for (const branchPoint of branchPoints) {
		const siblings = branchPoint.children;

		// Sort siblings by horizontal position
		siblings.sort((a, b) => a.position.x - b.position.x);

		// Find the sibling with the longest linear chain
		let maxDepth = 0;
		let referenceBranchIndex = 0;

		for (let i = 0; i < siblings.length; i++) {
			const depth = getLinearChainLength(siblings[i]);
			if (depth > maxDepth) {
				maxDepth = depth;
				referenceBranchIndex = i;
			}
		}

		const referenceBranch = siblings[referenceBranchIndex];

		// Collect all nodes in the reference branch with their depths
		const referenceNodes = new Map<number, TreeNode>();

		function collectReferenceNodes(node: TreeNode) {
			const relativeDepth = node.depth - referenceBranch.depth;
			referenceNodes.set(relativeDepth, node);

			// For linear branches, follow the first child
			// But stop at convergence points (nodes that have multiple parents)
			if (node.children.length === 1) {
				const child = node.children[0];
				// Check if this child is a convergence point (like FinishStage)
				// by seeing if it has a special name or if multiple nodes point to it
				if (child.node.name !== "FinishStage") {
					collectReferenceNodes(child);
				}
			}
		}
		collectReferenceNodes(referenceBranch);

		// Debug: log reference branch info
		console.log(`Reference branch selected: ${referenceBranch.node.name}`, {
			branchIndex: referenceBranchIndex,
			nodeCount: referenceNodes.size,
			nodes: Array.from(referenceNodes.values()).map((n) => n.node.name),
		});

		// Now align all other sibling branches based on the reference branch
		for (let i = 0; i < siblings.length; i++) {
			if (i === referenceBranchIndex) {
				console.log(`Skipping reference branch at index ${i}`);
				continue;
			}

			const sibling = siblings[i];
			console.log(`Processing sibling ${i}: ${sibling.node.name}`);

			// Collect nodes in this sibling branch
			const siblingNodes: Array<{ node: TreeNode; relativeDepth: number }> = [];

			function collectSiblingNodes(node: TreeNode, baseDepth: number) {
				const relativeDepth = node.depth - baseDepth;
				siblingNodes.push({ node, relativeDepth });

				// Don't collect convergence points like FinishStage
				for (const child of node.children) {
					if (child.node.name !== "FinishStage") {
						collectSiblingNodes(child, baseDepth);
					}
				}
			}
			collectSiblingNodes(sibling, sibling.depth);

			console.log(`Sibling ${sibling.node.name} has ${siblingNodes.length} nodes`);

			// For single-node branches, align with the middle node of the reference branch
			if (siblingNodes.length === 1) {
				// Find the middle depth of the reference branch
				const refDepths = Array.from(referenceNodes.keys()).sort((a, b) => a - b);
				const middleDepthIndex = Math.floor(refDepths.length / 2);
				const middleDepth = refDepths[middleDepthIndex];
				const referenceNode = referenceNodes.get(middleDepth);

				console.log(`Aligning ${sibling.node.name}:`, {
					refDepths,
					middleDepthIndex,
					middleDepth,
					referenceNode: referenceNode?.node.name,
					targetY: referenceNode?.position.y,
					currentY: sibling.position.y,
				});

				if (referenceNode) {
					const targetY = referenceNode.position.y;
					const deltaY = targetY - sibling.position.y;
					adjustSubtreeVerticalPosition(sibling, deltaY);
				}
			} else {
				// For multi-node branches, distribute them between the top and bottom of the reference branch
				const refDepths = Array.from(referenceNodes.keys()).sort((a, b) => a - b);
				const topRefNode = referenceNodes.get(refDepths[0]);
				const bottomRefNode = referenceNodes.get(refDepths[refDepths.length - 1]);

				if (topRefNode && bottomRefNode) {
					const topY = topRefNode.position.y;
					const bottomY = bottomRefNode.position.y + bottomRefNode.position.height;
					const availableHeight = bottomY - topY;

					// Sort sibling nodes by their relative depth
					siblingNodes.sort((a, b) => a.relativeDepth - b.relativeDepth);

					// Calculate total height needed for this branch
					const nodeHeights = siblingNodes.map((sn) => sn.node.position.height);
					const totalNodeHeight = nodeHeights.reduce((sum, h) => sum + h, 0);

					// Calculate spacing
					const totalSpacing = availableHeight - totalNodeHeight;
					const spacingBetween = siblingNodes.length > 1 ? totalSpacing / (siblingNodes.length - 1) : 0;

					// Position each node in the sibling branch
					let currentY = topY;
					for (const siblingNode of siblingNodes) {
						const targetY = currentY;
						const deltaY = targetY - siblingNode.node.position.y;

						if (Math.abs(deltaY) > 0.1) {
							// Adjust only this node, not its subtree
							siblingNode.node.position.y += deltaY;
						}

						currentY += siblingNode.node.position.height + spacingBetween;
					}
				}
			}
		}
	}
}

// Get layout bounds
// Helper function to get the bottom Y coordinate of a subtree
// Helper function to get the height of a subtree
// Helper function to get all nodes in the tree as entries
// Helper function to count nodes in a subtree
// Helper function to get the length of the longest linear chain in a subtree
function getLinearChainLength(node: TreeNode): number {
	let maxLength = 1; // Count this node

	// For each child, find the longest chain
	for (const child of node.children) {
		const childChainLength = getLinearChainLength(child);
		maxLength = Math.max(maxLength, 1 + childChainLength);
	}

	return maxLength;
}

function countNodesInSubtree(node: TreeNode): number {
	let count = 1; // Count this node

	for (const child of node.children) {
		count += countNodesInSubtree(child);
	}

	return count;
}

function getAllNodes(root: TreeNode): Array<[string, TreeNode]> {
	const nodes: Array<[string, TreeNode]> = [];

	function traverse(node: TreeNode) {
		nodes.push([node.id, node]);
		for (const child of node.children) {
			traverse(child);
		}
	}

	traverse(root);
	return nodes;
}

// Helper function to get the maximum depth in a subtree
function getMaxDepthInSubtree(node: TreeNode): number {
	let maxDepth = node.depth;

	function traverse(n: TreeNode) {
		maxDepth = Math.max(maxDepth, n.depth);
		for (const child of n.children) {
			traverse(child);
		}
	}

	for (const child of node.children) {
		traverse(child);
	}

	return maxDepth - node.depth; // Return relative depth
}

function getSubtreeHeight(node: TreeNode): number {
	const subtreeBottom = getSubtreeBottom(node);
	return subtreeBottom - node.position.y;
}

function getSubtreeBottom(node: TreeNode): number {
	let maxY = node.position.y + node.position.height;

	function traverse(n: TreeNode) {
		const nodeBottom = n.position.y + n.position.height;
		maxY = Math.max(maxY, nodeBottom);

		for (const child of n.children) {
			traverse(child);
		}
	}

	for (const child of node.children) {
		traverse(child);
	}

	return maxY;
}

// Helper function to adjust the vertical position of an entire subtree
function adjustSubtreeVerticalPosition(node: TreeNode, deltaY: number) {
	node.position.y += deltaY;

	for (const child of node.children) {
		adjustSubtreeVerticalPosition(child, deltaY);
	}
}

// Helper function to center terminal nodes (like FinishStage) horizontally
function centerTerminalNodes(root: TreeNode) {
	const bounds = getLayoutBounds(root);
	const layoutCenterX = bounds.minX + bounds.width / 2;

	// First, find all convergence points and their parent nodes
	const convergencePoints = new Map<TreeNode, TreeNode[]>();

	function findConvergencePoints(node: TreeNode, visited = new Set<string>()) {
		if (visited.has(node.id)) return;
		visited.add(node.id);

		for (const child of node.children) {
			if (!convergencePoints.has(child)) {
				convergencePoints.set(child, []);
			}
			convergencePoints.get(child)!.push(node);
			findConvergencePoints(child, visited);
		}
	}

	findConvergencePoints(root);

	// Process convergence points (nodes with multiple parents or named "FinishStage")
	for (const [node, parents] of convergencePoints) {
		if (node.children.length === 0 && (parents.length > 1 || node.node.name === "FinishStage")) {
			// This is a convergence point

			// Center horizontally
			node.position.x = layoutCenterX - LAYOUT_CONFIG.nodeWidth / 2;

			// Adjust vertical position to be one row below the bottommost parent
			let maxParentBottom = 0;

			// Find all nodes that connect to this convergence point
			function findConnectingNodes(
				searchNode: TreeNode,
				targetNode: TreeNode,
				connectingNodes: TreeNode[] = [],
			): TreeNode[] {
				if (searchNode.children.includes(targetNode)) {
					connectingNodes.push(searchNode);
				}

				for (const child of searchNode.children) {
					findConnectingNodes(child, targetNode, connectingNodes);
				}

				return connectingNodes;
			}

			const connectingNodes = findConnectingNodes(root, node);

			// Find the bottommost connecting node
			for (const connectingNode of connectingNodes) {
				const nodeBottom = connectingNode.position.y + connectingNode.position.height;
				maxParentBottom = Math.max(maxParentBottom, nodeBottom);
			}

			// Position the convergence point one row below the bottommost parent
			if (maxParentBottom > 0) {
				node.position.y = maxParentBottom + LAYOUT_CONFIG.verticalSpacing;
			}
		}
	}
}

// Helper function to check if a node is a convergence point (multiple paths lead to it)
function isNodeConvergencePoint(targetNode: TreeNode, root: TreeNode): boolean {
	let referenceCount = 0;

	function countReferences(node: TreeNode) {
		for (const child of node.children) {
			if (child === targetNode) {
				referenceCount++;
			}
			countReferences(child);
		}
	}

	countReferences(root);

	// Also check if the target node's name is "FinishStage" as a special case
	return referenceCount > 1 || targetNode.node.name === "FinishStage";
}

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

export function useHierarchicalLayout(line: Line) {
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });

	// Calculate layout
	const layout = useMemo(() => {
		const tree = buildTree(line);
		if (!tree) return null;

		// Calculate subtree widths
		calculateSubtreeWidths(tree);

		// Calculate initial positions
		calculatePositions(tree, 0, 0);

		// Adjust vertical spacing based on sibling relationships
		adjustVerticalSpacing(tree);

		// Center terminal nodes (like FinishStage) horizontally
		centerTerminalNodes(tree);

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
		};
	}, [line]);

	// Zoom handlers
	const handleZoom = useCallback((delta: number, centerX: number, centerY: number) => {
		setZoom((prevZoom) => {
			const newZoom = Math.max(LAYOUT_CONFIG.minZoom, Math.min(LAYOUT_CONFIG.maxZoom, prevZoom + delta));

			// Adjust pan to zoom towards the center point
			if (newZoom !== prevZoom) {
				setPan((prevPan) => ({
					x: prevPan.x - centerX * (newZoom - prevZoom),
					y: prevPan.y - centerY * (newZoom - prevZoom),
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
