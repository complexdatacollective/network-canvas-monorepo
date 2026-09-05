import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import FormFieldsSection from '../../sections/FormFieldsSection.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../../sections/IntroductionSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { saveStageAction } from './saveStageAction.tsx';

/**
 * A form the participant fills in about themselves.
 *
 * The one form interface with no subject section: an ego form always collects
 * against the interview's ego, which the schema fixes rather than the
 * researcher authoring, so there is no type to choose and nothing to filter.
 * That is also why the form fields are told their subject is `ego` rather than
 * reading it from the stage — there is no `subject` in the document to read.
 */
export function EgoFormStageEditor({
  controller,
  actions,
}: StageEditorProps<'EgoForm'>) {
  return (
    <StageEditorShell
      controller={controller}
      actions={actions ?? saveStageAction}
    >
      <StageNameSection
        documentationUrl={interfaceDocumentationUrl('ego-form')}
      />
      <IntroductionSection />
      <FormFieldsSection subject="ego" />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
