import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import AtRiskStatusesSection from '../../sections/narrativePedigree/AtRiskStatusesSection.tsx';
import DiseasesSection from '../../sections/narrativePedigree/DiseasesSection.tsx';
import SourceStageSection from '../../sections/narrativePedigree/SourceStageSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import {
  interviewPosition,
  type NamedStageEditorProps,
} from './stageEditorComposition.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('narrative-pedigree');

/**
 * The stage that draws conditions onto a family the participant has already
 * built.
 *
 * It has no family of its own: every disease maps an attribute of the node
 * type belonging to the Family Pedigree stage it reads, so the source comes
 * first and everything after it is configured against that stage's codebook.
 * A source that is deleted, moved later, or changed to another interface while
 * this editor is open is reported rather than corrected — which pedigree this
 * stage shows is the researcher's decision, not a gap to fill in for them.
 */
export function NarrativePedigreeStageEditor({
  controller,
  actions,
}: NamedStageEditorProps<'NarrativePedigree'>) {
  const { snapshot } = controller;
  const position = interviewPosition(
    snapshot.protocolContext,
    snapshot.editedSection.identity.id,
  );

  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageNameSection
        {...(position === undefined ? {} : { position })}
        documentationUrl={DOCUMENTATION_URL}
      />
      <SourceStageSection />
      <DiseasesSection />
      <AtRiskStatusesSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
