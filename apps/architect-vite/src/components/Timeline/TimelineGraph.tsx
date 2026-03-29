import type { BranchEntity, CollectionEntityType, Entity, StageEntity } from "@codaco/protocol-validation";
import { Reorder } from "motion/react";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "wouter";
import { timelineSliceActions } from "~/ducks/modules/protocol/timeline";
import { getTimeline } from "~/selectors/timeline";
import BranchNode from "./BranchNode";
import CollectionNode from "./CollectionNode";
import InsertPoint from "./InsertPoint";
import { computeLayout } from "./layout";
import StageNode from "./StageNode";

type TimelineGraphProps = {
	onInsertStage?: (afterIndex: number) => void;
};

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

	const handleReorderSlots = useCallback(
		(branchId: string, slotIds: string[]) => {
			dispatch(timelineSliceActions.reorderBranchSlots({ branchId, slotIds }));
		},
		[dispatch],
	);

	if (!timeline) return null;

	const layout = computeLayout(timeline);

	let stageCounter = 0;

	function renderEntity(entity: Entity): React.ReactNode {
		const layoutNode = layout.get(entity.id);
		if (!layoutNode) return null;

		switch (entity.type) {
			case "Stage": {
				stageCounter++;
				return (
					<div key={entity.id}>
						<StageNode
							entity={entity as StageEntity}
							stageNumber={stageCounter}
							onEdit={handleEdit}
							onDelete={handleDelete}
						/>
						<InsertPoint afterEntityId={entity.id} onInsert={handleInsert} />
					</div>
				);
			}
			case "Branch":
				return (
					<div key={entity.id}>
						<BranchNode
							entity={entity as BranchEntity}
							onEdit={handleEdit}
							onDelete={handleDelete}
							onReorderSlots={handleReorderSlots}
						/>
					</div>
				);
			case "Collection": {
				const collection = entity as CollectionEntityType;
				return (
					<CollectionNode key={entity.id} entity={collection}>
						{collection.children.map((child) => renderEntity(child))}
					</CollectionNode>
				);
			}
			default:
				return null;
		}
	}

	return (
		<div className="timeline-graph">
			<Reorder.Group axis="y" values={timeline.entities} onReorder={handleReorder}>
				{timeline.entities.map((entity) => (
					<Reorder.Item key={entity.id} value={entity}>
						{renderEntity(entity)}
					</Reorder.Item>
				))}
			</Reorder.Group>
		</div>
	);
}
