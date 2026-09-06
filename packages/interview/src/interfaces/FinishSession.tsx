'use client';

import { useSelector } from 'react-redux';

import { AppMessage } from '@codaco/app-i18n/react';
import { default as Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import {
  useContractHandlers,
  useFinishConfirmationDescription,
} from '../contract/context';
import { runtimeMessages } from '../i18n/runtimeMessages';
import { getInterviewId } from '../selectors/session';
import { useSyncFlush } from '../store/SyncFlushContext';
import { interfaceMessages } from './messages';

const describeFinishError = () => (
  <AppMessage message={runtimeMessages.finishFailed} />
);

const FinishSession = () => {
  const interviewId = useSelector(getInterviewId);
  const { onFinish } = useContractHandlers();
  const finishConfirmationDescription = useFinishConfirmationDescription();
  const flushSync = useSyncFlush();
  const { confirm } = useDialog();

  const finishInterviewConfirmation = async () => {
    if (!interviewId) return;

    await confirm({
      title: <AppMessage message={interfaceMessages.finishConfirmation} />,
      description: finishConfirmationDescription,
      confirmLabel: <AppMessage message={interfaceMessages.finishInterview} />,
      describeError: describeFinishError,
      onConfirm: async (signal: AbortSignal) => {
        // Order matters: autosave is debounced, so the participant's most
        // recent answers may still be waiting to be written. Hosts can freeze
        // an interview the moment it is finished and reject anything that
        // arrives afterwards, so the pending write has to land first.
        await flushSync();
        await onFinish(interviewId, signal);
      },
    });
  };

  return (
    <div className="interface">
      <Surface className="w-full max-w-2xl" noContainer>
        <Heading level="h1">
          <AppMessage message={interfaceMessages.finishInterview} />
        </Heading>
        <Paragraph>
          <AppMessage message={interfaceMessages.finishDescription} />
        </Paragraph>
        <Button
          color="primary"
          onClick={() => void finishInterviewConfirmation()}
        >
          <AppMessage message={interfaceMessages.finish} />
        </Button>
      </Surface>
    </div>
  );
};

export default FinishSession;
