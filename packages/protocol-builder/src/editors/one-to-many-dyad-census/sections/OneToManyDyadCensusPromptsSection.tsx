import { useCallback, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

import type { SortableProperty } from '../../../fields/sortOrderOptions.ts';
import type {
  RowEditorProps,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import { variablesForSubject } from '../../../protocol-context.ts';
import SortOrderRows from '../../../sections/prompts/SortOrderRows.tsx';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from '../../dyad-census/sections/censusMessages.ts';
import CreateEdgeField, {
  CREATE_EDGE_FIELD,
  missingEdgeTypeIssue,
} from '../../dyad-census/sections/CreateEdgeField.tsx';
import {
  PromptTextField,
  PromptTextPreview,
} from '../../dyad-census/sections/PromptTextField.tsx';

/** What only a One-to-Many Dyad Census says; the shared words are in `censusMessages`. */
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
  description: {
    id: 'protocolBuilder.censusPrompts.oneToManyDescription',
    defaultMessage:
      'Write the questions this stage asks about one person and the group around them, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section in a stage that shows the participant one network member alongside all the others and asks which of the others the question applies to. A stage is one step of an interview; a prompt is one question the participant is asked.',
  },
  fieldHint: {
    id: 'protocolBuilder.censusPrompts.oneToManyFieldHint',
    defaultMessage:
      'The participant is shown one person at a time and chooses who among the others the question applies to.',
    description:
      'Guidance under the list of prompts in a One-to-Many Dyad Census stage, where the participant selects any number of the remaining network members for the person in front of them.',
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
 * answer creates, and the two orders the people are met in.
 *
 * Both orders are the STAGE subject's, not the connection's: they order the
 * people, and it is people the participant is handed one at a time and chooses
 * between. A sort rule READS an attribute rather than writing it, so it sits
 * outside the writer-exclusivity rule entirely — every attribute of the type
 * is offered, including ones a form elsewhere collects.
 */
function OneToManyDyadCensusPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  /*
    The entity comes from the schema rather than from the draft: this
    interface's subject is a node subject, so only the TYPE is read from what
    the stage holds. A draft whose stored subject says `edge` — which a tolerant
    import or a half-written stage can hold — would otherwise send this
    family's sort rules at the edge codebook, about an interface the schema and
    the subject section both treat as node-based.
  */
  const subject = useStageSubject('node');
  const { createEdge } = useFormValue([CREATE_EDGE_FIELD] as const);
  const chosenEdge = typeof createEdge === 'string' && createEdge !== '';

  /**
   * Everything the rules may sort by.
   *
   * `undefined` says the family does not know yet — a stage that has not been
   * told which people it works with — and nothing is judged against it. An
   * EMPTY list is the other answer: a type whose attributes have all been
   * deleted, where every rule the prompt holds is certainly dangling and has
   * to be shown and refused as such. See `SortOrderRows.properties`.
   */
  const sortableProperties = useMemo<readonly SortableProperty[] | undefined>(
    () =>
      subject === undefined
        ? undefined
        : Object.entries(variablesForSubject(protocolContext, subject)).map(
            ([value, variable]) => ({
              value,
              label: variable.name,
              type: variable.type,
            }),
          ),
    [protocolContext, subject],
  );

  return (
    <>
      <PromptTextField
        item={item}
        guidance={<OneToManyGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
      <CreateEdgeField
        title={intl.formatMessage(censusMessages.affirmativeTitle)}
        description={intl.formatMessage(messages.edgeDescription)}
        hint={intl.formatMessage(messages.edgeHint)}
        requiredMessage={intl.formatMessage(censusMessages.affirmativeRequired)}
      />
      {/*
        Both orders wait on the connection type, as Architect's do: until one is
        chosen the prompt does not yet describe a task to order anything within.
      */}
      <SortOrderRows
        name="bucketSortOrder"
        title={intl.formatMessage(messages.askedOrderTitle)}
        description={intl.formatMessage(messages.askedOrderDescription)}
        label={intl.formatMessage(messages.askedOrderLabel)}
        hint={intl.formatMessage(censusMessages.sortRulesAddedHint)}
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
        hint={intl.formatMessage(censusMessages.sortRulesAddedHint)}
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
 * A prompt that orders nobody in particular carries no sort keys at all, and
 * this section does nothing to arrange that: closing an optional group clears
 * the fields inside it, and `OptionalList` answers `undefined` rather than an
 * empty array for a list the researcher emptied — so both routes already leave
 * the prompt in the state the schema recognises.
 */
export default function OneToManyDyadCensusPromptsSection() {
  const codebook = useProtocolContext().codebook;

  const beforeSave = useCallback(
    (row: RowValues): RowSaveOutcome => {
      const issue = missingEdgeTypeIssue(
        codebook.edge ?? {},
        row[CREATE_EDGE_FIELD],
      );
      return issue === undefined
        ? { row }
        : { refused: { fieldErrors: { [CREATE_EDGE_FIELD]: [issue] } } };
    },
    [codebook],
  );

  return (
    <PromptsSection
      PromptEditor={OneToManyDyadCensusPromptEditor}
      PromptPreview={PromptTextPreview}
      beforeSave={beforeSave}
      description={messages.description}
      fieldHint={messages.fieldHint}
    />
  );
}
