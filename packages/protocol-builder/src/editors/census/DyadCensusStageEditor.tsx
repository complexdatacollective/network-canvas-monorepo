import type { StageEditorController } from '../../controller.ts';
import StageEditorShell, {
  type StageEditorShellProps,
} from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../../sections/IntroductionSection.tsx';
import DyadCensusPromptsSection from '../../sections/prompts/DyadCensusPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';

const DOCUMENTATION = interfaceDocumentationUrl('dyad-census');

export type DyadCensusStageEditorProps = Readonly<{
  controller: StageEditorController;
  /** The host's action chrome, passed straight through to the shell. */
  actions?: StageEditorShellProps['actions'];
}>;

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
}: DyadCensusStageEditorProps) {
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
