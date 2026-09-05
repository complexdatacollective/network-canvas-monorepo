import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import AlterLimitsSection from '../../sections/AlterLimitsSection.tsx';
import FormFieldsSection from '../../sections/FormFieldsSection.tsx';
import NameGeneratorPromptsSection from '../../sections/NameGeneratorPromptsSection.tsx';
import NodePanelsSection from '../../sections/NodePanelsSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import NameGeneratorFrame from './NameGeneratorFrame.tsx';

const DOCUMENTATION_URL = interfaceDocumentationUrl(
  'name-generator-using-forms',
);

/**
 * The name generator a participant names people with, one form at a time.
 *
 * Five decisions, in the order a researcher makes them: which kind of person
 * this stage creates, what is recorded about each one, what the stage asks,
 * what it offers beside the question, and how many people it may name. The
 * form comes before the prompts because it describes the people the prompts
 * ask for — and because a prompt's own attribute stamps are chosen from what
 * the form does NOT already collect.
 *
 * Owns `subject`, `form.title`, `form.fields`, `prompts`, `panels` and
 * `behaviours.{minNodes,maxNodes}`; the frame owns `label`, `skipLogic` and
 * `interviewScript`.
 */
export function NameGeneratorStageEditor({
  controller,
}: StageEditorProps<'NameGenerator'>) {
  return (
    <NameGeneratorFrame
      controller={controller}
      documentationUrl={DOCUMENTATION_URL}
    >
      <SubjectSection entity="node" />
      {/*
        The interview shows this form's title above it, so the researcher
        authors one — which is what separates it from the three form stages,
        whose own stage name does that job.
      */}
      <FormFieldsSection subject="node" hasTitle />
      <NameGeneratorPromptsSection />
      <NodePanelsSection />
      <AlterLimitsSection />
    </NameGeneratorFrame>
  );
}
