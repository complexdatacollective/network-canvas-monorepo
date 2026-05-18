'use client';

import { find } from 'es-toolkit/compat';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  type EntityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import Node from '~/components/ConnectedNode';
import useBeforeNext from '~/hooks/useBeforeNext';
import useReadyForNextStage from '~/hooks/useReadyForNextStage';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNetworkEdgesForType,
  getNetworkNodes,
  makeGetEdgeColor,
} from '~/selectors/session';
import { updateEdge } from '~/store/modules/session';
import { useAppDispatch } from '~/store/store';
import type { StageProps } from '~/types';
import { edgeColorMap } from '~/utils/edgeColorMap';

import IntroPanel from '../SlidesForm/IntroPanel';
import SlidesForm from '../SlidesForm/SlidesForm';

function EdgeHeader({ item }: { item: NcEdge }) {
  const getEdgeColor = useMemo(() => makeGetEdgeColor(), []);
  const edgeColor = useStageSelector(getEdgeColor);
  const nodes = useStageSelector(getNetworkNodes);

  const fromNode = find(nodes, [entityPrimaryKeyProperty, item.from]);
  const toNode = find(nodes, [entityPrimaryKeyProperty, item.to]);

  return (
    <div className="flex shrink-0 items-center">
      {fromNode && (
        <Node
          nodeId={fromNode[entityPrimaryKeyProperty]}
          type={fromNode.type}
          className="rounded-full"
        />
      )}
      <div
        className={cx(
          edgeColorMap[edgeColor],
          'mx-[-1.5rem] h-2 w-32 bg-(--edge-color)',
        )}
      />
      {toNode && (
        <Node
          nodeId={toNode[entityPrimaryKeyProperty]}
          type={toNode.type}
          className="rounded-full"
        />
      )}
    </div>
  );
}

type Mode = 'intro' | 'form';

const AlterEdgeForm = (props: StageProps<'AlterEdgeForm'>) => {
  const { stage } = props;
  const items = useStageSelector(getNetworkEdgesForType);
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<Mode>('intro');
  const [isFormReady, setIsFormReady] = useState(false);

  const handleUpdateItem = useCallback(
    (id: string, newAttributeData: NcEdge[EntityAttributesProperty]) => {
      void dispatch(
        updateEdge({
          edgeId: id,
          newAttributeData,
        }),
      );
    },
    [dispatch],
  );

  const renderHeader = useCallback((item: NcNode | NcEdge) => {
    if (!('from' in item)) return null;
    return <EdgeHeader item={item} />;
  }, []);

  const { moveForward } = props.getNavigationHelpers();

  useBeforeNext((direction) => {
    if (mode === 'intro' && direction === 'forwards') {
      setMode('form');
      return false;
    }
    return true;
  });

  const { updateReady } = useReadyForNextStage();
  useEffect(() => {
    if (mode === 'intro') updateReady(true);
  }, [mode, updateReady]);

  const shouldSkipEmpty = mode === 'form' && items.length === 0;
  useEffect(() => {
    if (shouldSkipEmpty) moveForward();
  }, [shouldSkipEmpty, moveForward]);

  if (shouldSkipEmpty) return null;

  // See AlterForm for the per-mode layout-class rationale.
  return (
    <AnimatePresence mode="wait" initial={false}>
      {mode === 'intro' ? (
        <motion.div
          key="intro"
          className="interface"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-stage-section="intro"
          data-stage-ready="true"
        >
          <IntroPanel
            title={stage.introductionPanel.title}
            text={stage.introductionPanel.text}
          />
        </motion.div>
      ) : (
        <motion.div
          key="form"
          className="flex w-full flex-auto flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => setIsFormReady(true)}
          data-stage-section="form"
          data-stage-ready={isFormReady ? 'true' : undefined}
        >
          <SlidesForm
            updateItem={handleUpdateItem}
            items={items}
            subject={stage.subject}
            form={stage.form}
            onNavigateBack={() => setMode('intro')}
            renderHeader={renderHeader}
            form_kind="alter_edge"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AlterEdgeForm;
