import { createElement, useCallback } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
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
const messages = defineMessages({
  thisWillClearYourInterviewScript: {
    id: 'architect.sections.interviewScript.thisWillClearYourInterviewScript',
    defaultMessage: 'This will clear your interview script',
    description: 'The title text in components / sections / InterviewScript.',
  },
  thisWillClearYourInterviewScript81b71: {
    id: 'architect.sections.interviewScript.thisWillClearYourInterviewScript81b71',
    defaultMessage:
      'This will clear your interview script, and delete content you previously entered. Do you want to continue?',
    description:
      'The description text in components / sections / InterviewScript.',
  },
  clearScript: {
    id: 'architect.sections.interviewScript.clearScript',
    defaultMessage: 'Clear script',
    description:
      'The confirmLabel text in components / sections / InterviewScript.',
  },
  interviewerScriptText: {
    id: 'architect.sections.interviewScript.interviewerScriptText',
    defaultMessage: 'Interviewer script text',
    description:
      'The description text in components / sections / InterviewScript.',
  },
  interviewerGuidance: {
    id: 'architect.sections.interviewScript.interviewerGuidance',
    defaultMessage: 'Interviewer guidance',
    description: 'The title text in components / sections / InterviewScript.',
  },
  createNotesOrAGuideFor: {
    id: 'architect.sections.interviewScript.createNotesOrAGuideFor',
    defaultMessage: 'Create notes or a guide for the interviewer.',
    description:
      'The description text in components / sections / InterviewScript.',
  },
  enterTextForTheInterviewerHere: {
    id: 'architect.sections.interviewScript.enterTextForTheInterviewerHere',
    defaultMessage: 'Enter text for the interviewer here...',
    description:
      'The placeholder text in components / sections / InterviewScript.',
  },
});

const InterviewerScript = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
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
          title: createElement(AppMessage, {
            message: messages.thisWillClearYourInterviewScript,
          }),
          description: createElement(AppMessage, {
            message: messages.thisWillClearYourInterviewScript81b71,
          }),
          confirmLabel: createElement(AppMessage, {
            message: messages.clearScript,
          }),
          cancelLabel: createElement(AppMessage, {
            message: commonMessages.cancel,
          }),
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
        description={intl.formatMessage(messages.interviewerScriptText)}
      />
      <Section
        title={intl.formatMessage(messages.interviewerGuidance)}
        description={intl.formatMessage(messages.createNotesOrAGuideFor)}
        toggleable
        defaultOpen={!!currentValue}
        onOpenChange={handleToggleChange}
      >
        <ArchitectField
          name="interviewScript"
          component={RichText}
          initialValue={initialValue}
          label={intl.formatMessage(messages.interviewerScriptText)}
          placeholder={intl.formatMessage(
            messages.enterTextForTheInterviewerHere,
          )}
        />
      </Section>
    </>
  );
};
export default InterviewerScript;
