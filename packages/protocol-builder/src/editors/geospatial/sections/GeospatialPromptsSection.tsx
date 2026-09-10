import { geospatialMessages as messages } from '../../../fields/geospatial/geospatialMessages.ts';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import {
  GeospatialPromptFields,
  GeospatialPromptPreview,
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
  return (
    <PromptsSection
      PromptEditor={GeospatialPromptFields}
      PromptPreview={GeospatialPromptPreview}
      description={messages.promptsDescription}
      waitingDescription={messages.promptsWaitingDescription}
      fieldHint={messages.promptsFieldHint}
      emptyState={messages.promptsEmptyState}
    />
  );
}
