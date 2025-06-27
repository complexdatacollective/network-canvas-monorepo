import { bindActionCreators } from "@reduxjs/toolkit";
import cx from "classnames";
import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { useLocation } from "wouter";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/utils/stages";
import type { RootState } from "~/ducks/modules/root";
import { getCSSVariableAsNumber } from "~/lib/legacy-ui/utils/CSSVariables";
import { getProtocol, getStageList, getTimelineLocus } from "~/selectors/protocol";
import NewStageScreen from "../Screens/NewStageScreen/NewStageScreen";
import InsertButton from "./InsertButton";
import Stage from "./Stage";

const variants = {
	outer: {
		show: {
			background:
				"repeating-linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0) 100%, var(--background) 100%, var(--background) 100% )",
			transition: {
				duration: 0.5,
				delay: 0.75,
			},
		},
		hide: {
			background:
				"repeating-linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0) 0%, var(--background) 0%, var(--background) 100% )",
		},
	},
	newStage: {
		show: {
			opacity: 1,
			transition: {},
		},
		hide: {
			opacity: 0,
		},
	},
};

interface TimelineProps {
	stages?: Array<any>;
	sorting?: boolean;
	deleteStage: (stageId: string) => void;
	openDialog: (config: any) => void;
	show?: boolean;
	locus: number | string;
}

const Timeline = (props: TimelineProps) => {
	const { show = true, sorting = false, stages = [], locus, openDialog, deleteStage } = props;
	const [, setLocation] = useLocation();
	const [showNewStageDialog, setShowNewStageDialog] = useState(false);
	const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>(undefined);

	// Get protocol ID from URL for navigation
	const getProtocolId = useCallback(() => {
		const urlPath = window.location.pathname;
		return urlPath.match(/\/protocol\/([^\/]+)/)?.[1];
	}, []);

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
			const protocolId = getProtocolId();
			if (protocolId) {
				// Simple navigation without locus in URL - locus is managed in Redux state
				setLocation(`/protocol/${protocolId}/stages/${id}`);
			}
		},
		[getProtocolId, setLocation],
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

	const timelineStyles = cx("timeline", {
		"timeline--show": show,
		"timeline--sorting": sorting,
	});

	return (
		<div className={timelineStyles}>
			<motion.div
				className="timeline__stages"
				initial={sorting ? false : "hide"}
				animate="show"
				variants={variants.outer}
			>
				{renderStages()}
				<motion.div
					className="timeline__insert timeline__insert--new"
					onClick={() => handleInsertStage(stages.length)}
					variants={variants.newStage}
				>
					Add new stage
				</motion.div>
			</motion.div>
			<NewStageScreen show={showNewStageDialog} insertAtIndex={insertAtIndex} onCancel={handleNewStageCancel} />
		</div>
	);
};

const mapStateToProps = (state: RootState) => ({
	locus: getTimelineLocus(state),
	activeProtocol: getProtocol(state),
	stages: getStageList(state),
	transitionDuration: getCSSVariableAsNumber("--animation-duration-standard-ms"), // Re-order transition
});

const mapDispatchToProps = (dispatch: any, props: any) => ({
	deleteStage: bindActionCreators(stageActions.deleteStage, dispatch),
	openDialog: bindActionCreators(dialogsActions.openDialog, dispatch),
	onSortEnd: ({ oldIndex, newIndex }) => {
		props.setSorting(false);
		dispatch(stageActions.moveStage(oldIndex, newIndex));
	},
	onSortStart: () => {
		props.setSorting(true);
	},
});

export { Timeline };

export default compose(connect(mapStateToProps, mapDispatchToProps))(Timeline);
