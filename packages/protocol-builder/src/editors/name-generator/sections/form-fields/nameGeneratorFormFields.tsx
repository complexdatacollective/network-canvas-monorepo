import { useMemo } from 'react';

import { draftAdditionalAttributeVariableIds } from '../../../../codebook/variableValidation.ts';
import { useStageValue } from '../../../../form/stageFormHooks.ts';
import FormFieldsSection from '../../../../sections/form-fields/FormFieldsSection.tsx';
import type { StageSection } from '../../../defineStageEditor.tsx';

/**
 * The form that records each person named, told what this stage's own prompts
 * already stamp.
 *
 * The shared form section, because a name generator's form asks for an
 * attribute and a question exactly as every other form does. It has a title
 * the researcher authors, which is what separates it from the three form
 * stages: the interview shows this form's own heading above it, while a form
 * stage's own name does that job.
 *
 * The two sections write the same subject with opposite validation: a field
 * asks the participant and checks the answer, a stamp sets a value with nobody
 * to check. The schema refuses an attribute written both ways, and the prompts
 * section already excludes what the live form collects — this is that rule read
 * in the other direction, so binding a stamp withdraws the attribute from the
 * form's picker at once instead of letting the contradiction surface at stage
 * submit, against the prompt the researcher was not looking at.
 *
 * Subscribed to here, in the section that reads it, rather than handed down by
 * the editor: the stage form exists only inside the shell, and reading it here
 * re-renders this section alone.
 */
export const nameGeneratorFormFields = (): StageSection =>
  function NameGeneratorFormFields() {
    const prompts = useStageValue('prompts');
    // Stable across renders that did not change the prompts: a fresh array
    // re-registers the field list's validator.
    const draftUnvalidatedVariables = useMemo(
      () => [...draftAdditionalAttributeVariableIds(prompts)],
      [prompts],
    );

    return (
      <FormFieldsSection
        subject="node"
        hasTitle
        draftUnvalidatedVariables={draftUnvalidatedVariables}
      />
    );
  };
