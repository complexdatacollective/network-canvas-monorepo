import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import { geospatialMessages as messages } from '../../../fields/geospatial/geospatialMessages.ts';
import type {
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { asText } from '../../../sections/canvas/rowValues.ts';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import {
  GeospatialPromptFields,
  GeospatialPromptPreview,
  PROMPTS_FIELD,
  promptsOf,
  promptVariableOf,
  VARIABLE_FIELD,
} from './GeospatialPromptFields.tsx';

/**
 * The places a geospatial stage asks about.
 *
 * The package's shared prompt list with this interface's own row: a question,
 * and the location attribute the answer is stored in. Everything a prompt list
 * has in common with every other one — its ordering, its identity per row, its
 * rule that a stage must ask something — belongs to `PromptsSection` and is
 * not repeated here.
 *
 * The four sentences handed down are descriptors, not strings: a prompt here
 * asks WHERE something is and records the answer in one location attribute,
 * which the shared wording does not say.
 */
export default function GeospatialPromptsSection() {
  const intl = useAppIntl();
  const prompts = useStageValue(PROMPTS_FIELD);

  /**
   * The save-time half of the rule the row's own picker already applies.
   *
   * The interview writes each answer into the prompt's own attribute, so two
   * prompts sharing one leave the stage holding only the last place the
   * participant chose — a loss nothing downstream can report, because the
   * protocol schema is satisfied by both prompts naming a location attribute.
   * The picker stops a researcher choosing one; this stops a row that is
   * HOLDING one from being saved, which is the state a protocol authored
   * elsewhere arrives in and the one place it can be resolved.
   *
   * No unchanged-pick escape, for that reason: re-saving the row as it stands
   * would keep both prompts pointed at one attribute, so the researcher is
   * asked to settle it here rather than told about it and let past.
   */
  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      const variable = asText(row[VARIABLE_FIELD]);
      if (variable === undefined) return { row };

      const shared = promptsOf(prompts).some(
        (prompt, index) =>
          index !== context.editIndex && promptVariableOf(prompt) === variable,
      );
      return shared
        ? {
            refused: {
              fieldErrors: {
                [VARIABLE_FIELD]: intl.formatMessage(
                  messages.promptVariableDuplicateRefusal,
                ),
              },
            },
          }
        : { row };
    },
    [intl, prompts],
  );

  return (
    <PromptsSection
      PromptEditor={GeospatialPromptFields}
      PromptPreview={GeospatialPromptPreview}
      beforeSave={beforeSave}
      description={messages.promptsDescription}
      waitingDescription={messages.promptsWaitingDescription}
      fieldHint={messages.promptsFieldHint}
      emptyState={messages.promptsEmptyState}
    />
  );
}
