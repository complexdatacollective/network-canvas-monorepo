import type { StageEntity } from "@codaco/protocol-validation";
import { get } from "es-toolkit/compat";
import { Trash2 } from "lucide-react";
import { useRef } from "react";
import timelineImages from "~/images/timeline";

const DRAG_THRESHOLD = 5;

const getTimelineImage = (stageType: string) => get(timelineImages, stageType, timelineImages.Default);

type StageNodeProps = {
	entity: StageEntity;
	stageNumber: number;
	compact?: boolean;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
};

export default function StageNode({ entity, stageNumber, compact, onEdit, onDelete }: StageNodeProps) {
	const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

	const handlePointerDown = (e: React.PointerEvent) => {
		pointerStartRef.current = { x: e.clientX, y: e.clientY };
	};

	const handleEditClick = () => {
		const start = pointerStartRef.current;
		pointerStartRef.current = null;

		if (start) {
			const dx = start.x - (start.x ?? 0);
			const dy = start.y - (start.y ?? 0);
			if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) return;
		}

		onEdit(entity.id);
	};

	const image = getTimelineImage(entity.stageType);

	if (compact) {
		return (
			<div
				className="group/stage flex flex-col items-center gap-1 w-full"
				data-entity-id={entity.id}
				onPointerDown={handlePointerDown}
			>
				<button
					type="button"
					onClick={handleEditClick}
					className="cursor-pointer rounded-lg overflow-hidden bg-surface-accent shadow-sm hover:shadow-md hover:scale-[1.03] transition-all duration-300 w-28"
				>
					<div className="p-2">
						{image && <img src={image} alt={entity.stageType} className="w-full h-auto pointer-events-none" />}
					</div>
				</button>
				<button
					type="button"
					onClick={handleEditClick}
					className="cursor-pointer text-center text-xs font-medium text-foreground hover:text-primary transition-colors truncate max-w-[10rem]"
				>
					{entity.label || "\u00A0"}
				</button>
				<button
					type="button"
					onClick={() => onDelete(entity.id)}
					className="opacity-0 group-hover/stage:opacity-100 transition-opacity duration-200 cursor-pointer p-1 rounded-md hover:bg-error/10 text-error/60 hover:text-error"
					title="Delete stage"
				>
					<Trash2 size={12} />
				</button>
			</div>
		);
	}

	return (
		<div
			className="group/stage grid grid-cols-[1fr_auto_1fr] items-center gap-6 w-full max-w-2xl"
			data-entity-id={entity.id}
			onPointerDown={handlePointerDown}
		>
			<button
				type="button"
				onClick={handleEditClick}
				className="justify-self-end cursor-pointer rounded-lg overflow-hidden bg-surface-accent shadow-md hover:shadow-lg hover:scale-[1.03] transition-all duration-300 w-44"
			>
				<div className="p-3">
					{image && <img src={image} alt={entity.stageType} className="w-full h-auto pointer-events-none" />}
				</div>
			</button>

			<button
				type="button"
				onClick={handleEditClick}
				className="w-10 h-10 rounded-full bg-timeline flex items-center justify-center text-timeline-foreground font-semibold text-sm cursor-pointer hover:scale-110 transition-transform duration-200 shrink-0"
			>
				{stageNumber}
			</button>

			<div className="justify-self-start flex items-center gap-3 min-w-0">
				<button
					type="button"
					onClick={handleEditClick}
					className="cursor-pointer text-left truncate font-semibold text-base text-foreground hover:text-primary transition-colors"
				>
					{entity.label || "\u00A0"}
				</button>
				<button
					type="button"
					onClick={() => onDelete(entity.id)}
					className="opacity-0 group-hover/stage:opacity-100 transition-opacity duration-200 cursor-pointer p-1.5 rounded-md hover:bg-error/10 text-error/60 hover:text-error"
					title="Delete stage"
				>
					<Trash2 size={16} />
				</button>
			</div>
		</div>
	);
}
