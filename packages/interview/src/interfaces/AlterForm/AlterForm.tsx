"use client";

import {
	type EntityAttributesProperty,
	entityPrimaryKeyProperty,
	type NcEdge,
	type NcNode,
} from "@codaco/shared-consts";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import Node from "~/components/ConnectedNode";
import { useCurrentStep } from "~/contexts/CurrentStepContext";
import useBeforeNext from "~/hooks/useBeforeNext";
import useReadyForNextStage from "~/hooks/useReadyForNextStage";
import { useStageSelector } from "~/hooks/useStageSelector";
import { getNetworkNodesForType } from "~/selectors/session";
import { updateNode } from "~/store/modules/session";
import { useAppDispatch } from "~/store/store";
import type { StageProps } from "~/types";
import IntroPanel from "../SlidesForm/IntroPanel";
import SlidesForm from "../SlidesForm/SlidesForm";

type Mode = "intro" | "form";

const AlterForm = (props: StageProps<"AlterForm">) => {
	const { stage } = props;
	const items = useStageSelector(getNetworkNodesForType);
	const dispatch = useAppDispatch();
	const { currentStep } = useCurrentStep();
	const [mode, setMode] = useState<Mode>("intro");
	const [isFormReady, setIsFormReady] = useState(false);

	const handleUpdateItem = useCallback(
		(id: string, newAttributeData: NcNode[EntityAttributesProperty]) => {
			void dispatch(
				updateNode({
					nodeId: id,
					newAttributeData,
					currentStep,
				}),
			);
		},
		[dispatch, currentStep],
	);

	const renderHeader = useCallback((item: NcNode | NcEdge) => {
		if ("from" in item) return null;
		return <Node nodeId={item[entityPrimaryKeyProperty]} type={item.type} className="shrink-0 rounded-full" />;
	}, []);

	const { moveForward } = props.getNavigationHelpers();

	// Intro state owns the forward-nav signal: pressing next dismisses the intro
	// instead of leaving the stage. Once in form mode, SlidesForm's own
	// useBeforeNext takes over. Backwards always passes through.
	useBeforeNext((direction) => {
		if (mode === "intro" && direction === "forwards") {
			setMode("form");
			return false;
		}
		return true;
	});

	// Intro is always "ready" — clicking next is the only path forward.
	const { updateReady } = useReadyForNextStage();
	useEffect(() => {
		if (mode === "intro") updateReady(true);
	}, [mode, updateReady]);

	// Empty-items short-circuit: once we're past intro and the network has no
	// items of this type, leave the stage. Render null in the meantime so the
	// SlidesForm doesn't briefly paint with an empty item list.
	const shouldSkipEmpty = mode === "form" && items.length === 0;
	useEffect(() => {
		if (shouldSkipEmpty) moveForward();
	}, [shouldSkipEmpty, moveForward]);

	if (shouldSkipEmpty) return null;

	return (
		<div className="interface">
			<AnimatePresence mode="wait" initial={false}>
				{mode === "intro" ? (
					<motion.div
						key="intro"
						className="size-full"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						data-stage-section="intro"
						data-stage-ready="true"
					>
						<IntroPanel title={stage.introductionPanel.title} text={stage.introductionPanel.text} />
					</motion.div>
				) : (
					<motion.div
						key="form"
						className="size-full"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						onAnimationComplete={() => setIsFormReady(true)}
						data-stage-section="form"
						data-stage-ready={isFormReady ? "true" : undefined}
					>
						<SlidesForm
							updateItem={handleUpdateItem}
							items={items}
							subject={stage.subject}
							form={stage.form}
							onNavigateBack={() => setMode("intro")}
							renderHeader={renderHeader}
							form_kind="alter"
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

export default AlterForm;
