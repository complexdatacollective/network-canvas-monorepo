'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';

import type { Stage } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import BinSelectFocus from '../../components/BinSelectFocus';
import NodeDrawer from '../../components/NodeDrawer';
import Prompts from '../../components/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useBinSelection } from '../../hooks/useBinSelection';
import useCompletePlacement from '../../hooks/useCompletePlacement';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
  getCurrentStageId,
  getNetworkNodesForType,
} from '../../selectors/session';
import type { StageProps } from '../../types';
import OrdinalBinItem from './components/OrdinalBinItem';
import { useOrdinalBins } from './useOrdinalBins';

type OrdinalBinStageProps = StageProps<'OrdinalBin'>;

type OrdinalBinPrompts = Extract<
  Stage,
  { type: 'OrdinalBin' }
>['prompts'][number];

const binsContainerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      when: 'beforeChildren' as const,
    },
  },
  exit: { opacity: 0 },
};

const OrdinalBin = ({ stage }: OrdinalBinStageProps) => {
  const selectMode = stage.behaviours?.interactionMode === 'select';

  const {
    prompt,
    prompt: { variable: activePromptVariable },
  } = usePrompts<OrdinalBinPrompts>();

  const stageId = useStageSelector(getCurrentStageId);
  const { bins, unplacedNodes } = useOrdinalBins();
  const stageNodes = useStageSelector(getNetworkNodesForType);
  const lastBinIndexRef = useRef<Map<string, number>>(new Map());
  const { focalNode, choose, advanceFrom } = useBinSelection({
    enabled: selectMode,
    nodes: stageNodes,
    unplacedNodes,
  });

  useCompletePlacement({
    unplacedCount: unplacedNodes.length,
    required: stage.behaviours?.requireCompletePlacement,
    notice: stage.unplacedNodesNotice,
  });

  return (
    <div className="interface overflow-hidden pb-0">
      <Prompts />
      <div className="min-h-0 w-full flex-1">
        <AnimatePresence mode="wait">
          {prompt && activePromptVariable && (
            <motion.div
              key={prompt.id}
              // The header track still sizes to its labels, so a short label
              // keeps a band that hugs it. What it must not do is change size
              // for any other reason: `minmax(0,...)` on the node track drops
              // the automatic content minimum that otherwise squeezes the
              // header as people arrive in a bin, and `fit-content` caps a
              // sentence-length label before it takes the whole bin. Both keep
              // the box BinLabel fits to from moving under it mid-fit.
              className="grid h-full auto-cols-fr grid-flow-col grid-rows-[fit-content(45%)_minmax(0,1fr)] gap-x-2 portrait:grid-flow-row portrait:auto-rows-fr portrait:grid-cols-[fit-content(40%)_minmax(0,1fr)] portrait:grid-rows-none portrait:gap-x-0 portrait:gap-y-2"
              variants={binsContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {bins.map((bin, index) => (
                <OrdinalBinItem
                  key={index}
                  bin={bin}
                  index={index}
                  activePromptVariable={activePromptVariable}
                  stageId={stageId}
                  promptId={prompt.id}
                  sortOrder={prompt.binSortOrder}
                  totalBins={bins.length}
                  lastBinIndexRef={lastBinIndexRef}
                  select={
                    selectMode
                      ? {
                          focalNode,
                          onPlaced: advanceFrom,
                          onChoose: choose,
                        }
                      : undefined
                  }
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {selectMode && <BinSelectFocus node={focalNode} />}
      <NodeDrawer
        nodes={unplacedNodes}
        itemType="NODE"
        draggable={!selectMode}
        selectedNodeId={focalNode?.[entityPrimaryKeyProperty]}
      />
    </div>
  );
};

export default OrdinalBin;
