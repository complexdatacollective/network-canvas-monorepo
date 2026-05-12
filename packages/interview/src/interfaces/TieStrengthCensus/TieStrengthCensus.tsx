"use client";

import RichSelectGroupField, { type RichSelectOption } from "@codaco/fresco-ui/form/fields/RichSelectGroup";
import { MotionSurface } from "@codaco/fresco-ui/layout/Surface";
import { entityAttributesProperty, entityPrimaryKeyProperty } from "@codaco/shared-consts";
import { get } from "es-toolkit/compat";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTrack } from "~/analytics/useTrack";
import Pair from "~/components/Pair";
import Prompts from "~/components/Prompts";
import { usePrompts } from "~/components/Prompts/usePrompts";
import { useCurrentStep } from "~/contexts/CurrentStepContext";
import useBeforeNext from "~/hooks/useBeforeNext";
import { useStageSelector } from "~/hooks/useStageSelector";
import useStageValidation from "~/hooks/useStageValidation";
import { getNodePairs } from "~/selectors/dyad-census";
import { getEdgeColorForType, getNetworkEdges, getNetworkNodesForType, getStageMetadata } from "~/selectors/session";
import { getCodebook } from "~/store/modules/protocol";
import {
	addEdge,
	type DyadCensusMetadataItem,
	deleteEdge,
	edgeExists,
	updateEdge,
	updateStageMetadata,
} from "~/store/modules/session";
import { useAppDispatch } from "~/store/store";
import type { StageProps } from "~/types";
import type { VariableOptions, VariableOptionValue } from "~/utils/codebook";
import { getNodePair, getStageMetadataResponse, isDyadCensusMetadata, matchEntry } from "../DyadCensus/helpers";
import IntroPanel from "../SlidesForm/IntroPanel";

const fadeVariants = {
	initial: { opacity: 0, transition: { duration: 0.5 } },
	animate: { opacity: 1, transition: { duration: 0.5 } },
	exit: { opacity: 0, transition: { duration: 0.5 } },
};

const optionsVariants = {
	initial: { opacity: 0, transition: { delay: 0.35, duration: 0.25 } },
	animate: { opacity: 1, transition: { delay: 0.35, duration: 0.25 } },
	exit: { opacity: 0, transition: { delay: 0.35, duration: 0.25 } },
};

const choiceVariants = {
	initial: { opacity: 0, translateY: "120%" },
	animate: {
		opacity: 1,
		translateY: "0%",
		transition: { delay: 0.25, type: "spring" as const },
	},
	exit: { opacity: 0, translateY: "120%" },
};

const NEGATIVE_OPTION_VALUE = "__none__";

type TieStrengthCensusProps = StageProps<"TieStrengthCensus">;

export default function TieStrengthCensus(props: TieStrengthCensusProps) {
	const { stage, getNavigationHelpers } = props;
	const { moveForward } = getNavigationHelpers();
	const dispatch = useAppDispatch();
	const { currentStep } = useCurrentStep();

	const baseId = useId();
	const pairLabelId = `${baseId}-pair`;
	const promptLabelId = `${baseId}-prompt`;

	const [isIntroduction, setIsIntroduction] = useState(true);
	const [isForwards, setIsForwards] = useState(true);
	const [pairIndex, setPairIndex] = useState(0);

	const {
		promptIndex,
		prompt: { createEdge, edgeVariable, negativeLabel },
	} = usePrompts<{
		createEdge: string;
		edgeVariable?: string;
		negativeLabel: string;
	}>();

	const nodes = useStageSelector(getNetworkNodesForType);
	const edges = useStageSelector(getNetworkEdges);
	const edgeColor = useSelector(getEdgeColorForType(createEdge));
	const stageMetadata = useStageSelector(getStageMetadata);
	const codebook = useSelector(getCodebook);
	const pairs = useStageSelector(getNodePairs);

	const edgeVariableOptions = (
		edgeVariable ? get(codebook, ["edge", createEdge, "variables", edgeVariable, "options"]) : []
	) as VariableOptions;

	const richSelectOptions: RichSelectOption[] = [
		...edgeVariableOptions.flatMap((option) =>
			typeof option.value === "boolean" ? [] : [{ value: option.value, label: option.label }],
		),
		{ value: NEGATIVE_OPTION_VALUE, label: negativeLabel },
	];

	const pair = pairIndex >= 0 && pairIndex < pairs.length ? (pairs[pairIndex] ?? null) : null;
	const [fromNode, toNode] = getNodePair(nodes, pair);

	const track = useTrack();
	useEffect(() => {
		if (pair && !isIntroduction) {
			track("pair_shown", { node_a_id: pair[0], node_b_id: pair[1] });
		}
	}, [pair, isIntroduction, track]);

	// Compute edge state directly from Redux
	const existingEdgeId = (pair && edgeExists(edges, pair[0], pair[1], createEdge)) ?? false;

	const edgeVariableValue: string | number | undefined = (() => {
		if (!edgeVariable || !existingEdgeId) return undefined;
		const edge = edges.find((e) => e[entityPrimaryKeyProperty] === existingEdgeId);
		const value = edge?.[entityAttributesProperty]?.[edgeVariable];
		if (typeof value === "string" || typeof value === "number") {
			return value;
		}
		return undefined;
	})();

	const metadataResponse = pair
		? getStageMetadataResponse(stageMetadata, promptIndex, pair)
		: { exists: false, value: undefined };

	const hasEdge: boolean | null = existingEdgeId ? true : metadataResponse.exists ? false : null;

	// Auto-advance tracking
	const [isTouched, setIsTouched] = useState(false);
	const [isChanged, setIsChanged] = useState(false);

	// Reset touch state when pair or prompt changes
	useEffect(() => {
		setIsTouched(false);
		setIsChanged(false);
	}, [pairIndex, promptIndex]);

	// Validation
	useStageValidation({
		constraints: [
			{
				direction: "forwards",
				isMet: isIntroduction || hasEdge !== null,
				kind: "comparison_response_required",
				toast: {
					description: "Please select a response before continuing.",
					variant: "destructive",
					anchor: "forward",
				},
			},
		],
	});

	// Navigation
	useBeforeNext((direction) => {
		if (direction === "forwards") {
			setIsForwards(true);

			if (isIntroduction) {
				if (pairs.length === 0) {
					return "FORCE";
				}
				setIsIntroduction(false);
				return false;
			}

			const isLastPair = pairIndex === pairs.length - 1;
			if (isLastPair) {
				setPairIndex(0);
				return true;
			}

			setPairIndex((i) => i + 1);
			return false;
		}

		if (direction === "backwards") {
			setIsForwards(false);

			if (isIntroduction) {
				return true;
			}

			if (pairIndex > 0) {
				setPairIndex((i) => i - 1);
				return false;
			}

			// pairIndex === 0
			if (promptIndex === 0) {
				setIsIntroduction(true);
				return false;
			}

			setPairIndex(pairs.length - 1);
			return true;
		}

		return false;
	});

	// Auto-advance
	const moveForwardRef = useRef(moveForward);
	moveForwardRef.current = moveForward;

	useEffect(() => {
		if (!isTouched) return;

		if (!isChanged) {
			moveForwardRef.current();
			return;
		}

		const timer = setTimeout(() => {
			moveForwardRef.current();
		}, 350);

		return () => clearTimeout(timer);
	}, [isTouched, isChanged]);

	// Handle option selection
	const handleChange = (value: VariableOptionValue | false) => {
		if (!pair || isTouched) return;

		setIsChanged(hasEdge !== (value !== false));
		setIsTouched(true);

		if (value === false) {
			// Negative option selected - delete edge and record in metadata
			if (existingEdgeId) {
				dispatch(deleteEdge(existingEdgeId));
			}

			const existingMetadata = isDyadCensusMetadata(stageMetadata)
				? stageMetadata.filter((item) => !matchEntry(promptIndex, pair)(item))
				: [];

			dispatch(
				updateStageMetadata({
					currentStep,
					metadata: [...existingMetadata, [promptIndex, ...pair, false]] as DyadCensusMetadataItem[],
				}),
			);
			return;
		}

		// Ordinal option selected - create or update edge with variable value
		if (isDyadCensusMetadata(stageMetadata)) {
			dispatch(
				updateStageMetadata({
					currentStep,
					metadata: stageMetadata.filter((item) => !matchEntry(promptIndex, pair)(item)),
				}),
			);
		}

		if (existingEdgeId) {
			void dispatch(
				updateEdge({
					edgeId: existingEdgeId,
					newAttributeData: {
						[edgeVariable!]: value,
					},
				}),
			);
		} else {
			void dispatch(
				addEdge({
					from: pair[0],
					to: pair[1],
					type: createEdge,
					attributeData: {
						[edgeVariable!]: value,
					},
					currentStep,
				}),
			);
		}
	};

	return (
		<div className="interface">
			<AnimatePresence initial={false} mode="wait">
				{isIntroduction ? (
					<IntroPanel title={stage.introductionPanel.title} text={stage.introductionPanel.text} key="intro" />
				) : (
					<motion.div
						key="content"
						variants={fadeVariants}
						initial="initial"
						exit="exit"
						animate="animate"
						className="flex w-full flex-1 flex-col items-center"
					>
						<motion.div className="flex w-full grow flex-col items-center justify-center">
							<AnimatePresence mode="wait" custom={isForwards} initial={false}>
								<Pair
									key={`${promptIndex}_${pairIndex}`}
									edgeColor={edgeColor}
									hasEdge={hasEdge}
									animateForwards={isForwards}
									fromNode={fromNode}
									toNode={toNode}
									labelId={pairLabelId}
								/>
							</AnimatePresence>
						</motion.div>
						<MotionSurface
							noContainer
							className="flex size-fit shrink-0 grow-0 flex-col items-center justify-center gap-4"
							variants={choiceVariants}
							initial="initial"
							animate="animate"
						>
							<Prompts id={promptLabelId} />
							<AnimatePresence mode="wait">
								<motion.div
									key={`${promptIndex}_${pairIndex}_choice`}
									className="flex items-center justify-center"
									variants={optionsVariants}
									initial="initial"
									animate="animate"
									exit="exit"
								>
									<RichSelectGroupField
										orientation="horizontal"
										options={richSelectOptions}
										autoFocus
										value={
											hasEdge === false
												? NEGATIVE_OPTION_VALUE
												: hasEdge && edgeVariableValue !== undefined
													? edgeVariableValue
													: undefined
										}
										onChange={(next) => {
											if (next === NEGATIVE_OPTION_VALUE) {
												handleChange(false);
											} else if (typeof next === "string" || typeof next === "number") {
												handleChange(next);
											}
										}}
										aria-labelledby={`${pairLabelId} ${promptLabelId}`}
									/>
								</motion.div>
							</AnimatePresence>
						</MotionSurface>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
