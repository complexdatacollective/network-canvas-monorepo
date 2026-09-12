import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What one census family says where another one says the same thing.
 *
 * The three censuses ask the participant different questions and record
 * different things, but they share the controls those questions are written
 * in: the box the question itself goes in, and the connection an answer
 * creates. `extractMessages` throws on a second declaration of an id, so a
 * sentence more than one of them renders has to have exactly one home, and
 * this is it.
 *
 * A sentence only ONE family says is declared beside that family's own markup,
 * under this same `censusPrompts` area — an area names the copy's subject, and
 * a file is only obliged to be the single home of each id.
 *
 * It sits under the Dyad Census because that is the first of the three to
 * land, and the family rule is that the first editor owns what its siblings
 * also need. The bins join them in the next step; when the last census or bin
 * editor lands, this file and the two controls beside it move up to
 * `sections/` and every import follows.
 */
export const censusMessages = defineMessages({
  promptTextTitle: {
    id: 'protocolBuilder.censusPrompts.promptTextTitle',
    defaultMessage: 'Participant prompt',
    description:
      'Heading of the group holding the question one prompt shows the participant. A prompt is one question the participant is asked during a stage, which is one step of an interview.',
  },
  promptTextDescription: {
    id: 'protocolBuilder.censusPrompts.promptTextDescription',
    defaultMessage:
      'Write the question or instruction the participant sees for this prompt.',
    description:
      'Description of the group holding the question one prompt shows the participant.',
  },
  promptTextLabel: {
    id: 'protocolBuilder.censusPrompts.promptTextLabel',
    defaultMessage: 'Prompt text',
    description:
      'Label of the box a researcher writes the question one prompt shows the participant into.',
  },
  promptTextRequired: {
    id: 'protocolBuilder.censusPrompts.promptTextRequired',
    defaultMessage:
      'Write the question or instruction this prompt shows the participant.',
    description:
      'Refusal shown when a researcher saves a prompt without writing anything for the participant to read.',
  },
  promptTextEmptyPreview: {
    id: 'protocolBuilder.censusPrompts.promptTextEmptyPreview',
    defaultMessage: 'This prompt has no question yet.',
    description:
      'Shown in place of a prompt’s own words in the list of prompts, when the researcher has written none.',
  },
  pairDescription: {
    id: 'protocolBuilder.censusPrompts.pairDescription',
    defaultMessage:
      'Write the questions this stage asks about each pair, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section in a stage that shows the participant two network members side by side and asks about the two of them together. A stage is one step of an interview; a prompt is one question the participant is asked.',
  },
  pairFieldHint: {
    id: 'protocolBuilder.censusPrompts.pairFieldHint',
    defaultMessage:
      'The participant is shown one pair of people at a time and answers these questions about them, in this order.',
    description:
      'Guidance under the list of prompts in a stage that shows the participant two network members side by side and asks about the two of them together.',
  },
  affirmativeTitle: {
    id: 'protocolBuilder.censusPrompts.affirmativeTitle',
    defaultMessage: 'Affirmative answer',
    description:
      'Heading of the group that says what a yes from the participant records between the people the prompt asked about.',
  },
  affirmativeRequired: {
    id: 'protocolBuilder.censusPrompts.affirmativeRequired',
    defaultMessage:
      'Choose the type of connection an affirmative answer creates.',
    description:
      'Refusal shown when a researcher saves a census prompt without saying what a yes from the participant records.',
  },
  edgeLabel: {
    id: 'protocolBuilder.censusPrompts.edgeLabel',
    defaultMessage: 'Connection created',
    description:
      'Label of the control that picks which kind of connection between two people this prompt records. A connection is what the protocol schema calls an edge; the researcher never sees that word.',
  },
  edgeGoneRefusal: {
    id: 'protocolBuilder.censusPrompts.edgeGoneRefusal',
    defaultMessage:
      'The connection type this prompt records is no longer in the codebook. Choose another one.',
    description:
      'Refusal shown on the connection-type control when a researcher saves a census prompt whose connection type has been deleted from the protocol’s codebook. The codebook is the protocol’s definition of the node types, edge types and attributes a study records.',
  },
  sortRulesAddedHint: {
    id: 'protocolBuilder.censusPrompts.sortRulesAddedHint',
    defaultMessage:
      'Add one or more rules to determine the order in which nodes are displayed in the bucket before they are placed. Use the asterisk property to sort by the order that nodes were created.',
    description:
      'Guidance under a list of sort rules whose fallback is the order the people were added to the network. The asterisk is the wildcard option offered in the rule’s own property picker.',
  },
});
