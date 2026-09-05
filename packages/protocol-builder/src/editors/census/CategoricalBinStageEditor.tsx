import type { StageEditorController } from '../../controller.ts';
import StageEditorShell, {
  type StageEditorShellProps,
} from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import CategoricalBinPromptsSection from '../../sections/prompts/CategoricalBinPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';

const DOCUMENTATION = interfaceDocumentationUrl('categorical-bin');

/**
 * What a named editor takes.
 *
 * The stage type is not among it. The dispatcher passes one — it is how it
 * chooses this component at all — but an editor for a single interface has
 * nothing to decide from it, and reading identity out of a prop rather than
 * out of the session is the mistake `StageEditor` exists to prevent.
 */
export type CategoricalBinStageEditorProps = Readonly<{
  controller: StageEditorController;
  /**
   * The host's action chrome, passed straight through to the shell.
   *
   * The package owns the form; where the save button lives and what sits
   * beside it is the host's. Left out, the editor renders no buttons of its
   * own and a host submits the form by its id.
   */
  actions?: StageEditorShellProps['actions'];
}>;

/**
 * The editor for a Categorical Bin stage.
 *
 * Sections in the order the plan standardises: what the stage IS, then what it
 * works with, then what it asks the participant, then whether it runs at all,
 * then the notes the interviewer reads while running it.
 *
 * Every section is shared, and receives only semantic variation — this stage
 * sorts nodes, and it can be narrowed by a filter. Nothing here passes a stage
 * path, a selector or a host store: each section reads the draft, the codebook
 * and the validation it needs from the editor's own context.
 */
export function CategoricalBinStageEditor({
  controller,
  actions,
}: CategoricalBinStageEditorProps) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageNameSection documentationUrl={DOCUMENTATION} />
      <SubjectSection entity="node" filter />
      <CategoricalBinPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
