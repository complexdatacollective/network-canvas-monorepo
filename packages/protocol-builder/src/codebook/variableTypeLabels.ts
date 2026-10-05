import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import type { BadgeColor } from '@codaco/fresco-ui/Badge';
import { type VariableType, VariableTypes } from '@codaco/protocol-validation';

/**
 * What each kind of attribute is offered as.
 *
 * Keyed by the schema's own name for the type, and read through the option
 * list below, so what an editor OFFERS and what a stored variable IS are the
 * same list read twice. "Date" names the `datetime` type, which is what a
 * researcher calls it.
 *
 * A module of its own rather than a private list inside the codebook's
 * attribute editor, because more than one surface asks a researcher this
 * question: the codebook editor picks a type for an attribute it is creating,
 * and a form field's row picks one for an attribute it is inventing. A second
 * copy of the same nine words is how one of those two ends up offering raw
 * schema tokens — `text`, `datetime`, `scalar` — in every language, which is
 * exactly what happened before this moved.
 */
const VARIABLE_TYPE_LABELS = defineMessages({
  text: {
    id: 'protocolBuilder.codebookVariable.typeText',
    defaultMessage: 'Text',
    description:
      'Choice offered for what an attribute records: free text typed by a participant.',
  },
  number: {
    id: 'protocolBuilder.codebookVariable.typeNumber',
    defaultMessage: 'Number',
    description:
      'Choice offered for what an attribute records: a number entered by a participant.',
  },
  boolean: {
    id: 'protocolBuilder.codebookVariable.typeBoolean',
    defaultMessage: 'Boolean',
    description:
      'Choice offered for what an attribute records: a true or false answer.',
  },
  ordinal: {
    id: 'protocolBuilder.codebookVariable.typeOrdinal',
    defaultMessage: 'Ordinal',
    description:
      'Choice offered for what an attribute records: one option from a list whose order is meaningful, such as a rating.',
  },
  categorical: {
    id: 'protocolBuilder.codebookVariable.typeCategorical',
    defaultMessage: 'Categorical',
    description:
      'Choice offered for what an attribute records: one or more options from an unordered list.',
  },
  scalar: {
    id: 'protocolBuilder.codebookVariable.typeScalar',
    defaultMessage: 'Scalar',
    description:
      'Choice offered for what an attribute records: a position on a continuous scale, such as a slider.',
  },
  datetime: {
    id: 'protocolBuilder.codebookVariable.typeDatetime',
    defaultMessage: 'Date',
    description:
      'Choice offered for what an attribute records: a date. The schema calls this type datetime; researchers call it a date.',
  },
  layout: {
    id: 'protocolBuilder.codebookVariable.typeLayout',
    defaultMessage: 'Layout',
    description:
      'Choice offered for what an attribute records: where a network member sits on a canvas the participant arranges.',
  },
  location: {
    id: 'protocolBuilder.codebookVariable.typeLocation',
    defaultMessage: 'Location',
    description:
      'Choice offered for what an attribute records: a place on a map.',
  },
});

/**
 * What one kind of attribute is called, for a surface naming the type a
 * variable already has rather than offering the list.
 *
 * `undefined` for a type the schema does not know, which is what a protocol
 * authored against a later schema arrives holding.
 */
export const variableTypeLabel = (
  type: string | undefined,
): MessageDescriptor | undefined =>
  type !== undefined && type in VARIABLE_TYPE_LABELS
    ? VARIABLE_TYPE_LABELS[type as keyof typeof VARIABLE_TYPE_LABELS]
    : undefined;

/**
 * The theme colour each kind of attribute is marked in, so a badge naming a
 * type carries the same colour wherever it appears.
 *
 * The same pairing Architect has used since 8.2.5
 * (`apps/architect/src/config/variables.ts` at `74a07e626`), so a researcher
 * moving between the two tools reads the same colours. Keyed by the schema's
 * own name for the type, and complete over it, so a type the schema adds
 * fails to typecheck here rather than falling through to a default colour.
 */
export const VARIABLE_TYPE_BADGE_COLORS = {
  text: 'cerulean-blue',
  number: 'paradise-pink',
  boolean: 'neon-carrot',
  ordinal: 'sea-green',
  categorical: 'mustard',
  scalar: 'kiwi',
  datetime: 'tomato',
  layout: 'purple-pizazz',
  location: 'slate-blue-dark',
} as const satisfies Record<VariableType, BadgeColor>;

/** The colour a badge naming `type` is drawn in. */
export const variableTypeBadgeColor = (type: string | undefined): BadgeColor =>
  type !== undefined && type in VARIABLE_TYPE_BADGE_COLORS
    ? VARIABLE_TYPE_BADGE_COLORS[
        type as keyof typeof VARIABLE_TYPE_BADGE_COLORS
      ]
    : 'charcoal';

/**
 * The types in the order they are offered, with the descriptor each is named
 * by.
 *
 * Descriptors rather than strings, so a caller formats them in the reader's
 * language at the moment it renders them — a formatted list held anywhere
 * outlives the formatter that made it.
 */
export const VARIABLE_TYPE_OPTIONS = [
  { label: VARIABLE_TYPE_LABELS.text, value: VariableTypes.text },
  { label: VARIABLE_TYPE_LABELS.number, value: VariableTypes.number },
  { label: VARIABLE_TYPE_LABELS.boolean, value: VariableTypes.boolean },
  { label: VARIABLE_TYPE_LABELS.ordinal, value: VariableTypes.ordinal },
  { label: VARIABLE_TYPE_LABELS.categorical, value: VariableTypes.categorical },
  { label: VARIABLE_TYPE_LABELS.scalar, value: VariableTypes.scalar },
  { label: VARIABLE_TYPE_LABELS.datetime, value: VariableTypes.datetime },
  { label: VARIABLE_TYPE_LABELS.layout, value: VariableTypes.layout },
  { label: VARIABLE_TYPE_LABELS.location, value: VariableTypes.location },
] as const satisfies readonly Readonly<{
  label: MessageDescriptor;
  value: VariableType;
}>[];
