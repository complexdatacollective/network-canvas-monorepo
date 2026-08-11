import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { getFieldId } from '~/utils/issues';

const InterviewerScript = (_props: StageEditorSectionProps) => {
  const currentValue = useStageFormValue('interviewScript');
  const initialValue = useStageInitialValue<string>('interviewScript');
  const setStageValue = useSetStageValue();
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
        setStageValue('interviewScript', undefined);
        return true;
      }
      return false;
    },
    [confirm, setStageValue, currentValue],
  );
  return (
    <Section
      id={getFieldId('interviewScript')}
      title="Interviewer Script"
      summary={
        <Paragraph>
          Use this section to create notes or a guide for the interviewer.
        </Paragraph>
      }
      toggleable
      startExpanded={!!currentValue}
      handleToggleChange={handleToggleChange}
    >
      <ArchitectField
        name="interviewScript"
        component={RichText}
        initialValue={initialValue}
        label="Interviewer script text"
        labelHidden
        placeholder="Enter text for the interviewer here."
      />
    </Section>
  );
};
export default InterviewerScript;
