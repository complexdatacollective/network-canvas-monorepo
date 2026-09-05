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
 * A form the participant fills in once for each relationship in their network.
 *
 * Identical in shape to the per-alter form, and different in what it is about:
 * its subject is an edge type, so its fields collect against the codebook of a
 * relationship rather than of a person, and its filter narrows which edges the
 * participant is asked about.
 */
export function AlterEdgeFormStageEditor({
  controller,
}: StageEditorProps<'AlterEdgeForm'>) {
  return (
    <StageEditorShell controller={controller} actions={saveStageAction}>
      <StageNameSection
        documentationUrl={interfaceDocumentationUrl('per-alter-edge-form')}
      />
      <SubjectSection entity="edge" filter />
      <IntroductionSection />
      <FormFieldsSection subject="edge" />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
