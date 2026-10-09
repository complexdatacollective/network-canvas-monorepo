'use client';

import { type ReactNode, type Ref, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { default as Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
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
import type { StageProps } from '../../types';

// A heading takes emphasis and nothing else: the title's markdown is inline.
const TITLE_ELEMENTS = ['em', 'strong'];

type FinishSessionText = Pick<
  FinishSessionStage,
  'title' | 'content' | 'finishedNotice'
>;

/** The screen's own words, which the protocol holds as the stage's settings. */
function StageText({ value }: { value: LocalizedString }) {
  return <>{useLocalizedString(value).text}</>;
}

function FinishSessionTitle({
  title,
  headingRef,
}: {
  title: FinishSessionStage['title'];
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const { text } = useLocalizedString(title);
  return (
    <RenderMarkdown
      allowedElements={TITLE_ELEMENTS}
      render={
        <Heading
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          level="h1"
          className="text-center"
        />
      }
    >
      {text}
    </RenderMarkdown>
  );
}

/**
 * Text with no translation at all, which only a protocol still being written
 * can have: Architect previews it before the researcher writes the closing
 * text for a language Network Canvas supplies none for. A protocol cannot be
 * downloaded like that, so no participant meets it.
 */
const isUnwritten = (value: FinishSessionStage['title']) =>
  Object.keys(value).length === 0;

/** The researcher's title and content, in the protocol's language. */
function FinishSessionText({
  stage,
  headingRef,
}: {
  stage: FinishSessionText;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <>
      {!isUnwritten(stage.title) && (
        <FinishSessionTitle title={stage.title} headingRef={headingRef} />
      )}
      {!isUnwritten(stage.content) && (
        <LocalizedMarkdown
          value={stage.content}
          allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
        />
      )}
    </>
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

/**
 * The end of the interview. The participant reads the researcher's closing
 * text, and Finish ends the interview once they confirm. When the host has
 * recorded the finish, the interview shows its completed state.
 */
const FinishSession = ({ stage }: StageProps<'FinishSession'>) => {
  const interviewId = useSelector(getInterviewId);
  const { onFinish } = useContractHandlers();
  const finishConfirmationDescription = useFinishConfirmationDescription();
  const flushSync = useSyncFlush();
  const { complete } = useInterviewCompletion();
  const { confirm } = useDialog();
  const track = useTrack();
  const stageCount = useSelector(getStages).length;

  const finishInterviewConfirmation = async () => {
    if (!interviewId) return;

    const finished = await confirm({
      title: <StageText value={stage.finishConfirmation} />,
      description: finishConfirmationDescription,
      confirmLabel: <StageText value={stage.finishLabel} />,
      describeError: () => <StageText value={stage.finishFailed} />,
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
          throw new Error('The answers could not all be saved');
        }
        await onFinish(
          interviewId,
          { stageId: stage.id, outcome: stage.outcome },
          signal,
        );
        track('interview_finished', { stage_count: stageCount });
      },
    });
    // After the dialog has closed rather than inside its confirm handler, so
    // the dialog is not unmounted from under itself.
    if (finished === true) complete(stage.id);
  };

  return (
    <FinishSessionLayout>
      <FinishSessionText stage={stage} />
      <Button
        color="primary"
        onClick={() => void finishInterviewConfirmation()}
      >
        <StageText value={stage.finishLabel} />
      </Button>
    </FinishSessionLayout>
  );
};

/**
 * A finished interview: the closing text of the finish stage it ended at, a
 * notice that nothing can be changed, and the host's own actions if it offers
 * any. There is no way back into the interview from here.
 *
 * `stage` is absent only for a protocol with no finish stage, which a
 * validated protocol cannot be. The notice is the stage's own wording, so
 * there is then none, and only the host's actions are shown.
 *
 * `notice` is off for a review of an interview with nothing before its finish
 * stage: it shows the finish stage's text read-only, but the interview is not
 * finished, so it does not say it is.
 */
export function CompletedInterview({
  stage,
  focusOnMount,
  notice = true,
  actions,
}: {
  stage: FinishSessionText | undefined;
  focusOnMount: boolean;
  notice?: boolean;
  /** In place of the host's completed-state actions. */
  actions?: readonly CompletedAction[];
}) {
  const { completedActions: hostActions } = useInterviewCompletion();
  const completedActions = actions ?? hostActions;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // Focus goes to the heading when there is one, and to the notice otherwise:
  // no finish stage, or one whose heading is not written yet.
  const hasHeading = stage !== undefined && !isUnwritten(stage.title);

  // Finishing unmounts the Finish button and its dialog together, which would
  // drop focus on the document. The completed state takes it instead, so a
  // screen reader reads the closing text and the notice that follows it.
  useEffect(() => {
    if (!focusOnMount) return;
    (headingRef.current ?? noticeRef.current)?.focus();
  }, [focusOnMount]);

  return (
    <FinishSessionLayout>
      {stage && <FinishSessionText stage={stage} headingRef={headingRef} />}
      {notice && stage && (
        <Alert
          ref={noticeRef}
          tabIndex={hasHeading ? undefined : -1}
          variant="success"
          density="compact"
        >
          <AlertDescription>
            <StageText value={stage.finishedNotice} />
          </AlertDescription>
        </Alert>
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
