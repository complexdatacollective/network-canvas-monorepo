import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import OneToManyDyadCensusPromptsSection from '../../sections/prompts/OneToManyDyadCensusPromptsSection.tsx';
import RemoveAfterConsiderationSection from '../../sections/RemoveAfterConsiderationSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION = interfaceDocumentationUrl('one-to-many-dyad-census');

/**
 * The editor for a One-to-Many Dyad Census stage.
 *
 * What becomes of a person once they have been considered comes after the
 * prompts rather than before them: it is behaviour of the task the prompts
 * describe, and it reads as an answer to a question the prompts have already
 * raised.
 */
export function OneToManyDyadCensusStageEditor({
  controller,
  actions,
}: StageEditorProps<'OneToManyDyadCensus'>) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageNameSection documentationUrl={DOCUMENTATION} />
      <SubjectSection entity="node" filter />
      <OneToManyDyadCensusPromptsSection />
      <RemoveAfterConsiderationSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
