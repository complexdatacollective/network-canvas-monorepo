import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { getStageList } from "~/selectors/protocol";
import NewStageScreen from "../Screens/NewStageScreen";
import TimelineGraph from "./TimelineGraph";

const Timeline = () => {
	const stages = useSelector(getStageList);
	const [showNewStageDialog, setShowNewStageDialog] = useState(false);
	const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>(undefined);

	const handleInsertStage = useCallback((index: number) => {
		setInsertAtIndex(index);
		setShowNewStageDialog(true);
	}, []);

	return (
		<>
			<div className="relative mb-24">
				<div className="absolute left-1/2 top-0 w-[3px] h-[calc(100%-1.25rem)] -translate-x-1/2 bg-timeline/30 pointer-events-none rounded-full" />
				<div className="relative flex flex-col items-center gap-0 pt-12">
					<TimelineGraph onInsertStage={handleInsertStage} />
					<button
						type="button"
						className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-8 cursor-pointer group w-full max-w-2xl py-3"
						onClick={() => handleInsertStage(stages.length)}
					>
						<div />
						<div className="w-10 h-10 rounded-full bg-action flex items-center justify-center text-action-foreground group-hover:scale-110 transition-transform duration-300">
							<Plus size={22} />
						</div>
						<span className="justify-self-start text-foreground/60 group-hover:text-foreground font-semibold text-sm transition-colors">
							Add new stage
						</span>
					</button>
				</div>
			</div>
			<NewStageScreen open={showNewStageDialog} insertAtIndex={insertAtIndex} onOpenChange={setShowNewStageDialog} />
		</>
	);
};

export default Timeline;
