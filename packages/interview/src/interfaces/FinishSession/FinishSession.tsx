'use client';

import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import { default as Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ALLOWED_MARKDOWN_SECTION_TAGS } from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Spinner from '@codaco/fresco-ui/Spinner';
import type {
  FinishSessionStage,
  LocalizedString,
} from '@codaco/protocol-validation';

import { useTrack } from '../../analytics/useTrack';
import { useInterviewCompletion } from '../../contexts/InterviewCompletionContext';
import {
  useContractHandlers,
  useFinishConfirmationDescription,
} from '../../contract/context';
import type { CompletedAction } from '../../contract/types';
import { LocalizedMarkdown } from '../../localization/LocalizedMarkdown';
import { useLocalizedString } from '../../localization/ProtocolLocalizationProvider';
import { getInterviewId } from '../../selectors/session';
import { getStages } from '../../store/modules/protocol';
import { useSyncFlush } from '../../store/SyncFlushContext';
import { useInterviewToast } from '../../toast/useInterviewToast';
import type { StageProps } from '../../types';

type FinishSessionText = Pick<
  FinishSessionStage,
  'mode' | 'content' | 'finishedContent'
>;

/** The screen's own words, which the protocol holds as the stage's settings. */
function StageText({ value }: { value: LocalizedString }) {
  return <>{useLocalizedString(value).text}</>;
}

/**
 * Text with no translation at all, which only a protocol still being written
 * can have: Architect previews it before the researcher writes the text for a
 * language Network Canvas supplies none for. A protocol cannot be downloaded
 * like that, so no participant meets it.
 */
const isUnwritten = (value: LocalizedString) => Object.keys(value).length === 0;

/**
 * One of the screen's texts, in the protocol's language. Its heading is part
 * of the text, written as markdown.
 */
function ScreenText({
  value,
  textRef,
}: {
  value: LocalizedString;
  textRef?: Ref<HTMLDivElement>;
}) {
  if (isUnwritten(value)) return null;
  return (
    <div
      ref={textRef}
      tabIndex={textRef ? -1 : undefined}
      className="focusable"
    >
      <LocalizedMarkdown
        value={value}
        allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
      />
    </div>
  );
}

function FinishSessionLayout({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="m-0 size-full">
      <div className="interface mx-auto flex min-h-full max-w-[80ch] flex-col justify-center select-text">
        <Surface className="grow-0" noContainer spacing="lg" shadow="lg">
          {children}
        </Surface>
      </div>
    </ScrollArea>
  );
}

type FinishState = 'idle' | 'finishing';

/**
 * The end of the interview, in one of two modes.
 *
 * In confirmation mode the participant reads the closing screen, and its
 * Finish button ends the interview once they confirm. In automatic mode the
 * interview ends as soon as the stage is shown, with no closing screen,
 * button or question. Either way, once the host has recorded the finish the
 * interview shows its finished screen (`CompletedInterview`, rendered by the
 * Shell). If the finish fails the participant is told so in a toast, and can
 * try again: from the closing screen in confirmation mode, or with the Finish
 * button that then appears in automatic mode.
 *
 * The interview never moves forward from a finish stage, and an automatic one
 * cannot be left backwards either (see `useInterviewNavigation`).
 */
const FinishSession = ({ stage }: StageProps<'FinishSession'>) => {
  const interviewId = useSelector(getInterviewId);
  const { onFinish } = useContractHandlers();
  const finishConfirmationDescription = useFinishConfirmationDescription();
  const flushSync = useSyncFlush();
  const { complete } = useInterviewCompletion();
  const { confirm } = useDialog();
  const { showToast } = useInterviewToast();
  const track = useTrack();
  const stageCount = useSelector(getStages).length;
  const [state, setState] = useState<FinishState>('idle');
  // In automatic mode the Finish button appears only once a finish has failed.
  const [failed, setFailed] = useState(false);

  // Aborted when the stage is torn down (the Shell unmounting), so an
  // interview being left is not handed over afterwards.
  const unmountSignal = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    unmountSignal.current = controller;
    return () => controller.abort();
  }, []);

  const finishInterview = useCallback(
    async (signal: AbortSignal) => {
      if (!interviewId) throw new Error('There is no interview to finish');
      // Order matters: autosave is debounced, so the participant's most
      // recent answers may still be waiting to be written. Hosts can freeze
      // an interview the moment it is finished and reject anything that
      // arrives afterwards, so the pending write has to land first, and an
      // answer that could not be saved keeps the interview from finishing.
      //
      // A host's finish is a server request or a storage write that completes
      // whatever the signal says. The signal still aborts if the stage is torn
      // down, and then the interview is not handed over.
      const stored = await flushSync();
      if (signal.aborted) return false;
      if (!stored) throw new Error('The answers could not all be saved');
      await onFinish(
        interviewId,
        { stageId: stage.id, outcome: stage.outcome },
        signal,
      );
      track('interview_finished', { stage_count: stageCount });
      return true;
    },
    [
      flushSync,
      interviewId,
      onFinish,
      stage.id,
      stage.outcome,
      stageCount,
      track,
    ],
  );

  const reportFailure = useCallback(() => {
    setFailed(true);
    showToast({
      description: <StageText value={stage.finishFailed} />,
      variant: 'destructive',
      anchor: 'forward',
      timeout: 8000,
    });
  }, [showToast, stage.finishFailed]);

  // Finishing without asking: automatic mode, and the retry after it failed.
  const finishNow = useCallback(async () => {
    const signal = unmountSignal.current?.signal;
    if (!signal || signal.aborted) return;
    setState('finishing');
    try {
      if (await finishInterview(signal)) complete(stage.id);
    } catch {
      if (!signal.aborted) reportFailure();
    } finally {
      if (!signal.aborted) setState('idle');
    }
  }, [complete, finishInterview, reportFailure, stage.id]);

  const finishWithConfirmation = async () => {
    // Written by the confirm handler, which runs before `confirm` resolves.
    const attempt: { outcome: 'finished' | 'failed' | 'abandoned' } = {
      outcome: 'abandoned',
    };
    const finished = await confirm({
      title: <StageText value={stage.finishConfirmation} />,
      description: finishConfirmationDescription,
      confirmLabel: <StageText value={stage.finishLabel} />,
      onConfirm: async (signal: AbortSignal) => {
        // A failure closes the question and returns to the closing screen,
        // where the toast says what happened, rather than keeping the
        // question open over it.
        try {
          if (await finishInterview(signal)) attempt.outcome = 'finished';
        } catch {
          attempt.outcome = 'failed';
        }
      },
    });
    // After the dialog has closed rather than inside its confirm handler, so
    // the dialog is not unmounted from under itself.
    if (finished !== true) return;
    if (attempt.outcome === 'failed') reportFailure();
    if (attempt.outcome === 'finished') complete(stage.id);
  };

  // An automatic finish stage ends the interview as soon as it is shown. The
  // ref holds the signal of the attempt under way, so a re-run of this effect
  // does not finish twice. Strict Mode's replay in development aborts that
  // signal, and its attempt then reports nothing, so an aborted attempt is
  // started again.
  const automaticAttempt = useRef<AbortSignal | null>(null);
  useEffect(() => {
    if (stage.mode !== 'automatic') return;
    if (automaticAttempt.current && !automaticAttempt.current.aborted) return;
    automaticAttempt.current = unmountSignal.current?.signal ?? null;
    void finishNow();
  }, [finishNow, stage.mode]);

  if (stage.mode === 'automatic') {
    if (!failed) {
      return (
        <div className="flex size-full items-center justify-center">
          <Spinner />
        </div>
      );
    }
    return (
      <FinishSessionLayout>
        <Button
          color="primary"
          disabled={state === 'finishing'}
          onClick={() => void finishNow()}
        >
          <StageText value={stage.finishLabel} />
        </Button>
      </FinishSessionLayout>
    );
  }

  return (
    <FinishSessionLayout>
      <ScreenText value={stage.content} />
      <Button
        color="primary"
        disabled={state === 'finishing'}
        onClick={() => void finishWithConfirmation()}
      >
        <StageText value={stage.finishLabel} />
      </Button>
    </FinishSessionLayout>
  );
};

/**
 * A finished interview: the finished screen of the finish stage it ended at,
 * and the host's own actions if it offers any. There is no way back into the
 * interview from here.
 *
 * `stage` is absent only for a protocol with no finish stage, which a
 * validated protocol cannot be; then only the host's actions are shown.
 *
 * `finished` is off for a review of an interview with nothing before its
 * finish stage: it shows the text that stage opens with read-only, without
 * the Finish button, because the interview is not finished. An automatic
 * finish stage has no closing text, so it shows its finished text.
 */
export function CompletedInterview({
  stage,
  focusOnMount,
  finished = true,
  actions,
}: {
  stage: FinishSessionText | undefined;
  focusOnMount: boolean;
  finished?: boolean;
  /** In place of the host's completed-state actions. */
  actions?: readonly CompletedAction[];
}) {
  const { completedActions: hostActions } = useInterviewCompletion();
  const completedActions = actions ?? hostActions;
  const textRef = useRef<HTMLDivElement>(null);

  // Finishing unmounts the Finish button and its dialog together, which would
  // drop focus on the document. The finished screen takes it instead, so a
  // screen reader reads it.
  useEffect(() => {
    if (!focusOnMount) return;
    textRef.current?.focus();
  }, [focusOnMount]);

  return (
    <FinishSessionLayout>
      {stage && (
        <ScreenText
          value={
            finished || stage.mode === 'automatic'
              ? stage.finishedContent
              : stage.content
          }
          textRef={textRef}
        />
      )}
      {completedActions.map((action, index) => (
        <Button
          // Actions are fixed for the life of the completed state.
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          color={index === 0 ? 'primary' : 'default'}
          onClick={action.onAction}
        >
          {action.label}
        </Button>
      ))}
    </FinishSessionLayout>
  );
}

export default FinishSession;
