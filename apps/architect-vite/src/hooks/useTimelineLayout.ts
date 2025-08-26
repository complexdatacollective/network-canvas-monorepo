import { useMemo } from "react";
import type { Connection, Entity, Timeline } from "~/utils/timelineValidation";

export interface LayoutNode {
	id: string;
	entity: Entity;
	row: number;
	column: number;
	isInCollection: boolean;
	collectionId?: string;
}

interface CollectionLayout {
	id: string;
	startRow: number;
	endRow: number;
	startColumn: number;
	endColumn: number;
	nodes: LayoutNode[];
}

interface TimelineLayout {
	nodes: LayoutNode[];
	collections: CollectionLayout[];
	connections: Connection[];
	gridColumns: number;
	gridRows: number;
}

export function useTimelineLayout(timeline: Timeline, connections: Connection[]): TimelineLayout {
	return useMemo(() => {
		const layoutNodes: LayoutNode[] = [];
		const collections: CollectionLayout[] = [];
		const nodeMap = new Map<string, Entity>();
		const nodeLayoutMap = new Map<string, LayoutNode>();

		// Build entity map - includes entities in collections
		function addEntitiesToMap(entities: Timeline) {
			for (const entity of entities) {
				nodeMap.set(entity.id, entity);
				if (entity.type === "Collection" && entity.children) {
					addEntitiesToMap(entity.children);
				}
			}
		}
		addEntitiesToMap(timeline);

		// Find start node
		const startNode = timeline.find((e) => e.type === "Start");
		if (!startNode) throw new Error("No start node found");

		// Find finish node
		const finishNode = timeline.find((e) => e.type === "Finish");
		if (!finishNode) throw new Error("No finish node found");

		// Track visited nodes to prevent infinite loops
		const visited = new Set<string>();

		// Track the maximum column needed
		let maxColumn = 0;

		// Recursive function to layout nodes
		function layoutEntity(
			entityId: string,
			row: number,
			column: number,
			isInCollection = false,
			collectionId?: string,
		): { endRow: number; columns: number[] } {
			if (visited.has(entityId)) {
				return { endRow: row, columns: [column] };
			}
			visited.add(entityId);

			const entity = nodeMap.get(entityId);
			if (!entity) throw new Error(`Entity ${entityId} not found`);

			// Create layout node
			const layoutNode: LayoutNode = {
				id: entityId,
				entity,
				row,
				column,
				isInCollection,
				collectionId,
			};
			layoutNodes.push(layoutNode);
			nodeLayoutMap.set(entityId, layoutNode);

			maxColumn = Math.max(maxColumn, column);

			// Handle different entity types
			if (entity.type === "Branch") {
				// Branch nodes split into multiple streams
				const targets = entity.targets;
				const numBranches = targets.length;

				// Calculate starting column for branches to center them
				const branchWidth = numBranches * 2 - 1; // Each branch takes 2 columns except we share the gaps
				const startCol = column - Math.floor(branchWidth / 2);

				let maxEndRow = row + 1;
				const occupiedColumns: number[] = [];

				targets.forEach((targetId, index) => {
					const branchCol = startCol + index * 2;
					const result = layoutEntity(targetId, row + 1, branchCol, isInCollection, collectionId);
					maxEndRow = Math.max(maxEndRow, result.endRow);
					occupiedColumns.push(...result.columns);
				});

				return { endRow: maxEndRow, columns: occupiedColumns };
			}
			if (entity.type === "Collection") {
				// Collections are containers with their own timeline
				const _collectionStartRow = row;
				const collectionLayout: CollectionLayout = {
					id: entity.id,
					startRow: row,
					endRow: row, // Will be updated
					startColumn: column - 1, // Padding for border
					endColumn: column + 1, // Will be updated
					nodes: [],
				};

				// Layout collection's internal timeline
				let collectionRow = row + 1;
				const collectionChildren = entity.children || [];
				// Find the first node in the collection (no longer requires a Start node)
				const collectionFirstNode = collectionChildren[0];

				if (collectionFirstNode) {
					// Build internal connections for collection
					const internalConnections: Connection[] = [];
					for (const colEntity of collectionChildren) {
						if ((colEntity.type === "Stage" || colEntity.type === "Start") && colEntity.target) {
							internalConnections.push({
								from: colEntity.id,
								to: colEntity.target,
								type: colEntity.type === "Start" ? "start" : "stage",
							});
						} else if (colEntity.type === "Branch") {
							for (const targetId of colEntity.targets) {
								internalConnections.push({
									from: colEntity.id,
									to: targetId,
									type: "branch",
								});
							}
						}
					}

					// Layout internal nodes
					const internalResult = layoutEntity(collectionFirstNode.id, collectionRow, column, true, entity.id);

					collectionRow = internalResult.endRow + 1;

					// Update collection bounds
					collectionLayout.endRow = collectionRow;
					const minCol = Math.min(...internalResult.columns) - 1;
					const maxCol = Math.max(...internalResult.columns) + 1;
					collectionLayout.startColumn = minCol;
					collectionLayout.endColumn = maxCol;
				}

				collections.push(collectionLayout);

				// Continue with the collection's target
				if (entity.target) {
					return layoutEntity(entity.target, collectionRow + 1, column, isInCollection, collectionId);
				}

				return { endRow: collectionRow, columns: [column] };
			}
			if (entity.type === "Finish") {
				return { endRow: row, columns: [column] };
			}
			// Stage or Start node - continue in a straight line
			const target = entity.target;
			if (target) {
				// Check if target is already laid out (convergence point)
				const existingLayout = nodeLayoutMap.get(target);
				if (existingLayout) {
					// This is a convergence point - don't re-layout
					return { endRow: existingLayout.row, columns: [column] };
				}

				// Check if multiple nodes point to this target (convergence)
				const incomingConnections = connections.filter((c) => c.to === target);
				if (incomingConnections.length > 1) {
					// This is a convergence point - wait for all parents
					const allParentsVisited = incomingConnections.every((c) => visited.has(c.from));
					if (!allParentsVisited) {
						// Not all parents visited yet, just return current position
						return { endRow: row, columns: [column] };
					}

					// All parents visited - find the lowest row and center column
					let maxRow = row;
					const parentColumns: number[] = [];
					for (const conn of incomingConnections) {
						const parentLayout = nodeLayoutMap.get(conn.from);
						if (parentLayout) {
							maxRow = Math.max(maxRow, parentLayout.row);
							parentColumns.push(parentLayout.column);
						}
					}

					// Center between parent columns
					const minCol = Math.min(...parentColumns);
					const maxCol = Math.max(...parentColumns);
					const centerCol = Math.floor((minCol + maxCol) / 2);

					return layoutEntity(target, maxRow + 1, centerCol, isInCollection, collectionId);
				}

				// Normal flow - continue down
				return layoutEntity(target, row + 1, column, isInCollection, collectionId);
			}

			return { endRow: row, columns: [column] };
		}

		// Start layout from the start node
		// We need to determine the initial column to center the timeline
		// This requires a preliminary pass to understand the width
		// For now, we'll start at a large enough column number and adjust later
		const preliminaryStartCol = 10; // Start with a buffer
		layoutEntity(startNode.id, 0, preliminaryStartCol);

		// Calculate the actual grid dimensions
		const minColumn = Math.min(...layoutNodes.map((n) => n.column));
		const maxColumnUsed = Math.max(...layoutNodes.map((n) => n.column));
		const columnRange = maxColumnUsed - minColumn + 1;

		// Ensure odd number of columns for centering
		const gridColumns = columnRange % 2 === 0 ? columnRange + 1 : columnRange;
		const gridRows = Math.max(...layoutNodes.map((n) => n.row)) + 1;

		// Adjust all columns to start from 0 and center the layout
		const columnOffset = minColumn - Math.floor((gridColumns - columnRange) / 2);
		layoutNodes.forEach((node) => {
			node.column -= columnOffset;
		});

		// Adjust collection bounds
		collections.forEach((collection) => {
			collection.startColumn -= columnOffset;
			collection.endColumn -= columnOffset;
			// Filter nodes that belong to this collection
			collection.nodes = layoutNodes.filter((n) => n.collectionId === collection.id);
		});

		// Ensure start and finish are in the center column
		const centerColumn = Math.floor(gridColumns / 2);
		const startLayout = layoutNodes.find((n) => n.entity.type === "Start");
		const _finishLayout = layoutNodes.find((n) => n.entity.type === "Finish");

		if (startLayout && startLayout.column !== centerColumn) {
			const offset = centerColumn - startLayout.column;
			layoutNodes.forEach((node) => {
				if (!node.isInCollection || node.entity.type === "Start") {
					node.column += offset;
				}
			});
			collections.forEach((collection) => {
				collection.startColumn += offset;
				collection.endColumn += offset;
			});
		}

		return {
			nodes: layoutNodes,
			collections,
			connections,
			gridColumns,
			gridRows,
		};
	}, [timeline, connections]);
}
