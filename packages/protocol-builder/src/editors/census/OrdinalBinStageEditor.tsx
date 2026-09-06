import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import OrdinalBinPromptsSection from '../../sections/prompts/OrdinalBinPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageHeading from '../../sections/StageHeading.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION = interfaceDocumentationUrl('ordinal-bin');

/**
 * The editor for an Ordinal Bin stage.
 *
 * The same composition as the Categorical Bin, differing only in the prompts:
 * the two interfaces sort the same people by the same rules, and disagree only
 * about whether the bins they are sorted into are ordered.
 */
export function OrdinalBinStageEditor({
  controller,
  actions,
}: StageEditorProps<'OrdinalBin'>) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageHeading documentationUrl={DOCUMENTATION} />
      <SubjectSection entity="node" filter />
      <OrdinalBinPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
