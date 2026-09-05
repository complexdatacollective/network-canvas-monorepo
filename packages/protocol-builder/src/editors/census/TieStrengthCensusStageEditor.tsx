import type { StageEditorController } from '../../controller.ts';
import StageEditorShell, {
  type StageEditorShellProps,
} from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../../sections/IntroductionSection.tsx';
import TieStrengthCensusPromptsSection from '../../sections/prompts/TieStrengthCensusPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';

const DOCUMENTATION = interfaceDocumentationUrl('tie-strength-census');

export type TieStrengthCensusStageEditorProps = Readonly<{
  controller: StageEditorController;
  /** The host's action chrome, passed straight through to the shell. */
  actions?: StageEditorShellProps['actions'];
}>;

/**
 * The editor for a Tie-Strength Census stage.
 *
 * The same composition as the Dyad Census, and for the same reason: both walk
 * the participant through every pair in the network, so both require the
 * screen that explains what is about to happen. They differ only in what an
 * answer records — a connection, or a connection and how strong it is.
 */
export function TieStrengthCensusStageEditor({
  controller,
  actions,
}: TieStrengthCensusStageEditorProps) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageNameSection documentationUrl={DOCUMENTATION} />
      <SubjectSection entity="node" filter />
      <IntroductionSection />
      <TieStrengthCensusPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
