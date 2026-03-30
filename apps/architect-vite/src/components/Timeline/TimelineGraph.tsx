import type { BranchEntity, CollectionEntityType, Entity, StageEntity } from "@codaco/protocol-validation";
import { ArrowDown } from "lucide-react";
import { Reorder } from "motion/react";
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

function Connector() {
	return <div className="w-[3px] h-6 bg-timeline/40 shrink-0" />;
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

	const handleReorder = useCallback(
		(newOrder: Entity[]) => {
			if (!timeline) return;
			for (let i = 0; i < newOrder.length; i++) {
				const newEntity = newOrder[i];
				const oldEntity = timeline.entities[i];
				if (!newEntity || !oldEntity) break;
				if (newEntity.id !== oldEntity.id) {
					const movedEntityId = newEntity.id;
					const afterEntityId = i > 0 ? (newOrder[i - 1]?.id ?? null) : null;
					dispatch(timelineSliceActions.moveEntity({ entityId: movedEntityId, afterEntityId }));
					break;
				}
			}
		},
		[dispatch, timeline],
	);

	const renderList = useMemo(() => {
		if (!timeline || timeline.entities.length === 0) return [];
		const index = buildEntityIndex(timeline.entities);
		const visited = new Set<string>();
		return buildRenderList(timeline.start, null, index, visited);
	}, [timeline]);

	if (!timeline) return null;

	let stageCounter = 0;

	function renderNodes(nodes: RenderNode[]): React.ReactNode[] {
		const result: React.ReactNode[] = [];

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (!node) continue;

			// Add connector line before each node (except the first)
			if (i > 0) {
				result.push(
					<Connector
						key={`connector-before-${node.kind === "branch" ? node.entity.id : node.kind === "stage" ? node.entity.id : node.entity.id}`}
					/>,
				);
			}

			switch (node.kind) {
				case "stage": {
					stageCounter++;
					result.push(
						<div key={node.entity.id} className="flex flex-col items-center">
							<StageNode entity={node.entity} stageNumber={stageCounter} onEdit={handleEdit} onDelete={handleDelete} />
							<InsertPoint afterEntityId={node.entity.id} onInsert={handleInsert} />
						</div>,
					);
					break;
				}

				case "branch": {
					const colWidth = "max(20rem, 42rem)";

					result.push(
						<div key={node.entity.id} className="flex flex-col items-center">
							{/* Branch header */}
							<BranchNode entity={node.entity} onEdit={handleEdit} onDelete={handleDelete} />

							{/* Vertical connector from branch diamond down to horizontal bar */}
							<Connector />

							{/* Forking area */}
							<div className="flex flex-col items-center">
								{/* Top horizontal bar */}
								<div
									className="h-[3px] bg-timeline/40 rounded-full"
									style={{ width: `calc(${node.columns.length} * ${colWidth})` }}
								/>

								{/* Columns */}
								<div className="flex">
									{node.columns.map((col) => (
										<div
											key={`${node.entity.id}-${col.slotLabel}`}
											className="flex flex-col items-center"
											style={{ width: colWidth }}
										>
											{/* Vertical line into column */}
											<Connector />

											{/* Slot label */}
											<div
												className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap mb-2 ${
													col.isDefault
														? "bg-action/15 text-action border border-action/30"
														: "bg-surface-1 text-foreground/70 border border-border"
												}`}
											>
												{col.slotLabel}
											</div>

											{/* Column content */}
											{col.nodes.length > 0 ? (
												<div className="flex flex-col items-center">{renderNodes(col.nodes)}</div>
											) : (
												<div className="flex flex-col items-center gap-1 py-4 text-foreground/30">
													<ArrowDown size={16} />
													<span className="text-[10px] italic">skip</span>
												</div>
											)}

											{/* Vertical line out of column */}
											<Connector />
										</div>
									))}
								</div>

								{/* Bottom horizontal bar (convergence) */}
								<div
									className="h-[3px] bg-timeline/40 rounded-full"
									style={{ width: `calc(${node.columns.length} * ${colWidth})` }}
								/>
							</div>

							{/* Vertical connector from convergence bar down to next entity */}
							<Connector />
						</div>,
					);
					break;
				}

				case "collection": {
					result.push(
						<div key={node.entity.id} className="flex flex-col items-center">
							<CollectionNode entity={node.entity}>{renderNodes(node.innerNodes)}</CollectionNode>
							<InsertPoint afterEntityId={node.entity.id} onInsert={handleInsert} />
						</div>,
					);
					break;
				}
			}
		}

		return result;
	}

	return (
		<Reorder.Group
			axis="y"
			values={timeline.entities}
			onReorder={handleReorder}
			className="flex flex-col items-center list-none p-0 m-0"
		>
			{timeline.entities.length > 0 && <>{renderNodes(renderList)}</>}
		</Reorder.Group>
	);
}
