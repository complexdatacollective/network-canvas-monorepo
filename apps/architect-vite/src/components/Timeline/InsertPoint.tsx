import { Plus } from "lucide-react";

type InsertPointProps = {
	afterEntityId: string;
	onInsert: (afterEntityId: string) => void;
};

export default function InsertPoint({ afterEntityId, onInsert }: InsertPointProps) {
	return (
		<div className="flex justify-center py-1">
			<button
				type="button"
				onClick={() => onInsert(afterEntityId)}
				aria-label="Insert entity"
				className="group/insert flex items-center justify-center w-6 h-6 rounded-full border-2 border-transparent hover:border-action hover:bg-action/10 cursor-pointer transition-all duration-200 opacity-0 hover:opacity-100 focus:opacity-100"
			>
				<Plus size={14} className="text-action opacity-0 group-hover/insert:opacity-100 transition-opacity" />
			</button>
		</div>
	);
}
