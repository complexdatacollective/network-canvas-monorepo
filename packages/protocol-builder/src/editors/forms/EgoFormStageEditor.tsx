import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import FormFieldsSection from '../../sections/form-fields/FormFieldsSection.tsx';
import InterviewerGuidanceSection from '../../sections/interviewer-guidance/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../../sections/introduction/IntroductionSection.tsx';
import SkipLogicSection from '../../sections/skip-logic/SkipLogicSection.tsx';
import StageHeading from '../../sections/stage-heading/StageHeading.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { saveStageAction } from '../saveStageAction.tsx';

/**
 * A form the participant fills in about themselves.
 *
 * The one form interface with no subject section: an ego form always collects
 * against the interview's ego, which the schema fixes rather than the
 * researcher authoring, so there is no type to choose and nothing to filter.
 * That is also why the form fields are told their subject is `ego` rather than
 * reading it from the stage — there is no `subject` in the document to read.
 */
export function EgoFormStageEditor({ actions }: StageEditorProps<'EgoForm'>) {
  return (
    <StageEditorShell actions={actions ?? saveStageAction}>
      <StageHeading documentationUrl={interfaceDocumentationUrl('ego-form')} />
      <IntroductionSection />
      <FormFieldsSection subject="ego" />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
