import type { BranchEntity } from "@codaco/protocol-validation";

type BranchNodeProps = {
	entity: BranchEntity;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
};

export default function BranchNode({ entity, onEdit, onDelete }: BranchNodeProps) {
	return (
		<div className="timeline-branch" data-entity-id={entity.id}>
			<button type="button" className="timeline-branch__diamond" onClick={() => onEdit(entity.id)}>
				<span className="timeline-branch__name">{entity.name}</span>
			</button>
			<div className="timeline-branch__slots">
				{entity.slots.map((slot) => (
					<div key={slot.id} className="timeline-branch__slot">
						<span>{slot.label}</span>
						{slot.default && <span className="timeline-branch__default-badge">default</span>}
					</div>
				))}
			</div>
			<div className="timeline-branch__controls">
				<button type="button" onClick={() => onDelete(entity.id)}>
					Delete
				</button>
			</div>
		</div>
	);
}
