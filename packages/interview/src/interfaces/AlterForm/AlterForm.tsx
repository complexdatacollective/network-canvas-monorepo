"use client";

import {
	type EntityAttributesProperty,
	entityPrimaryKeyProperty,
	type NcEdge,
	type NcNode,
} from "@codaco/shared-consts";
import { useCallback, useEffect, useState } from "react";
import Node from "../../components/ConnectedNode";
import { updateNode } from "../../store/modules/session";
import { getNetworkNodesForType } from "../../selectors/session";
import { useAppDispatch } from "../../store/store";
import type { StageProps } from "../../types";
import IntroPanel from "../SlidesForm/IntroPanel";
import SlidesForm from "../SlidesForm/SlidesForm";
import { useCurrentStep } from "../../contexts/CurrentStepContext";
import { useStageSelector } from "../../hooks/useStageSelector";

const AlterForm = (props: StageProps<"AlterForm">) => {
	const { stage } = props;
	const items = useStageSelector(getNetworkNodesForType);
	const dispatch = useAppDispatch();
	const { currentStep } = useCurrentStep();
	const [showIntro, setShowIntro] = useState(true);

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

	// If the intro panel is dismissed and there are no items, skip to the next stage.
	useEffect(() => {
		if (showIntro === false && items.length === 0) {
			moveForward();
		}
	}, [showIntro, items.length, moveForward]);

	if (showIntro) {
		return (
			<div className="interface">
				<IntroPanel
					title={stage.introductionPanel.title}
					text={stage.introductionPanel.text}
					onDismiss={() => setShowIntro(false)}
				/>
			</div>
		);
	}

	return (
		<SlidesForm
			updateItem={handleUpdateItem}
			items={items}
			subject={stage.subject}
			form={stage.form}
			onNavigateBack={() => setShowIntro(true)}
			renderHeader={renderHeader}
		/>
	);
};

export default AlterForm;
