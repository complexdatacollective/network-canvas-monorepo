import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import ContentBlockEditor from '../../sections/content-blocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../../sections/content-blocks/ContentBlockPreview.tsx';
import { contentBlockSlots } from '../../sections/content-blocks/contentBlockTypes.ts';
import InterviewerGuidanceSection from '../../sections/interviewer-guidance/InterviewerGuidanceSection.tsx';
import PageContentSection from '../../sections/page-content/PageContentSection.tsx';
import SkipLogicSection from '../../sections/skip-logic/SkipLogicSection.tsx';
import StageHeadingSection from '../../sections/stage-heading/StageHeadingSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import BoundaryOptionsSection from './sections/BoundaryOptionsSection.tsx';
import CensusPromptSection from './sections/CensusPromptSection.tsx';
import FramingConfigSection from './sections/FramingConfigSection.tsx';
import NominationPromptsSection from './sections/NominationPromptsSection.tsx';
import PedigreeEdgeConfigurationSection from './sections/PedigreeEdgeConfigurationSection.tsx';
import PedigreeNodeConfigurationSection from './sections/PedigreeNodeConfigurationSection.tsx';

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
 * The introduction screen is the package's shared page section given the
 * package's shared content block editor, so a pedigree's introduction offers
 * the same text, image, audio and video blocks an Information stage does —
 * minus the display size, which only that stage's own schema has room for. The
 * family member form the node configuration lists is the package's shared
 * form-fields section, pointed at where this interface keeps its form, so it
 * asks for an attribute and a question exactly as every other form does.
 */
export function FamilyPedigreeStageEditor({
  actions,
}: StageEditorProps<'FamilyPedigree'>) {
  return (
    <StageEditorShell {...(actions === undefined ? {} : { actions })}>
      <StageHeadingSection documentationUrl={DOCUMENTATION_URL} />
      <FramingConfigSection />
      <BoundaryOptionsSection />
      <PedigreeNodeConfigurationSection />
      <PedigreeEdgeConfigurationSection />
      <PageContentSection
        variant="introScreen"
        ItemEditor={ContentBlockEditor}
        ItemPreview={ContentBlockPreview}
        slots={contentBlockSlots}
      />
      <CensusPromptSection />
      <NominationPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
