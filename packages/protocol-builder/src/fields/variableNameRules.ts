import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { Variable } from '@codaco/protocol-validation';
import {
  CodebookNameSchema,
  findExportColumnConflicts,
  normalizeCodebookName,
  normalizeForComparison,
  type ExportColumnConflict,
  type ExportColumnEntity,
  type ExportColumnOrigin,
  type ExportColumnVariable,
} from '@codaco/shared-consts';

const messages = defineMessages({
  nameTaken: {
    id: 'protocolBuilder.variablePicker.nameTaken',
    defaultMessage: 'this type already has an attribute called that',
    description:
      'Reason given on the switched-off create row of the attribute list. Reads after a colon, so it is a clause rather than a sentence: “Cannot create attribute named “age”: this type already has an attribute called that”.',
  },
  nameInvalid: {
    id: 'protocolBuilder.variablePicker.nameInvalid',
    defaultMessage:
      'a name cannot contain line breaks, tabs or other control characters',
    description:
      'Reason given on the switched-off create row of the attribute list when the name typed holds a character that cannot be stored in a name, such as a line break or a tab. Reads after a colon, so it is a clause rather than a sentence. Names may otherwise be written in any language or script, with spaces and punctuation.',
  },
});

/*
 * One whole sentence for each way two export columns can meet. In every
 * description the export is the file a researcher analyses after the
 * interviews and a column is one field in it. Attribute names, option values
 * and column names are the researcher's own text, shown as given inside the
 * quotation marks, and are never translated.
 */
const reservedMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.reservedName',
    defaultMessage:
      'The export already has a built-in column called “{reservedColumn}”, so an attribute cannot be named “{column}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of a column the export always writes itself. column is the name typed; reservedColumn is the built-in column it matches, which can differ in capital letters. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.reservedOption',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the export already has a built-in column called “{reservedColumn}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical attribute would be exported to a column the export always writes itself. name is the attribute; value is the option; column is where it would be written; reservedColumn is the built-in column it matches. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.reservedLayout',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the export already has a built-in column called “{reservedColumn}”. Choose a different name.',
    description:
      'Refusal shown when a layout attribute, which is exported as several position columns named after it, would write one of them to a column the export always writes itself. name is the attribute; column is the position column; reservedColumn is the built-in column it matches. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

const siblingNameMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.siblingNameWithName',
    defaultMessage:
      'The export already has a column called “{siblingColumn}” for the attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of a column another attribute already writes. siblingColumn is that column; siblingName is the other attribute. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.siblingNameWithOption',
    defaultMessage:
      'The export already has a column called “{siblingColumn}” for option “{siblingValue}” of the attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of the column an option of a categorical attribute is exported to, such as “foo_bar” for option “bar” of “foo”. siblingColumn is that column; siblingValue is the option; siblingName is the categorical attribute. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.siblingNameWithLayout',
    defaultMessage:
      'The export already has a column called “{siblingColumn}” for the position of the layout attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of one of the position columns a layout attribute is exported to, such as “position_x”. siblingColumn is that column; siblingName is the layout attribute. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

const siblingOptionMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.siblingOptionWithName',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the attribute “{siblingName}” already has a column called “{siblingColumn}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical attribute would be exported to a column another attribute already writes. name is the categorical attribute; value is the option; column is where it would be written; siblingName is the other attribute; siblingColumn is its column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.siblingOptionWithOption',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for option “{siblingValue}” of the attribute “{siblingName}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of one categorical attribute would be exported to the same column as an option of another, which happens when two names and values run together the same way. name and value are the option being saved; column is where it would be written; siblingName and siblingValue are the other option; siblingColumn is its column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.siblingOptionWithLayout',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for the position of the layout attribute “{siblingName}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical attribute would be exported to the same column as a position of a layout attribute. name and value are the option being saved; column is where it would be written; siblingName is the layout attribute; siblingColumn is its position column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
});

const siblingLayoutMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.siblingLayoutWithName',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the attribute “{siblingName}” already has a column called “{siblingColumn}”. Choose a different name.',
    description:
      'Refusal shown when a layout attribute, which is exported as several position columns named after it, would write one of them to a column another attribute already writes. name is the layout attribute; column is the position column; siblingName is the other attribute; siblingColumn is its column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.siblingLayoutWithOption',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for option “{siblingValue}” of the attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when a position column of a layout attribute would be the same as the column an option of a categorical attribute is exported to. name is the layout attribute; column is the position column; siblingName and siblingValue are the categorical attribute and its option; siblingColumn is the option’s column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.siblingLayoutWithLayout',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for the position of the layout attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when a position column of one layout attribute would be the same as a position column of another. name is the layout attribute being saved; column is its position column; siblingName is the other layout attribute; siblingColumn is its position column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

/**
 * Keyed by what produces the column being saved, then by what produces the one
 * it meets. A name meeting a name cannot happen — equal columns mean equal
 * names, which the duplicate-name check refuses first — but the pair is kept so
 * the lookup is total and a column is never left without a sentence.
 */
const siblingMessages = {
  name: siblingNameMessages,
  option: siblingOptionMessages,
  layout: siblingLayoutMessages,
} as const satisfies Record<
  ExportColumnOrigin['kind'],
  Record<ExportColumnOrigin['kind'], MessageDescriptor>
>;

/** One attribute of a type, as far as the columns it exports depend on it. */
export type ScopedVariable = ExportColumnVariable & Readonly<{ id: string }>;

/**
 * What a name is judged against: the attributes of one node type, one edge type
 * or the participant themselves, and which of those it is. Each carries its
 * record id so the attribute being renamed can be left out of its own way.
 */
export type VariableNameScope = Readonly<{
  entity: ExportColumnEntity;
  variables: readonly ScopedVariable[];
}>;

/** One clash of export columns, in the words the codebook refuses it with. */
export type ExportColumnRefusal = Readonly<{
  /** What in the attribute being saved produces the column that clashes. */
  origin: ExportColumnOrigin;
  /** Encoded, so it is read in the language it is shown in. */
  message: string;
}>;

const refusalValues = (
  name: string,
  conflict: ExportColumnConflict,
): Record<string, string> => ({
  name,
  column: conflict.column,
  ...(conflict.origin.kind === 'option'
    ? { value: String(conflict.origin.value) }
    : {}),
  ...(conflict.kind === 'reserved'
    ? { reservedColumn: conflict.reservedColumn }
    : {
        siblingName: conflict.sibling.name,
        siblingColumn: conflict.siblingColumn,
        ...(conflict.siblingOrigin.kind === 'option'
          ? { siblingValue: String(conflict.siblingOrigin.value) }
          : {}),
      }),
});

/**
 * Every way the export would write two things to one column if `candidate`
 * were saved beside `siblings`, each said as its own whole sentence.
 *
 * The rule behind all of them is `findExportColumnConflicts`, which derives
 * columns the way the exporters do; this only says which clash it found. It is
 * asked by every control that changes what an attribute's columns would be — a
 * name typed, an option added or renamed, a type changed — and by the codebook
 * write, which has the last word.
 *
 * `siblings` are the other attributes of the same type, and never the
 * candidate itself.
 */
export const exportColumnRefusals = ({
  entity,
  candidate,
  siblings,
}: Readonly<{
  entity: ExportColumnEntity;
  candidate: ExportColumnVariable;
  siblings: readonly ExportColumnVariable[];
}>): readonly ExportColumnRefusal[] =>
  findExportColumnConflicts({ entity, candidate, siblings }).map(
    (conflict) => ({
      origin: conflict.origin,
      message: createMessageError(
        conflict.kind === 'reserved'
          ? reservedMessages[conflict.origin.kind]
          : siblingMessages[conflict.origin.kind][conflict.siblingOrigin.kind],
        refusalValues(candidate.name, conflict),
      ),
    }),
  );

/**
 * The attributes of one type, as far as export columns are concerned.
 *
 * Built from the codebook's own record, so the only thing a caller decides is
 * which type it is asking about.
 */
export const variableNameScope = (
  entity: ExportColumnEntity,
  variables: Readonly<Record<string, Variable>>,
): VariableNameScope => ({
  entity,
  variables: Object.entries(variables).map(([id, variable]) => ({
    id,
    name: variable.name,
    type: variable.type,
    ...('options' in variable && Array.isArray(variable.options)
      ? { options: variable.options }
      : {}),
  })),
});

/**
 * Why a name typed for an attribute cannot be used, or `undefined` while it
 * can.
 *
 * Asked of the whole type rather than of whatever list a control is offering,
 * and against the codebook's own rules rather than a second opinion about
 * them: the codebook is what refuses the write, and a control that offered a
 * name the codebook would refuse would spend a round trip to say so.
 *
 * Which is why the name is judged as it will be stored — `normalizeCodebookName`
 * trims it and puts it in Unicode canonical form — and compared through
 * `normalizeForComparison`, the helper the codebook write judges a duplicate
 * with: it case-folds and canonicalises, so `AGE` is the name `age` and a
 * decomposed `café` is the precomposed one. A raw comparison would offer a name
 * the codebook holds and then answer with a duplicate-name refusal about a name
 * the researcher believed was free.
 *
 * A name is also refused when it would make the export write two things to one
 * column. A categorical or layout attribute takes every one of its columns from
 * its name, so a rename is judged as the attribute it renames — its own type
 * and options — while a name typed for an attribute that does not exist yet is
 * judged as one that exports a single column, or as `type` where the caller
 * already knows what it will create.
 *
 * One rule for the two controls that ask it — the create row of the attribute
 * window, and the editor the held pill opens on the name it already has — so
 * they cannot come to disagree about what a name may be. `excluding` is the
 * rename's own record id: an attribute is not the thing standing in its own
 * way.
 */
export const variableNameRefusal = (
  typed: string,
  {
    scope,
    excluding,
    type = 'text',
    intl,
  }: Readonly<{
    scope?: VariableNameScope;
    excluding?: string;
    type?: string;
    intl: IntlShape;
  }>,
): string | undefined => {
  const name = normalizeCodebookName(typed);
  const others = scope?.variables.filter(({ id }) => id !== excluding) ?? [];
  const comparable = normalizeForComparison(name);
  if (others.some((held) => normalizeForComparison(held.name) === comparable)) {
    return intl.formatMessage(messages.nameTaken);
  }
  if (!CodebookNameSchema.safeParse(name).success) {
    return intl.formatMessage(messages.nameInvalid);
  }
  if (scope === undefined) return undefined;
  const renamed = scope.variables.find(({ id }) => id === excluding);
  const [refusal] = exportColumnRefusals({
    entity: scope.entity,
    candidate: renamed === undefined ? { name, type } : { ...renamed, name },
    siblings: others,
  });
  return refusal === undefined
    ? undefined
    : (formatMessageError(refusal.message, intl) ?? refusal.message);
};
