import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

import PromptsSection, { type PromptsSectionCopy } from '../PromptsSection.tsx';
import { censusPromptsMessages } from './censusPromptsMessages.ts';
import CreateEdgeField from './CreateEdgeField.tsx';
import { PromptTextField, PromptTextPreview } from './promptText.tsx';

/** What this stage shows the participant, said in the section's own words. */
const WORDS: PromptsSectionCopy = Object.freeze({
  description: censusPromptsMessages.pairDescription,
  fieldHint: censusPromptsMessages.pairFieldHint,
});

/**
 * What only this family says. The words it shares with the other two censuses
 * are declared once in `censusPromptsMessages.ts`.
 */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.dyadCensusGuidance',
    defaultMessage:
      'The participant sees two people side by side and answers yes or no, so write the question about the pair in front of them — “these two people” rather than a name — and phrase it so that yes and no are both sensible answers.',
    description:
      'Guidance shown above the box where a researcher writes a Dyad Census prompt, saying what the participant is looking at while they answer it. The quoted phrase is an example of how to refer to the pair.',
  },
  placeholder: {
    id: 'protocolBuilder.censusPrompts.dyadCensusPlaceholder',
    defaultMessage: 'Do these two people know each other?',
    description:
      'Example question in the empty box where a researcher writes a Dyad Census prompt.',
  },
  edgeDescription: {
    id: 'protocolBuilder.censusPrompts.dyadCensusEdgeDescription',
    defaultMessage:
      'Choose the kind of connection an affirmative answer records between the pair.',
    description:
      'Description of the group that says what a yes from the participant records between the two people a Dyad Census prompt asked about.',
  },
  edgeHint: {
    id: 'protocolBuilder.censusPrompts.dyadCensusEdgeHint',
    defaultMessage:
      'A connection of this type is created between the two people whenever the participant answers yes.',
    description:
      'Guidance under the control that picks what a yes from the participant records between the two people a Dyad Census prompt asked about.',
  },
});

/**
 * What the participant is looking at while they answer, said before the
 * researcher writes the question rather than after it.
 */
function DyadCensusGuidance() {
  const intl = useAppIntl();
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        {intl.formatMessage(messages.guidance)}
      </AlertDescription>
    </Alert>
  );
}

/**
 * One Dyad Census question: what to ask about a pair, and what an affirmative
 * answer creates between them.
 */
function DyadCensusPromptEditor() {
  const intl = useAppIntl();

  return (
    <>
      <PromptTextField
        guidance={<DyadCensusGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
      <CreateEdgeField
        title={intl.formatMessage(censusPromptsMessages.affirmativeTitle)}
        description={intl.formatMessage(messages.edgeDescription)}
        label={intl.formatMessage(censusPromptsMessages.edgeLabel)}
        hint={intl.formatMessage(messages.edgeHint)}
        requiredMessage={intl.formatMessage(
          censusPromptsMessages.affirmativeRequired,
        )}
        createLabel={intl.formatMessage(censusPromptsMessages.edgeCreateLabel)}
        createDescription={intl.formatMessage(
          censusPromptsMessages.edgeCreateDescription,
        )}
      />
    </>
  );
}

/**
 * The questions a Dyad Census asks about every pair of people.
 *
 * Ported from Architect's `DyadCensusPrompts`. The list itself — its identity,
 * its ordering, its rule that a stage must ask something — is the shared
 * prompts section; only what one prompt SAYS is here.
 */
export default function DyadCensusPromptsSection() {
  return (
    <PromptsSection
      PromptEditor={DyadCensusPromptEditor}
      PromptPreview={PromptTextPreview}
      words={WORDS}
    />
  );
}
