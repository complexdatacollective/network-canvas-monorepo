import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

import PromptsSection, { type PromptsCopy } from '../PromptsSection.tsx';
import CreateEdgeField from './CreateEdgeField.tsx';
import { PromptTextField, PromptTextPreview } from './promptText.tsx';

const PROMPTS_COPY: Partial<PromptsCopy> = {
  description:
    'Write the questions this stage asks about each pair, and drag them into the order the participant answers them.',
  fieldHint:
    'The participant is shown one pair of people at a time and answers these questions about them, in this order.',
};

/**
 * What the participant is looking at while they answer, said before the
 * researcher writes the question rather than after it.
 */
function DyadCensusGuidance() {
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        The participant sees two people side by side and answers yes or no, so
        write the question about the pair in front of them — &ldquo;these two
        people&rdquo; rather than a name — and phrase it so that yes and no are
        both sensible answers.
      </AlertDescription>
    </Alert>
  );
}

/**
 * One Dyad Census question: what to ask about a pair, and what an affirmative
 * answer creates between them.
 */
function DyadCensusPromptEditor() {
  return (
    <>
      <PromptTextField
        guidance={<DyadCensusGuidance />}
        placeholder="Do these two people know each other?"
      />
      <CreateEdgeField
        title="Affirmative answer"
        description="Choose the kind of connection an affirmative answer records between the pair."
        label="Connection created"
        hint="A connection of this type is created between the two people whenever the participant answers yes."
        requiredMessage="Choose the type of connection an affirmative answer creates."
        createLabel="Create a new connection type"
        createDescription="Create a connection type and use it for this prompt"
      />
    </>
  );
}

export type DyadCensusPromptsSectionProps = Readonly<{
  copy?: Partial<PromptsCopy>;
}>;

/**
 * The questions a Dyad Census asks about every pair of people.
 *
 * Ported from Architect's `DyadCensusPrompts`. The list itself — its identity,
 * its ordering, its rule that a stage must ask something — is the shared
 * prompts section; only what one prompt SAYS is here.
 */
export default function DyadCensusPromptsSection({
  copy,
}: DyadCensusPromptsSectionProps) {
  return (
    <PromptsSection
      PromptEditor={DyadCensusPromptEditor}
      PromptPreview={PromptTextPreview}
      copy={{ ...PROMPTS_COPY, ...copy }}
    />
  );
}
