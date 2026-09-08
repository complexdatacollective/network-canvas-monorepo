import { defineMessage, defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import type { DateFormat } from '@codaco/protocol-validation';

/**
 * The rule copy that more than one module renders.
 *
 * A message id may be declared in exactly one file — `extractMessages` throws
 * on a second declaration — so copy two modules both say lives here rather
 * than in either of them. Both sets below are genuinely shared:
 *
 * - the date-resolution names are the words the row (`ruleDescription.ts`) and
 *   the editor (`RuleEditorDialog.tsx`) both use for what a date attribute
 *   records;
 * - the rule-sentence subjects are the same phrase read twice, once as plain
 *   text for a host printing a protocol out (`ruleDescription.ts`) and once as
 *   markup in the editable list (`RulePreview.tsx`). One phrase, so a
 *   translator moves the entity and the attribute around the connecting word
 *   once and both readings follow.
 *
 * Filed under the `ruleDescription` area, which owns the vocabulary a rule is
 * read back in.
 */

/** How a date attribute records an answer, in the researcher's own words. */
export const dateResolutionMessages = defineMessages({
  full: {
    id: 'protocolBuilder.ruleDescription.dateResolutionFull',
    defaultMessage: 'a full date',
    description:
      'Noun phrase naming the precision a date attribute records answers at: a day, a month and a year together. Interpolated into a sentence about a rule that compares against a date, so it reads as the object of "answered with".',
  },
  month: {
    id: 'protocolBuilder.ruleDescription.dateResolutionMonth',
    defaultMessage: 'a month and a year',
    description:
      'Noun phrase naming the precision a date attribute records answers at: a month and a year, with no day. Interpolated into a sentence about a rule that compares against a date, so it reads as the object of "answered with".',
  },
  year: {
    id: 'protocolBuilder.ruleDescription.dateResolutionYear',
    defaultMessage: 'a year',
    description:
      'Noun phrase naming the precision a date attribute records answers at: a year alone. Interpolated into a sentence about a rule that compares against a date, so it reads as the object of "answered with".',
  },
}) satisfies Record<DateFormat, MessageDescriptor>;

/**
 * The subject of a rule sentence — what the rule is about, and which of its
 * attributes it asks about.
 *
 * Whole phrases with both parts named, never a connecting word concatenated
 * onto a label: "Person where Age" and "Ego has EgoName" put the entity, the
 * connector and the attribute in an order English happens to use, and a
 * translator has to be free to move all three.
 *
 * `entity` is the researcher's own name for a node type, an edge type, or the
 * ego — the focal participant of the interview. `attribute` is their own name
 * for one of that entity's variables. Neither is translated: both come out of
 * the protocol's codebook.
 */
export const ruleSubjectMessages = defineMessages({
  alterAttribute: {
    id: 'protocolBuilder.ruleDescription.subjectAlterAttribute',
    defaultMessage: '{entity} where {attribute}',
    description:
      'Subject of a sentence reading a rule back to a researcher, for a rule about a network member (an alter) rather than about the interview participant. entity is the codebook name of the node or edge type; attribute is the codebook name of the variable the rule asks about. A comparison follows.',
  },
  egoAttribute: {
    id: 'protocolBuilder.ruleDescription.subjectEgoAttribute',
    defaultMessage: '{entity} has {attribute}',
    description:
      'Subject of a sentence reading a rule back to a researcher, for a rule about the ego — the interview participant themselves. entity is the word for the ego; attribute is the codebook name of the ego variable the rule asks about. A comparison follows.',
  },
  alterAttributeUnknownEntity: {
    id: 'protocolBuilder.ruleDescription.subjectAlterAttributeUnknownEntity',
    defaultMessage: 'where {attribute}',
    description:
      'The same subject as subjectAlterAttribute, for a broken rule that never said what it is about, so there is no entity to name. attribute is the codebook name of the variable the rule asks about. A comparison follows.',
  },
  egoAttributeUnknownEntity: {
    id: 'protocolBuilder.ruleDescription.subjectEgoAttributeUnknownEntity',
    defaultMessage: 'has {attribute}',
    description:
      'The same subject as subjectEgoAttribute, for a broken rule that never said what it is about, so there is no entity to name. attribute is the codebook name of the ego variable the rule asks about. A comparison follows.',
  },
});

/**
 * What an unanswered control inside the rule editor says.
 *
 * Fresco's built-in required copy addresses a participant mid-interview. A
 * protocol is authored by a researcher, so the rule is stated instead. Shared
 * because the dialog and the operand control it renders are one form, and the
 * same unanswered question has to read the same way wherever it sits.
 */
export const ruleEditorRequiredMessage = defineMessage({
  id: 'protocolBuilder.ruleEditor.required',
  defaultMessage: 'This field is required.',
  description:
    'Shown under any unanswered control in the rule editor when the researcher tries to finish the rule. Addresses the researcher authoring the protocol, not a participant answering it.',
});
