import type { StageEntity } from "@codaco/protocol-validation";
import { useRef } from "react";

const DRAG_THRESHOLD = 5;

type StageNodeProps = {
	entity: StageEntity;
	stageNumber: number;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
};

export default function StageNode({ entity, stageNumber, onEdit, onDelete }: StageNodeProps) {
	const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

	const handlePointerDown = (e: React.PointerEvent) => {
		pointerStartRef.current = { x: e.clientX, y: e.clientY };
	};

	const handleEditClick = (e: React.MouseEvent) => {
		const start = pointerStartRef.current;
		pointerStartRef.current = null;

		if (start) {
			const dx = e.clientX - start.x;
			const dy = e.clientY - start.y;
			if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) return;
		}

		onEdit(entity.id);
	};

	return (
		<div className="timeline-stage" data-entity-id={entity.id} onPointerDown={handlePointerDown}>
			<button type="button" className="timeline-stage__edit-stage" onClick={handleEditClick}>
				<img src={`/images/timeline/stage--${entity.stageType}.png`} alt={entity.stageType} />
			</button>
			<div className="timeline-stage__notch">{stageNumber}</div>
			<div className="timeline-stage__label">{entity.label}</div>
			<div className="timeline-stage__controls">
				<button type="button" onClick={() => onDelete(entity.id)}>
					Delete
				</button>
			</div>
		</div>
	);
}
