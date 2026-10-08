'use client';

import { useSelector } from 'react-redux';

import { AppMessage } from '@codaco/app-i18n/react';
import { default as Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useTrack } from '../analytics/useTrack';
import {
  useContractHandlers,
  useFinishConfirmationDescription,
} from '../contract/context';
import { runtimeMessages } from '../i18n/runtimeMessages';
import { getInterviewId } from '../selectors/session';
import { getProtocolStages } from '../store/modules/protocol';
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
  const track = useTrack();
  const stageCount = useSelector(getProtocolStages).length;

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
        // arrives afterwards, so the pending write has to land first, and an
        // answer that could not be saved keeps the interview from finishing.
        //
        // The confirmation cannot be cancelled while this runs: a host's
        // finish is a server request or a storage write that completes
        // whatever the signal says. The signal still aborts if the
        // confirmation is torn down (the Shell unmounting), and then the
        // interview is not handed over.
        const stored = await flushSync();
        if (signal.aborted) return;
        if (!stored) {
          throw new Error('An answer still being saved was refused');
        }
        await onFinish(interviewId, signal);
        track('interview_finished', { stage_count: stageCount });
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
