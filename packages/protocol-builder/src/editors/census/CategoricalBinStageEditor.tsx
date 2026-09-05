import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import CategoricalBinPromptsSection from '../../sections/prompts/CategoricalBinPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION = interfaceDocumentationUrl('categorical-bin');

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
 *
 * `stageType` is part of what the dispatcher passes every named editor — it is
 * how it chose this one — and is deliberately unread here: an editor for a
 * single interface has nothing to decide from it, and reading identity out of
 * a prop rather than out of the session is the mistake `StageEditor` exists to
 * prevent. `actions` is the host's own chrome, forwarded to the shell
 * untouched: the package owns the form, and where the save button lives is the
 * host's business.
 */
export function CategoricalBinStageEditor({
  controller,
  actions,
}: StageEditorProps<'CategoricalBin'>) {
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
