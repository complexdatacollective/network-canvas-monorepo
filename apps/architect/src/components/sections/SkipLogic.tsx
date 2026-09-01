import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import SkipLogicFields from '~/components/sections/fields/SkipLogicFields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';

const SkipLogicSection = (props: StageEditorSectionProps) => {
  const { confirm } = useDialog();
  // `SkipLogicFields` registers three separate leaf fields
  // (`skipLogic.action`/`.filter`/`.destination`) — `skipLogic` itself is
  // never a registered field, so the initial open state is derived from the
  // leaf fields the section actually owns.
  const action = useStageFormValue('skipLogic.action');
  const filter = useStageFormValue('skipLogic.filter');
  const destination = useStageFormValue('skipLogic.destination');
  const hasSkipLogic = action != null || filter != null || destination != null;
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!hasSkipLogic || newState) {
        return true;
      }
      return (
        (await confirm({
          title: 'This will clear your skip logic',
          description:
            'This will clear your skip logic, and delete any rules you have created. Do you want to continue?',
          confirmLabel: 'Clear skip logic',
          cancelLabel: 'Cancel',
          intent: 'warning',
          onConfirm: () => {},
        })) === true
      );
    },
    [confirm, hasSkipLogic],
  );
  return (
    <Section
      toggleable
      title="Skip logic"
      description="Determine whether this stage is shown and where the interview continues when it is skipped."
      defaultOpen={hasSkipLogic}
      onOpenChange={handleToggleChange}
    >
      <SkipLogicFields
        stagePath={props.stagePath}
        stagePosition={props.stagePosition}
      />
    </Section>
  );
};
export default SkipLogicSection;
