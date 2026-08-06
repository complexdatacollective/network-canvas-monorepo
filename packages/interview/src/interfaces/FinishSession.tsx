'use client';

import { useSelector } from 'react-redux';

import { default as Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import {
  useContractHandlers,
  useFinishConfirmationDescription,
} from '../contract/context';
import { getInterviewId } from '../selectors/session';
import { useSyncFlush } from '../store/SyncFlushContext';

const FinishSession = () => {
  const interviewId = useSelector(getInterviewId);
  const { onFinish } = useContractHandlers();
  const finishConfirmationDescription = useFinishConfirmationDescription();
  const flushSync = useSyncFlush();
  const { confirm } = useDialog();

  const finishInterviewConfirmation = async () => {
    if (!interviewId) return;

    await confirm({
      title: 'Are you sure you want to finish the interview?',
      description: finishConfirmationDescription,
      confirmLabel: 'Finish Interview',
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
        <Heading level="h1">Finish Interview</Heading>
        <Paragraph>
          You have reached the end of the interview. If you are satisfied with
          the information you have entered, you may finish the interview now.
        </Paragraph>
        <Button
          color="primary"
          onClick={() => void finishInterviewConfirmation()}
        >
          Finish
        </Button>
      </Surface>
    </div>
  );
};

export default FinishSession;
