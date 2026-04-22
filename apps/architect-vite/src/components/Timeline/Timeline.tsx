import { Reorder } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
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

	const handleDeleteStage = useCallback(
		(id: string) => {
			dispatch(
				dialogsActions.openDialog({
					type: "Warning",
					title: "Delete stage",
					message: "Are you sure you want to delete this stage from your protocol? This action cannot be undone!",
					confirmLabel: "Delete stage",
					onConfirm: () => {
						dispatch(stageActions.deleteStage(id));
					},
				}),
			);
		},
		[dispatch],
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
			<TimelineRail>
				<Reorder.Group axis="y" onReorder={handleReorder} values={stages} className="flex w-full flex-col items-center">
					{stages.flatMap((stage, index) => {
						const previousStage = index > 0 ? stages[index - 1] : undefined;
						const incomingRailColor = previousStage ? getStageDisplayMeta(previousStage.type).color : undefined;
						return [
							<InsertButton key={`insert_${stage.id}`} onClick={() => handleInsertStage(index)} />,
							<Reorder.Item
								tabIndex={0}
								key={stage.id}
								value={stage}
								layoutId={`timeline-stage-${stage.id}`}
								className="w-full cursor-pointer focus:outline-none"
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
									subLabel={getStageDisplayMeta(stage.type).subLabel}
									index={index}
									color={getStageDisplayMeta(stage.type).color}
									iconSrc={getStageDisplayMeta(stage.type).iconSrc}
									labelPosition={index % 2 === 0 ? "right" : "left"}
									incomingRailColor={incomingRailColor}
									onDelete={() => handleDeleteStage(stage.id)}
									hasFilter={stage.hasFilter}
									hasSkipLogic={stage.hasSkipLogic}
								/>
							</Reorder.Item>,
						];
					})}
					<InsertButton key="insert_end" onClick={() => handleInsertStage(stages.length)} />
				</Reorder.Group>
			</TimelineRail>
			<NewStageScreen open={showNewStageDialog} insertAtIndex={insertAtIndex} onOpenChange={setShowNewStageDialog} />
		</>
	);
};

export default Timeline;
