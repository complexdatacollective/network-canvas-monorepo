'use client';

import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppIntl, AppMessage } from '@codaco/app-i18n/react';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import type { SortRule } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { useTrack } from '../../analytics/useTrack';
import { ConnectedMotionNode } from '../../components/ConnectedNode';
import NodeList from '../../components/NodeList';
import Panel from '../../components/Panel';
import Prompts from '../../components/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import useBeforeNext from '../../hooks/useBeforeNext';
import useSortedNodeList, { useStepOrder } from '../../hooks/useSortedNodeList';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
  getNetworkEdges,
  getNetworkNodesForType,
} from '../../selectors/session';
import { edgeExists, toggleEdge } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import { interfaceMessages } from '../messages';

type OneToManyDyadCensusProps = StageProps<'OneToManyDyadCensus'>;

function OneToManyDyadCensus(props: OneToManyDyadCensusProps) {
  const intl = useAppIntl();
  const {
    stage: {
      behaviours: { removeAfterConsideration },
    },
  } = props;

  const { currentStep: stageStep } = useCurrentStep();

  // Records the direction of the navigation that crosses a prompt boundary so
  // the prompt change can seed the focal node: forward entry starts at the
  // first focal node, backward entry resumes at the last (#668).
  const crossingDirection = useRef<'forwards' | 'backwards'>('forwards');

  // The ScrollArea viewport uses overflow-auto which clips nodes during
  // layoutId animations across the Surface boundary. Temporarily switch to
  // overflow-visible while the animation is in flight, then restore scrolling.
  const [isTransitioning, setIsTransitioning] = useState(false);

  const dispatch = useAppDispatch();

  const {
    prompt: { createEdge, bucketSortOrder, binSortOrder },
    promptIndex,
  } = usePrompts<{
    createEdge: string;
    bucketSortOrder?: SortRule[];
    binSortOrder?: SortRule[];
  }>();

  const nodes = useStageSelector(getNetworkNodesForType);
  const edges = useStageSelector(getNetworkEdges);

  // The focal people are stepped through by position, so each prompt keeps the
  // order it began with even when the list re-sorts, such as once the
  // passphrase is entered. Undefined while that order is still settling.
  const focalPeople = useStepOrder(nodes, bucketSortOrder, promptIndex);

  // The index of the last step. With removeAfterConsideration the last person
  // is never focal: by then they have been considered with everyone else.
  const lastStep =
    (focalPeople ?? nodes).length - (removeAfterConsideration ? 2 : 1);

  const [step, setStep] = useState({ prompt: promptIndex, index: 0 });
  // Seeded in the render that changes the prompt, so that no render shows the
  // new prompt's people at the step reached on the previous one.
  if (step.prompt !== promptIndex) {
    setStep({
      prompt: promptIndex,
      index:
        crossingDirection.current === 'backwards' ? Math.max(lastStep, 0) : 0,
    });
  }
  const currentStep = step.index;

  const source = focalPeople?.[currentStep];

  const track = useTrack();
  useEffect(() => {
    if (source) {
      track('focal_node', { node_id: source[entityPrimaryKeyProperty] });
    }
  }, [source, track]);

  const targets = useMemo(
    () =>
      source
        ? nodes.filter(
            (node) =>
              node[entityPrimaryKeyProperty] !==
              source[entityPrimaryKeyProperty],
          )
        : [],
    [nodes, source],
  );
  const sortedTargets = useSortedNodeList(targets, binSortOrder);

  /**
   * Hijack stage navigation:
   * - If we are moving forward and not on the last step, increment the step
   * - If we are moving forward and on the last step, allow navigation
   * - If we are moving backward, decrement the step until we reach 0
   * - If we are moving backward and on step 0, allow navigation
   */
  useBeforeNext((direction, intent) => {
    if (intent === 'jump') {
      crossingDirection.current = direction;
      return true;
    }

    // Nobody is shown until the order settles, so there is no step to leave.
    if (!focalPeople) return false;

    if (direction === 'forwards') {
      if (currentStep < lastStep) {
        setStep((prev) => ({ ...prev, index: prev.index + 1 }));
        setIsTransitioning(true);
        return false;
      }

      crossingDirection.current = 'forwards';
      return true;
    }

    if (direction === 'backwards') {
      if (currentStep > 0) {
        setStep((prev) => ({ ...prev, index: prev.index - 1 }));
        setIsTransitioning(true);
        return false;
      }

      crossingDirection.current = 'backwards';
      return true;
    }

    return true;
  });

  useEffect(() => {
    crossingDirection.current = 'forwards';
    setIsTransitioning(true);
  }, [promptIndex]);

  // Fallback: restore overflow after animation duration in case
  // onLayoutAnimationComplete doesn't fire (e.g. no layout change).
  useEffect(() => {
    if (!isTransitioning) return;
    const timer = setTimeout(() => setIsTransitioning(false), 800);
    return () => clearTimeout(timer);
  }, [isTransitioning]);

  const handleNodeClick = useCallback(
    (sourceNode: NcNode, target: NcNode) => () => {
      const edgeAction = toggleEdge({
        from: sourceNode[entityPrimaryKeyProperty],
        to: target[entityPrimaryKeyProperty],
        type: createEdge,
        currentStep: stageStep,
      });

      void dispatch(edgeAction);
    },
    [createEdge, dispatch, stageStep],
  );

  const filteredTargets = useMemo(() => {
    if (!removeAfterConsideration || !focalPeople) return sortedTargets;
    const considered = new Set(
      focalPeople
        .slice(0, currentStep)
        .map((node) => node[entityPrimaryKeyProperty]),
    );
    return sortedTargets.filter(
      (node) => !considered.has(node[entityPrimaryKeyProperty]),
    );
  }, [sortedTargets, focalPeople, removeAfterConsideration]);

  const renderItem = useCallback(
    (node: NcNode, itemProps: ItemProps) => {
      if (!source) return null;
      const selected = !!edgeExists(
        edges,
        node[entityPrimaryKeyProperty],
        source[entityPrimaryKeyProperty],
        createEdge,
      );
      return (
        <ConnectedMotionNode
          {...itemProps}
          nodeId={node[entityPrimaryKeyProperty]}
          type={node.type}
          size="sm"
          selected={selected}
          onClick={handleNodeClick(source, node)}
          layoutId={node[entityPrimaryKeyProperty]}
        />
      );
    },
    [edges, source, createEdge, handleNodeClick],
  );

  return (
    <div className="interface">
      <Prompts />
      <AnimatePresence mode="popLayout">
        {source ? (
          <ConnectedMotionNode
            nodeId={source[entityPrimaryKeyProperty]}
            type={source.type}
            size="md"
            className="z-10"
            layoutId={source[entityPrimaryKeyProperty]}
            key={source[entityPrimaryKeyProperty]}
            onLayoutAnimationComplete={() => setIsTransitioning(false)}
          />
        ) : focalPeople ? (
          <div key="missing" className="flex h-24 items-center justify-center">
            <AppMessage message={interfaceMessages.noNodesAvailable} />
          </div>
        ) : null}
      </AnimatePresence>
      <Panel
        title={intl.formatMessage(interfaceMessages.selectAllThenNext)}
        panelNumber={0}
        noCollapse
        className="w-full max-w-7xl"
      >
        <NodeList
          id="dyad-census-targets"
          items={filteredTargets}
          renderItem={renderItem}
          selectionMode="none"
          layoutGroupId={null}
          animationKey={promptIndex}
          aria-label={intl.formatMessage(interfaceMessages.targetNodes)}
          announcedName={intl.formatMessage(interfaceMessages.targetNodes)}
          emptyState={
            focalPeople ? (
              <h3>
                <AppMessage message={interfaceMessages.noNodes} />
              </h3>
            ) : null
          }
        />
      </Panel>
    </div>
  );
}

export default OneToManyDyadCensus;
