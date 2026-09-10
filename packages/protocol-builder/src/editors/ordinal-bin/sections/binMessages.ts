import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What one bin family says where the other one says the same thing.
 *
 * The two bins ask different questions — a scale running from least to most,
 * or a set of named answers with no order among them — but they are the same
 * task: the participant drags each person into one of the values an attribute
 * offers. So the attribute picker, the warning about how many values fit on a
 * screen, and the two orders a bin prompt holds are worded once here.
 * `extractMessages` throws on a second declaration of an id, so a sentence
 * both of them render has to have exactly one home.
 *
 * A sentence only ONE bin says is declared beside that bin's own markup, under
 * this same `censusPrompts` area — an area names the copy's subject, and a
 * file is only obliged to be the single home of each id.
 *
 * It sits under the Ordinal Bin because that is the first of the two to land,
 * and the family rule is that the first editor owns what its sibling also
 * needs. It moves up to `sections/` with `censusMessages.ts` and the controls
 * beside them once the last census or bin editor has landed.
 */
export const binMessages = defineMessages({
  binDescription: {
    id: 'protocolBuilder.censusPrompts.binDescription',
    defaultMessage:
      'Write the questions this stage asks about each person, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section in a stage where the participant answers each question about one network member at a time by dragging them into a bin. A stage is one step of an interview; a prompt is one question the participant is asked.',
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
  binAttributeRequired: {
    id: 'protocolBuilder.censusPrompts.binAttributeRequired',
    defaultMessage: 'Choose the attribute whose values become the bins.',
    description:
      'Refusal shown when a researcher saves a bin prompt without saying which attribute it sorts people by. A bin is one answer the participant drags a network member into.',
  },
  binAttributeGoneRefusal: {
    id: 'protocolBuilder.censusPrompts.binAttributeGoneRefusal',
    defaultMessage:
      'The attribute whose values become the bins is no longer available on this type. Choose another one.',
    description:
      'Refusal shown on the attribute picker when a researcher saves a bin prompt whose attribute has been deleted from the protocol’s codebook or changed to a kind of answer this interface cannot draw as bins. The codebook is the protocol’s definition of the node types, edge types and attributes a study records.',
  },
  binLimitTitle: {
    id: 'protocolBuilder.censusPrompts.binLimitTitle',
    defaultMessage: 'More bins than fit on one screen',
    description:
      'Heading of the warning shown when the attribute a bin prompt uses offers more values than the interview screen can draw as bins.',
  },
  lockedOptions: {
    id: 'protocolBuilder.promptAttribute.lockedOptions',
    defaultMessage:
      'These values are set by the interface that uses this attribute, so they cannot be changed here.',
    description:
      'Shown above the read-only list of an attribute’s values, when another interface both writes the attribute and depends on its exact values so a researcher may not edit them.',
  },
  lockedOptionsLabelColumn: {
    id: 'protocolBuilder.promptAttribute.lockedOptionsLabelColumn',
    defaultMessage: 'Label',
    description:
      'Heading of the column of a read-only list of an attribute’s values holding the words the participant reads.',
  },
  lockedOptionsValueColumn: {
    id: 'protocolBuilder.promptAttribute.lockedOptionsValueColumn',
    defaultMessage: 'Value',
    description:
      'Heading of the column of a read-only list of an attribute’s values holding what the interview records when the participant chooses one. It is not translated: it is stored in the protocol and exported as written.',
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
  sortRulesDroppedHint: {
    id: 'protocolBuilder.censusPrompts.sortRulesDroppedHint',
    defaultMessage:
      'Rules are applied in order. Use the asterisk to keep the order the people were dropped in.',
    description:
      'The same guidance as `sortRulesAddedHint` for a list of sort rules inside a bin, where the fallback is the order the participant dragged people into that bin. The asterisk is the wildcard option offered in the rule’s own property picker.',
  },
});
