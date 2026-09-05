import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import ContentBlockEditor from '../../sections/contentBlocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../../sections/contentBlocks/ContentBlockPreview.tsx';
import {
  collapseContentBlock,
  expandContentBlock,
} from '../../sections/contentBlocks/contentBlockTypes.ts';
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
 * The introduction screen is the package's shared page section given the
 * package's shared content block editor, so a pedigree's introduction offers
 * the same text, image, audio and video blocks an Information stage does —
 * minus the display size, which only that stage's own schema has room for. The
 * family member form the node configuration lists is the package's shared
 * form-fields section, pointed at where this interface keeps its form, so it
 * asks for an attribute and a question exactly as every other form does.
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
      <PedigreeNodeConfigurationSection />
      <PedigreeEdgeConfigurationSection />
      <PageContentSection
        variant="introScreen"
        ItemEditor={ContentBlockEditor}
        ItemPreview={ContentBlockPreview}
        itemSelector={expandContentBlock}
        normalizeItem={collapseContentBlock}
      />
      <CensusPromptSection />
      <NominationPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
