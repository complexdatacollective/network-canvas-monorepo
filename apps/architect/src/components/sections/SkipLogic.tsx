import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import SkipLogicFields from '~/components/sections/fields/SkipLogicFields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
const SkipLogicSection = (props: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const getFormValue = formValueSelector('edit-stage');
  const hasSkipLogic = useSelector((state: RootState) =>
    getFormValue(state, 'skipLogic'),
  );
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
        dispatch(change('edit-stage', 'skipLogic', null));
        return true;
      }
      return false;
    },
    [confirm, dispatch, hasSkipLogic],
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
      startExpanded={!!hasSkipLogic}
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
