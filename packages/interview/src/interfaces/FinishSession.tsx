'use client';

import { useSelector } from 'react-redux';

import { default as Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useContractHandlers } from '../contract/context';
import { getInterviewId } from '../selectors/session';

const FinishSession = () => {
  const interviewId = useSelector(getInterviewId);
  const { onFinish } = useContractHandlers();
  const { confirm } = useDialog();

  const finishInterviewConfirmation = async () => {
    if (!interviewId) return;

    await confirm({
      title: 'Are you sure you want to finish the interview?',
      description:
        'Your responses cannot be changed after you finish the interview.',
      confirmLabel: 'Finish Interview',
      onConfirm: async (signal: AbortSignal) => {
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
