import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What the prompts section says for a census or bin family.
 *
 * `PromptsSection` words itself for the ordinary case — a stage that asks
 * questions about the thing it collects — and these are the families where
 * that sentence would be wrong about what the participant is looking at: a
 * pair of people side by side, a row of bins, one person against the group
 * around them. Whole sentences per family rather than a noun swapped into a
 * shared frame, for the reason `PageContentSection` gives: "each pair" and
 * "each person" do not differ only in the noun in every language.
 *
 * Declared here rather than beside each family, because two of them say the
 * same thing. A Dyad Census and a Tie Strength Census both show one pair at a
 * time and differ only in what they ask about it, so they share the sentence
 * and a translator answers once — `extractMessages` throws on a second
 * declaration of an id, so a shared message has to have exactly one home.
 *
 * The rest of this family's copy is still English literals; the area is listed
 * in `src/locales/ID_MAP.md` and the rest of it converts with the family.
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
});
