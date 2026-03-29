import type { StageEntity } from "@codaco/protocol-validation";

type StageNodeProps = {
	entity: StageEntity;
	stageNumber: number;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
};

export default function StageNode({ entity, stageNumber, onEdit, onDelete }: StageNodeProps) {
	return (
		<div className="timeline-stage" data-entity-id={entity.id}>
			<button type="button" className="timeline-stage__edit-stage" onClick={() => onEdit(entity.id)}>
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
