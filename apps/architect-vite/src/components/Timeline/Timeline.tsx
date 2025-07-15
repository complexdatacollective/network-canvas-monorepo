import { get } from "es-toolkit/compat";
import { motion, Reorder, type Variants } from "motion/react";
import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import timelineImages from "~/images/timeline";
import { getStageList } from "~/selectors/protocol";
import NewStageScreen from "../Screens/NewStageScreen/NewStageScreen";
import InsertButton from "./InsertButton";
import Stage from "./Stage";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

export const lineVariants: Variants = {
	hide: {
		backgroundImage: "linear-gradient(var(--color-background), var(--color-background))",
		backgroundRepeat: "no-repeat",
		backgroundPosition: "center top",
		backgroundSize: "5px 0%",
	},
	show: {
		backgroundSize: "5px 97%", // Not 100% because of the new stage button at the bottom
		transition: {
			backgroundSize: { delay: 1, duration: 1.6, ease: "easeInOut" },
			delayChildren: 1,
			staggerChildren: 0.1,
		},
	},
};

const itemVariants = {
	show: {
		opacity: 1,
		y: 0,
	},
	hide: {
		opacity: 0,
		y: 30,
	},
};

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
		(config: any) => {
			dispatch(dialogsActions.openDialog(config));
		},
		[dispatch],
	);

	const [, setLocation] = useLocation();
	const [showNewStageDialog, setShowNewStageDialog] = useState(false);
	const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>(undefined);

	const handleInsertStage = useCallback((index) => {
		setInsertAtIndex(index);
		setShowNewStageDialog(true);
	}, []);

	const handleNewStageCancel = useCallback(() => {
		setShowNewStageDialog(false);
		setInsertAtIndex(undefined);
	}, []);

	const handleDeleteStage = useCallback(
		(stageId) => {
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
		(id, origin) => {
			setLocation(`/protocol/stage/${id}`);
		},
		[setLocation],
	);

	const renderStages = useCallback(
		() =>
			stages.flatMap((stage, index) => [
				<InsertButton key={`insert_${index}`} onClick={() => handleInsertStage(index)} />,
				<Stage
					key={`stage_${stage.id}`}
					index={index}
					stageNumber={index + 1} // Because SortableElement strips index prop
					id={stage.id}
					type={stage.type}
					hasFilter={stage.hasFilter}
					hasSkipLogic={stage.hasSkipLogic}
					label={stage.label}
					onEditStage={handleEditStage}
					onDeleteStage={handleDeleteStage}
				/>,
			]),
		[stages, handleInsertStage, handleEditStage, handleDeleteStage],
	);

	const [stateStages, setStateStages] = useState(stages);

	return (
		<>
			<Reorder.Group
				axis="y"
				onReorder={setStateStages}
				className="relative overflow-hidden grid grid-cols-1 gap-28 py-16 justify-items-center [--color-background:var(--color-timeline)]"
				initial="hide"
				animate="show"
				variants={lineVariants}
				values={stateStages}
			>
				{stateStages.map((stage, index) => (
					<Reorder.Item
						key={stage.id}
						value={stage}
						layoutId={`timeline-stage-${stage.id}`}
						variants={itemVariants}
						className="grid grid-cols-[1fr_auto_1fr] items-center gap-10 cursor-pointer"
					>
						<img
							className="w-40 rounded shadow justify-self-end select-none pointer-events-none"
							src={getTimelineImage(stage.type)}
							alt={`${stage.type} interface`}
							title={`${stage.type} interface`}
						/>
						<div className="bg-timeline text-timeline-foreground rounded-full h-10 w-10 flex items-center justify-center">
							{index + 1}
						</div>
						<h4 className="text-center justify-self-start">{stage.label || "\u00A0"}</h4>
					</Reorder.Item>
				))}

				<motion.div className="mb-40" onClick={() => handleInsertStage(stages.length)}>
					Add new stage
				</motion.div>
			</Reorder.Group>

			<NewStageScreen show={showNewStageDialog} insertAtIndex={insertAtIndex} onCancel={handleNewStageCancel} />
		</>
	);
};

export default Timeline;
