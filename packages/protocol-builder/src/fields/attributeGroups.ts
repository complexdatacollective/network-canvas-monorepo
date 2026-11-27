import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The headings of the groups in an attribute list, in one place, so that the
 * Attribute menu in text, the field picker of a form and the rule pickers
 * name each group in the same words.
 *
 * Every list uses them in the order in which they are declared here: the
 * attributes of the node or edge that the text refers to, then the
 * participant's, then the stage's dynamic attributes, then the values that the
 * interview itself supplies. Rule pickers inside a form put the answers on the
 * form first.
 */
export const attributeGroupMessages = defineMessages({
  formAnswers: {
    id: 'protocolBuilder.attributeGroups.formAnswers',
    defaultMessage: 'Answers on this form',
    description:
      'Heading of a group in an attribute list inside a form, above the attributes collected by the fields of that form. A rule that uses one of them reads the answer while the participant fills in the form.',
  },
  earlierAnswers: {
    id: 'protocolBuilder.attributeGroups.earlierAnswers',
    defaultMessage: 'Answers from earlier stages',
    description:
      'Heading of a group in an attribute list inside a form, above the attributes whose values were recorded before this form.',
  },
  node: {
    id: 'protocolBuilder.attributeGroups.node',
    defaultMessage: 'Node attributes',
    description:
      'Heading of a group in an attribute list, above the attributes of the node (the person or thing) that the text or form refers to.',
  },
  edge: {
    id: 'protocolBuilder.attributeGroups.edge',
    defaultMessage: 'Edge attributes',
    description:
      'Heading of a group in an attribute list, above the attributes of the edge (the relationship between two nodes) that the text or form refers to.',
  },
  firstNode: {
    id: 'protocolBuilder.attributeGroups.firstNode',
    defaultMessage: 'First node attributes',
    description:
      'Heading of a group in an attribute list, above the attributes of the first of the two nodes that an edge connects.',
  },
  secondNode: {
    id: 'protocolBuilder.attributeGroups.secondNode',
    defaultMessage: 'Second node attributes',
    description:
      'Heading of a group in an attribute list, above the attributes of the second of the two nodes that an edge connects.',
  },
  ego: {
    id: 'protocolBuilder.attributeGroups.ego',
    defaultMessage: 'Ego attributes',
    description:
      'Heading of a group in an attribute list, above the attributes of the participant (the ego) of the interview.',
  },
  dynamic: {
    id: 'protocolBuilder.attributeGroups.dynamic',
    defaultMessage: 'Dynamic attributes',
    description:
      'Heading of a group in an attribute list, above the dynamic attributes of the stage. A dynamic attribute shows different wording depending on rules or on an answer, such as “their”, “her” or “his”.',
  },
  interview: {
    id: 'protocolBuilder.attributeGroups.interview',
    defaultMessage: 'Interview attributes',
    description:
      'Heading of a group in an attribute list, above values that the interview itself supplies, such as today’s date.',
  },
});
