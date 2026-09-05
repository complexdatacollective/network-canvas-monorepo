import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import PageContentSection from '../../sections/PageContentSection.tsx';
import BoundaryOptionsSection from '../../sections/pedigree/BoundaryOptionsSection.tsx';
import CensusPromptSection from '../../sections/pedigree/CensusPromptSection.tsx';
import FramingConfigSection from '../../sections/pedigree/FramingConfigSection.tsx';
import NominationPromptsSection from '../../sections/pedigree/NominationPromptsSection.tsx';
import PedigreeEdgeConfigurationSection from '../../sections/pedigree/PedigreeEdgeConfigurationSection.tsx';
import PedigreeNodeConfigurationSection from '../../sections/pedigree/PedigreeNodeConfigurationSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import {
  FamilyMemberFormFieldEditor,
  FamilyMemberFormFieldPreview,
} from './familyMemberForm/FamilyMemberFormFieldRow.tsx';
import {
  IntroScreenBlockEditor,
  IntroScreenBlockPreview,
  normalizeIntroScreenBlock,
} from './introScreen/IntroScreenBlockRow.tsx';
import { interviewPosition } from './stageEditorComposition.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('family-pedigree');

/**
 * The stage a participant draws their family in.
 *
 * The sections run from what the pedigree IS to what it asks. Framing and
 * boundaries decide the language it uses and how far it has to reach; the node
 * and edge configuration bind the codebook attributes the interface writes the
 * family into; the introduction screen is what the participant reads before
 * any of it; and the census and nomination prompts are the questions asked
 * while they build it.
 *
 * Two of those sections render a list whose rows belong to other families —
 * content blocks to the Information stage, form fields to the forms family —
 * so each is composed with a seam of this editor's own until the shared
 * editors land. Both seams say so in their own files.
 */
export function FamilyPedigreeStageEditor({
  controller,
  actions,
}: StageEditorProps<'FamilyPedigree'>) {
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
      <FramingConfigSection />
      <BoundaryOptionsSection />
      <PedigreeNodeConfigurationSection
        FormFieldEditor={FamilyMemberFormFieldEditor}
        FormFieldPreview={FamilyMemberFormFieldPreview}
      />
      <PedigreeEdgeConfigurationSection />
      <PageContentSection
        variant="introScreen"
        ItemEditor={IntroScreenBlockEditor}
        ItemPreview={IntroScreenBlockPreview}
        normalizeItem={normalizeIntroScreenBlock}
      />
      <CensusPromptSection />
      <NominationPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
