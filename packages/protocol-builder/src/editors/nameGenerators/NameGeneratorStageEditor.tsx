import { useMemo } from 'react';

import { draftAdditionalAttributeVariableIds } from '../../codebook/variableValidation.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
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
  actions,
}: StageEditorProps<'NameGenerator'>) {
  return (
    <NameGeneratorFrame
      controller={controller}
      documentationUrl={DOCUMENTATION_URL}
      // A generator offering the people named so far is a different stage from
      // one that offers nothing, so the name proposed to a new stage says so.
      hasSidePanels
      {...(actions === undefined ? {} : { actions })}
    >
      <SubjectSection entity="node" />
      <NodeFormFields />
      <NameGeneratorPromptsSection />
      <NodePanelsSection />
      <AlterLimitsSection />
    </NameGeneratorFrame>
  );
}

/**
 * The form, told what this stage's own prompts already stamp.
 *
 * The two sections write the same subject with opposite validation: a field
 * asks the participant and checks the answer, a stamp sets a value with nobody
 * to check. The schema refuses an attribute written both ways, and the prompts
 * section already excludes what the live form collects — this is that rule read
 * in the other direction, so binding a stamp withdraws the attribute from the
 * form's picker at once instead of letting the contradiction surface at stage
 * submit, against the prompt the researcher was not looking at.
 *
 * Read here rather than by the editor above because the stage form only exists
 * inside the shell, and mounted as its own component so the subscription
 * re-renders the form section alone.
 */
function NodeFormFields() {
  const prompts = useStageValue('prompts');
  // Stable across renders that did not change the prompts: a fresh array
  // re-registers the field list's validator.
  const draftUnvalidatedVariables = useMemo(
    () => [...draftAdditionalAttributeVariableIds(prompts)],
    [prompts],
  );

  return (
    /*
      The interview shows this form's title above it, so the researcher authors
      one — which is what separates it from the three form stages, whose own
      stage name does that job.
    */
    <FormFieldsSection
      subject="node"
      hasTitle
      draftUnvalidatedVariables={draftUnvalidatedVariables}
    />
  );
}
