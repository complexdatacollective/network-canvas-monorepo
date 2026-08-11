import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import SkipLogicFields from '~/components/sections/fields/SkipLogicFields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
} from '~/components/StageEditor/stageFormHooks';

const SkipLogicSection = (props: StageEditorSectionProps) => {
  const setStageValue = useSetStageValue();
  const { confirm } = useDialog();
  // `SkipLogicFields` registers three separate leaf fields
  // (`skipLogic.action`/`.filter`/`.destination`) — `skipLogic` itself is
  // never a registered field, and the store has no hierarchical relationship
  // between a path and its sub-paths. Reading (or writing) the parent path
  // would fall through to the stale committed value once the leaves are
  // unregistered, resurrecting "cleared" rules the next time the section
  // opens — so presence and clearing both go through the real leaves.
  const action = useStageFormValue('skipLogic.action');
  const filter = useStageFormValue('skipLogic.filter');
  const destination = useStageFormValue('skipLogic.destination');
  const hasSkipLogic = action != null || filter != null || destination != null;
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      // When turning skip logic on
      if (!hasSkipLogic || newState) {
        return true;
      }
      // When turning skip logic off, confirm that the user wants to clear the skip logic
      const confirmed = await confirm({
        title: 'This will clear your skip logic',
        description:
          'This will clear your skip logic, and delete any rules you have created. Do you want to continue?',
        confirmLabel: 'Clear skip logic',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });
      if (confirmed) {
        setStageValue('skipLogic.action', undefined);
        setStageValue('skipLogic.filter', undefined);
        setStageValue('skipLogic.destination', undefined);
        return true;
      }
      return false;
    },
    [confirm, setStageValue, hasSkipLogic],
  );
  return (
    <Section
      toggleable
      title="Skip Logic"
      summary={
        <Paragraph>
          Use skip logic to determine if this stage should be shown and where
          the interview continues when it is skipped.
        </Paragraph>
      }
      startExpanded={hasSkipLogic}
      handleToggleChange={handleToggleChange}
    >
      <SkipLogicFields
        stagePath={props.stagePath}
        stagePosition={props.stagePosition}
      />
    </Section>
  );
};
export default SkipLogicSection;
