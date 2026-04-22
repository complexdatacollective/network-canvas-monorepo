import { Reorder } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import { getStageList } from "~/selectors/protocol";
import NewStageScreen from "../Screens/NewStageScreen";
import { getStageDisplayMeta } from "../shared/stageMeta";
import TimelineRail from "../shared/TimelineRail";
import TimelineStation from "../shared/TimelineStation";
import InsertButton from "./InsertButton";

const Timeline = () => {
	const stages = useSelector(getStageList);
	const dispatch = useAppDispatch();
	const pointerStart = useRef({ x: 0, y: 0 });

	const [, setLocation] = useLocation();
	const [showNewStageDialog, setShowNewStageDialog] = useState(false);
	const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>(undefined);

	const handleInsertStage = useCallback((index: number) => {
		setInsertAtIndex(index);
		setShowNewStageDialog(true);
	}, []);

	const handleEditStage = useCallback(
		(id: string) => {
			setLocation(`/protocol/stage/${id}`);
		},
		[setLocation],
	);

	const handleReorder = useCallback(
		(newOrder: typeof stages) => {
			// Find which stage moved
			for (let i = 0; i < newOrder.length; i++) {
				if (newOrder[i]?.id !== stages[i]?.id) {
					const stageId = newOrder[i]?.id;
					if (!stageId) continue;

					const oldIndex = stages.findIndex((s) => s.id === stageId);
					const newIndex = i;

					if (oldIndex !== -1 && oldIndex !== newIndex) {
						dispatch(stageActions.moveStage(oldIndex, newIndex));
					}
					break;
				}
			}
		},
		[stages, dispatch],
	);

	return (
		<>
			<TimelineRail railColor="hsl(220 4% 88%)">
				<Reorder.Group axis="x" onReorder={handleReorder} values={stages} className="flex items-center gap-6">
					{stages.flatMap((stage, index) => [
						<InsertButton key={`insert_${stage.id}`} onClick={() => handleInsertStage(index)} />,
						<Reorder.Item
							tabIndex={0}
							key={stage.id}
							value={stage}
							layoutId={`timeline-stage-${stage.id}`}
							className="cursor-pointer focus:outline-none"
							onPointerDown={(e) => {
								pointerStart.current = { x: e.clientX, y: e.clientY };
							}}
							onClick={(e) => {
								const dx = e.clientX - pointerStart.current.x;
								const dy = e.clientY - pointerStart.current.y;
								if (dx * dx + dy * dy < 25) handleEditStage(stage.id);
							}}
						>
							<TimelineStation
								label={stage.label ?? "Untitled stage"}
								index={index}
								color={getStageDisplayMeta(stage.type).color}
								iconSrc={getStageDisplayMeta(stage.type).iconSrc}
								labelPosition={index % 2 === 0 ? "below" : "above"}
							/>
						</Reorder.Item>,
					])}
					<InsertButton key="insert_end" onClick={() => handleInsertStage(stages.length)} />
				</Reorder.Group>
			</TimelineRail>
			<NewStageScreen open={showNewStageDialog} insertAtIndex={insertAtIndex} onOpenChange={setShowNewStageDialog} />
		</>
	);
};

export default Timeline;
