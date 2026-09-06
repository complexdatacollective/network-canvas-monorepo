import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What a census or bin family says where another one says the same thing.
 *
 * Two kinds of copy live here. The first is what the prompts section says for
 * these families: `PromptsSection` words itself for the ordinary case — a
 * stage that asks questions about the thing it collects — and these are the
 * families where that sentence would be wrong about what the participant is
 * looking at: a pair of people side by side, a row of bins, one person against
 * the group around them. Whole sentences per family rather than a noun swapped
 * into a shared frame, for the reason `PageContentSection` gives: "each pair"
 * and "each person" do not differ only in the noun in every language.
 *
 * The second is everything more than one of the five families renders — the
 * connection an affirmative answer creates, the attribute picker the two bins
 * and the tie-strength scale share, and the two sort orders the bins hold.
 * `extractMessages` throws on a second declaration of an id, so a shared
 * message has to have exactly one home; and a Dyad Census and a Tie Strength
 * Census both show one pair at a time, so they share the sentence rather than
 * declaring a twin of it and asking a translator the same question twice.
 *
 * A sentence only one family says is declared beside that family's markup,
 * under this same `censusPrompts` area — an area names the copy's subject, and
 * a file is only obliged to be the single home of each id.
 */
export const censusPromptsMessages = defineMessages({
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
  binDescription: {
    id: 'protocolBuilder.censusPrompts.binDescription',
    defaultMessage:
      'Write the questions this stage asks about each person, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section in a stage where the participant answers each question about one network member at a time by dragging them into a bin. A stage is one step of an interview; a prompt is one question the participant is asked.',
  },
  categoricalBinFieldHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinFieldHint',
    defaultMessage:
      'The participant sorts everyone into bins for one question at a time, in this order.',
    description:
      'Guidance under the list of prompts in a Categorical Bin stage, where a bin is one named answer the participant drags a network member into, and the bins have no order among them.',
  },
  ordinalBinFieldHint: {
    id: 'protocolBuilder.censusPrompts.ordinalBinFieldHint',
    defaultMessage:
      'The participant sorts everyone into ordered bins for one question at a time, in this order.',
    description:
      'Guidance under the list of prompts in an Ordinal Bin stage, where the bins are a scale running from least to most and their order is what the answer means.',
  },
  oneToManyDescription: {
    id: 'protocolBuilder.censusPrompts.oneToManyDescription',
    defaultMessage:
      'Write the questions this stage asks about one person and the group around them, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section in a stage that shows the participant one network member alongside all the others and asks which of the others the question applies to. A stage is one step of an interview; a prompt is one question the participant is asked.',
  },
  oneToManyFieldHint: {
    id: 'protocolBuilder.censusPrompts.oneToManyFieldHint',
    defaultMessage:
      'The participant is shown one person at a time and chooses who among the others the question applies to.',
    description:
      'Guidance under the list of prompts in a One-to-Many Dyad Census stage, where the participant selects any number of the remaining network members for the person in front of them.',
  },
  attributeLabel: {
    id: 'protocolBuilder.censusPrompts.attributeLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the control that picks which codebook attribute one prompt writes its answer to. An attribute is one thing an interview records about a network member.',
  },
  attributeCreateLabel: {
    id: 'protocolBuilder.censusPrompts.attributeCreateLabel',
    defaultMessage: 'Create a new attribute',
    description:
      'Button that opens the codebook editor for inventing an attribute this prompt can write to. Also the title of the dialog it opens.',
  },
  attributeEditLabel: {
    id: 'protocolBuilder.censusPrompts.attributeEditLabel',
    defaultMessage: "Change this attribute's values",
    description:
      'Button that opens the codebook editor for the list of answers the picked attribute offers, which are the bins or the points of the scale this prompt is answered on. Also the title of the dialog it opens.',
  },
  binAttributeRequired: {
    id: 'protocolBuilder.censusPrompts.binAttributeRequired',
    defaultMessage: 'Choose the attribute whose values become the bins.',
    description:
      'Refusal shown when a researcher saves a bin prompt without saying which attribute it sorts people by. A bin is one answer the participant drags a network member into.',
  },
  binLimitTitle: {
    id: 'protocolBuilder.censusPrompts.binLimitTitle',
    defaultMessage: 'More bins than fit on one screen',
    description:
      'Heading of the warning shown when the attribute a bin prompt uses offers more values than the interview screen can draw as bins.',
  },
  scaleTitle: {
    id: 'protocolBuilder.censusPrompts.scaleTitle',
    defaultMessage: 'The scale',
    description:
      'Heading of the group that picks the attribute whose ordered values the participant answers on — the points running from least to most.',
  },
  edgeLabel: {
    id: 'protocolBuilder.censusPrompts.edgeLabel',
    defaultMessage: 'Connection created',
    description:
      'Label of the control that picks which kind of connection between two people this prompt records. A connection is what the protocol schema calls an edge; the researcher never sees that word.',
  },
  edgeCreateLabel: {
    id: 'protocolBuilder.censusPrompts.edgeCreateLabel',
    defaultMessage: 'Create a new connection type',
    description:
      'Button that opens the codebook editor for inventing a kind of connection this prompt can record. Also the title of the dialog it opens.',
  },
  edgeCreateDescription: {
    id: 'protocolBuilder.censusPrompts.edgeCreateDescription',
    defaultMessage: 'Create a connection type and use it for this prompt',
    description:
      'Description at the top of the dialog for inventing a kind of connection, saying that the prompt will point at it once it exists.',
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
  sortRulesAddedHint: {
    id: 'protocolBuilder.censusPrompts.sortRulesAddedHint',
    defaultMessage:
      'Rules are applied in order. Use the asterisk to keep the order the people were added in.',
    description:
      'Guidance under a list of sort rules whose fallback is the order the people were added to the network. The asterisk is the wildcard option offered in the rule’s own attribute picker.',
  },
  sortRulesDroppedHint: {
    id: 'protocolBuilder.censusPrompts.sortRulesDroppedHint',
    defaultMessage:
      'Rules are applied in order. Use the asterisk to keep the order the people were dropped in.',
    description:
      'The same guidance for a list of sort rules inside a bin, where the fallback is the order the participant dragged people into that bin. The asterisk is the wildcard option offered in the rule’s own attribute picker.',
  },
  bucketOrderTitle: {
    id: 'protocolBuilder.censusPrompts.bucketOrderTitle',
    defaultMessage: 'Order people are handed to the participant in',
    description:
      'Heading of the optional group holding the rules that order the people a bin stage has not been asked about yet.',
  },
  bucketOrderDescription: {
    id: 'protocolBuilder.censusPrompts.bucketOrderDescription',
    defaultMessage:
      'Choose the order the people still to be sorted are offered in.',
    description:
      'Description of the group holding the rules that order the people a bin stage has not been asked about yet.',
  },
  bucketOrderLabel: {
    id: 'protocolBuilder.censusPrompts.bucketOrderLabel',
    defaultMessage: 'Rules for handing people over',
    description:
      'Label of the list of sort rules that order the people a bin stage has not been asked about yet.',
  },
  bucketOrderAddLabel: {
    id: 'protocolBuilder.censusPrompts.bucketOrderAddLabel',
    defaultMessage: 'Add a rule for the order people are handed over in',
    description:
      'Button that appends one sort rule to the list ordering the people a bin stage has not been asked about yet.',
  },
  bucketOrderEmptyState: {
    id: 'protocolBuilder.censusPrompts.bucketOrderEmptyState',
    defaultMessage:
      'No rules yet, so people are handed over in the order they were added.',
    description:
      'Shown in place of the sort rules ordering the people a bin stage has not been asked about yet, when the researcher has written none.',
  },
  binOrderTitle: {
    id: 'protocolBuilder.censusPrompts.binOrderTitle',
    defaultMessage: 'Order within each bin',
    description:
      'Heading of the optional group holding the rules that order the people already dragged into a bin.',
  },
  binOrderDescription: {
    id: 'protocolBuilder.censusPrompts.binOrderDescription',
    defaultMessage:
      'Choose the order people already sorted into a bin are listed in.',
    description:
      'Description of the group holding the rules that order the people already dragged into a bin.',
  },
  binOrderLabel: {
    id: 'protocolBuilder.censusPrompts.binOrderLabel',
    defaultMessage: 'Rules for the order within a bin',
    description:
      'Label of the list of sort rules that order the people already dragged into a bin.',
  },
  binOrderAddLabel: {
    id: 'protocolBuilder.censusPrompts.binOrderAddLabel',
    defaultMessage: 'Add a rule for the order within a bin',
    description:
      'Button that appends one sort rule to the list ordering the people already dragged into a bin.',
  },
  binOrderEmptyState: {
    id: 'protocolBuilder.censusPrompts.binOrderEmptyState',
    defaultMessage:
      'No rules yet, so people are listed in the order they were dropped in.',
    description:
      'Shown in place of the sort rules ordering the people already dragged into a bin, when the researcher has written none.',
  },
});
