import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import ContentBlockEditor from '../../sections/content-blocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../../sections/content-blocks/ContentBlockPreview.tsx';
import { contentBlockSlots } from '../../sections/content-blocks/contentBlockTypes.ts';
import InterviewerGuidanceSection from '../../sections/interviewer-guidance/InterviewerGuidanceSection.tsx';
import PageContentSection from '../../sections/page-content/PageContentSection.tsx';
import SkipLogicSection from '../../sections/skip-logic/SkipLogicSection.tsx';
import StageHeading from '../../sections/stage-heading/StageHeading.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { saveStageAction } from '../saveStageAction.tsx';

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
  actions,
}: StageEditorProps<'Information'>) {
  return (
    <StageEditorShell actions={actions ?? saveStageAction}>
      <StageHeading
        documentationUrl={interfaceDocumentationUrl('information')}
      />
      <PageContentSection
        ItemEditor={ContentBlockEditor}
        ItemPreview={ContentBlockPreview}
        slots={contentBlockSlots}
      />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
