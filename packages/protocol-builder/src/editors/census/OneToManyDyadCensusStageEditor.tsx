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
 * What becomes of a person once they have been considered comes AFTER the
 * prompts. Architect puts it before them — `Interfaces.tsx` lists
 * `FilteredNodeType, RemoveAfterConsideration, OneToManyDyadCensusPrompts,
 * SkipLogic, InterviewScript` — and this is a deliberate departure, not an
 * oversight in the port: the setting is behaviour of the task the prompts
 * describe, so before them it is an answer to a question the researcher has
 * not been asked yet, and after them it reads as one they have. Everything
 * else about the composition follows Architect's list.
 *
 * The order is pinned by this editor's outline test, so changing it back is a
 * decision rather than a drift.
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
