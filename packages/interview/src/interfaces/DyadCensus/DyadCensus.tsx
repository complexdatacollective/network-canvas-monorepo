import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import type { DyadCensusMetadataItem } from '@codaco/shared-consts';

import { useTrack } from '../../analytics/useTrack';
import Pair from '../../components/Pair';
import Prompts from '../../components/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import useBeforeNext from '../../hooks/useBeforeNext';
import { useStageSelector } from '../../hooks/useStageSelector';
import useStageValidation from '../../hooks/useStageValidation';
import { getNodePairs } from '../../selectors/dyad-census';
import {
  getEdgeColorForType,
  getNetworkEdges,
  getNetworkNodesForType,
  getStageMetadata,
} from '../../selectors/session';
import {
  addEdge,
  deleteEdge,
  edgeExists,
  updateStageMetadata,
} from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import IntroPanel from '../SlidesForm/IntroPanel';
import {
  getNodePair,
  getStageMetadataResponse,
  isDyadCensusMetadata,
  matchEntry,
} from './helpers';

const choiceVariants = {
  initial: { opacity: 0, translateY: '120%' },
  animate: {
    opacity: 1,
    translateY: '0%',
    transition: { delay: 0.15, type: 'spring' as const },
  },
  exit: { opacity: 0, translateY: '120%' },
};

type DyadCensusProps = StageProps<'DyadCensus'>;

export default function DyadCensus(props: DyadCensusProps) {
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
    prompt: { createEdge },
  } = usePrompts<(typeof stage.prompts)[number]>();

  const nodes = useStageSelector(getNetworkNodesForType);
  const edges = useStageSelector(getNetworkEdges);
  const edgeColor = useSelector(getEdgeColorForType(createEdge));
  const stageMetadata = useStageSelector(getStageMetadata);
  const pairs = useStageSelector(getNodePairs);

  const pair =
    pairIndex >= 0 && pairIndex < pairs.length
      ? (pairs[pairIndex] ?? null)
      : null;
  const [fromNode, toNode] = getNodePair(nodes, pair);

  // Compute edge state directly from Redux. The edge itself lives on the shared
  // graph (keyed by {from,to,type}), so a sibling prompt sharing this
  // createEdge type may have already created it.
  const existingEdgeId =
    (pair && edgeExists(edges, pair[0], pair[1], createEdge)) ?? false;
  const metadataResponse = pair
    ? getStageMetadataResponse(stageMetadata, promptIndex, pair)
    : { exists: false, value: undefined };

  // What to DISPLAY reflects the shared graph (the single source of truth): if
  // an edge of this type exists for the pair — even one created by a sibling
  // prompt sharing this createEdge — the pair reads as connected and 'Yes' is
  // pre-selected. A recorded negative answer for this prompt renders as 'No'.
  const displayedEdge: boolean | null = existingEdgeId
    ? true
    : metadataResponse.exists
      ? false
      : null;

  // Whether THIS prompt has been answered is scoped per prompt via the metadata
  // tuple, NOT raw edge existence. A sibling prompt's shared edge pre-fills the
  // display above but must NOT auto-skip data collection here: the participant
  // still has to click through, which records the per-prompt answer.
  const isAnswered = metadataResponse.exists;

  // Auto-advance tracking
  const [isTouched, setIsTouched] = useState(false);
  const [isChanged, setIsChanged] = useState(false);

  // Reset touch state when pair or prompt changes
  useEffect(() => {
    setIsTouched(false);
    setIsChanged(false);
  }, [pairIndex, promptIndex]);

  const track = useTrack();
  useEffect(() => {
    if (pair && !isIntroduction) {
      track('pair_shown', { node_a_id: pair[0], node_b_id: pair[1] });
    }
  }, [pair, isIntroduction, track]);

  // Validation
  useStageValidation({
    constraints: [
      {
        direction: 'forwards',
        isMet: isIntroduction || isAnswered,
        kind: 'comparison_response_required',
        toast: {
          description: 'Please select a response before continuing.',
          variant: 'destructive',
          anchor: 'forward',
        },
      },
    ],
  });

  // Navigation
  useBeforeNext((direction, intent) => {
    if (intent === 'jump') {
      setPairIndex(0);
      return true;
    }

    if (direction === 'forwards') {
      setIsForwards(true);

      if (isIntroduction) {
        if (pairs.length === 0) {
          return 'FORCE';
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

    if (direction === 'backwards') {
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

  // Edge state management
  const setEdge = (value: boolean | undefined) => {
    if (!pair || value === undefined) return;

    setIsChanged(displayedEdge !== value);
    setIsTouched(true);

    if (value) {
      // Idempotent on the shared graph: only create the edge when one of this
      // type does not already exist for the pair (a re-select / double-tap, or
      // a sibling prompt sharing createEdge, must not append a duplicate).
      if (!existingEdgeId) {
        void dispatch(
          addEdge({
            from: pair[0],
            to: pair[1],
            type: createEdge,
            currentStep,
          }),
        );
      }

      // Record a per-prompt positive answer so this prompt is independently
      // answered, symmetric with the 'No' path below.
      const existingMetadata = isDyadCensusMetadata(stageMetadata)
        ? stageMetadata.filter((item) => !matchEntry(promptIndex, pair)(item))
        : [];

      const entry: DyadCensusMetadataItem = [
        promptIndex,
        pair[0],
        pair[1],
        value,
      ];
      dispatch(
        updateStageMetadata({
          currentStep,
          metadata: [...existingMetadata, entry],
        }),
      );
      return;
    }

    // value === false
    if (existingEdgeId) {
      dispatch(deleteEdge(existingEdgeId));
    }

    const existingMetadata = isDyadCensusMetadata(stageMetadata)
      ? stageMetadata.filter((item) => !matchEntry(promptIndex, pair)(item))
      : [];

    const entry: DyadCensusMetadataItem = [
      promptIndex,
      pair[0],
      pair[1],
      value,
    ];
    dispatch(
      updateStageMetadata({
        currentStep,
        metadata: [...existingMetadata, entry],
      }),
    );
  };

  return (
    <div className="interface">
      <AnimatePresence initial={false} mode="wait">
        {isIntroduction ? (
          <IntroPanel
            title={stage.introductionPanel.title}
            text={stage.introductionPanel.text}
            key="intro"
          />
        ) : (
          <motion.div
            key="content"
            variants={{
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              exit: { opacity: 0 },
            }}
            initial="initial"
            exit="exit"
            animate="animate"
            className="flex w-full flex-1 flex-col items-center"
          >
            <motion.div className="flex w-full grow flex-col items-center justify-center">
              <AnimatePresence mode="wait" custom={isForwards} initial={false}>
                <Pair
                  key={`${promptIndex}_${pairIndex}`}
                  fromNode={fromNode}
                  toNode={toNode}
                  edgeColor={edgeColor}
                  hasEdge={displayedEdge}
                  animateForwards={isForwards}
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <BooleanField
                    value={displayedEdge ?? undefined}
                    onChange={setEdge}
                    options={[
                      { label: 'Yes', value: true },
                      { label: 'No', value: false },
                    ]}
                    noReset
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
