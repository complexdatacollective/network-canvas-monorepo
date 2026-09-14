'use client';
import { motion } from 'motion/react';
import { memo, useMemo, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { SortOrder, Stage } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { useTrack } from '../../../analytics/useTrack';
import BinLabel from '../../../components/BinLabel';
import NodeList from '../../../components/NodeList';
import { usePrompts } from '../../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../../contexts/CurrentStepContext';
import useMediaQuery from '../../../hooks/useMediaQuery';
import useSortedNodeList from '../../../hooks/useSortedNodeList';
import { updateNode } from '../../../store/modules/session';
import { useAppDispatch } from '../../../store/store';
import { getEntityAttributes } from '../../../utils/networkEntities';
import { interfaceMessages } from '../../messages';
import type { OrdinalBinItem as OrdinalBinItemType } from '../useOrdinalBins';

type OrdinalBinItemProps = {
  bin: OrdinalBinItemType;
  index: number;
  activePromptVariable: string;
  stageId: string;
  promptId: string;
  sortOrder?: SortOrder;
  totalBins: number;
};

const itemVariants = {
  initial: { opacity: 0, y: '20%' },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
  },
  exit: { opacity: 0, y: '20%', transition: { duration: 0.15 } },
};

// A bin represents a 'missing value' (e.g. N/A) when its option value is
// negative. The option value may be authored as the number -1 or the numeric
// string '-1' (both schema-valid), so coerce to a number before the check and
// guard against NaN for non-numeric strings.
export const isMissingValue = (value: OrdinalBinItemType['value']): boolean => {
  const numeric = Number(value);
  return !Number.isNaN(numeric) && numeric < 0;
};

type OrdinalBinPrompt = Extract<
  Stage,
  { type: 'OrdinalBin' }
>['prompts'][number];

const getPromptColorClass = (color: OrdinalBinPrompt['color']) => {
  return cx(
    color === 'ord-color-seq-1' && '[--prompt-color:var(--ord-1)]',
    color === 'ord-color-seq-2' && '[--prompt-color:var(--ord-2)]',
    color === 'ord-color-seq-3' && '[--prompt-color:var(--ord-3)]',
    color === 'ord-color-seq-4' && '[--prompt-color:var(--ord-4)]',
    color === 'ord-color-seq-5' && '[--prompt-color:var(--ord-5)]',
    color === 'ord-color-seq-6' && '[--prompt-color:var(--ord-6)]',
    color === 'ord-color-seq-7' && '[--prompt-color:var(--ord-7)]',
    color === 'ord-color-seq-8' && '[--prompt-color:var(--ord-8)]',
    color === 'ord-color-seq-9' && '[--prompt-color:var(--ord-9)]',
    color === 'ord-color-seq-10' && '[--prompt-color:var(--ord-10)]',
  );
};

const OrdinalBinItem = memo((props: OrdinalBinItemProps) => {
  const intl = useAppIntl();
  const {
    bin,
    index,
    activePromptVariable,
    stageId,
    promptId,
    sortOrder = [],
    totalBins,
  } = props;

  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();
  const { prompt } = usePrompts<OrdinalBinPrompt>();
  const isPortrait = useMediaQuery('(orientation: portrait)');
  const track = useTrack();
  const lastBinIndexRef = useRef<Map<string, number>>(new Map());
  const headerRef = useRef<HTMLDivElement>(null);
  // The label's text, not its markdown source: a screen reader should not read
  // the asterisks around an emphasised word.
  const spokenLabel = useMemo(
    () => getMarkdownLabelText(bin.label),
    [bin.label],
  );

  const missingValue = isMissingValue(bin.value);
  const blendPercent = Math.round((1 / totalBins) * index * 100);
  const isFirst = index === 0;
  const isLast = index === totalBins - 1;

  const promptColorClass = getPromptColorClass(prompt.color);

  const handleDrop = (metadata?: Record<string, unknown>) => {
    const meta = metadata as NcNode | undefined;
    if (!meta) return;

    if (getEntityAttributes(meta)[activePromptVariable] === bin.value) {
      return;
    }

    const nodeId = meta[entityPrimaryKeyProperty];
    const previousIndex = lastBinIndexRef.current.get(nodeId);
    if (previousIndex === undefined) {
      track('node_binned', {
        node_id: nodeId,
        node_type: meta.type,
        bin_index: index,
      });
    } else if (previousIndex !== index) {
      track('node_rebinned', {
        node_id: nodeId,
        node_type: meta.type,
        from_bin_index: previousIndex,
        to_bin_index: index,
      });
    }
    lastBinIndexRef.current.set(nodeId, index);

    void dispatch(
      updateNode({
        nodeId,
        attributePatch: {
          set: { [activePromptVariable]: bin.value },
          unset: [],
        },
        currentStep,
      }),
    );
  };

  const sortedNodes = useSortedNodeList(bin.nodes, sortOrder);

  const listId = `ORDBIN_NODE_LIST_${stageId}_${promptId}_${index}`;

  const panelClasses = cx(
    'row-span-2 grid min-w-0 grid-rows-subgrid overflow-hidden shadow portrait:col-span-2 portrait:row-span-1 portrait:grid-cols-subgrid portrait:grid-rows-none',
    'bg-[color-mix(in_oklch,var(--surface-1)_var(--blend-percent),var(--background)_calc(100%-var(--blend-percent)))]',
    missingValue && 'bg-surface-1',
    isFirst &&
      'rounded-tl rounded-bl portrait:rounded-tr portrait:rounded-bl-none',
    isLast &&
      'rounded-tr rounded-br portrait:rounded-tr-none portrait:rounded-bl',
  );

  // `overflow-hidden` keeps the header inside the row the grid gave it: in
  // portrait the panel's implicit row otherwise grows to the tallest thing in
  // the bin, and a header centred in a row taller than the panel is pushed out
  // through the panel's clipped edge. It is also the box BinLabel fits to.
  const accentClasses = cx(
    'flex min-h-14 items-center justify-center overflow-hidden px-2 py-1 text-center',
    promptColorClass,
    missingValue
      ? 'bg-surface-2'
      : 'bg-[color-mix(in_oklab,var(--prompt-color)_var(--blend-percent),var(--background)_calc(100%-var(--blend-percent)))]',
  );

  const bodyClasses = cx(
    'flex min-h-0 flex-col items-center overflow-hidden transition-colors duration-200',
    promptColorClass,
  );

  return (
    <motion.div
      data-testid={`ordinal-bin-${index}`}
      className={panelClasses}
      variants={itemVariants}
      style={
        {
          '--blend-percent': `${100 - blendPercent}%`,
        } as React.CSSProperties
      }
    >
      <div ref={headerRef} className={accentClasses}>
        <BinLabel label={bin.label} variant="header" containerRef={headerRef} />
      </div>
      <NodeList
        id={listId}
        items={sortedNodes}
        nodeSize="sm"
        orientation={isPortrait ? 'horizontal' : 'vertical'}
        className={bodyClasses}
        announcedName={intl.formatMessage(interfaceMessages.ordinalContainer, {
          label: spokenLabel,
        })}
        onDrop={handleDrop}
        accepts={['NODE']}
      />
    </motion.div>
  );
});

OrdinalBinItem.displayName = 'OrdinalBinItem';

export default OrdinalBinItem;
