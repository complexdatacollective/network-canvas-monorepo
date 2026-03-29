import type { BranchEntity } from "@codaco/protocol-validation";
import { Reorder } from "motion/react";

type BranchNodeProps = {
	entity: BranchEntity;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onReorderSlots?: (branchId: string, slotIds: string[]) => void;
};

export default function BranchNode({ entity, onEdit, onDelete, onReorderSlots }: BranchNodeProps) {
	return (
		<div className="timeline-branch" data-entity-id={entity.id}>
			<button type="button" className="timeline-branch__diamond" onClick={() => onEdit(entity.id)}>
				<span className="timeline-branch__name">{entity.name}</span>
			</button>
			<Reorder.Group
				axis="y"
				values={entity.slots}
				onReorder={(newSlots) => {
					onReorderSlots?.(
						entity.id,
						newSlots.map((s) => s.id),
					);
				}}
				className="timeline-branch__slots"
			>
				{entity.slots.map((slot) => (
					<Reorder.Item key={slot.id} value={slot} className="timeline-branch__slot">
						<span>{slot.label}</span>
						{slot.default && <span className="timeline-branch__default-badge">default</span>}
					</Reorder.Item>
				))}
			</Reorder.Group>
			<div className="timeline-branch__controls">
				<button type="button" onClick={() => onDelete(entity.id)}>
					Delete
				</button>
			</div>
		</div>
	);
}
