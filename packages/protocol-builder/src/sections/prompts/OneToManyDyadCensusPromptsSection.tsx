import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

/**
 * What only this family says. The words it shares with the other two censuses
 * are declared once in `censusPromptsMessages.ts`.
 */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.oneToManyGuidance',
    defaultMessage:
      'The participant sees one person alongside everyone else and selects whoever the question applies to, so write it as a question about that one person and the group — “which of these people does this person know?” rather than a question about a single pair.',
    description:
      'Guidance shown above the box where a researcher writes a One-to-Many Dyad Census prompt, saying what the participant is looking at while they answer it. The quoted sentence is an example of a question about one person and the group.',
  },
  placeholder: {
    id: 'protocolBuilder.censusPrompts.oneToManyPlaceholder',
    defaultMessage: 'Which of these people does this person know?',
    description:
      'Example question in the empty box where a researcher writes a One-to-Many Dyad Census prompt.',
  },
  edgeDescription: {
    id: 'protocolBuilder.censusPrompts.oneToManyEdgeDescription',
    defaultMessage:
      'Choose the kind of connection an affirmative answer records between the two people.',
    description:
      'Description of the group that says what selecting someone records between them and the person the prompt asked about.',
  },
  edgeHint: {
    id: 'protocolBuilder.censusPrompts.oneToManyEdgeHint',
    defaultMessage:
      'A connection of this type is created from the person being asked about to everyone the participant selects.',
    description:
      'Guidance under the control that picks what selecting someone records between them and the person the prompt asked about.',
  },
  askedOrderTitle: {
    id: 'protocolBuilder.censusPrompts.oneToManyAskedOrderTitle',
    defaultMessage: 'Order of the people asked about',
    description:
      'Heading of the optional group holding the rules that order the people the participant is asked about, one at a time.',
  },
  askedOrderDescription: {
    id: 'protocolBuilder.censusPrompts.oneToManyAskedOrderDescription',
    defaultMessage:
      'Choose the order the participant is asked about each person in.',
    description:
      'Description of the group holding the rules that order the people the participant is asked about, one at a time.',
  },
  askedOrderLabel: {
    id: 'protocolBuilder.censusPrompts.oneToManyAskedOrderLabel',
    defaultMessage: 'Rules for the order people are asked about',
    description:
      'Label of the list of sort rules that order the people the participant is asked about, one at a time.',
  },
  askedOrderAddLabel: {
    id: 'protocolBuilder.censusPrompts.oneToManyAskedOrderAddLabel',
    defaultMessage: 'Add a rule for the order people are asked about',
    description:
      'Button that appends one sort rule to the list ordering the people the participant is asked about.',
  },
  askedOrderEmptyState: {
    id: 'protocolBuilder.censusPrompts.oneToManyAskedOrderEmptyState',
    defaultMessage:
      'No rules yet, so people are asked about in the order they were added.',
    description:
      'Shown in place of the sort rules ordering the people the participant is asked about, when the researcher has written none.',
  },
  choiceOrderTitle: {
    id: 'protocolBuilder.censusPrompts.oneToManyChoiceOrderTitle',
    defaultMessage: 'Order of the people to choose from',
    description:
      'Heading of the optional group holding the rules that order the people the participant picks from for whoever they were asked about.',
  },
  choiceOrderDescription: {
    id: 'protocolBuilder.censusPrompts.oneToManyChoiceOrderDescription',
    defaultMessage:
      'Choose the order the people the participant selects from are shown in.',
    description:
      'Description of the group holding the rules that order the people the participant picks from for whoever they were asked about.',
  },
  choiceOrderLabel: {
    id: 'protocolBuilder.censusPrompts.oneToManyChoiceOrderLabel',
    defaultMessage: 'Rules for the order people are shown in',
    description:
      'Label of the list of sort rules that order the people the participant picks from.',
  },
  choiceOrderAddLabel: {
    id: 'protocolBuilder.censusPrompts.oneToManyChoiceOrderAddLabel',
    defaultMessage: 'Add a rule for the order people are shown in',
    description:
      'Button that appends one sort rule to the list ordering the people the participant picks from.',
  },
  choiceOrderEmptyState: {
    id: 'protocolBuilder.censusPrompts.oneToManyChoiceOrderEmptyState',
    defaultMessage:
      'No rules yet, so people are shown in the order they were added.',
    description:
      'Shown in place of the sort rules ordering the people the participant picks from, when the researcher has written none.',
  },
});

function OneToManyGuidance() {
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
 * One One-to-Many Dyad Census question: what to ask, what an affirmative
 * answer creates, and the order the people are shown in.
 */
function OneToManyDyadCensusPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject();
  const sortableProperties = useSortVariablePool(subject);
  const { createEdge } = useFormValue(['createEdge'] as const);
  const chosenEdge = typeof createEdge === 'string' && createEdge !== '';

  return (
    <>
      <PromptTextField
        guidance={<OneToManyGuidance />}
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
      <SortOrderRows
        name="bucketSortOrder"
        title={intl.formatMessage(messages.askedOrderTitle)}
        description={intl.formatMessage(messages.askedOrderDescription)}
        label={intl.formatMessage(messages.askedOrderLabel)}
        hint={intl.formatMessage(censusPromptsMessages.sortRulesAddedHint)}
        addButtonLabel={intl.formatMessage(messages.askedOrderAddLabel)}
        emptyStateMessage={intl.formatMessage(messages.askedOrderEmptyState)}
        properties={sortableProperties}
        disabled={!chosenEdge}
        committedRules={item.bucketSortOrder}
      />
      <SortOrderRows
        name="binSortOrder"
        title={intl.formatMessage(messages.choiceOrderTitle)}
        description={intl.formatMessage(messages.choiceOrderDescription)}
        label={intl.formatMessage(messages.choiceOrderLabel)}
        hint={intl.formatMessage(censusPromptsMessages.sortRulesAddedHint)}
        addButtonLabel={intl.formatMessage(messages.choiceOrderAddLabel)}
        emptyStateMessage={intl.formatMessage(messages.choiceOrderEmptyState)}
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
