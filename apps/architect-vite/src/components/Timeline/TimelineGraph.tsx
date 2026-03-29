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

	let stageCounter = 0;

	function renderEntity(entity: Entity): React.ReactNode {
		switch (entity.type) {
			case "Stage": {
				stageCounter++;
				return (
					<div key={entity.id} className="flex flex-col items-center">
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
					<div key={entity.id} className="flex flex-col items-center">
						<BranchNode
							entity={entity as BranchEntity}
							onEdit={handleEdit}
							onDelete={handleDelete}
							onReorderSlots={handleReorderSlots}
						/>
						<InsertPoint afterEntityId={entity.id} onInsert={handleInsert} />
					</div>
				);
			case "Collection": {
				const collection = entity as CollectionEntityType;
				return (
					<div key={entity.id} className="flex flex-col items-center">
						<CollectionNode entity={collection}>
							{collection.children.map((child) => renderEntity(child))}
						</CollectionNode>
						<InsertPoint afterEntityId={entity.id} onInsert={handleInsert} />
					</div>
				);
			}
			default:
				return null;
		}
	}

	return (
		<Reorder.Group
			axis="y"
			values={timeline.entities}
			onReorder={handleReorder}
			className="flex flex-col items-center gap-1 list-none p-0 m-0"
		>
			{timeline.entities.map((entity) => (
				<Reorder.Item key={entity.id} value={entity} className="list-none w-full flex justify-center">
					{renderEntity(entity)}
				</Reorder.Item>
			))}
		</Reorder.Group>
	);
}
