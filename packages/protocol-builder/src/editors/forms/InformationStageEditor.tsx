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
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { saveStageAction } from './saveStageAction.tsx';

/**
 * A page the participant reads, rather than a task they do.
 *
 * The whole interface is its page: a heading and an ordered list of blocks of
 * text and media. There is no subject — nothing here is about a person or a
 * relationship — and nothing to configure about how the participant answers,
 * because they are not being asked anything.
 *
 * Skip logic is composed even so. The schema allows it on every stage and the
 * interview runtime honours it generically, so a researcher who wants a page
 * shown to only some participants has to be able to say so — and a section
 * left out would not merely hide the setting, it would let a save delete skip
 * logic somebody had already authored.
 */
export function InformationStageEditor({
  controller,
  actions,
}: StageEditorProps<'Information'>) {
  return (
    <StageEditorShell
      controller={controller}
      actions={actions ?? saveStageAction}
    >
      <StageNameSection
        documentationUrl={interfaceDocumentationUrl('information')}
      />
      <PageContentSection
        ItemEditor={ContentBlockEditor}
        ItemPreview={ContentBlockPreview}
        itemSelector={expandContentBlock}
        normalizeItem={collapseContentBlock}
      />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
