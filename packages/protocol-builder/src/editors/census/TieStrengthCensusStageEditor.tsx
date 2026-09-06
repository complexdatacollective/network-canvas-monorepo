import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../../sections/IntroductionSection.tsx';
import TieStrengthCensusPromptsSection from '../../sections/prompts/TieStrengthCensusPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageHeading from '../../sections/StageHeading.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION = interfaceDocumentationUrl('tie-strength-census');

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
}: StageEditorProps<'TieStrengthCensus'>) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageHeading documentationUrl={DOCUMENTATION} />
      <SubjectSection entity="node" filter />
      <IntroductionSection />
      <TieStrengthCensusPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
