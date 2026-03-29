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
				<div className="absolute left-1/2 top-0 w-[5px] h-[calc(100%-1.25rem)] -translate-x-1/2 bg-timeline pointer-events-none" />
				<div className="relative grid grid-cols-1 gap-6 pt-16 justify-items-center">
					<TimelineGraph />
					<button
						type="button"
						className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-10 cursor-pointer group w-2xl p-4"
						onClick={() => handleInsertStage(stages.length)}
					>
						<div />
						<div className="w-10 h-10 rounded-full bg-action flex items-center justify-center text-primary-foreground text-4xl font-medium group-hover:scale-110 transition-transform duration-300 ease-in-out">
							+
						</div>
						<span className="justify-self-start group-hover:font-bold transition-all font-semibold text-lg">
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
