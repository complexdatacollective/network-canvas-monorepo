import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../../sections/IntroductionSection.tsx';
import DyadCensusPromptsSection from '../../sections/prompts/DyadCensusPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION = interfaceDocumentationUrl('dyad-census');

/**
 * The editor for a Dyad Census stage.
 *
 * The introduction comes before the prompts because that is the order the
 * participant meets them in: a census walks through every pair in the network,
 * which is a task nobody should arrive at unexplained, so the protocol schema
 * requires the introduction and this editor puts it where it happens.
 */
export function DyadCensusStageEditor({
  controller,
  actions,
}: StageEditorProps<'DyadCensus'>) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageNameSection documentationUrl={DOCUMENTATION} />
      <SubjectSection entity="node" filter />
      <IntroductionSection />
      <DyadCensusPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
