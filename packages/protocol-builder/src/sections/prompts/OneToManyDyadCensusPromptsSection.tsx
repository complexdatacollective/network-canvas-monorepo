import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

import PromptsSection, { type PromptsSectionCopy } from '../PromptsSection.tsx';
import type { RowEditorProps } from '../rowRenderers.tsx';
import { censusPromptsMessages } from './censusPromptsMessages.ts';
import CreateEdgeField from './CreateEdgeField.tsx';
import { useSortVariablePool, useStageSubject } from './promptCodebook.ts';
import { PromptTextField, PromptTextPreview } from './promptText.tsx';
import SortOrderRows from './SortOrderRows.tsx';

/** What this stage shows the participant, said in the section's own words. */
const WORDS: PromptsSectionCopy = Object.freeze({
  description: censusPromptsMessages.oneToManyDescription,
  fieldHint: censusPromptsMessages.oneToManyFieldHint,
});

function OneToManyGuidance() {
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        The participant sees one person alongside everyone else and selects
        whoever the question applies to, so write it as a question about that
        one person and the group — &ldquo;which of these people does this person
        know?&rdquo; rather than a question about a single pair.
      </AlertDescription>
    </Alert>
  );
}

/**
 * One One-to-Many Dyad Census question: what to ask, what an affirmative
 * answer creates, and the order the people are shown in.
 */
function OneToManyDyadCensusPromptEditor({ item }: RowEditorProps) {
  const subject = useStageSubject();
  const sortableProperties = useSortVariablePool(subject);
  const { createEdge } = useFormValue(['createEdge'] as const);
  const chosenEdge = typeof createEdge === 'string' && createEdge !== '';

  return (
    <>
      <PromptTextField
        guidance={<OneToManyGuidance />}
        placeholder="Which of these people does this person know?"
      />
      <CreateEdgeField
        title="Affirmative answer"
        description="Choose the kind of connection an affirmative answer records between the two people."
        label="Connection created"
        hint="A connection of this type is created from the person being asked about to everyone the participant selects."
        requiredMessage="Choose the type of connection an affirmative answer creates."
        createLabel="Create a new connection type"
        createDescription="Create a connection type and use it for this prompt"
      />
      <SortOrderRows
        name="bucketSortOrder"
        title="Order of the people asked about"
        description="Choose the order the participant is asked about each person in."
        label="Rules for the order people are asked about"
        hint="Rules are applied in order. Use the asterisk to keep the order the people were added in."
        addButtonLabel="Add a rule for the order people are asked about"
        emptyStateMessage="No rules yet, so people are asked about in the order they were added."
        properties={sortableProperties}
        disabled={!chosenEdge}
        committedRules={item.bucketSortOrder}
      />
      <SortOrderRows
        name="binSortOrder"
        title="Order of the people to choose from"
        description="Choose the order the people the participant selects from are shown in."
        label="Rules for the order people are shown in"
        hint="Rules are applied in order. Use the asterisk to keep the order the people were added in."
        addButtonLabel="Add a rule for the order people are shown in"
        emptyStateMessage="No rules yet, so people are shown in the order they were added."
        properties={sortableProperties}
        disabled={!chosenEdge}
        committedRules={item.binSortOrder}
      />
    </>
  );
}

/**
 * The questions a One-to-Many Dyad Census asks about one person and the group.
 *
 * Ported from Architect's `OneToManyDyadCensusPrompts`, including its rule
 * that the two orderings cannot be set before the connection type is chosen:
 * until then the prompt does not yet describe a task to order anything within.
 */
export default function OneToManyDyadCensusPromptsSection() {
  return (
    <PromptsSection
      PromptEditor={OneToManyDyadCensusPromptEditor}
      PromptPreview={PromptTextPreview}
      words={WORDS}
    />
  );
}
