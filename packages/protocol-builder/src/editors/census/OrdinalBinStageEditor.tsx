import type { StageEditorController } from '../../controller.ts';
import StageEditorShell, {
  type StageEditorShellProps,
} from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import OrdinalBinPromptsSection from '../../sections/prompts/OrdinalBinPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';

const DOCUMENTATION = interfaceDocumentationUrl('ordinal-bin');

export type OrdinalBinStageEditorProps = Readonly<{
  controller: StageEditorController;
  /** The host's action chrome, passed straight through to the shell. */
  actions?: StageEditorShellProps['actions'];
}>;

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
}: OrdinalBinStageEditorProps) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageNameSection documentationUrl={DOCUMENTATION} />
      <SubjectSection entity="node" filter />
      <OrdinalBinPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
