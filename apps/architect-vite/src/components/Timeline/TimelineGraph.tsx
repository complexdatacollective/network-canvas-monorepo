import type { BranchEntity, CollectionEntityType, Entity, StageEntity } from "@codaco/protocol-validation";
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

export default function TimelineGraph() {
	const dispatch = useDispatch();
	const [, setLocation] = useLocation();
	const timeline = useSelector(getTimeline);

	const handleEdit = useCallback(
		(entityId: string) => {
			setLocation(`/protocol/entity/${entityId}`);
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
			setLocation(`/protocol/entity/new?afterEntityId=${afterEntityId}`);
		},
		[setLocation],
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
						<BranchNode entity={entity as BranchEntity} onEdit={handleEdit} onDelete={handleDelete} />
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

	return <div className="timeline-graph">{timeline.entities.map((entity) => renderEntity(entity))}</div>;
}
