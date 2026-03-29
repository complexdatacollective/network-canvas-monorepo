import type { BranchEntity } from "@codaco/protocol-validation";
import { GitFork, Trash2 } from "lucide-react";
import { Reorder } from "motion/react";

type BranchNodeProps = {
	entity: BranchEntity;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onReorderSlots?: (branchId: string, slotIds: string[]) => void;
};

export default function BranchNode({ entity, onEdit, onDelete, onReorderSlots }: BranchNodeProps) {
	return (
		<div
			className="group/branch grid grid-cols-[1fr_auto_1fr] items-center gap-6 w-full max-w-2xl"
			data-entity-id={entity.id}
		>
			<div className="justify-self-end w-44">
				<Reorder.Group
					axis="y"
					values={entity.slots}
					onReorder={(newSlots) => {
						onReorderSlots?.(
							entity.id,
							newSlots.map((s) => s.id),
						);
					}}
					className="flex flex-col gap-1"
				>
					{entity.slots.map((slot) => (
						<Reorder.Item key={slot.id} value={slot}>
							<div
								className={`text-xs px-2.5 py-1.5 rounded cursor-grab active:cursor-grabbing transition-colors ${
									slot.default
										? "bg-action/15 text-action font-medium border border-action/30"
										: "bg-surface-1 text-foreground/70 border border-border"
								}`}
							>
								<span className="truncate block">{slot.label}</span>
							</div>
						</Reorder.Item>
					))}
				</Reorder.Group>
			</div>

			<button
				type="button"
				onClick={() => onEdit(entity.id)}
				className="w-10 h-10 rounded-lg bg-primary rotate-45 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform duration-200 shrink-0"
			>
				<GitFork size={18} className="-rotate-45 text-primary-foreground" />
			</button>

			<div className="justify-self-start flex items-center gap-3 min-w-0">
				<button
					type="button"
					onClick={() => onEdit(entity.id)}
					className="cursor-pointer text-left truncate font-semibold text-base text-foreground hover:text-primary transition-colors"
				>
					{entity.name}
				</button>
				<span className="text-xs text-foreground/40 tabular-nums">{entity.slots.length} paths</span>
				<button
					type="button"
					onClick={() => onDelete(entity.id)}
					className="opacity-0 group-hover/branch:opacity-100 transition-opacity duration-200 cursor-pointer p-1.5 rounded-md hover:bg-error/10 text-error/60 hover:text-error"
					title="Delete branch"
				>
					<Trash2 size={16} />
				</button>
			</div>
		</div>
	);
}
