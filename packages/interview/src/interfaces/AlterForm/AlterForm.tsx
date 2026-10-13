'use client';

import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

import {
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import Node from '../../components/ConnectedNode';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import { writeSubmissionResult } from '../../forms/writeSubmissionResult';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useStageSelector } from '../../hooks/useStageSelector';
import { getNetworkNodesForType } from '../../selectors/session';
import type { AttributePatch } from '../../store/entityAttributePatch';
import { updateNode } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import SlidesForm from '../SlidesForm/SlidesForm';

const AlterForm = (props: StageProps<'AlterForm'>) => {
  const { stage } = props;
  const items = useStageSelector(getNetworkNodesForType);
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();
  const [isFormReady, setIsFormReady] = useState(false);

  const handleUpdateItem = useCallback(
    async (id: string, attributePatch: AttributePatch) =>
      writeSubmissionResult(
        await dispatch(
          updateNode({
            nodeId: id,
            attributePatch,
            currentStep,
          }),
        ),
      ),
    [dispatch, currentStep],
  );

  const renderHeader = useCallback((item: NcNode | NcEdge) => {
    if ('from' in item) return null;
    return (
      <Node
        nodeId={item[entityPrimaryKeyProperty]}
        type={item.type}
        className="shrink-0"
      />
    );
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
        form_kind="alter"
      />
    </motion.div>
  );
};

export default AlterForm;
