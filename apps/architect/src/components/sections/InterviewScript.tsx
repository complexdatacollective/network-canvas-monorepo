import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, Field, formValueSelector } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { Section } from '~/components/EditorLayout';
import { Field as RichText } from '~/components/Form/Fields/RichText';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getFieldId } from '~/utils/issues';

const InterviewerScript = (_props: StageEditorSectionProps) => {
  const getFormValue = formValueSelector('edit-stage');
  const currentValue = useSelector((state: RootState) =>
    getFormValue(state, 'interviewScript'),
  );
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();

  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!currentValue || newState) {
        return true;
      }

      const confirmed = await confirm({
        title: 'This will clear your interview script',
        description:
          'This will clear your interview script, and delete content you previously entered. Do you want to continue?',
        confirmLabel: 'Clear script',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });

      if (confirmed) {
        dispatch(change('edit-stage', 'interviewScript', null));
        return true;
      }

      return false;
    },
    [confirm, dispatch, currentValue],
  );

  return (
    <Section
      id={getFieldId('interviewScript')}
      title="Interviewer Script"
      summary={
        <p>Use this section to create notes or a guide for the interviewer.</p>
      }
      toggleable
      startExpanded={!!currentValue}
      handleToggleChange={handleToggleChange}
    >
      <Field
        name="interviewScript"
        component={RichText}
        placeholder="Enter text for the interviewer here."
      />
    </Section>
  );
};

export default InterviewerScript;
