import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import FormFieldsSection from '../../sections/FormFieldsSection.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../../sections/IntroductionSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { saveStageAction } from './saveStageAction.tsx';

/**
 * A form the participant fills in once for each person in their network.
 *
 * The same form as an ego form, asked repeatedly and about somebody else — so
 * the stage starts by saying which people it asks about: the node type it
 * collects into, and optionally a filter narrowing which of those nodes the
 * participant is asked about at all.
 */
export function AlterFormStageEditor({
  controller,
  actions,
}: StageEditorProps<'AlterForm'>) {
  return (
    <StageEditorShell
      controller={controller}
      actions={actions ?? saveStageAction}
    >
      <StageNameSection
        documentationUrl={interfaceDocumentationUrl('per-alter-form')}
      />
      <SubjectSection entity="node" filter />
      <IntroductionSection />
      <FormFieldsSection subject="node" />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
