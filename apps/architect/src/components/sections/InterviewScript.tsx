import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

const InterviewerScript = (_props: StageEditorSectionProps) => {
  const currentValue = useStageFormValue('interviewScript');
  const initialValue = useStageInitialValue<string>('interviewScript');
  const { confirm } = useDialog();
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!currentValue || newState) {
        return true;
      }
      return (
        (await confirm({
          title: 'This will clear your interview script',
          description:
            'This will clear your interview script, and delete content you previously entered. Do you want to continue?',
          confirmLabel: 'Clear script',
          cancelLabel: 'Cancel',
          intent: 'warning',
          onConfirm: () => {},
        })) === true
      );
    },
    [confirm, currentValue],
  );
  return (
    <>
      <IssueAnchor
        fieldName="interviewScript"
        description="Interviewer script text"
      />
      <Section
        title="Interviewer guidance"
        description="Create notes or a guide for the interviewer."
        toggleable
        defaultOpen={!!currentValue}
        onOpenChange={handleToggleChange}
      >
        <ArchitectField
          name="interviewScript"
          component={RichText}
          initialValue={initialValue}
          label="Interviewer script text"
          placeholder="Enter text for the interviewer here..."
        />
      </Section>
    </>
  );
};
export default InterviewerScript;
