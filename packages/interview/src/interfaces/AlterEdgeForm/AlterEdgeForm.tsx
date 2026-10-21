'use client';

import { find } from 'es-toolkit/compat';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import Node from '../../components/ConnectedNode';
import { writeSubmissionResult } from '../../forms/writeSubmissionResult';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
  getNetworkEdgesForType,
  getNetworkNodes,
  makeGetEdgeColor,
} from '../../selectors/session';
import type { AttributePatch } from '../../store/entityAttributePatch';
import { updateEdge } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import { edgeColorMap } from '../../utils/edgeColorMap';
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
        />
      )}
      <div
        className={cx(
          edgeColorMap[edgeColor],
          'mx-[-1.5rem] h-2 w-32 bg-(--edge-color)',
        )}
      />
      {toNode && (
        <Node nodeId={toNode[entityPrimaryKeyProperty]} type={toNode.type} />
      )}
    </div>
  );
}

const AlterEdgeForm = (props: StageProps<'AlterEdgeForm'>) => {
  const { stage } = props;
  const items = useStageSelector(getNetworkEdgesForType);
  const dispatch = useAppDispatch();
  const [isFormReady, setIsFormReady] = useState(false);

  const handleUpdateItem = useCallback(
    async (id: string, attributePatch: AttributePatch) =>
      writeSubmissionResult(
        await dispatch(
          updateEdge({
            edgeId: id,
            attributePatch,
          }),
        ),
      ),
    [dispatch],
  );

  const renderHeader = useCallback((item: NcNode | NcEdge) => {
    if (!('from' in item)) return null;
    return <EdgeHeader item={item} />;
  }, []);

  const { moveForward } = props.getNavigationHelpers();

  // Navigation passes this stage while it has nothing to ask about (see
  // buildStageAvailabilityMap). A participant can still open it from the
  // stages menu, and then it shows nothing and next leaves it: SlidesForm lets
  // an empty list through, and with no form mounted there is nothing to check.
  const isEmpty = items.length === 0;
  const { updateReady } = useReadyForNextStage();
  useEffect(() => {
    if (isEmpty) updateReady(true);
  }, [isEmpty, updateReady]);

  if (isEmpty) return <div className="interface" />;

  // SlidesForm's root `flex-auto` needs a `flex flex-col` parent with real
  // height to propagate a height down to its ScrollArea; otherwise the scroll
  // viewport collapses to zero. `data-stage-ready` marks the end of the
  // entrance fade, so the first field is settled before it is interacted with.
  return (
    <motion.div
      className="flex w-full flex-auto flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
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
        moveForward={moveForward}
        renderHeader={renderHeader}
        form_kind="alter_edge"
      />
    </motion.div>
  );
};

export default AlterEdgeForm;
