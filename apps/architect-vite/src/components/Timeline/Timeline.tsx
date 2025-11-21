import { get } from "es-toolkit/compat";
import { motion, Reorder } from "motion/react";
import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import timelineImages from "~/images/timeline";
import { Button } from "~/lib/legacy-ui/components";
import { getStageList } from "~/selectors/protocol";
import { cn } from "~/utils/cn";
import NewStageScreen from "../Screens/NewStageScreen";
import InsertButton from "./InsertButton";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

const Timeline = () => {
	const stages = useSelector(getStageList);
	const dispatch = useAppDispatch();

	const deleteStage = useCallback(
		(stageId: string) => {
			dispatch(stageActions.deleteStage(stageId));
		},
		[dispatch],
	);

	const openDialog = useCallback(
		(config: Record<string, unknown>) => {
			dispatch(dialogsActions.openDialog(config));
		},
		[dispatch],
	);

	const [, setLocation] = useLocation();
	const [showNewStageDialog, setShowNewStageDialog] = useState(false);
	const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>(undefined);

	const handleInsertStage = useCallback((index: number) => {
		setInsertAtIndex(index);
		setShowNewStageDialog(true);
	}, []);

	const _handleNewStageCancel = useCallback(() => {
		setShowNewStageDialog(false);
		setInsertAtIndex(undefined);
	}, []);

	const handleDeleteStage = useCallback(
		(stageId: string) => {
			openDialog({
				type: "Warning",
				title: "Delete stage",
				message: "Are you sure you want to delete this stage from your protocol? This action cannot be undone!",
				onConfirm: () => deleteStage(stageId),
				confirmLabel: "Delete stage",
			});
		},
		[openDialog, deleteStage],
	);

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
					// Move to new index
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

	const itemClasses = cn(
		"relative grid grid-cols-[1fr_auto_1fr] items-center gap-10 cursor-pointer group w-2xl p-4",
		"hover:bg-timeline-hover transition-colors duration-300 ease-in-out",
		// Focus state for accessibility
		"focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-timeline",
	);

	return (
		<>
			<Reorder.Group
				axis="y"
				onReorder={handleReorder}
				className="relative overflow-hidden grid grid-cols-1 gap-6 py-16 justify-items-center [--color-background:var(--color-timeline)]"
				values={stages}
				style={{
					backgroundImage: "linear-gradient(var(--color-background), var(--color-background))",
					backgroundRepeat: "no-repeat",
					backgroundPosition: "center top",
					backgroundSize: "5px 97%",
				}}
			>
				{stages.flatMap((stage, index) => [
					<InsertButton key={`insert_${stage.id}_${index}`} onClick={() => handleInsertStage(index)} />,
					<Reorder.Item
						tabIndex={0}
						key={stage.id}
						value={stage}
						layoutId={`timeline-stage-${stage.id}`}
						className={itemClasses}
						onClick={() => handleEditStage(stage.id)}
					>
						<img
							className="w-40 rounded shadow justify-self-end select-none pointer-events-none group-hover:scale-105 transition-transform duration-300 ease-in-out"
							src={getTimelineImage(stage.type)}
							alt={`${stage.type} interface`}
							title={`${stage.type} interface`}
						/>
						<div className="bg-timeline text-timeline-foreground rounded-full h-10 w-10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ease-in-out">
							{index + 1}
						</div>
						<div className="justify-self-start">
							<h4 className="group-hover:font-bold transition-all">{stage.label || "\u00A0"}</h4>
						</div>
						<div className="absolute -right-40 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out">
							<Button
								onClick={(e) => {
									e.stopPropagation();
									handleDeleteStage(stage.id);
								}}
								color="neon-coral"
							>
								Delete stage
							</Button>
						</div>
					</Reorder.Item>,
				])}

				<motion.div
					className="mb-40 grid grid-cols-[1fr_auto_1fr] items-center gap-10 cursor-pointer group w-2xl p-4"
					onClick={() => handleInsertStage(stages.length)}
				>
					<div />
					<div className="w-10 h-10 rounded-full bg-action flex items-center justify-center text-primary-foreground text-4xl font-medium group-hover:scale-110 transition-transform duration-300 ease-in-out">
						+
					</div>
					<span className="justify-self-start group-hover:font-bold transition-all font-semibold text-lg">
						Add new stage
					</span>
				</motion.div>
			</Reorder.Group>
			<NewStageScreen open={showNewStageDialog} insertAtIndex={insertAtIndex} onOpenChange={setShowNewStageDialog} />
		</>
	);
};

export default Timeline;
