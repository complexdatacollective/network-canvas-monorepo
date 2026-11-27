import { useCallback, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import { attributeAvailabilityMessages } from '../../../../codebook/attributeAvailability.ts';
import { draftAdditionalAttributePromptNumbers } from '../../../../codebook/variableValidation.ts';
import { useStageValue } from '../../../../form/stageFormHooks.ts';
import FormDocumentSection from '../../../../sections/form-document/FormDocumentSection.tsx';
import type { StageSection } from '../../../defineStageEditor.tsx';

function NameGeneratorFormFields() {
  const intl = useAppIntl();
  const prompts = useStageValue('prompts');
  const promptNumbers = useMemo(
    () => draftAdditionalAttributePromptNumbers(prompts),
    [prompts],
  );
  // Stable across renders that did not change the prompts: a fresh array
  // re-registers the form's validator.
  const draftUnvalidatedVariables = useMemo(
    () => [...promptNumbers.keys()],
    [promptNumbers],
  );
  const draftUnvalidatedReason = useCallback(
    (variableId: string) =>
      intl.formatMessage(attributeAvailabilityMessages.promptAssigns, {
        promptNumber: promptNumbers.get(variableId) ?? 0,
      }),
    [intl, promptNumbers],
  );

  return (
    <FormDocumentSection
      subject="node"
      hasTitle
      draftUnvalidatedVariables={draftUnvalidatedVariables}
      draftUnvalidatedReason={draftUnvalidatedReason}
    />
  );
}

/**
 * The form that records each person named, told what this stage's own prompts
 * already stamp.
 *
 * The shared form section, because a name generator's form asks for an
 * attribute and a question exactly as every other form does. It has a title
 * the researcher authors, as an ego form's does: the interview shows this
 * form's own heading above it, while an alter or alter edge form's own stage
 * name does that job.
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
  NameGeneratorFormFields;
