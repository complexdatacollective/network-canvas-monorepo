import type { BranchEntity, CollectionEntityType, Entity, StageEntity } from "@codaco/protocol-validation";
import { ArrowDown } from "lucide-react";
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

function getEntityTarget(entity: Entity): string | undefined {
	if (entity.type === "Stage" && "target" in entity) {
		return (entity as { target?: string }).target;
	}
	return undefined;
}

function findConvergencePoint(branch: BranchEntity, index: Map<string, Entity>): string | null {
	const pathReachable: Set<string>[] = branch.slots.map((slot) => {
		const ids = new Set<string>();
		let current: string | undefined = slot.target;
		const visited = new Set<string>();
		while (current && !visited.has(current)) {
			visited.add(current);
			ids.add(current);
			const entity = index.get(current);
			if (!entity) break;
			if (entity.type === "Branch") {
				const nested = entity as BranchEntity;
				const defaultSlot = nested.slots.find((s) => s.default);
				current = defaultSlot?.target;
			} else {
				current = getEntityTarget(entity);
			}
		}
		return ids;
	});

	if (pathReachable.length === 0) return null;

	const firstSlot = branch.slots[0];
	if (!firstSlot) return null;

	let current: string | undefined = firstSlot.target;
	const visited = new Set<string>();
	while (current && !visited.has(current)) {
		visited.add(current);
		const id = current;
		const reachableFromAll = pathReachable.every((pathSet) => pathSet.has(id));
		if (reachableFromAll) {
			return current;
		}
		const entity = index.get(current);
		if (!entity) break;
		if (entity.type === "Branch") {
			const nested = entity as BranchEntity;
			const defaultSlot = nested.slots.find((s) => s.default);
			current = defaultSlot?.target;
		} else {
			current = getEntityTarget(entity);
		}
	}

	return null;
}

type RenderNode =
	| { kind: "stage"; entity: StageEntity }
	| {
			kind: "branch";
			entity: BranchEntity;
			columns: { slotLabel: string; isDefault: boolean; nodes: RenderNode[] }[];
	  }
	| { kind: "collection"; entity: CollectionEntityType; innerNodes: RenderNode[] };

function buildRenderList(
	startId: string,
	stopAtId: string | null,
	index: Map<string, Entity>,
	visited: Set<string>,
): RenderNode[] {
	const nodes: RenderNode[] = [];
	let currentId: string | undefined = startId;

	while (currentId) {
		if (currentId === stopAtId) break;
		if (visited.has(currentId)) break;

		const entity = index.get(currentId);
		if (!entity) break;

		visited.add(currentId);

		if (entity.type === "Stage") {
			const stage = entity as StageEntity;
			nodes.push({ kind: "stage", entity: stage });
			currentId = "target" in stage ? (stage.target as string | undefined) : undefined;
		} else if (entity.type === "Branch") {
			const branch = entity as BranchEntity;
			const convergence = findConvergencePoint(branch, index);

			const columns = branch.slots.map((slot) => ({
				slotLabel: slot.label,
				isDefault: slot.default === true,
				nodes: buildRenderList(slot.target, convergence, index, visited),
			}));

			nodes.push({ kind: "branch", entity: branch, columns });
			currentId = convergence ?? undefined;
		} else if (entity.type === "Collection") {
			const collection = entity as CollectionEntityType;
			const firstChild = collection.children[0];
			const innerNodes = firstChild ? buildRenderList(firstChild.id, null, index, visited) : [];
			nodes.push({ kind: "collection", entity: collection, innerNodes });

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

	return nodes;
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

	const renderList = useMemo(() => {
		if (!timeline || timeline.entities.length === 0) return [];
		const index = buildEntityIndex(timeline.entities);
		const visited = new Set<string>();
		return buildRenderList(timeline.start, null, index, visited);
	}, [timeline]);

	if (!timeline) return null;

	let stageCounter = 0;

	function renderNodes(nodes: RenderNode[], compact = false): React.ReactNode[] {
		return nodes.map((node) => {
			switch (node.kind) {
				case "stage": {
					stageCounter++;
					return (
						<div key={node.entity.id} className="flex flex-col items-center">
							<StageNode
								entity={node.entity}
								stageNumber={stageCounter}
								compact={compact}
								onEdit={handleEdit}
								onDelete={handleDelete}
							/>
							{!compact && <InsertPoint afterEntityId={node.entity.id} onInsert={handleInsert} />}
						</div>
					);
				}

				case "branch": {
					return (
						<div key={node.entity.id} className="flex flex-col items-center w-full max-w-4xl">
							{/* Branch header */}
							<BranchNode entity={node.entity} onEdit={handleEdit} onDelete={handleDelete} />

							{/* Horizontal connector from center to each column */}
							<div className="relative w-full flex justify-center py-1">
								{/* Vertical line from branch to horizontal bar */}
								<div className="w-[3px] h-4 bg-timeline/40" />
							</div>

							{/* Columns container */}
							<div className="relative flex justify-center w-full">
								{/* Horizontal bar spanning across columns */}
								<div
									className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] bg-timeline/40 rounded-full"
									style={{
										width: `${Math.max(node.columns.length - 1, 1) * 12}rem`,
									}}
								/>

								{/* Column layout */}
								<div className="flex gap-0 pt-0">
									{node.columns.map((col) => (
										<div
											key={`${node.entity.id}-${col.slotLabel}`}
											className="flex flex-col items-center"
											style={{ minWidth: "12rem" }}
										>
											{/* Vertical line into column */}
											<div className="w-[3px] h-5 bg-timeline/40" />

											{/* Slot label */}
											<div
												className={`text-xs px-3 py-1 rounded-full mb-3 font-medium whitespace-nowrap ${
													col.isDefault
														? "bg-action/15 text-action border border-action/30"
														: "bg-surface-1 text-foreground/70 border border-border"
												}`}
											>
												{col.slotLabel}
											</div>

											{/* Column content */}
											<div className="flex flex-col items-center gap-2 min-h-[3rem]">
												{col.nodes.length > 0 ? (
													renderNodes(col.nodes, true)
												) : (
													<div className="flex flex-col items-center gap-1 py-2 text-foreground/30">
														<ArrowDown size={16} />
														<span className="text-[10px] italic">skip</span>
													</div>
												)}
											</div>

											{/* Vertical line out of column */}
											<div className="w-[3px] h-5 bg-timeline/40 mt-2" />
										</div>
									))}
								</div>
							</div>

							{/* Horizontal bar converging */}
							<div className="relative w-full flex justify-center">
								<div
									className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-timeline/40 rounded-full"
									style={{
										width: `${Math.max(node.columns.length - 1, 1) * 12}rem`,
									}}
								/>
								{/* Vertical line from horizontal bar back to center */}
								<div className="w-[3px] h-4 bg-timeline/40 mt-[3px]" />
							</div>
						</div>
					);
				}

				case "collection": {
					return (
						<div key={node.entity.id} className="flex flex-col items-center">
							<CollectionNode entity={node.entity}>{renderNodes(node.innerNodes)}</CollectionNode>
							<InsertPoint afterEntityId={node.entity.id} onInsert={handleInsert} />
						</div>
					);
				}

				default:
					return null;
			}
		});
	}

	return <div className="flex flex-col items-center gap-1 w-full">{renderNodes(renderList)}</div>;
}
