import type { ReactNode } from 'react';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import type { StageEditorController } from '../../controller.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';

export type NameGeneratorFrameProps = Readonly<{
  controller: StageEditorController;
  /** Where this interface is documented. */
  documentationUrl: string;
  /**
   * The interface's own sections, in the order a researcher meets them:
   * what the stage works on, what it asks, and how it behaves.
   */
  children: ReactNode;
}>;

/**
 * Everything the three name generators have in common besides their sections.
 *
 * The parts every stage editor carries — the shell, the stage's own heading,
 * skip logic and the interviewer's notes — plus the ONE ordering rule that is
 * the same for every interface: identity first, then what the interface itself
 * is about, then whether the stage runs at all, then the notes the interviewer
 * reads. An editor composes its own sections into the middle and states
 * nothing about the ends.
 *
 * It lives beside the name generators rather than above them because they are
 * the first family to land. The moment a second family needs it, it moves up —
 * there is nothing about it that is specific to naming people.
 */
export default function NameGeneratorFrame({
  controller,
  documentationUrl,
  children,
}: NameGeneratorFrameProps) {
  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <div className="flex justify-end">
          {/*
            Deliberately not disabled while the session is read-only. Every
            control above it already is, and a spectator who presses this is
            asking a question — the shell answers it with the reason the stage
            cannot be saved and what to do about it, which a disabled button
            says to nobody. It is also the only honest state: access can be
            taken away between the render that read it and the submit itself.
          */}
          <SubmitButton form={formId}>Save stage</SubmitButton>
        </div>
      )}
    >
      <StageHeading documentationUrl={documentationUrl} />
      {children}
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}

/**
 * The stage's name, with where it sits in the interview.
 *
 * A component of its own because the position is read from the protocol the
 * editor is already holding rather than passed in by a host: the interview's
 * stage order is protocol content, and an editor that took it as a prop could
 * be told something the protocol disagrees with. A stage the order does not
 * contain yet — one being created — simply has no position to state.
 */
function StageHeading({
  documentationUrl,
}: Readonly<{ documentationUrl: string }>) {
  const { identity, protocolContext } = useStageEditorForm();
  const index = protocolContext.orderedStages.findIndex(
    (stage) => stage.id === identity.id,
  );

  return (
    <StageNameSection
      documentationUrl={documentationUrl}
      {...(index === -1
        ? {}
        : {
            position: {
              index: index + 1,
              total: protocolContext.orderedStages.length,
            },
          })}
    />
  );
}
