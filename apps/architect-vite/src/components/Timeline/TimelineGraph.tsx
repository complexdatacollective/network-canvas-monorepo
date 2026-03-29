import type { BranchEntity, CollectionEntityType, Entity, StageEntity } from "@codaco/protocol-validation";
import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "wouter";
import { timelineSliceActions } from "~/ducks/modules/protocol/timeline";
import { getTimeline } from "~/selectors/timeline";
import BranchNode from "./BranchNode";
import CollectionNode from "./CollectionNode";
import InsertPoint from "./InsertPoint";
import StageNode from "./StageNode";

type TimelineGraphProps = {
	onInsertStage?: (afterIndex: number) => void;
};

function buildEntityIndex(entities: Entity[]): Map<string, Entity> {
	const index = new Map<string, Entity>();
	function walk(list: Entity[]) {
		for (const entity of list) {
			index.set(entity.id, entity);
			if (entity.type === "Collection") {
				walk((entity as CollectionEntityType).children);
			}
		}
	}
	walk(entities);
	return index;
}

function computeInDegree(entities: Entity[], index: Map<string, Entity>): Map<string, number> {
	const inDegree = new Map<string, number>();
	for (const [id] of index) {
		inDegree.set(id, 0);
	}

	function countTargets(list: Entity[]) {
		for (const entity of list) {
			if (entity.type === "Stage" && "target" in entity) {
				const target = (entity as { target?: string }).target;
				if (target) {
					inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
				}
			}
			if (entity.type === "Branch") {
				for (const slot of (entity as BranchEntity).slots) {
					inDegree.set(slot.target, (inDegree.get(slot.target) ?? 0) + 1);
				}
			}
			if (entity.type === "Collection") {
				countTargets((entity as CollectionEntityType).children);
			}
		}
	}
	countTargets(entities);
	return inDegree;
}

function resolveEntity(entityId: string, index: Map<string, Entity>): Entity | undefined {
	return index.get(entityId);
}

type GraphPathSegment =
	| { kind: "stage"; entity: StageEntity }
	| {
			kind: "branch";
			entity: BranchEntity;
			paths: { slotLabel: string; isDefault: boolean; segments: GraphPathSegment[] }[];
	  }
	| { kind: "collection"; entity: CollectionEntityType; innerSegments: GraphPathSegment[] };

function buildRenderTree(
	startId: string,
	index: Map<string, Entity>,
	inDegree: Map<string, number>,
	visited: Set<string>,
): GraphPathSegment[] {
	const segments: GraphPathSegment[] = [];
	let currentId: string | undefined = startId;

	while (currentId) {
		if (visited.has(currentId)) break;

		const entity = resolveEntity(currentId, index);
		if (!entity) break;

		// If this entity is a convergence point and we're not the first visitor, stop
		const deg = inDegree.get(currentId) ?? 0;
		if (deg > 1 && visited.has(`__approached_${currentId}`)) {
			// This is a convergence point all paths have now reached
			visited.delete(`__approached_${currentId}`);
			// Continue rendering from here
		} else if (deg > 1 && !visited.has(currentId)) {
			// First path to reach this convergence point - mark it and stop
			// The parent branch rendering will handle placing it after all columns
			visited.add(`__approached_${currentId}`);
			break;
		}

		visited.add(currentId);

		if (entity.type === "Stage") {
			const stage = entity as StageEntity;
			segments.push({ kind: "stage", entity: stage });
			currentId = "target" in stage ? (stage.target as string | undefined) : undefined;
		} else if (entity.type === "Branch") {
			const branch = entity as BranchEntity;
			visited.add(currentId);

			// Find convergence point: entity targeted by multiple slots' downstream paths
			// Build each slot's path
			const branchPaths = branch.slots.map((slot) => {
				const slotSegments = buildRenderTree(slot.target, index, inDegree, visited);
				return {
					slotLabel: slot.label,
					isDefault: slot.default === true,
					segments: slotSegments,
				};
			});

			segments.push({ kind: "branch", entity: branch, paths: branchPaths });

			// After all branch paths, find the convergence point (if any)
			// Look for an entity that was approached but not fully visited
			let convergenceId: string | undefined;
			for (const key of visited) {
				if (key.startsWith("__approached_")) {
					convergenceId = key.replace("__approached_", "");
					break;
				}
			}

			if (convergenceId) {
				visited.delete(`__approached_${convergenceId}`);
				currentId = convergenceId;
			} else {
				currentId = undefined;
			}
		} else if (entity.type === "Collection") {
			const collection = entity as CollectionEntityType;
			visited.add(currentId);

			const innerSegments: GraphPathSegment[] = [];
			if (collection.children.length > 0) {
				const firstChild = collection.children[0];
				if (firstChild) {
					innerSegments.push(...buildRenderTree(firstChild.id, index, inDegree, visited));
				}
			}

			segments.push({ kind: "collection", entity: collection, innerSegments });

			// Collection's last child's target continues the main path
			const lastChild = collection.children.at(-1);
			if (lastChild && lastChild.type === "Stage" && "target" in lastChild && lastChild.target) {
				currentId = lastChild.target as string;
			} else {
				currentId = undefined;
			}
		} else {
			break;
		}
	}

	return segments;
}

export default function TimelineGraph({ onInsertStage }: TimelineGraphProps) {
	const dispatch = useDispatch();
	const [, setLocation] = useLocation();
	const timeline = useSelector(getTimeline);

	const handleEdit = useCallback(
		(entityId: string) => {
			setLocation(`/protocol/stage/${entityId}`);
		},
		[setLocation],
	);

	const handleDelete = useCallback(
		(entityId: string) => {
			dispatch(timelineSliceActions.deleteEntity(entityId));
		},
		[dispatch],
	);

	const handleInsert = useCallback(
		(afterEntityId: string) => {
			if (!timeline || !onInsertStage) return;
			const index = timeline.entities.findIndex((e) => e.id === afterEntityId);
			if (index >= 0) {
				onInsertStage(index + 1);
			}
		},
		[timeline, onInsertStage],
	);

	const handleReorderSlots = useCallback(
		(branchId: string, slotIds: string[]) => {
			dispatch(timelineSliceActions.reorderBranchSlots({ branchId, slotIds }));
		},
		[dispatch],
	);

	const renderTree = useMemo(() => {
		if (!timeline || timeline.entities.length === 0) return [];
		const index = buildEntityIndex(timeline.entities);
		const inDegree = computeInDegree(timeline.entities, index);
		const visited = new Set<string>();
		return buildRenderTree(timeline.start, index, inDegree, visited);
	}, [timeline]);

	if (!timeline) return null;

	let stageCounter = 0;

	function renderSegments(segments: GraphPathSegment[]): React.ReactNode[] {
		return segments.map((segment) => {
			switch (segment.kind) {
				case "stage": {
					stageCounter++;
					return (
						<div key={segment.entity.id} className="flex flex-col items-center">
							<StageNode
								entity={segment.entity}
								stageNumber={stageCounter}
								onEdit={handleEdit}
								onDelete={handleDelete}
							/>
							<InsertPoint afterEntityId={segment.entity.id} onInsert={handleInsert} />
						</div>
					);
				}

				case "branch": {
					const pathCount = segment.paths.length;
					return (
						<div key={segment.entity.id} className="flex flex-col items-center w-full">
							{/* Branch node */}
							<BranchNode
								entity={segment.entity}
								onEdit={handleEdit}
								onDelete={handleDelete}
								onReorderSlots={handleReorderSlots}
							/>

							{/* Connector lines from branch to columns */}
							<div className="relative w-full flex justify-center">
								<div className="flex items-start" style={{ gap: "2rem" }}>
									{/* Horizontal connector bar */}
									<div
										className="absolute top-0 h-[3px] bg-timeline/30 rounded-full"
										style={{
											left: `calc(50% - ${(pathCount - 1) * 10}rem)`,
											width: `${(pathCount - 1) * 20}rem`,
										}}
									/>
								</div>
							</div>

							{/* Branch columns */}
							<div
								className="grid w-full gap-4 mt-0"
								style={{
									gridTemplateColumns: `repeat(${pathCount}, 1fr)`,
								}}
							>
								{segment.paths.map((path) => (
									<div key={`${segment.entity.id}-${path.slotLabel}`} className="flex flex-col items-center">
										{/* Vertical line down into column */}
										<div className="w-[3px] h-6 bg-timeline/30 rounded-full" />

										{/* Slot label */}
										<div
											className={`text-xs px-3 py-1 rounded-full mb-3 font-medium ${
												path.isDefault
													? "bg-action/15 text-action border border-action/30"
													: "bg-surface-1 text-foreground/70 border border-border"
											}`}
										>
											{path.slotLabel}
										</div>

										{/* Path content */}
										<div className="flex flex-col items-center border-l-[3px] border-timeline/15 pl-0">
											{path.segments.length > 0 ? (
												renderSegments(path.segments)
											) : (
												<div className="text-xs text-foreground/30 italic py-4">(path continues)</div>
											)}
										</div>
									</div>
								))}
							</div>
						</div>
					);
				}

				case "collection": {
					return (
						<div key={segment.entity.id} className="flex flex-col items-center">
							<CollectionNode entity={segment.entity}>{renderSegments(segment.innerSegments)}</CollectionNode>
							<InsertPoint afterEntityId={segment.entity.id} onInsert={handleInsert} />
						</div>
					);
				}

				default:
					return null;
			}
		});
	}

	return <div className="flex flex-col items-center gap-1 w-full">{renderSegments(renderTree)}</div>;
}
