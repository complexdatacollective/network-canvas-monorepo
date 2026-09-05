import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import AnonymisationExplanationSection from '../../sections/anonymisation/AnonymisationExplanationSection.tsx';
import AnonymisationValidationSection from '../../sections/anonymisation/AnonymisationValidationSection.tsx';
import EncryptedVariablesSection from '../../sections/anonymisation/EncryptedVariablesSection.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import {
  interviewPosition,
  type NamedStageEditorProps,
} from './stageEditorComposition.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('anonymisation');

/**
 * The stage that asks a participant for the passphrase protecting their
 * answers.
 *
 * Three decisions, in the order a researcher makes them: what the participant
 * is told before they choose a passphrase, whether the passphrase has to meet
 * any requirements, and which attributes it protects.
 *
 * The third is not a property of this stage at all — `encrypted` belongs to a
 * codebook attribute and outlives any stage that switches it on — so that
 * section writes through compound edits rather than through this form. It is
 * composed here because this is where a researcher goes looking for it.
 *
 * Skip logic is included deliberately. This was once the one interface without
 * it, which made the editor's overwrite-on-save silently delete skip logic a
 * protocol already held; the section is the fix, and a stage that never runs
 * is as legitimate here as anywhere else.
 */
export function AnonymisationStageEditor({
  controller,
  actions,
}: NamedStageEditorProps<'Anonymisation'>) {
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
      <AnonymisationExplanationSection />
      <AnonymisationValidationSection />
      <EncryptedVariablesSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
