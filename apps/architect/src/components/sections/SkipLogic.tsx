import { createElement, useCallback } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import SkipLogicFields from '~/components/sections/fields/SkipLogicFields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';
const messages = defineMessages({
  thisWillClearYourSkipLogic: {
    id: 'architect.sections.skipLogic.thisWillClearYourSkipLogic',
    defaultMessage: 'This will clear your skip logic',
    description: 'The title text in components / sections / SkipLogic.',
  },
  thisWillClearYourSkipLogic54d49: {
    id: 'architect.sections.skipLogic.thisWillClearYourSkipLogic54d49',
    defaultMessage:
      'This will clear your skip logic, and delete any rules you have created. Do you want to continue?',
    description: 'The description text in components / sections / SkipLogic.',
  },
  clearSkipLogic: {
    id: 'architect.sections.skipLogic.clearSkipLogic',
    defaultMessage: 'Clear skip logic',
    description: 'The confirmLabel text in components / sections / SkipLogic.',
  },
  skipLogic: {
    id: 'architect.sections.skipLogic.skipLogic',
    defaultMessage: 'Skip logic',
    description: 'The title text in components / sections / SkipLogic.',
  },
  determineWhetherThisStageIsShown: {
    id: 'architect.sections.skipLogic.determineWhetherThisStageIsShown',
    defaultMessage:
      'Determine whether this stage is shown and where the interview continues when it is skipped.',
    description: 'The description text in components / sections / SkipLogic.',
  },
});

const SkipLogicSection = (props: StageEditorSectionProps) => {
  const intl = useAppIntl();
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
          title: createElement(AppMessage, {
            message: messages.thisWillClearYourSkipLogic,
          }),
          description: createElement(AppMessage, {
            message: messages.thisWillClearYourSkipLogic54d49,
          }),
          confirmLabel: createElement(AppMessage, {
            message: messages.clearSkipLogic,
          }),
          cancelLabel: createElement(AppMessage, {
            message: commonMessages.cancel,
          }),
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
      title={intl.formatMessage(messages.skipLogic)}
      description={intl.formatMessage(
        messages.determineWhetherThisStageIsShown,
      )}
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
